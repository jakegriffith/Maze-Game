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
//   entry → waiting → instructions → ROUND 1 → "You found someone."
//   → Round 2 brief (partner's name) → Ready → waiting for partner
//   → ROUND 2 → "You found {name}." → Begin again (back to entry)
//
// At any point after pairing, if the partner's phone drops out the room
// is deleted and this phone shows "The other person left."

async function runMultiplayer() {
  const { mountEntry }        = await import('./screens/entry.js')
  const { mountWaiting }      = await import('./screens/waiting.js')
  const { mountInstructions } = await import('./screens/instructions.js')
  const { mountRound2 }       = await import('./screens/round2.js')
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
    role: null,          // 'a' | 'b'
    roomId: null,
    partnerName: null,
    seeds: null,         // [round1Seed, round2Seed]
    phase: 'entry',      // entry | lobby | instructions | round1 | met1 | between
                         // | ready-wait | round2 | finished | left
    round: 0,
    metWritten: 0,       // last round we wrote a "met" flag for
    unsubRoom: null,
    lobby: null,
  }

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

  // ── Lobby ──────────────────────────────────────────────────────────

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

    let match
    try {
      match = await lobby.matched
    } catch (err) {
      if (S.lobby !== lobby) return
      console.error(err)
      S.lobby = null
      showMessage({
        label: 'Could not connect.',
        button: 'Try again',
        onButton: findPartner,
      })
      return
    }

    // Player left the waiting screen while the match was landing
    if (S.lobby !== lobby || S.phase !== 'lobby') {
      mp.leaveRoom(match.roomId).catch(console.error)
      return
    }
    S.lobby = null
    onPaired(match)
  }

  function onPaired(match) {
    S.role        = match.role
    S.roomId      = match.roomId
    S.partnerName = match.partnerName
    S.seeds       = match.seeds
    S.round       = 0
    S.metWritten  = 0
    S.unsubRoom   = mp.watchRoom(S.roomId, onRoom)

    S.phase = 'instructions'
    mountInstructions(screen('instructions'), () => startRound(1))
    showScreen('instructions')
  }

  // ── Room updates (fires whenever anything in the room changes) ─────

  function onRoom(snap) {
    const room = snap.val()
    if (!room || !room.seed1) {
      if (S.phase !== 'finished') partnerLeft()
      return
    }

    const partner = room.players?.[S.role === 'a' ? 'b' : 'a']
    if (game && partner && partner.round === S.round) {
      game.setPartnerPosition(partner.x, partner.y)
    }

    if (S.phase === 'round1' && room.met1) return onMet(1)
    if (S.phase === 'round2' && room.met2) return onMet(2)

    if (S.phase === 'ready-wait') {
      if (room.status === 'round2') return startRound(2)
      if (room.players?.a?.ready && room.players?.b?.ready) {
        mp.writeStatus(S.roomId, 'round2')
      }
    }
  }

  // ── Rounds ─────────────────────────────────────────────────────────

  function startRound(n) {
    S.round = n
    S.phase = `round${n}`

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

    // Fresh game each pairing (role may differ); same game object for Round 2
    if (n === 1 || !game) game = createGame(mazeCanvas, () => {}, S.role)
    game.start(S.seeds[n - 1])

    hideAllScreens()  // reveals the maze behind the overlays
    keepAwake()
    startLoop()
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
        mp.writePosition(S.roomId, S.role, S.round, mx, my)
      }

      // Touching? Either phone may announce it.
      if (S.metWritten < S.round && game.checkMeeting()) {
        S.metWritten = S.round
        mp.writeMet(S.roomId, S.round)
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

  function onMet(n) {
    stopLoop()

    if (n === 1) {
      S.phase = 'met1'
      showMessage({
        label: 'You found someone.',
        button: 'Continue',
        onButton: showRound2Intro,
      })
      return
    }

    // End of Round 2
    S.phase = 'finished'
    const roomId = S.roomId
    if (S.unsubRoom) { S.unsubRoom(); S.unsubRoom = null }
    S.roomId = null
    // Small delay so the partner's phone sees the final "met" before the room vanishes
    setTimeout(() => mp.leaveRoom(roomId).catch(console.error), 2000)

    showMessage({
      label: `You found ${S.partnerName}.`,
      button: 'Begin again',
      onButton: goToEntry,
    })
  }

  function showRound2Intro() {
    S.phase = 'between'
    mountRound2(screen('round2'), S.partnerName, () => {
      S.phase = 'ready-wait'
      mountWaiting(screen('waiting'), `Waiting for ${S.partnerName}.`)
      showScreen('waiting')
      mp.writeReady(S.roomId, S.role)
    })
    showScreen('round2')
  }

  // ── Partner dropped out ────────────────────────────────────────────

  function partnerLeft() {
    const knowsName = ['between', 'ready-wait', 'round2'].includes(S.phase)
    const who = knowsName ? S.partnerName : 'The other person'
    leaveCurrentRoom()
    S.phase = 'left'
    showMessage({
      label: `${who} left.`,
      button: 'Find someone new',
      onButton: findPartner,
    })
  }

  function leaveCurrentRoom() {
    stopLoop()
    if (S.unsubRoom) { S.unsubRoom(); S.unsubRoom = null }
    if (S.roomId) { mp.leaveRoom(S.roomId).catch(console.error); S.roomId = null }
    S.role = null
    S.partnerName = null
    S.seeds = null
    S.round = 0
    S.metWritten = 0
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
