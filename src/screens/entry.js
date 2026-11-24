// Entry screen: asks for a name, calls onSubmit(name) when confirmed.

export function mountEntry(container, onSubmit) {
  container.innerHTML = `
    <div class="screen-inner">
      <p class="screen-label">What should we call you?</p>
      <input
        id="entry-name"
        type="text"
        autocomplete="off"
        autocorrect="off"
        autocapitalize="words"
        spellcheck="false"
        maxlength="32"
        placeholder="Your name"
      />
      <button id="entry-btn">Continue</button>
    </div>
  `

  const input = container.querySelector('#entry-name')
  const btn   = container.querySelector('#entry-btn')

  function submit() {
    const name = input.value.trim()
    if (!name) {
      input.focus()
      return
    }
    onSubmit(name)
  }

  btn.addEventListener('click', submit)
  input.addEventListener('keydown', e => { if (e.key === 'Enter') submit() })

  // Auto-focus after a tick so the keyboard doesn't fight layout
  setTimeout(() => input.focus(), 80)
}
