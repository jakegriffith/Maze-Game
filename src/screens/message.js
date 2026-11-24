// General-purpose message screen: a large line, optional smaller text,
// optional button. Used for "You found someone.", the ending,
// "The other person left.", and connection errors.

export function mountMessage(container, { label, body = '', button = '', onButton = null }) {
  container.innerHTML = `
    <div class="screen-inner">
      <p class="screen-label"></p>
      ${body   ? '<p class="screen-body" style="white-space: pre-line"></p>' : ''}
      ${button ? '<button></button>' : ''}
    </div>
  `
  container.querySelector('.screen-label').textContent = label
  if (body) container.querySelector('.screen-body').textContent = body
  if (button) {
    const btn = container.querySelector('button')
    btn.textContent = button
    if (onButton) btn.addEventListener('click', onButton, { once: true })
  }
}
