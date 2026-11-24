import { config } from './config.js'
import { generateMaze } from './maze.js'

// role: 'solo' | slot number 0–7 (multiplayer start spot)
// Slots: corners first, then edge midpoints, so up to 8 people start spread out.
//   0 top-left · 1 bottom-right · 2 top-right · 3 bottom-left
//   4 top-middle · 5 bottom-middle · 6 left-middle · 7 right-middle
function slotCell(slot, cols, rows) {
  const mc = Math.floor(cols / 2)
  const mr = Math.floor(rows / 2)
  const cells = [
    [0, 0], [cols - 1, rows - 1], [cols - 1, 0], [0, rows - 1],
    [mc, 0], [mc, rows - 1], [0, mr], [cols - 1, mr],
  ]
  return cells[slot % cells.length]
}

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
  // Who to draw: ids in my linked cluster, and the linked pairs to join with lines.
  // 'me' stands for this phone's own ball in pairs.
  let visible = new Set()
  let linkLines = []

  let won = false

  function init(seed) {
    won = false
    cols = config.gridSize
    rows = config.gridSize
    maze = generateMaze(seed, cols, rows)
    layout()
    velX = 0
    velY = 0
    others = {}
    visible = new Set()
    linkLines = []

    if (role === 'solo') {
      // Solo: start top-left, goal bottom-right
      ballX = cellSize * 0.5
      ballY = cellSize * 0.5
      goalX = cellSize * (cols - 0.5)
      goalY = cellSize * (rows - 0.5)
    } else {
      const [c, r] = slotCell(role, cols, rows)
      ballX = cellSize * (c + 0.5)
      ballY = cellSize * (r + 0.5)
    }
  }

  function layout() {
    const size = mazeCanvas.width  // square canvas
    cellSize = size / config.gridSize
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
    if (won) return

    // Apply friction every frame regardless of input — caller overlays input velocity
    velX *= config.friction
    velY *= config.friction

    // Sub-step to prevent tunneling at high speeds or low frame rates
    const steps = Math.ceil((Math.hypot(velX, velY) * dt) / (config.ballRadius * 0.5)) + 1
    const subDt = dt / steps

    for (let i = 0; i < steps; i++) {
      ballX += velX * subDt
      ballY += velY * subDt

      const result = resolveWalls(ballX, ballY, config.ballRadius)
      ballX = result.x
      ballY = result.y
      if (result.hitX) velX = 0
      if (result.hitY) velY = 0
    }

    // Win condition — solo only. Multiplayer meeting is detected externally.
    if (role === 'solo') {
      const dx = ballX - goalX
      const dy = ballY - goalY
      if (Math.hypot(dx, dy) < config.ballRadius * 2.5) {
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

    if (role !== 'solo') drawLinked()

    if (vis > 0) ctx.restore()

    drawBall()
  }

  // People you've linked up with: thin hollow rings, joined by thin lines.
  // Everyone you haven't reached yet stays invisible.
  function drawLinked() {
    const pos = (id) => {
      if (id === 'me') return [ballX, ballY]
      const o = others[id]
      return o ? [o.mx * cellSize, o.my * cellSize] : null
    }

    ctx.strokeStyle = config.ink
    ctx.lineWidth = 1

    for (const [a, b] of linkLines) {
      const pa = pos(a)
      const pb = pos(b)
      if (!pa || !pb) continue
      ctx.beginPath()
      ctx.moveTo(pa[0], pa[1])
      ctx.lineTo(pb[0], pb[1])
      ctx.stroke()
    }

    for (const id of visible) {
      const p = pos(id)
      if (!p) continue
      // Fill with background first so link lines don't show through the ring
      ctx.beginPath()
      ctx.arc(p[0], p[1], config.ballRadius, 0, Math.PI * 2)
      ctx.fillStyle = config.bg
      ctx.fill()
      ctx.stroke()
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
    const r = config.ballRadius * 1.4
    ctx.beginPath()
    ctx.arc(goalX, goalY, r, 0, Math.PI * 2)
    ctx.strokeStyle = config.ink
    ctx.lineWidth = config.wallThickness
    ctx.stroke()
  }

  function drawBall() {
    ctx.beginPath()
    ctx.arc(ballX, ballY, config.ballRadius, 0, Math.PI * 2)
    ctx.fillStyle = config.ink
    ctx.fill()
  }

  // Public API — main.js drives the loop, calling step() then draw() each frame
  return {
    start(seed) {
      init(seed)
    },

    restart(seed) {
      init(seed)
    },

    setVelocity(vx, vy) {
      if (won) return
      const inputMag = Math.hypot(vx, vy)
      if (inputMag > 1) {
        velX = vx
        velY = vy
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

    // Returns ball position in maze coordinates (cell units, e.g. 0.5 = center of cell 0)
    getPosition() {
      return { mx: ballX / cellSize, my: ballY / cellSize }
    },

    // Other players' positions this round (maze coords): { id: { mx, my } }
    setOthers(map) {
      others = map
    },

    // Who to draw: ids in my linked cluster + linked pairs ('me' = this ball)
    setLinked(visibleIds, pairs) {
      visible = new Set(visibleIds)
      linkLines = pairs
    },

    // Ids of other players whose ball is touching mine right now
    touching() {
      const meetDist = (config.ballRadius * 2) / cellSize
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

    get won() { return won },
  }
}
