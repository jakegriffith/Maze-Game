import { config } from './config.js'
import { generateMaze } from './maze.js'

// ── Start positions ───────────────────────────────────────────────────

// Finding rounds: corners first, then edge midpoints, so up to 8 people
// start spread out.
//   0 top-left · 1 bottom-right · 2 top-right · 3 bottom-left
//   4 top-middle · 5 bottom-middle · 6 left-middle · 7 right-middle
export function slotCell(slot, cols, rows) {
  const mc = Math.floor(cols / 2)
  const mr = Math.floor(rows / 2)
  const cells = [
    [0, 0], [cols - 1, rows - 1], [cols - 1, 0], [0, rows - 1],
    [mc, 0], [mc, rows - 1], [0, mr], [cols - 1, mr],
  ]
  return cells[slot % cells.length]
}

// Battle: Red spread down the left edge, Blue down the right edge.
export function teamCell(team, index, teamSize, grid) {
  const col = team === 'red' ? 0 : grid - 1
  const row = Math.min(grid - 1, Math.floor(((index + 0.5) * grid) / Math.max(1, teamSize)))
  return [col, row]
}

// role: 'solo' | [col, row] start cell (multiplayer)
export function createGame(mazeCanvas, onWin, role = 'solo') {
  const ctx = mazeCanvas.getContext('2d')

  let maze = null
  let cols = 0
  let rows = 0
  let cellSize = 0

  // Ball state in pixel coords
  let ballX = 0
  let ballY = 0
  let velX = 0
  let velY = 0

  // Goal cell (bottom-right corner) — solo only
  let goalX = 0
  let goalY = 0

  // Other players (multiplayer only), in maze coords: id → { mx, my }
  let others = {}
  // What to draw for other players (see setScene)
  let scene = { balls: [], lines: [], me: {} }

  let won = false

  // Ball radius and speed scale with the cell, so they fit any maze size
  const radius = () => config.ballSize * cellSize

  function init(seed, grid) {
    won = false
    cols = grid || config.gridSize
    rows = cols
    maze = generateMaze(seed, cols, rows)
    layout()
    velX = 0
    velY = 0
    others = {}
    scene = { balls: [], lines: [], me: {} }

    if (role === 'solo') {
      // Solo: start top-left, goal bottom-right
      ballX = cellSize * 0.5
      ballY = cellSize * 0.5
      goalX = cellSize * (cols - 0.5)
      goalY = cellSize * (rows - 0.5)
    } else {
      const [c, r] = role
      ballX = cellSize * (c + 0.5)
      ballY = cellSize * (r + 0.5)
    }
  }

  function layout() {
    const size = mazeCanvas.width  // square canvas
    cellSize = size / cols
  }

  // ── Collision helpers ──────────────────────────────────────────────

  function cellOf(px, py) {
    return {
      c: Math.floor(px / cellSize),
      r: Math.floor(py / cellSize),
    }
  }

  // Returns true if wall exists between adjacent cells in direction d from (r,c)
  // d: 0=top,1=right,2=bottom,3=left
  function hasWall(r, c, d) {
    if (r < 0 || r >= rows || c < 0 || c >= cols) return true
    return maze[r][c].walls[d]
  }

  // Check if a circle at (cx,cy) with given radius overlaps a wall segment and push it out.
  // Returns { x, y, hitX, hitY } where hitX/hitY indicate which axes were blocked.
  function resolveWalls(cx, cy, radius) {
    let hitX = false
    let hitY = false
    const half = config.wallThickness / 2

    // We test the four walls of the cell the ball center is in,
    // plus neighboring cells the ball's footprint might overlap.
    const minC = Math.max(0, Math.floor((cx - radius) / cellSize))
    const maxC = Math.min(cols - 1, Math.floor((cx + radius) / cellSize))
    const minR = Math.max(0, Math.floor((cy - radius) / cellSize))
    const maxR = Math.min(rows - 1, Math.floor((cy + radius) / cellSize))

    for (let r = minR; r <= maxR; r++) {
      for (let c = minC; c <= maxC; c++) {
        const left   = c * cellSize
        const top    = r * cellSize
        const right  = left + cellSize
        const bottom = top + cellSize

        // Top wall of this cell
        if (hasWall(r, c, 0)) {
          const wallY = top
          if (cy - radius < wallY + half && cy > wallY - half) {
            // Ball is too close to this horizontal wall from below
            if (cx > left - half && cx < right + half) {
              cy = wallY + half + radius
              hitY = true
            }
          }
        }

        // Bottom wall of this cell
        if (hasWall(r, c, 2)) {
          const wallY = bottom
          if (cy + radius > wallY - half && cy < wallY + half) {
            if (cx > left - half && cx < right + half) {
              cy = wallY - half - radius
              hitY = true
            }
          }
        }

        // Left wall of this cell
        if (hasWall(r, c, 3)) {
          const wallX = left
          if (cx - radius < wallX + half && cx > wallX - half) {
            if (cy > top - half && cy < bottom + half) {
              cx = wallX + half + radius
              hitX = true
            }
          }
        }

        // Right wall of this cell
        if (hasWall(r, c, 1)) {
          const wallX = right
          if (cx + radius > wallX - half && cx < wallX + half) {
            if (cy > top - half && cy < bottom + half) {
              cx = wallX - half - radius
              hitX = true
            }
          }
        }
      }
    }

    // Keep ball inside outer border
    const border = half + radius
    if (cx < border) { cx = border; hitX = true }
    if (cx > cols * cellSize - border) { cx = cols * cellSize - border; hitX = true }
    if (cy < border) { cy = border; hitY = true }
    if (cy > rows * cellSize - border) { cy = rows * cellSize - border; hitY = true }

    return { x: cx, y: cy, hitX, hitY }
  }

  // ── Game loop ──────────────────────────────────────────────────────

  function update(dt) {
    if (won || scene.me.hidden) return

    // Apply friction every frame regardless of input — caller overlays input direction
    velX *= config.friction
    velY *= config.friction

    // Sub-step to prevent tunneling at high speeds or low frame rates
    const r = radius()
    const steps = Math.ceil((Math.hypot(velX, velY) * dt) / (r * 0.5)) + 1
    const subDt = dt / steps

    for (let i = 0; i < steps; i++) {
      ballX += velX * subDt
      ballY += velY * subDt

      const result = resolveWalls(ballX, ballY, r)
      ballX = result.x
      ballY = result.y
      if (result.hitX) velX = 0
      if (result.hitY) velY = 0
    }

    // Win condition — solo only. Multiplayer meetings are detected in main.js.
    if (role === 'solo') {
      const dx = ballX - goalX
      const dy = ballY - goalY
      if (Math.hypot(dx, dy) < r * 2.5) {
        won = true
        onWin()
      }
    }
  }

  function draw() {
    const size = mazeCanvas.width
    ctx.clearRect(0, 0, size, size)

    // Background
    ctx.fillStyle = config.bg
    ctx.fillRect(0, 0, size, size)

    // Fog of war clip
    const vis = config.visibleRadius
    if (vis > 0) {
      ctx.save()
      ctx.beginPath()
      ctx.arc(ballX, ballY, vis, 0, Math.PI * 2)
      ctx.clip()
    }

    drawMaze()
    if (role === 'solo') drawGoal()
    else drawOthers()

    if (vis > 0) ctx.restore()

    drawBall()
  }

  // Other players, as described by setScene():
  //   lines: pairs of ids ('me' = this ball) joined by a thin line
  //   balls: { id, color, filled } — filled disc, or a thin hollow ring
  function drawOthers() {
    const pos = (id) => {
      if (id === 'me') return [ballX, ballY]
      const o = others[id]
      return o ? [o.mx * cellSize, o.my * cellSize] : null
    }
    const r = radius()

    ctx.lineWidth = 1
    ctx.strokeStyle = config.ink
    for (const [a, b] of scene.lines) {
      const pa = pos(a)
      const pb = pos(b)
      if (!pa || !pb) continue
      ctx.beginPath()
      ctx.moveTo(pa[0], pa[1])
      ctx.lineTo(pb[0], pb[1])
      ctx.stroke()
    }

    for (const ball of scene.balls) {
      const p = pos(ball.id)
      if (!p) continue
      ctx.beginPath()
      ctx.arc(p[0], p[1], r, 0, Math.PI * 2)
      if (ball.filled) {
        ctx.fillStyle = ball.color || config.ink
        ctx.fill()
      } else {
        // Fill with background first so link lines don't show through the ring
        ctx.fillStyle = config.bg
        ctx.fill()
        ctx.strokeStyle = ball.color || config.ink
        ctx.stroke()
      }
    }
  }

  function drawMaze() {
    ctx.strokeStyle = config.ink
    ctx.lineWidth = config.wallThickness
    ctx.lineCap = 'square'

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = c * cellSize
        const y = r * cellSize
        const walls = maze[r][c].walls

        ctx.beginPath()
        // Top
        if (walls[0]) {
          ctx.moveTo(x, y)
          ctx.lineTo(x + cellSize, y)
        }
        // Right
        if (walls[1]) {
          ctx.moveTo(x + cellSize, y)
          ctx.lineTo(x + cellSize, y + cellSize)
        }
        // Bottom
        if (walls[2]) {
          ctx.moveTo(x, y + cellSize)
          ctx.lineTo(x + cellSize, y + cellSize)
        }
        // Left
        if (walls[3]) {
          ctx.moveTo(x, y)
          ctx.lineTo(x, y + cellSize)
        }
        ctx.stroke()
      }
    }
  }

  function drawGoal() {
    ctx.beginPath()
    ctx.arc(goalX, goalY, radius() * 1.4, 0, Math.PI * 2)
    ctx.strokeStyle = config.ink
    ctx.lineWidth = config.wallThickness
    ctx.stroke()
  }

  // My ball: solid (ink, or my team colour). In the battle it also gets a
  // thin ink ring so I can pick myself out from my teammates.
  function drawBall() {
    const me = scene.me
    if (me.hidden) return
    const r = radius()
    ctx.beginPath()
    ctx.arc(ballX, ballY, r, 0, Math.PI * 2)
    ctx.fillStyle = me.color || config.ink
    ctx.fill()
    if (me.ring) {
      ctx.beginPath()
      ctx.arc(ballX, ballY, r + 3, 0, Math.PI * 2)
      ctx.strokeStyle = config.ink
      ctx.lineWidth = 1.5
      ctx.stroke()
    }
  }

  // Public API — main.js drives the loop, calling step() then draw() each frame
  return {
    start(seed, grid) {
      init(seed, grid)
    },

    restart(seed, grid) {
      init(seed, grid)
    },

    // Direction from the pad: (dx, dy) each -1…1. Speed is config.speed cells/s.
    setDirection(dx, dy) {
      if (won) return
      const mag = Math.hypot(dx, dy)
      if (mag > 0) {
        const speed = config.speed * cellSize
        velX = (dx / mag) * speed
        velY = (dy / mag) * speed
      }
    },

    step(dt) {
      update(dt)
    },

    draw() {
      draw()
    },

    resize() {
      // Keep the ball in the same maze spot when the canvas changes size
      const mx = cellSize ? ballX / cellSize : 0.5
      const my = cellSize ? ballY / cellSize : 0.5
      layout()
      ballX = mx * cellSize
      ballY = my * cellSize
    },

    // Ball position in maze coordinates (cell units, e.g. 0.5 = center of cell 0)
    getPosition() {
      return { mx: ballX / cellSize, my: ballY / cellSize }
    },

    // Ball velocity in cells per second
    getVelocity() {
      return { vx: velX / cellSize, vy: velY / cellSize }
    },

    // Other players' positions this round (maze coords): { id: { mx, my } }
    setOthers(map) {
      others = map
    },

    // What to draw: { balls: [{id, color, filled}], lines: [[a, b]], me: {color, ring, hidden} }
    setScene(next) {
      scene = { balls: [], lines: [], me: {}, ...next }
    },

    // Ids of other players whose ball is touching mine right now
    touching() {
      const meetDist = config.ballSize * 2
      const mx = ballX / cellSize
      const my = ballY / cellSize
      return Object.entries(others)
        .filter(([, o]) => Math.hypot(mx - o.mx, my - o.my) < meetDist)
        .map(([id]) => id)
    },

    // Testing aid (phone.html?debug): jump the ball to a maze position
    teleport(mx, my) {
      ballX = mx * cellSize
      ballY = my * cellSize
      velX = 0
      velY = 0
    },

    get cellSize() { return cellSize },

    get grid() { return cols },

    get won() { return won },
  }
}
