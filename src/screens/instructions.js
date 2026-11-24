// Brief Round 1 instructions. onReady() when the player taps the button.

export function mountInstructions(container, onReady) {
  container.innerHTML = `
    <div class="screen-inner">
      <p class="screen-label">Round 1</p>
      <p class="screen-body">
        Someone else is in this maze,<br>
        starting from the far corner.
      </p>
      <p class="screen-body">
        You won't be able to see them.<br>
        Try to find them anyway.<br>
        You'll know when you bump into each other.
      </p>
      <p class="screen-body">
        Use the buttons to move.
      </p>
      <button id="instructions-btn">Begin</button>
    </div>
  `
  container.querySelector('#instructions-btn').addEventListener('click', onReady, { once: true })
}
