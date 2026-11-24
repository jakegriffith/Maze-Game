# Maze Game — Project Context

## Project Description

A two-player maze game for a digital storytelling class about belonging, moving from disembodiment to embodiment. Two people in the same room, each on their own phone, start at opposite sides of a maze and try to find each other by rolling a small ball into the other player's ball.

- **Round 1:** Players don't know who their partner is and can't see or talk to them.
- **Round 2:** Players learn their partner's name and are allowed to talk out loud (not looking at each other's screens) to find each other in a new maze.

Many pairs play at once on a rolling basis. Entry is through a QR code on a separate display screen.

## Visual Rules (Kindle aesthetic)

- Black on off-white (`#f5f0e8`)
- Serif font only (Georgia)
- Thin lines, large type, lots of whitespace
- No color, no gradients, no shadows, no animation
- Nothing eases or fades — changes happen instantly, like an e-ink refresh
- Designed for phone in portrait first

## Stack

- **Frontend:** Plain JavaScript ES modules, **no build step** (no Vite/npm). External libs via `<script type="importmap">` in each HTML file: Firebase 13.4.0 from gstatic, `qrcode@1.5.4` from jsdelivr `+esm`. User deploys by drag-and-drop upload to a GitHub repo served by GitHub Pages (no build).
- **Sync:** Firebase Realtime Database + anonymous auth
- **Hosting:** GitHub Pages (public repo `maze-game`, deploy from branch main /root). Moved off Netlify Nov 2026: Netlify's free-plan "Powered by Netlify" badge covered the D-pad. All paths must stay relative (site lives under /maze-game/).
- **Entry:** QR code on a separate display screen

## Current State

Full two-round multiplayer flow is written (Round 1 → name reveal → ready → Round 2 → ending → begin again, plus partner-left). Firebase project `maze-game-6afe4` is configured; anonymous auth, rules and pairing verified with a Node script. Not yet played end-to-end in a browser/phones. Solo demo at `?solo`. Laptop QR display at `?display`. See README "What's left".

## Pages (local: `python3 -m http.server 8000`)

- `index.html` — laptop/projector screen with QR code → `phone.html` on same origin (`?url=...` overrides)
- `phone.html` — multiplayer phone flow
- `phone.html?solo` — solo tuning demo (full tuning panel, no Firebase)

## File Structure

```
src/
  config.js           — single config object with all tunable values (DO NOT change without tuning)
                        showPartner: draw partner as hollow ring (default false)
  maze.js             — seeded RNG (mulberry32) + recursive backtracker maze generator
  game.js             — canvas rendering, collision detection, game loop
                        accepts role: 'solo' | 'a' | 'b'
                        'a' starts top-left, 'b' starts bottom-right
                        exposes getPosition() in maze coords, setPartnerPosition(), checkMeeting()
  input.js            — D-pad drawn on pad canvas (touch by angle from centre, corners = diagonal,
                        multi-touch), mouse, arrow keys → velocity at maxSpeed; exposes draw()
  tuning.js           — hidden tuning panel (T key or top-right corner tap); solo only
  router.js           — showScreen(name) / hideAllScreens() — toggles fixed overlay divs
  firebase.js         — Firebase init, exports db, auth, signIn()
  firebase-config.js  — YOUR Firebase credentials go here (not committed to git)
  multiplayer.js      — joinLobby() {matched, cancel}, watchRoom, position/met/ready/status writes, leaveRoom
  main.js             — phone.html entry: ?solo → runSolo(), else → runMultiplayer()
                        runMultiplayer is a phase state machine (S.phase)
  screens/
    display.js        — laptop QR screen (self-mounting script for index.html)
    entry.js          — name input screen
    waiting.js        — mountWaiting(container, label, onCancel?)
    instructions.js   — Round 1 brief instructions
    round2.js         — partner name reveal + Round 2 instructions + Ready
    message.js        — generic label/body/button screen (met, ending, partner left, errors)
database.rules.json   — Firebase rules to paste into the console
```

## Database Structure

```
/lobby/waiting          ← one slot; player A writes self, player B claims it
  uid, name, roomId

/rooms/{roomId}         ← fresh push-id chosen by A for every pairing
  seed1, seed2          ← maze seeds per round
  status                ← round1 | between | round2 | finished
  met1, met2            ← true when balls overlap in that round
  players/
    a/  uid, name, x, y, round, ready
    b/  uid, name, x, y, round, ready
```

Positions are stored in **maze coordinates** (cell units), not pixels, so phones with different screen sizes agree. Each position is tagged with `round`; partner positions from a different round are ignored.

## Matchmaking Design

Player B always creates the room (avoids double-creation race condition):
1. Player A picks a fresh roomId, writes {uid, name, roomId} to `lobby/waiting`, watches `rooms/{roomId}`
2. Player B transaction clears the slot, creates the room at `rooms/{roomId}`
3. Player A sees the room appear with players.b → paired; cancels its lobby onDisconnect

## Notes

- Collision uses per-axis resolution so ball slides along walls
- Ball must never tunnel through walls at any frame rate (sub-step physics)
- Visible radius slider = fog-of-war, default unlimited
- Firebase is lazily imported so the solo path never loads it
- `onDisconnect` on the room means a dropped player auto-deletes the room → partner sees "…left."
- Testing two players on one machine needs a normal + private window (same-browser tabs share an anonymous uid)
