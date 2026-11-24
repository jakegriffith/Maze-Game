import { config } from './config.js'
import { createGame } from './game.js'
import { createPadInput } from './input.js'
import { createTuningPanel } from './tuning.js'
import { showScreen, hideAllScreens } from './router.js'

// phone.html        → two-player game
// phone.html?solo   → solo tuning demo
// (The laptop QR screen is index.html — see display.js)

const isSolo = new URLSearchParams(window.location.search).has('solo')

if (isSolo) {
  runSolo()
} else {
  runMultiplayer()
}

// ── SOLO MODE ─────────────────────────────────────────────────────────

function runSolo() {
  const mazeCanvas = document.getElementById('maze-canvas')
  const padCanvas  = document.getElementById('pad-canvas')
  const winOverlay = document.getElementById('win-overlay')
  const newMazeBtn = document.getElementById('new-maze-btn')

  const sizeCanvases = () => sizeGameCanvases(mazeCanvas, padCanvas)

  sizeCanvases()

  const game  = createGame(mazeCanvas, () => winOverlay.classList.add('visible'), 'solo')
  const input = createPadInput(padCanvas)
  game.start(config.seed)

  window.addEventListener('resize', () => { sizeCanvases(); game.resize(); input.draw() })

  newMazeBtn.addEventListener('click', () => {
    config.seed = String(Math.random()).slice(2)
    winOverlay.classList.remove('visible')
    game.restart(config.seed)
  })

  let lastTs = null
  function loop(ts) {
    if (lastTs === null) lastTs = ts
    const dt = Math.min((ts - lastTs) / 1000, 0.05)
    lastTs = ts
    const { vx, vy } = input.getVelocity()
    game.setVelocity(vx, vy)
    game.step(dt)
    game.draw()
    requestAnimationFrame(loop)
  }
  requestAnimationFrame(loop)

  createTuningPanel((fullRebuild) => {
    if (fullRebuild) {
      winOverlay.classList.remove('visible')
      sizeCanvases()
      game.start(config.seed)
      input.draw()
    }
  })
}

// ── MULTIPLAYER MODE ──────────────────────────────────────────────────
//
// Phone journey:
//   name → "Waiting for someone." → Round 1 brief → ROUND 1 (pair, anonymous)
//   → "You found someone." → name reveal → ROUND 2 (pair, may call out)
//   → "You found Sam." → "Waiting for others to join you." (≤ 60 s)
//   → Round 3 brief → ROUND 3 (≈4) → … → ROUND 5 (≈8)
//   → "You found each other." → Begin again
//
// Every round: touching someone links you. You only see the people you're
// linked with. The round ends when everyone is linked into one group.
// Groups grow by a pair at a time (2 → 4 → 6 → 8); if nobody is ready to
// join within config.mergeWaitSeconds, the group carries on as it is.

async function runMultiplayer() {
  const { mountEntry }        = await import('./screens/entry.js')
  const { mountWaiting }      = await import('./screens/waiting.js')
  const { mountInstructions } = await import('./screens/instructions.js')
  const { mountRound2 }       = await import('./screens/round2.js')
  const { mountGroup }        = await import('./screens/group.js')
  const { mountMessage }      = await import('./screens/message.js')

  const screen = (id) => document.getElementById(`screen-${id}`)

  function showMessage(opts) {
    mountMessage(screen('message'), opts)
    showScreen('message')
  }

  // ── Firebase not set up yet? Say so instead of crashing ────────────
  const { firebaseConfig } = await import('./firebase-config.js')
  if (!firebaseConfig.apiKey || String(firebaseConfig.apiKey).startsWith('PASTE')) {
    showMessage({
      label: 'Not connected yet.',
      body: 'Firebase hasn’t been set up.\nSee the README.',
    })
    return
  }

  let signIn, mp
  try {
    ({ signIn } = await import('./firebase.js'))
    mp = await import('./multiplayer.js')
  } catch (err) {
    console.error(err)
    showMessage({
      label: 'Could not connect.',
      body: 'Check the Firebase settings.',
      button: 'Try again',
      onButton: () => location.reload(),
    })
    return
  }

  // ── State ──────────────────────────────────────────────────────────
  const S = {
    uid: null,
    name: null,
    roomId: null,
    room: null,          // latest room snapshot
    unsubRoom: null,
    lobby: null,
    mySlot: undefined,   // start spot in the current room
    otherNames: [],      // names of everyone else in the room
    phase: 'entry',      // entry | signing-in | lobby | joining | intro | ready-wait
                         // | playing | found | merge-wait | finished | left
    stage: 0,            // round this phone is on
    linked: new Set(),   // people I've already written a link with this round
    foundWritten: 0,
    mergeKey: null,      // the merge this phone is running as group leader
    mergeTimers: [],
  }

  const debug = new URLSearchParams(location.search).has('debug')
  const mazeCanvas = document.getElementById('maze-canvas')
  const padCanvas  = document.getElementById('pad-canvas')
  let game  = null
  let input = null
  let loopId = 0
  let posWriteTs = 0
  let wakeLock = null

  goToEntry()

  // ── Entry ──────────────────────────────────────────────────────────

  function goToEntry() {
    leaveCurrentRoom()
    S.phase = 'entry'
    mountEntry(screen('entry'), onNameSubmit)
    showScreen('entry')
  }

  async function onNameSubmit(name) {
    if (S.phase !== 'entry') return   // ignore double-taps
    S.phase = 'signing-in'
    S.name = name
    try {
      if (!S.uid) S.uid = await signIn()
    } catch (err) {
      console.error(err)
      S.phase = 'entry'
      showMessage({
        label: 'Could not connect.',
        body: 'Check the internet connection.',
        button: 'Try again',
        onButton: goToEntry,
      })
      return
    }
    findPartner()
  }

  // ── Round 1 pairing ────────────────────────────────────────────────

  async function findPartner() {
    leaveCurrentRoom()
    S.phase = 'lobby'
    const lobby = mp.joinLobby(S.uid, S.name)
    S.lobby = lobby

    mountWaiting(screen('waiting'), 'Waiting for someone.', () => {
      S.lobby = null
      lobby.cancel().catch(console.error)
      goToEntry()
    })
    showScreen('waiting')

    let roomId
    try {
      roomId = await lobby.matched
    } catch (err) {
      if (S.lobby !== lobby) return
      console.error(err)
      S.lobby = null
      showMessage({ label: 'Could not connect.', button: 'Try again', onButton: findPartner })
      return
    }

    // Player left the waiting screen while the match was landing
    if (S.lobby !== lobby || S.phase !== 'lobby') {
      mp.leaveRoom(roomId, S.uid).catch(console.error)
      return
    }
    S.lobby = null
    enterRoom(roomId)
  }

  // ── Rooms ──────────────────────────────────────────────────────────

  function enterRoom(roomId) {
    S.roomId = roomId
    S.room = null
    S.phase = 'joining'
    mp.registerPresence(roomId, S.uid).catch(console.error)
    S.unsubRoom = mp.watchRoom(roomId, onRoom)
  }

  function switchRoom(newRoomId) {
    leaveCurrentRoom()
    enterRoom(newRoomId)
  }

  function leaveCurrentRoom() {
    stopLoop()
    S.mergeTimers.forEach(clearTimeout)
    S.mergeTimers = []
    S.mergeKey = null
    if (S.unsubRoom) { S.unsubRoom(); S.unsubRoom = null }
    if (S.roomId) { mp.leaveRoom(S.roomId, S.uid).catch(console.error); S.roomId = null }
    S.room = null
    S.stage = 0
    S.mySlot = undefined
  }

  // Fires whenever anything in the room changes
  function onRoom(snap) {
    if (['finished', 'left', 'entry'].includes(S.phase)) return
    const room = snap.val()
    if (!room) return everyoneLeft()
    S.room = room

    // This group has merged into a bigger one
    if (room.next) {
      if (S.phase === 'merge-wait' || S.phase === 'joining') switchRoom(room.next)
      return  // anyone still reading "You found…" follows when they tap Continue
    }

    const players = mp.presentPlayers(room)

    // My record vanished (a brief connection drop) — put it back
    if (!players[S.uid]) {
      if (S.mySlot !== undefined) {
        mp.rejoin(S.roomId, S.uid, { name: S.name, slot: S.mySlot }).catch(console.error)
      }
      return
    }
    S.mySlot = players[S.uid].slot

    const ids = Object.keys(players)
    if (ids.length < 2) return everyoneLeft()
    S.otherNames = ids.filter(id => id !== S.uid).map(id => players[id].name)

    if (S.phase === 'joining') return goIntro(room.stage)

    if (S.phase === 'ready-wait') {
      const allReady = ids.every(id => players[id].ready === S.stage)
      if (room.stage === S.stage && allReady) startRound()
      return
    }

    if (S.phase === 'playing') {
      if (room.found?.[S.stage]) return onFound()
      updateLinks(room, players)
      return
    }

    if (S.phase === 'merge-wait' && room.stage > S.stage) return goIntro(room.stage)

    if (S.phase === 'found' || S.phase === 'merge-wait') maybeLead(room, players)
  }

  // ── Round intro + ready ────────────────────────────────────────────

  function goIntro(stage) {
    stopLoop()
    S.stage = stage
    S.phase = 'intro'
    S.linked = new Set()
    S.foundWritten = 0
    const names = S.otherNames

    const onReady = () => {
      S.phase = 'ready-wait'
      const label =
        stage === 1 ? 'Waiting for the other person.' :
        stage === 2 ? `Waiting for ${names[0]}.` :
                      'Waiting for everyone.'
      mountWaiting(screen('waiting'), label, findPartner)
      showScreen('waiting')
      mp.writeReady(S.roomId, S.uid, stage)
    }

    if (stage === 1) {
      mountInstructions(screen('instructions'), onReady)
      showScreen('instructions')
    } else if (stage === 2) {
      mountRound2(screen('round2'), names[0], onReady)
      showScreen('round2')
    } else {
      mountGroup(screen('group'), stage, names, onReady)
      showScreen('group')
    }
  }

  // ── Playing ────────────────────────────────────────────────────────

  function startRound() {
    S.phase = 'playing'

    if (!input) {
      // One-time setup: direction pad + resize handling
      sizeGameCanvases(mazeCanvas, padCanvas)
      input = createPadInput(padCanvas)
      window.addEventListener('resize', () => {
        sizeGameCanvases(mazeCanvas, padCanvas)
        if (game) game.resize()
        input.draw()
      })
    }

    sizeGameCanvases(mazeCanvas, padCanvas)
    input.draw()

    game = createGame(mazeCanvas, () => {}, S.mySlot)
    game.start(mp.seedFor(S.roomId, S.stage))
    if (debug) window.__maze = game

    hideAllScreens()  // reveals the maze behind the overlays
    keepAwake()
    startLoop()
    updateLinks(S.room, mp.presentPlayers(S.room))
  }

  // Positions of everyone else, who I'm linked with, and whether we're done
  function updateLinks(room, players) {
    if (!game) return
    const others = {}
    for (const [id, p] of Object.entries(players)) {
      if (id !== S.uid && p.stage === S.stage) others[id] = { mx: p.x, my: p.y }
    }
    game.setOthers(others)

    const links = Object.keys(room.links?.[S.stage] || {})
      .map(key => key.split('__'))
      .filter(([a, b]) => players[a] && players[b])
    const cluster = clusterOf(S.uid, links)

    const meOr = (id) => (id === S.uid ? 'me' : id)
    game.setLinked(
      [...cluster].filter(id => id !== S.uid),
      links.filter(([a, b]) => cluster.has(a) && cluster.has(b)).map(([a, b]) => [meOr(a), meOr(b)]),
    )

    // Everyone is in my linked group → round found (any phone may announce it)
    if (cluster.size === Object.keys(players).length && S.foundWritten !== S.stage) {
      S.foundWritten = S.stage
      mp.writeFound(S.roomId, S.stage)
    }
  }

  function startLoop() {
    const myLoop = ++loopId
    let lastTs = null

    function frame(ts) {
      if (myLoop !== loopId) return  // a newer loop (or stopLoop) replaced this one
      if (lastTs === null) lastTs = ts
      const dt = Math.min((ts - lastTs) / 1000, 0.05)
      lastTs = ts

      const { vx, vy } = input.getVelocity()
      game.setVelocity(vx, vy)
      game.step(dt)
      game.draw()

      // Share position ~12 times a second
      if (ts - posWriteTs > 83) {
        posWriteTs = ts
        const { mx, my } = game.getPosition()
        mp.writePosition(S.roomId, S.uid, S.stage, mx, my)
      }

      // Touching someone new? Link up.
      for (const other of game.touching()) {
        if (!S.linked.has(other)) {
          S.linked.add(other)
          mp.writeLink(S.roomId, S.stage, S.uid, other)
        }
      }

      requestAnimationFrame(frame)
    }
    requestAnimationFrame(frame)
  }

  function stopLoop() {
    loopId++
    posWriteTs = 0
    releaseWake()
  }

  // ── End of a round ─────────────────────────────────────────────────

  function onFound() {
    stopLoop()
    const k = S.stage
    const names = S.otherNames

    if (k >= config.lastRound) {
      S.phase = 'finished'
      const roomId = S.roomId
      if (S.unsubRoom) { S.unsubRoom(); S.unsubRoom = null }
      S.roomId = null
      // Small delay so everyone's phone sees the final "found" first
      setTimeout(() => mp.leaveRoom(roomId, S.uid).catch(console.error), 2000)
      const n = names.length + 1
      showMessage({
        label: 'You found each other.',
        body: n > 2 ? `All ${n} of you.` : '',
        button: 'Begin again',
        onButton: goToEntry,
      })
      return
    }

    S.phase = 'found'
    if (k === 1) mp.advanceStage(S.roomId, 1).catch(console.error)

    showMessage({
      label: k === 1 ? 'You found someone.' :
             k === 2 ? `You found ${names[0]}.` :
                       'You found each other.',
      button: 'Continue',
      onButton: afterFound,
    })
    maybeLead(S.room, mp.presentPlayers(S.room))
  }

  function afterFound() {
    const room = S.room
    if (room?.next) return switchRoom(room.next)
    if (room && room.stage > S.stage) return goIntro(room.stage)
    S.phase = 'merge-wait'
    mountWaiting(screen('waiting'),
      S.stage === 1 ? 'One moment.' : 'Waiting for others to join you.',
      findPartner)
    showScreen('waiting')
  }

  // ── Growing the group (the group's leader does this) ───────────────

  function maybeLead(room, players) {
    const k = room.stage
    if (!room.found?.[k] || room.next) return
    if (k < 2 || k >= config.lastRound) return
    const leader = Object.keys(players).sort()[0]
    if (leader !== S.uid) return
    const key = `${S.roomId}:${k}`
    if (S.mergeKey === key) return
    S.mergeKey = key
    runMerge(S.roomId, room, Object.keys(players).length, k)
  }

  async function runMerge(roomId, room, size, k) {
    try {
      const res = await mp.joinGroups(roomId, size, k, config.maxGroup)

      if (res.partnerRoomId) {
        // We found a group to join with: build the new, bigger room
        await mp.createMergedRoom(roomId, room, res.partnerRoomId, res.partnerStage)
        return
      }

      // Nobody ready yet — wait, then carry on as we are
      S.mergeTimers.push(setTimeout(async () => {
        if (S.roomId !== roomId) return
        const stillWaiting = await mp.leaveGroups(roomId)
        if (stillWaiting) {
          await mp.advanceStage(roomId, k)
        } else {
          // Another group claimed us at the last second; give them time to
          // build the new room, then carry on anyway if it never appears.
          S.mergeTimers.push(setTimeout(() => {
            if (S.roomId === roomId && !S.room?.next && S.room?.stage === k) {
              mp.advanceStage(roomId, k)
            }
          }, 15000))
        }
      }, config.mergeWaitSeconds * 1000))
    } catch (err) {
      console.error(err)
      S.mergeKey = null
    }
  }

  // ── Everyone else dropped out ──────────────────────────────────────

  function everyoneLeft() {
    const label =
      S.stage <= 1                                   ? 'The other person left.' :
      S.stage === 2 && S.otherNames.length === 1     ? `${S.otherNames[0]} left.` :
                                                       'Everyone else left.'
    leaveCurrentRoom()
    S.phase = 'left'
    showMessage({ label, button: 'Find someone new', onButton: findPartner })
  }

  // ── Keep the phone screen from dimming mid-maze (where supported) ──

  async function keepAwake() {
    try {
      if ('wakeLock' in navigator && !wakeLock) {
        wakeLock = await navigator.wakeLock.request('screen')
      }
    } catch { /* not supported or not allowed — fine */ }
  }

  function releaseWake() {
    if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null }
  }
}

// Everyone connected to `start` through links (a chain of hands)
function clusterOf(start, links) {
  const seen = new Set([start])
  let grew = true
  while (grew) {
    grew = false
    for (const [a, b] of links) {
      if (seen.has(a) && !seen.has(b)) { seen.add(b); grew = true }
      if (seen.has(b) && !seen.has(a)) { seen.add(a); grew = true }
    }
  }
  return seen
}

// ── Canvas sizing (solo + multiplayer) ────────────────────────────────
//
// Maze: square, as wide as the screen (leaving at least MIN_PAD for buttons).
// Direction pad: fills all the space left underneath.

function sizeGameCanvases(mazeCanvas, padCanvas) {
  const MIN_PAD = 200
  const W = window.innerWidth
  const H = window.innerHeight
  const mazeSize = Math.max(100, Math.min(W, H - MIN_PAD))
  const padHeight = Math.max(MIN_PAD, H - mazeSize)

  mazeCanvas.width  = mazeSize
  mazeCanvas.height = mazeSize
  mazeCanvas.style.width  = mazeSize + 'px'
  mazeCanvas.style.height = mazeSize + 'px'

  padCanvas.width  = W
  padCanvas.height = padHeight
  padCanvas.style.width  = W + 'px'
  padCanvas.style.height = padHeight + 'px'
}
