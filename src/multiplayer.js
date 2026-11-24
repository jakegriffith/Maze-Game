import {
  ref, set, get, update, remove, onValue, onDisconnect,
  runTransaction, push
} from 'firebase/database'
import { db } from './firebase.js'
import { config, gridFor } from './config.js'

// ── Paths ─────────────────────────────────────────────────────────────
//
// /lobby/waiting            one slot: the person waiting for a Round 1 partner
// /lobby/groups/{roomId}    groups waiting to grow after Round 2
// /lobby/battles/{roomId}   teams waiting for an opponent after Round 3
// /rooms/{roomId}           one room per group (2–6 people) or battle (up to 12)
//   stage                   current round (1–5)
//   grid                    maze size for the current round
//   mode                    'battle' for the Round 4 battle room
//   ended                   'peace' if no opponent ever arrived
//   out/{uid}               battle: knocked out
//   next                    set when this group has merged into another room
//   players/{uid}           name, slot, x, y, vx, vy, stage, ready (+ team, teamSize in battle)
//   links/{stage}/{a__b}    true once those two balls have touched this round
//   found/{stage}           true once everyone is linked into one group
//
// Each round's maze seed is `${roomId}-${stage}`, so nothing needs storing.
// (Everything lives under /lobby and /rooms, which the existing rules allow.)

const lobbyRef  = ()          => ref(db, 'lobby/waiting')
const groupsRef = ()          => ref(db, 'lobby/groups')
const roomRef   = (id)        => ref(db, `rooms/${id}`)
const playerRef = (id, uid)   => ref(db, `rooms/${id}/players/${uid}`)

function newPlayer(name, slot) {
  return { name, slot, x: 0, y: 0, stage: 0, ready: 0 }
}

// Players that are really present (a stray position write can leave a
// half-made node behind; anything without a name doesn't count).
export function presentPlayers(room) {
  const out = {}
  for (const [uid, p] of Object.entries(room?.players || {})) {
    if (p && p.name) out[uid] = p
  }
  return out
}

export function seedFor(roomId, stage) {
  return `${roomId}-${stage}`
}

// ── Round 1 matchmaking ───────────────────────────────────────────────
//
//   Player A arrives → picks a fresh roomId → writes {uid, name, roomId}
//                      to lobby/waiting → watches rooms/{roomId}
//   Player B arrives → transaction claims the slot (clears it)
//                      → creates the room with both players
//   Player A sees the room appear → paired
//
// Returns { matched: Promise<roomId>, cancel() }

export function joinLobby(uid, name) {
  const myRoomId = push(ref(db, 'rooms')).key
  let role = null
  let stopWatching = () => {}

  const matched = (async () => {
    let partner = null

    const result = await runTransaction(lobbyRef(), (current) => {
      if (current === null || current.uid === uid) {
        role = 'a'
        partner = null
        return { uid, name, roomId: myRoomId }
      }
      role = 'b'
      partner = current
      return null  // clears the slot
    })

    if (!result.committed) throw new Error('Could not join the lobby.')

    // ── Player B: build the room ──
    if (role === 'b') {
      const roomId = partner.roomId
      await onDisconnect(playerRef(roomId, uid)).remove()
      await set(roomRef(roomId), {
        stage: 1,
        grid: gridFor(2),
        createdAt: Date.now(),
        players: {
          [partner.uid]: newPlayer(partner.name, 0),
          [uid]:         newPlayer(name, 1),
        },
      })
      return roomId
    }

    // ── Player A: wait for B to build the room ──
    await onDisconnect(lobbyRef()).remove()
    await onDisconnect(playerRef(myRoomId, uid)).remove()

    return new Promise((resolve, reject) => {
      let done = false
      const unsub = onValue(roomRef(myRoomId), (snap) => {
        const room = snap.val()
        if (done || Object.keys(presentPlayers(room)).length < 2) return
        done = true
        stopWatching()
        // We're out of the lobby now — don't wipe whoever waits there next
        onDisconnect(lobbyRef()).cancel()
        resolve(myRoomId)
      }, reject)
      stopWatching = () => { done = true; unsub() }
    })
  })()

  async function cancel() {
    stopWatching()

    // Remove the slot only if it's still ours
    let claimed = false
    await runTransaction(lobbyRef(), (current) => {
      if (current && current.uid === uid) { claimed = false; return null }
      claimed = true
      return current ?? null
    })

    if (role === 'a') {
      onDisconnect(lobbyRef()).cancel()
      onDisconnect(playerRef(myRoomId, uid)).cancel()
      // Someone grabbed our slot just as we left: delete the room they make,
      // so they get "The other person left." instead of waiting forever.
      if (claimed) {
        const r = roomRef(myRoomId)
        let stop = null
        stop = onValue(r, (snap) => {
          if (snap.exists()) { remove(r); if (stop) stop() }
        })
        setTimeout(() => stop && stop(), 15000)
      }
    }
  }

  return { matched, cancel }
}

// ── Queues between rounds ─────────────────────────────────────────────
//
// Two queues, both under /lobby (so the existing rules cover them):
//   lobby/groups/{roomId}   groups waiting to grow after Round 2
//                           (pair + pair → 4)
//   lobby/battles/{roomId}  teams waiting for an opponent after Round 3
//                           (any two teams)
//
// A group's leader calls joinQueue(). In one transaction it either claims
// the longest-waiting compatible entry (removing it) → { partnerRoomId,
// partnerStage }, or adds itself → { waiting: true }.

export async function joinQueue(queue, roomId, size, stage, compatible) {
  let claimed = null
  const qRef = ref(db, `lobby/${queue}`)

  const result = await runTransaction(qRef, (current) => {
    const entries = current || {}
    claimed = null

    // Already queued (e.g. a new leader taking over) — keep waiting
    if (entries[roomId]) return entries

    const candidates = Object.entries(entries)
      .filter(([id, e]) => id !== roomId && e && compatible(e.size, size))
      .sort((x, y) => x[1].since - y[1].since)

    if (candidates.length) {
      const [id, e] = candidates[0]
      claimed = { partnerRoomId: id, partnerStage: e.stage }
      delete entries[id]
      return entries
    }

    entries[roomId] = { size, stage, since: Date.now() }
    return entries
  })

  if (!result.committed) throw new Error('Could not join the queue.')
  if (claimed) return claimed

  // If this phone drops while queued, take the group out of the queue
  onDisconnect(ref(db, `lobby/${queue}/${roomId}`)).remove()
  return { waiting: true }
}

// Leave the queue if still in it. Returns true if we were still waiting,
// false if another group claimed us in the meantime.
export async function leaveQueue(queue, roomId) {
  let wasWaiting = false
  await runTransaction(ref(db, `lobby/${queue}/${roomId}`), (current) => {
    wasWaiting = !!current
    return null
  })
  onDisconnect(ref(db, `lobby/${queue}/${roomId}`)).cancel()
  return wasWaiting
}

// Growth: the claimer builds the merged room and points both old rooms at it.
export async function createMergedRoom(myRoomId, myRoom, partnerRoomId, partnerStage) {
  const partnerRoom = (await get(roomRef(partnerRoomId))).val()
  const everyone = [
    ...Object.entries(presentPlayers(myRoom)),
    ...Object.entries(presentPlayers(partnerRoom)),
  ]

  const newId = push(ref(db, 'rooms')).key
  const players = {}
  everyone.forEach(([uid, p], i) => { players[uid] = newPlayer(p.name, i) })

  await set(roomRef(newId), {
    stage: Math.max(myRoom.stage || 0, partnerStage || 0) + 1,
    grid: gridFor(everyone.length),
    createdAt: Date.now(),
    players,
  })
  await update(roomRef(myRoomId), { next: newId })
  if (partnerRoom) await update(roomRef(partnerRoomId), { next: newId })
  return newId
}

// Battle: the claiming team is Red, the waiting team is Blue.
export async function createBattleRoom(myRoomId, myRoom, partnerRoomId) {
  const partnerRoom = (await get(roomRef(partnerRoomId))).val()
  const red  = Object.entries(presentPlayers(myRoom))
  const blue = Object.entries(presentPlayers(partnerRoom))

  const newId = push(ref(db, 'rooms')).key
  const players = {}
  red.forEach(([uid, p], i)  => { players[uid] = { ...newPlayer(p.name, i), team: 'red',  teamSize: red.length } })
  blue.forEach(([uid, p], i) => { players[uid] = { ...newPlayer(p.name, i), team: 'blue', teamSize: blue.length } })

  await set(roomRef(newId), {
    mode: 'battle',
    stage: config.battleRound,
    grid: gridFor(red.length + blue.length),
    createdAt: Date.now(),
    players,
  })
  await update(roomRef(myRoomId), { next: newId })
  if (partnerRoom) await update(roomRef(partnerRoomId), { next: newId })
  return newId
}

// Move the room on to the next round (only if it's still on `fromStage`),
// sizing the maze for whoever is still there. Nobody is writing positions
// between rounds, so a whole-room transaction is cheap here.
export async function advanceStage(roomId, fromStage) {
  await runTransaction(roomRef(roomId), (room) => {
    if (!room || room.stage !== fromStage) return room
    room.stage = fromStage + 1
    room.grid = gridFor(Object.keys(presentPlayers(room)).length)
    return room
  })
}

// No opponent turned up: end this group's game peacefully.
export function endPeacefully(roomId) {
  return update(roomRef(roomId), { ended: 'peace' })
}

// ── Room membership ───────────────────────────────────────────────────

// Calls onUpdate(snapshot) on every change. Returns an unsubscribe function.
export function watchRoom(roomId, onUpdate) {
  return onValue(roomRef(roomId), onUpdate)
}

// Register "remove me if my phone drops" for this room.
export function registerPresence(roomId, uid) {
  return onDisconnect(playerRef(roomId, uid)).remove()
}

// Put my player record back (after a brief connection drop removed it).
export async function rejoin(roomId, uid, player) {
  await registerPresence(roomId, uid)
  await set(playerRef(roomId, uid), newPlayer(player.name, player.slot))
}

// Leave a room: drop my record; if nobody's left, delete the room.
export async function leaveRoom(roomId, uid) {
  await onDisconnect(playerRef(roomId, uid)).cancel()
  await remove(playerRef(roomId, uid))
  const room = (await get(roomRef(roomId))).val()
  if (!room || Object.keys(presentPlayers(room)).length === 0) {
    await remove(roomRef(roomId))
    await remove(ref(db, `lobby/groups/${roomId}`))
    await remove(ref(db, `lobby/battles/${roomId}`))
  }
}

// ── Writes during play ────────────────────────────────────────────────

// Position (cells) and velocity (cells/s), tagged with the round
export function writePosition(roomId, uid, stage, x, y, vx, vy) {
  update(playerRef(roomId, uid), { x, y, vx, vy, stage })
}

export function writeReady(roomId, uid, stage) {
  set(ref(db, `rooms/${roomId}/players/${uid}/ready`), stage)
}

export function linkKey(a, b) {
  return a < b ? `${a}__${b}` : `${b}__${a}`
}

export function writeLink(roomId, stage, a, b) {
  set(ref(db, `rooms/${roomId}/links/${stage}/${linkKey(a, b)}`), true)
}

export function writeFound(roomId, stage) {
  set(ref(db, `rooms/${roomId}/found/${stage}`), true)
}

// Battle: this player has been knocked out
export function writeOut(roomId, uid) {
  set(ref(db, `rooms/${roomId}/out/${uid}`), true)
}
