// Round 2 brief: reveals the partner's name, explains the new rule.
// onReady() when the player taps Ready.

export function mountRound2(container, partnerName, onReady) {
  container.innerHTML = `
    <div class="screen-inner">
      <p class="screen-body">Their name is</p>
      <p class="screen-label screen-name"></p>
      <p class="screen-body">
        Find them again in a new maze.<br>
        You still can't see them,<br>
        but this time you may call out to each other.<br>
        Don't look at each other's screens.
      </p>
      <button>Ready</button>
    </div>
  `
  container.querySelector('.screen-name').textContent = partnerName + '.'
  container.querySelector('button').addEventListener('click', onReady, { once: true })
}
