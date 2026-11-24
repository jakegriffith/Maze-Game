import { config } from './config.js'

export function createTuningPanel(onRebuild) {
  const panel = document.getElementById('tuning-panel')
  let visible = false

  function toggle() {
    visible = !visible
    panel.classList.toggle('visible', visible)
  }

  // T key
  window.addEventListener('keydown', e => {
    if (e.key === 't' || e.key === 'T') toggle()
  })

  // Corner tap: top-right 60x60 area of the page
  document.addEventListener('pointerdown', e => {
    if (e.clientX > window.innerWidth - 60 && e.clientY < 60) toggle()
  })

  function wire(sliderId, labelId, configKey, transform) {
    const slider = document.getElementById(sliderId)
    const label  = document.getElementById(labelId)
    if (!slider) return

    slider.value = config[configKey]
    label.textContent = config[configKey]

    slider.addEventListener('input', () => {
      const val = transform ? transform(parseFloat(slider.value)) : parseFloat(slider.value)
      config[configKey] = val
      label.textContent = val
      onRebuild(false) // soft rebuild — no maze regeneration
    })
  }

  wire('sl-grid',    'lbl-grid',    'gridSize',       v => Math.round(v))
  wire('sl-wall',    'lbl-wall',    'wallThickness',  null)
  wire('sl-ball',    'lbl-ball',    'ballSize',       null)
  wire('sl-speed',   'lbl-speed',   'speed',          null)
  wire('sl-friction','lbl-friction','friction',       null)

  // Visible radius: slider max = 800, but we map slider value 800 → 0 (unlimited)
  const visSlider = document.getElementById('sl-vis')
  const visLabel  = document.getElementById('lbl-vis')
  visSlider.max = 801
  visSlider.value = 801  // unlimited by default
  visLabel.textContent = 'unlimited'
  visSlider.addEventListener('input', () => {
    const v = parseFloat(visSlider.value)
    if (v >= 801) {
      config.visibleRadius = 0
      visLabel.textContent = 'unlimited'
    } else {
      config.visibleRadius = v
      visLabel.textContent = v
    }
    onRebuild(false)
  })

  // Seed input
  const seedInput = document.getElementById('inp-seed')
  seedInput.value = config.seed

  // Grid slider rebuild triggers maze regeneration
  document.getElementById('sl-grid').addEventListener('change', () => onRebuild(true))

  document.getElementById('btn-new').addEventListener('click', () => {
    config.seed = seedInput.value || String(Date.now())
    seedInput.value = config.seed
    onRebuild(true)
  })
}
