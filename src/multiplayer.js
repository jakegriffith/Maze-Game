import {
  ref, set, update, remove, onValue, onDisconnect,
  runTransaction, push
} from 'firebase/database'
import { db } from './firebase.js'

const lobbyRef = ()   => ref(db, 'lobby/waiting')
const roomRef  = (id) => ref(db, `rooms/${id}`)

function newSeed() {
  return String(Math.floor(Math.random() * 1_000_000))
}

// ── Matchmaking ───────────────────────────────────────────────────────
//
// Flow:
//   Player A arrives → picks a fresh roomId → writes {uid, name, roomId}
//                      to lobby/waiting → watches rooms/{roomId}
//   Player B arrives → transaction claims the slot (clears it)
//                      → creates rooms/{roomId} with both players
//   Player A sees the room appear → paired
//
// Player B always creates the room, so it can never be created twice.
// Every pairing gets a brand-new roomId, so old rooms never collide with new ones.
//
// Returns { matched, cancel }
//   matched: Promise<{ role, roomId, partnerName, seeds: [seed1, seed2] }>
//   cancel():  leave the lobby (safe to call at any time)

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
      const roomId = partner.roomId || partner.uid
      const seeds  = [newSeed(), newSeed()]
      await onDisconnect(roomRef(roomId)).remove()
      await set(roomRef(roomId), {
        seed1: seeds[0],
        seed2: seeds[1],
        status: 'round1',
        met1: false,
        met2: false,
        players: {
          a: { uid: partner.uid, name: partner.name, x: 0, y: 0, round: 0, ready: false },
          b: { uid,              name,               x: 0, y: 0, round: 0, ready: false },
        },
      })
      return { role: 'b', roomId, partnerName: partner.name, seeds }
    }

    // ── Player A: wait for B to build the room ──
    await onDisconnect(lobbyRef()).remove()
    await onDisconnect(roomRef(myRoomId)).remove()

    return new Promise((resolve, reject) => {
      let done = false
      const unsub = onValue(roomRef(myRoomId), (snap) => {
        const room = snap.val()
        if (done || !room?.players?.b) return
        done = true
        stopWatching()
        // We're out of the lobby now — don't wipe whoever waits there next
        onDisconnect(lobbyRef()).cancel()
        resolve({
          role: 'a',
          roomId: myRoomId,
          partnerName: room.players.b.name,
          seeds: [room.seed1, room.seed2],
        })
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
      onDisconnect(roomRef(myRoomId)).cancel()
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

// ── Room watcher ──────────────────────────────────────────────────────

// Calls onUpdate(snapshot) every time anything in the room changes.
// Returns an unsubscribe function.
export function watchRoom(roomId, onUpdate) {
  return onValue(roomRef(roomId), onUpdate)
}

// ── Writes ────────────────────────────────────────────────────────────

// Own position in maze-coordinate units, tagged with the round number
// so a stale Round 1 position can't trigger a Round 2 meeting.
export function writePosition(roomId, role, round, x, y) {
  update(ref(db, `rooms/${roomId}/players/${role}`), { x, y, round })
}

// Either phone may write this — whichever notices the touch first.
export function writeMet(roomId, round) {
  update(roomRef(roomId), {
    [`met${round}`]: true,
    status: round === 1 ? 'between' : 'finished',
  })
}

export function writeReady(roomId, role) {
  set(ref(db, `rooms/${roomId}/players/${role}/ready`), true)
}

export function writeStatus(roomId, status) {
  set(ref(db, `rooms/${roomId}/status`), status)
}

// ── Cleanup ───────────────────────────────────────────────────────────

export async function leaveRoom(roomId) {
  await onDisconnect(roomRef(roomId)).cancel()
  await remove(roomRef(roomId))
}
