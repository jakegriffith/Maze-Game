// Manages which overlay screen is visible.
// The game canvases live in #app (always rendered behind screens).
// Calling showScreen() with any name shows that overlay.
// Calling hideAllScreens() lets #app show through.

const SCREEN_IDS = ['entry', 'waiting', 'instructions', 'round2', 'group', 'message']

export function showScreen(name) {
  for (const id of SCREEN_IDS) {
    const el = document.getElementById(`screen-${id}`)
    if (el) el.classList.toggle('visible', id === name)
  }
}

export function hideAllScreens() {
  for (const id of SCREEN_IDS) {
    const el = document.getElementById(`screen-${id}`)
    if (el) el.classList.remove('visible')
  }
}
