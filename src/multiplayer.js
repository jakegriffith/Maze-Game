import {
  ref, set, get, update, remove, onValue, onDisconnect,
  runTransaction, push
} from 'firebase/database'
import { db } from './firebase.js'

// ── Paths ─────────────────────────────────────────────────────────────
//
// /lobby/waiting            one slot: the person waiting for a Round 1 partner
// /lobby/groups/{roomId}    groups waiting to grow after a round
// /rooms/{roomId}           one room per group (2–8 people)
//   stage                   current round (1–5)
//   next                    set when this group has merged into another room
//   players/{uid}           name, slot (start corner), x, y, stage, ready
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

// ── Group merging (after Rounds 2–4) ──────────────────────────────────
//
// A group's leader calls joinGroups(). In one transaction it either:
//   • claims the longest-waiting compatible group (removes it from the
//     queue) → returns { partnerRoomId, partnerStage }, or
//   • adds itself to the queue → returns { waiting: true }.
// Compatible = one of the two groups is a pair, and together they're ≤ maxSize.

export async function joinGroups(roomId, size, stage, maxSize) {
  let claimed = null

  const result = await runTransaction(groupsRef(), (current) => {
    const queue = current || {}
    claimed = null

    // Already queued (e.g. a new leader taking over) — keep waiting
    if (queue[roomId]) return queue

    const candidates = Object.entries(queue)
      .filter(([id, g]) => id !== roomId && g &&
        (g.size === 2 || size === 2) && g.size + size <= maxSize)
      .sort((x, y) => x[1].since - y[1].since)

    if (candidates.length) {
      const [id, g] = candidates[0]
      claimed = { partnerRoomId: id, partnerStage: g.stage }
      delete queue[id]
      return queue
    }

    queue[roomId] = { size, stage, since: Date.now() }
    return queue
  })

  if (!result.committed) throw new Error('Could not join the group queue.')
  if (claimed) return claimed

  // If this phone drops while queued, take the group out of the queue
  onDisconnect(ref(db, `lobby/groups/${roomId}`)).remove()
  return { waiting: true }
}

// Leave the queue if still in it. Returns true if we were still waiting,
// false if another group claimed us in the meantime.
export async function leaveGroups(roomId) {
  let wasWaiting = false
  await runTransaction(ref(db, `lobby/groups/${roomId}`), (current) => {
    wasWaiting = !!current
    return null
  })
  onDisconnect(ref(db, `lobby/groups/${roomId}`)).cancel()
  return wasWaiting
}

// Claimer builds the merged room and points both old rooms at it.
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
    createdAt: Date.now(),
    players,
  })
  await update(roomRef(myRoomId), { next: newId })
  if (partnerRoom) await update(roomRef(partnerRoomId), { next: newId })
  return newId
}

// Move the room on to the next round (only if it's still on `fromStage`).
export async function advanceStage(roomId, fromStage) {
  await runTransaction(ref(db, `rooms/${roomId}/stage`), (cur) => {
    if (cur === fromStage) return fromStage + 1
    return cur
  })
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
  }
}

// ── Writes during play ────────────────────────────────────────────────

export function writePosition(roomId, uid, stage, x, y) {
  update(playerRef(roomId, uid), { x, y, stage })
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
