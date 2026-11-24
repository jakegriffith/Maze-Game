# Maze Game — Project Context

## Project Description

A multiplayer maze game for a digital storytelling class about belonging, moving from disembodiment to embodiment, and from two people to a crowd. People in the same room, each on their own phone, roll a small ball through a shared maze to find each other. Touching links two people; a round ends when everyone in the maze is linked into one group. You only see people you're linked with.

- **Round 1 (pair):** anonymous, no talking.
- **Round 2 (same pair):** names revealed, may call out loud (not look at screens).
- **Rounds 3–5:** groups grow by a pair each round, 2 → 4 → 6 → 8 (merge with longest-waiting compatible group; 60 s wait, then carry on as-is). Same rules as Round 2. Ending after Round 5.

Many groups play at once on a rolling basis. Entry is through a QR code on a separate display screen.

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
- **Hosting:** GitHub Pages — repo https://github.com/jakegriffith/maze-game (public), deploy from branch main /root, live at https://jakegriffith.github.io/maze-game/. **Workflow: after every change, commit and `git push` (user's standing request); site updates in ~1 min.** Push uses the saved macOS keychain login (no gh CLI installed). Moved off Netlify Nov 2026: Netlify's free-plan "Powered by Netlify" badge covered the D-pad. All paths must stay relative (site lives under /maze-game/).
- **Entry:** QR code on a separate display screen

## Current State

Full Round 1–5 growing-groups flow is built and live. Verified end to end with 8 headless-Chrome "phones" against real Firebase (2→4→6→8), plus a player leaving mid-round and the 60 s carry-on. Not yet played on real phones. `phone.html?debug` exposes `window.__maze` (the current game, has `teleport(mx,my)`) for automated tests.

## Pages (local: `python3 -m http.server 8000`)

- `index.html` — laptop/projector screen with QR code → `phone.html` on same origin (`?url=...` overrides)
- `phone.html` — multiplayer phone flow
- `phone.html?solo` — solo tuning demo (full tuning panel, no Firebase)

## File Structure

```
src/
  config.js           — single config object with all tunable values (DO NOT change without tuning)
                        lastRound 5, maxGroup 8, mergeWaitSeconds 60
  maze.js             — seeded RNG (mulberry32) + recursive backtracker maze generator
  game.js             — canvas rendering, collision detection, game loop
                        accepts role: 'solo' | slot 0–7 (corners first, then edge midpoints)
                        exposes getPosition(), setOthers(), setLinked(), touching(), teleport()
                        draws linked players as hollow rings + 1px link lines
  input.js            — D-pad drawn on pad canvas (touch by angle from centre, corners = diagonal,
                        multi-touch), mouse, arrow keys → velocity at maxSpeed; exposes draw()
  tuning.js           — hidden tuning panel (T key or top-right corner tap); solo only
  router.js           — showScreen(name) / hideAllScreens() — toggles fixed overlay divs
  firebase.js         — Firebase init, exports db, auth, signIn()
  firebase-config.js  — Firebase web config (public by design; rules protect data)
  multiplayer.js      — joinLobby(), joinGroups/leaveGroups/createMergedRoom (merge queue), advanceStage,
                        presence (player-level onDisconnect), writePosition/Ready/Link/Found, leaveRoom
  main.js             — phone.html entry: ?solo → runSolo(), else → runMultiplayer()
                        runMultiplayer is a phase state machine (S.phase)
  screens/
    display.js        — laptop QR screen (self-mounting script for index.html)
    entry.js          — name input screen
    waiting.js        — mountWaiting(container, label, onCancel?)
    instructions.js   — Round 1 brief instructions
    round2.js         — partner name reveal + Round 2 instructions + Ready
    group.js          — Rounds 3–5 intro: group names + rules + Ready
    message.js        — generic label/body/button screen (met, ending, partner left, errors)
database.rules.json   — Firebase rules to paste into the console
```

## Database Structure

```
/lobby/waiting            ← Round 1 slot; A writes {uid, name, roomId}, B claims it
/lobby/groups/{roomId}    ← merge queue: {size, stage, since} (under /lobby so existing rules cover it)
/rooms/{roomId}
  stage                   ← current round 1–5 (advanceStage = transaction k → k+1)
  next                    ← merged-into roomId; phones follow it
  players/{uid}           ← name, slot, x, y, stage, ready (ready = stage number)
  links/{stage}/{a__b}    ← true when those two touched (sorted uid pair)
  found/{stage}           ← true when link graph connects all present players
```

Maze seed = `${roomId}-${stage}`. Positions in maze cells, tagged with stage; other-stage positions ignored. Present players = nodes with a `name` (stray position writes can leave nameless nodes).

## Matchmaking Design

Round 1: Player B always creates the room (no double-creation race):
1. A picks a fresh roomId, writes {uid, name, roomId} to `lobby/waiting`, watches `rooms/{roomId}`
2. B's transaction clears the slot and creates the room with both players
3. A sees the room with 2 present players → paired; cancels its lobby onDisconnect

Merging (after found at stage 2–4): the group leader (lowest present uid) runs one transaction on `lobby/groups`. It either claims the oldest compatible entry (one side is a pair, combined ≤ maxGroup) and builds a new room (stage = max+1, writes `next` to both old rooms), or queues itself. After mergeWaitSeconds the leader dequeues and advances stage in place. If it was claimed at the last second, it waits 15 s for `next`, then advances anyway. A new leader takes over if the leader leaves.

## Notes

- Collision uses per-axis resolution so ball slides along walls
- Ball must never tunnel through walls at any frame rate (sub-step physics)
- Visible radius slider = fog-of-war, default unlimited
- Firebase is lazily imported so the solo path never loads it
- `onDisconnect` removes only that player's node; group continues. Last one out deletes the room. Alone → "…left."
- A phone whose node vanished (connection blip) re-adds itself via `rejoin()`
- Testing two players on one machine needs a normal + private window (same-browser tabs share an anonymous uid)
