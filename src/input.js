import { config } from './config.js'

// Game Boy–style direction pad drawn on the pad canvas under the maze.
//
// Hold a direction to roll at full speed; let go and the ball coasts to a
// stop (friction). Touches anywhere in the pad area count, judged by their
// direction from the centre of the cross, so thumbs don't need to be precise.
// Pressing between two arms (a corner) gives a diagonal. Multi-touch safe.
// Arrow keys also work (laptop testing).

export function createPadInput(canvas) {
  const ctx = canvas.getContext('2d')

  // Active pointers: id → { x, y } in canvas pixels
  const touches = new Map()
  const keys = { ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false }

  // Last-drawn pressed state, so we only redraw when it changes
  let drawnState = ''

  // ── Geometry ───────────────────────────────────────────────────────

  function geometry() {
    const W = canvas.width
    const H = canvas.height
    const size = Math.min(W * 0.8, H * 0.85, 280)  // whole cross, edge to edge
    return { cx: W / 2, cy: H / 2, size, arm: size / 3 }
  }

  // Which directions does one touch point press?
  function dirsFor(x, y) {
    const { cx, cy, arm } = geometry()
    const dx = x - cx
    const dy = y - cy
    const d = { up: false, down: false, left: false, right: false }
    if (Math.max(Math.abs(dx), Math.abs(dy)) < arm / 2) return d  // centre square: nothing
    // Each axis counts if it's a real part of the direction (corners → diagonal)
    const t = 0.4 * Math.hypot(dx, dy)
    if (dy < -t) d.up = true
    if (dy >  t) d.down = true
    if (dx < -t) d.left = true
    if (dx >  t) d.right = true
    return d
  }

  function pressed() {
    const p = { up: keys.ArrowUp, down: keys.ArrowDown, left: keys.ArrowLeft, right: keys.ArrowRight }
    for (const { x, y } of touches.values()) {
      const d = dirsFor(x, y)
      p.up ||= d.up; p.down ||= d.down; p.left ||= d.left; p.right ||= d.right
    }
    return p
  }

  // ── Drawing ────────────────────────────────────────────────────────

  function draw() {
    const W = canvas.width
    const H = canvas.height
    const { cx, cy, arm } = geometry()
    const p = pressed()
    drawnState = JSON.stringify(p) + W + 'x' + H

    ctx.fillStyle = config.bg
    ctx.fillRect(0, 0, W, H)

    const h = arm / 2
    // Four arm squares: [direction, centre x, centre y, arrow angle]
    const arms = [
      ['up',    cx,       cy - arm, -Math.PI / 2],
      ['down',  cx,       cy + arm,  Math.PI / 2],
      ['left',  cx - arm, cy,        Math.PI],
      ['right', cx + arm, cy,        0],
    ]

    // Filled (pressed) arms
    for (const [dir, x, y] of arms) {
      if (p[dir]) {
        ctx.fillStyle = config.ink
        ctx.fillRect(x - h, y - h, arm, arm)
      }
    }

    // Cross outline (one thin continuous line)
    ctx.beginPath()
    ctx.moveTo(cx - h, cy - 3 * h)
    ctx.lineTo(cx + h, cy - 3 * h)
    ctx.lineTo(cx + h, cy - h)
    ctx.lineTo(cx + 3 * h, cy - h)
    ctx.lineTo(cx + 3 * h, cy + h)
    ctx.lineTo(cx + h, cy + h)
    ctx.lineTo(cx + h, cy + 3 * h)
    ctx.lineTo(cx - h, cy + 3 * h)
    ctx.lineTo(cx - h, cy + h)
    ctx.lineTo(cx - 3 * h, cy + h)
    ctx.lineTo(cx - 3 * h, cy - h)
    ctx.lineTo(cx - h, cy - h)
    ctx.closePath()
    ctx.strokeStyle = config.ink
    ctx.lineWidth = 1
    ctx.stroke()

    // Arrows: small solid triangles, inverted when pressed
    const s = arm * 0.18
    for (const [dir, x, y, angle] of arms) {
      ctx.save()
      ctx.translate(x, y)
      ctx.rotate(angle)
      ctx.beginPath()
      ctx.moveTo(s, 0)
      ctx.lineTo(-s * 0.7, -s)
      ctx.lineTo(-s * 0.7, s)
      ctx.closePath()
      ctx.fillStyle = p[dir] ? config.bg : config.ink
      ctx.fill()
      ctx.restore()
    }
  }

  function redrawIfChanged() {
    const state = JSON.stringify(pressed()) + canvas.width + 'x' + canvas.height
    if (state !== drawnState) draw()
  }

  // ── Touch ──────────────────────────────────────────────────────────

  function local(t) {
    const rect = canvas.getBoundingClientRect()
    return {
      x: (t.clientX - rect.left) * (canvas.width / rect.width),
      y: (t.clientY - rect.top) * (canvas.height / rect.height),
    }
  }

  canvas.addEventListener('touchstart', e => {
    e.preventDefault()
    for (const t of e.changedTouches) touches.set(t.identifier, local(t))
    redrawIfChanged()
  }, { passive: false })

  canvas.addEventListener('touchmove', e => {
    e.preventDefault()
    for (const t of e.changedTouches) touches.set(t.identifier, local(t))
    redrawIfChanged()
  }, { passive: false })

  const endTouch = e => {
    e.preventDefault()
    for (const t of e.changedTouches) touches.delete(t.identifier)
    redrawIfChanged()
  }
  canvas.addEventListener('touchend', endTouch, { passive: false })
  canvas.addEventListener('touchcancel', endTouch, { passive: false })

  // ── Mouse (laptop testing) ─────────────────────────────────────────

  let mouseDown = false
  canvas.addEventListener('mousedown', e => {
    mouseDown = true
    touches.set('mouse', local(e))
    redrawIfChanged()
  })
  window.addEventListener('mousemove', e => {
    if (!mouseDown) return
    touches.set('mouse', local(e))
    redrawIfChanged()
  })
  window.addEventListener('mouseup', () => {
    mouseDown = false
    touches.delete('mouse')
    redrawIfChanged()
  })

  // ── Arrow keys ─────────────────────────────────────────────────────

  window.addEventListener('keydown', e => {
    if (e.key in keys) { keys[e.key] = true; e.preventDefault(); redrawIfChanged() }
  })
  window.addEventListener('keyup', e => {
    if (e.key in keys) { keys[e.key] = false; redrawIfChanged() }
  })

  // Phone switched apps / lost focus: release everything
  window.addEventListener('blur', () => {
    touches.clear()
    for (const k in keys) keys[k] = false
    redrawIfChanged()
  })

  draw()

  return {
    getVelocity() {
      const p = pressed()
      let vx = (p.right ? 1 : 0) - (p.left ? 1 : 0)
      let vy = (p.down ? 1 : 0) - (p.up ? 1 : 0)
      const mag = Math.hypot(vx, vy)
      if (mag === 0) return { vx: 0, vy: 0 }
      return {
        vx: (vx / mag) * config.maxSpeed,
        vy: (vy / mag) * config.maxSpeed,
      }
    },

    // Call after the canvas is resized
    draw,

    isActive() { return touches.size > 0 },
  }
}
