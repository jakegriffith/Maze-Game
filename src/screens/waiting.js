// Waiting screen: used while looking for a partner, and in Round 2 while
// waiting for the partner to tap Ready.
// onCancel is optional — if given, a small "Leave" link appears.

export function mountWaiting(container, label, onCancel = null) {
  container.innerHTML = `
    <div class="screen-inner">
      <p class="screen-label"></p>
      ${onCancel ? '<button class="btn-ghost">Leave</button>' : ''}
    </div>
  `
  container.querySelector('.screen-label').textContent = label
  if (onCancel) container.querySelector('button').addEventListener('click', onCancel)
}
