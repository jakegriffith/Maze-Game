# Maze Game — Project Context

## Project Description

A multiplayer maze game for a digital storytelling class about belonging, moving from disembodiment to embodiment, from strangers to a group to group-vs-group. People in the same room, each on their own phone, roll a small ball through a shared maze.

- **Round 1 (pair):** anonymous, no talking. Find each other (touch).
- **Round 2 (same pair):** names revealed, may call out loud (not look at screens).
- **Rounds 3–4:** groups grow by a pair, 2 → 4 → 6 (merge with the longest-waiting compatible group; 60 s wait, then carry on as-is). Touching links; the round ends when everyone is linked; you only see your linked cluster.
- **Round 5: battle.** After R4, groups queue for any other team (60 s, else peaceful ending). Red (claimer) vs Blue, everyone visible in team colours. Collision: higher speed toward the other wins; within `battleTie` both are out. Last team with anyone in wins.
- The maze grows with player count (`config.mazeSizes`: 2→12, 4→15, 6→18, 12→22). Ball size and speed are in cell units.

Many groups play at once on a rolling basis. Entry is through a QR code on a separate display screen.

## Visual Rules (Kindle aesthetic)

- Black on off-white (`#f5f0e8`)
- Serif font only (Georgia)
- Thin lines, large type, lots of whitespace
- No color (exception: battle team colours `config.red` / `config.blue`, user-requested), no gradients, no shadows, no animation
- Nothing eases or fades — changes happen instantly, like an e-ink refresh
- Designed for phone in portrait first

## Stack

- **Frontend:** Plain JavaScript ES modules, **no build step** (no Vite/npm). External libs via `<script type="importmap">` in each HTML file: Firebase 13.4.0 from gstatic, `qrcode@1.5.4` from jsdelivr `+esm`. User deploys by drag-and-drop upload to a GitHub repo served by GitHub Pages (no build).
- **Sync:** Firebase Realtime Database + anonymous auth
- **Hosting:** GitHub Pages — repo https://github.com/jakegriffith/maze-game (public), deploy from branch main /root, live at https://jakegriffith.github.io/maze-game/. **Workflow: after every change, commit and `git push` (user's standing request); site updates in ~1 min.** Push uses the saved macOS keychain login (no gh CLI installed). Moved off Netlify Nov 2026: Netlify's free-plan "Powered by Netlify" badge covered the D-pad. All paths must stay relative (site lives under /maze-game/).
- **Entry:** QR code on a separate display screen

## Current State

Rounds 1–4 (growing groups) + Round 5 Red vs Blue battle are built. Verified end to end with 12 headless-Chrome "phones" against real Firebase: groups 2→4→6, grids 12→15→18→22, battle formation, a charge KO, both-out ties, and "Red wins." Not yet played on real phones. `phone.html?debug` exposes `window.__maze` (game: `teleport`, `grid`) and `window.__room()` ({id, uid, room}) for automated tests.

## Pages (local: `python3 -m http.server 8000`)

- `index.html` — laptop/projector screen with QR code → `phone.html` on same origin (`?url=...` overrides)
- `phone.html` — multiplayer phone flow
- `phone.html?solo` — solo tuning demo (full tuning panel, no Firebase)

## File Structure

```
src/
  config.js           — single config object with all tunable values (DO NOT change without tuning)
                        ballSize (cell fraction), speed (cells/s), mazeSizes + gridFor(),
                        lastLinkRound 4, battleRound 5, maxGroup 6, mergeWaitSeconds 60, battleTie, red/blue
  maze.js             — seeded RNG (mulberry32) + recursive backtracker maze generator
  game.js             — canvas rendering, collision detection, game loop
                        createGame(canvas, onWin, 'solo' | [col,row]); start(seed, grid)
                        slotCell() (finding rounds), teamCell() (battle start spots)
                        setDirection(dx,dy), getPosition(), getVelocity() (cells/s),
                        setOthers(), setScene({balls, lines, me}), touching(), teleport()
  input.js            — D-pad drawn on pad canvas (touch by angle from centre, corners = diagonal,
                        multi-touch), mouse, arrow keys → getDirection(); draw(); setDisabled(text)
  tuning.js           — hidden tuning panel (T key or top-right corner tap); solo only
  router.js           — showScreen(name) / hideAllScreens() — toggles fixed overlay divs
  firebase.js         — Firebase init, exports db, auth, signIn()
  firebase-config.js  — Firebase web config (public by design; rules protect data)
  multiplayer.js      — joinLobby(), joinQueue/leaveQueue ('groups' | 'battles'), createMergedRoom,
                        createBattleRoom, advanceStage (room transaction, sets grid), endPeacefully, writeOut,
                        presence (player-level onDisconnect), writePosition/Ready/Link/Found, leaveRoom
  main.js             — phone.html entry: ?solo → runSolo(), else → runMultiplayer()
                        runMultiplayer is a phase state machine (S.phase)
  screens/
    display.js        — laptop QR screen (self-mounting script for index.html)
    entry.js          — name input screen
    waiting.js        — mountWaiting(container, label, onCancel?)
    instructions.js   — Round 1 brief instructions
    round2.js         — partner name reveal + Round 2 instructions + Ready
    group.js          — Rounds 3–4 intro: group names + rules + Ready
    battle.js         — Round 5 intro: team (coloured), teammates, opponent count, rules
    message.js        — generic label/body/button screen (met, ending, partner left, errors)
database.rules.json   — Firebase rules to paste into the console
```

## Database Structure

```
/lobby/waiting            ← Round 1 slot; A writes {uid, name, roomId}, B claims it
/lobby/groups/{roomId}    ← growth queue: {size, stage, since}
/lobby/battles/{roomId}   ← battle queue: {size, stage, since}
/rooms/{roomId}
  stage, grid             ← current round + maze size (advanceStage sets both)
  mode                    ← 'battle' for the R5 room
  next                    ← merged-into roomId; phones follow it
  ended                   ← 'peace' when no opponent came
  players/{uid}           ← name, slot, x, y, vx, vy, stage, ready (+ team, teamSize)
  links/{stage}/{a__b}    ← finding rounds: touched pair
  found/{stage}           ← finding rounds: link graph connects all present players
  out/{uid}               ← battle: knocked out
```

Maze seed = `${roomId}-${stage}`. Positions and velocities are in cells, tagged with stage. Present players = nodes with a `name`.

## Matchmaking Design

Round 1: Player B always creates the room (no double-creation race).

Between rounds the group leader (lowest present uid) runs one transaction on a queue under /lobby:
- After R2/R3, `groups` queue: claim the oldest entry where one side is a pair and the total is ≤ maxGroup, then createMergedRoom. Else wait mergeWaitSeconds, then advanceStage in place.
- After R4, `battles` queue: claim any other team, then createBattleRoom (claimer = red). Else wait, then endPeacefully.

If the leader was claimed at the last second, it waits 15 s for `next`, then carries on anyway. A new leader takes over if the leader leaves.

Battle collisions: the lower uid of a touching red/blue pair judges using its own velocity vs the other's last-written velocity. Each phone ends the battle when a team has no present, not-out players.

## Notes

- Collision uses per-axis resolution so ball slides along walls
- Ball must never tunnel through walls at any frame rate (sub-step physics)
- Visible radius slider = fog-of-war, default unlimited
- Firebase is lazily imported so the solo path never loads it
- `onDisconnect` removes only that player's node; group continues. Last one out deletes the room. Alone → "…left."
- A phone whose node vanished (connection blip) re-adds itself via `rejoin()`
- Testing two players on one machine needs a normal + private window (same-browser tabs share an anonymous uid)
