// Round 4 brief: the battle. Which team you're on, who's with you, the rules.
// onReady() when the player taps Ready.

import { config } from '../config.js'

export function mountBattle(container, round, team, teammateNames, opponentCount, onReady) {
  const teamName  = team === 'red' ? 'Red' : 'Blue'
  const otherName = team === 'red' ? 'Blue' : 'Red'

  container.innerHTML = `
    <div class="screen-inner">
      <p class="screen-label"></p>
      <p class="screen-body">You are on <span class="team-name"></span>.</p>
      <p class="screen-body team-list"></p>
      <p class="screen-body">
        Everyone can see everyone now.<br>
        If you run into someone from the other team,<br>
        whoever hits harder wins.<br>
        The other is out.<br>
        Last team standing wins.
      </p>
      <button>Ready</button>
    </div>
  `
  container.querySelector('.screen-label').textContent = `Round ${round}. The battle.`

  const name = container.querySelector('.team-name')
  name.textContent = teamName
  name.style.color = config[team]

  const others = opponentCount === 1 ? '1 player' : `${opponentCount} players`
  container.querySelector('.team-list').textContent =
    `Your team: ${listNames([...teammateNames, 'you'])}\n${otherName} has ${others}.`
  container.querySelector('.team-list').style.whiteSpace = 'pre-line'

  container.querySelector('button').addEventListener('click', onReady, { once: true })
}

// "Sam, Ana and you."
function listNames(names) {
  if (names.length === 1) return names[0] + '.'
  return names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1] + '.'
}
