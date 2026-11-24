// Rounds 3–5 brief: who is in your group now, and the rules.
// onReady() when the player taps Ready.

export function mountGroup(container, round, otherNames, onReady) {
  container.innerHTML = `
    <div class="screen-inner">
      <p class="screen-label"></p>
      <p class="screen-body">Your group:</p>
      <p class="screen-label screen-names"></p>
      <p class="screen-body">
        Everyone starts apart in a new maze.<br>
        You can only see someone<br>
        once you've bumped into them.<br>
        Call out to each other.<br>
        Don't look at each other's screens.
      </p>
      <button>Ready</button>
    </div>
  `
  container.querySelector('.screen-label').textContent = `Round ${round}`
  container.querySelector('.screen-names').textContent = listNames([...otherNames, 'you'])
  container.querySelector('button').addEventListener('click', onReady, { once: true })
}

// "Sam, Ana and you."
function listNames(names) {
  if (names.length === 1) return names[0] + '.'
  return names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1] + '.'
}
