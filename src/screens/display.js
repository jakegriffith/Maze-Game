// Laptop / projector screen (index.html).
// A QR code drawn as a maze, sending phones to phone.html, and a line of
// text that turns over every ROTATE_SECONDS like an e-ink page.
//
// Where the QR points:
//   1. index.html?url=https://example.com/phone.html → that exact address (override)
//   2. Otherwise → phone.html on this same site

import QRCode from 'qrcode'
import { config } from '../config.js'

// ── Words ─────────────────────────────────────────────────────────────

const TITLE = 'Find someone.'

// Shown one at a time under the title, in order, looping
const LINES = [
  'Somewhere in this room, someone is looking for you.',
  'At first, you won’t know who.',
  'Then you’ll learn their name.',
  'Then there will be four of you.',
  'Then you’ll find out which side you’re on.',
]
const ROTATE_SECONDS = 20

// ── Maze QR look ──────────────────────────────────────────────────────

// Width of the maze corridors, as a fraction of one QR square.
// Higher = bolder and easier to scan; lower = more delicate and maze-like.
// (0.38–0.72 all tested to scan; 0.45 reads most like maze walls.)
const CORRIDOR = 0.45

// ──────────────────────────────────────────────────────────────────────

function getPlayUrl() {
  const override = new URLSearchParams(window.location.search).get('url')
  if (override) return override
  const url = new URL('phone.html', window.location.href)
  url.search = ''
  url.hash = ''
  return url.href
}

// Draw the QR code as a maze:
//  • the shapes scanners lock onto (the three big corner squares and the
//    small alignment square) stay solid, exactly as scanners expect;
//  • every other dark square becomes a piece of corridor wall, joined to
//    its dark neighbours, so the code reads as a maze.
// Each square's centre keeps its colour, which is what scanners read.
// Uses the highest error correction (H, 30%) for extra safety.
export function mazeQrSvg(text) {
  const { modules } = QRCode.create(text, { errorCorrectionLevel: 'H' })
  const n = modules.size
  const quiet = 2
  const total = n + quiet * 2
  const w = CORRIDOR
  const inset = (1 - w) / 2
  const dark = (r, c) => r >= 0 && c >= 0 && r < n && c < n && modules.get(r, c)

  // Solid shapes: the corner finder squares, plus any other reserved block
  // that isn't the dotted timing lines (row/col 6) or the format strips
  // (row/col 8 next to the corners) — i.e. the alignment square(s).
  const finder = (r, c) => (r < 7 && c < 7) || (r < 7 && c >= n - 7) || (r >= n - 7 && c < 7)
  const timing = (r, c) => r === 6 || c === 6
  const format = (r, c) => (r === 8 && (c < 9 || c >= n - 8)) || (c === 8 && (r < 9 || r >= n - 8))
  const solid = (r, c) => finder(r, c) ||
    (modules.isReserved(r, c) && !timing(r, c) && !format(r, c))

  const rects = []
  const rect = (x, y, rw, rh) =>
    rects.push(`<rect x="${(x + quiet).toFixed(3)}" y="${(y + quiet).toFixed(3)}" width="${rw.toFixed(3)}" height="${rh.toFixed(3)}"/>`)

  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (!dark(r, c)) continue

      if (solid(r, c)) {
        rect(c, r, 1, 1)
        continue
      }

      // Corridor piece, plus bridges to dark neighbours (right, below)
      rect(c + inset, r + inset, w, w)
      if (dark(r, c + 1) && !solid(r, c + 1)) rect(c + inset + w, r + inset, 1 - w, w)
      if (dark(r + 1, c) && !solid(r + 1, c)) rect(c + inset, r + inset + w, w, 1 - w)
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges">` +
    `<rect width="${total}" height="${total}" fill="${config.bg}"/>` +
    `<g fill="${config.ink}">${rects.join('')}</g></svg>`
}

function mountDisplay(container) {
  const url = getPlayUrl()
  const isLocal = ['localhost', '127.0.0.1'].includes(new URL(url).hostname)

  container.innerHTML = `
    <div class="display-inner">
      <div class="display-text">
        <p class="display-title"></p>
        <p class="display-line"></p>
        <p class="display-body">Scan with your phone.</p>
        <p class="display-url"></p>
        ${isLocal ? `<p class="display-url">This is a local test address. Phones can't open it. Use the live site for phones.</p>` : ''}
      </div>
      <div class="display-qr">${mazeQrSvg(url)}</div>
    </div>
  `
  container.querySelector('.display-title').textContent = TITLE
  container.querySelector('.display-url').textContent = url.replace(/^https?:\/\//, '')

  // Turn the line over every ROTATE_SECONDS — instantly, no fade
  // (?rotate=2 speeds this up for testing)
  const line = container.querySelector('.display-line')
  const seconds = Number(new URLSearchParams(window.location.search).get('rotate')) || ROTATE_SECONDS
  let i = 0
  line.textContent = LINES[0]
  setInterval(() => {
    i = (i + 1) % LINES.length
    line.textContent = LINES[i]
  }, seconds * 1000)
}

mountDisplay(document.getElementById('display'))
