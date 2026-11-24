# Maze

A phone game about belonging, made for a digital storytelling class. It moves from disembodiment to embodiment, from two strangers to a group, and finally to a group facing another group.

People in the same room scan a QR code on a shared screen. Each gets a maze on their own phone and rolls a small ball through it.

- **Round 1 (2 people):** Find your partner. You don't know who they are, you can't see them, and you can't talk.
- **Round 2 (same 2):** You learn their name and may call out loud (but not look at each other's screens).
- **Round 3 (4):** Your pair joins another pair. Touching someone **links** you; the round ends when everyone is linked into one group, like a chain of hands. You only see people you've linked with.
- **Round 4: the battle.** Your group of 4 becomes a team, **Red** or **Blue**, facing another group of 4 in one maze. Everyone can see everyone. When Red and Blue collide, whoever was moving harder into the other wins and the other is out. Last team standing wins.

The maze grows as more people share it: 12×12 for 2, 15×15 for 4, 18×18 for the 4-vs-4 battle. A battle needs 8 people; bigger audiences simply run several games side by side. Many groups play at once, on a rolling basis.

---

## The Pages

| File | Address | Who sees it |
|---|---|---|
| `index.html` | `jakegriffith.github.io/maze-game/` | The laptop or projector: "Find someone." and a large QR code. Leave it up all session. |
| `phone.html` | `jakegriffith.github.io/maze-game/phone.html` | Players' phones. The QR code sends people here. |
| `phone.html?solo` | `jakegriffith.github.io/maze-game/phone.html?solo` | You, while tuning: one player alone with a goal and a hidden tuning panel (press `T` or tap the top-right corner). |

The QR code always points at `phone.html` on whatever site the laptop page is open on, so it never needs updating.

---

## The Experience, Start to Finish

1. **The laptop shows "Find someone."** next to a QR code.
2. **"What should we call you?"** The player types a name.
3. **"Waiting for someone."** They're paired with the next person who arrives.
4. **"Round 1."** Someone else is in this maze, starting from the far corner. You won't be able to see them, so try to find them anyway: you'll know when you bump into each other. Both tap Begin.
5. **The maze.** A cross-shaped direction pad sits underneath. Hold a direction to roll; let go to coast to a stop. Pressing between two arms moves diagonally.
6. **"You found someone."** Continue.
7. **"Their name is Sam."** Round 2 instructions: you may call out to each other, but don't look at each other's screens. Ready → **"Waiting for Sam."**
8. **Round 2**, then **"You found Sam."** Continue.
9. **"Waiting for others to join you."** The pair waits for another pair.
10. **"Round 3. Your group: Sam, Ana, Ben and you."** Everyone starts apart in a new, bigger maze. You can only see someone once you've bumped into them. Call out. Ready → **"Waiting for everyone."**
11. **The maze.** Your ball is solid. People you've linked with appear as thin hollow rings, joined by thin lines. The round ends when everyone is linked: **"You found each other."**
12. **"Waiting for another team."** Your 4 wait for another group that has finished Round 3.
13. **"Round 4. The battle. You are on Red."** It lists your team and how many are on the other side, plus the rules. Ready.
14. **The battle.** Red starts down the left edge, Blue down the right. Everyone is visible in their team colour, and your own ball has a thin black ring so you can find it. Hit someone from the other team while moving faster into them than they're moving into you, and they're out. If it's close to even, you're both out. If you're out, the pad becomes **"You're out. Watch your team."**
15. **"Red wins."** / **"Blue wins."** (or **"No one is left."**), with "You were on Red." Begin again returns to the start.

**How groups grow:** after Round 2, a pair joins the longest-waiting other pair to make a group of 4. If nobody is ready within **60 seconds**, the pair carries on to Round 3 as a pair.

**How battles form:** after Round 3, a group waits for any other group that has also finished Round 3. Teams don't have to be the same size; a lone pair can battle a 4. The team that arrives second is Red. If no other team arrives within **60 seconds**, the game ends peacefully: **"You found each other. All 4 of you."**

**If someone leaves:** the rest of the group keeps playing, and the round ends when everyone still there is linked. If you're the last one left, you see **"The other person left."**, **"Sam left."** or **"Everyone else left."** and a button to find someone new. Every waiting screen also has a small **Leave** link.

All wording lives in `src/screens/` and `src/main.js` and can be changed freely. Maze sizes, group size, waiting time, ball size, speed and team colours are all in `src/config.js` (`mazeSizes`, `maxGroup`, `mergeWaitSeconds`, `ballSize`, `speed`, `red`, `blue`).

---

## Visual Language

Like a Kindle: black on off-white (`#f5f0e8`), Georgia serif only, thin lines, large type, lots of whitespace. No color, gradients, shadows or animation. Changes happen instantly, like an e-ink refresh. Designed for a phone in portrait first.

---

## Putting It Online (GitHub Pages)

There's no build step. GitHub Pages serves the files exactly as they are, for free, with nothing added to the page. (Netlify started putting a "Powered by Netlify" badge on new free sites in August 2026, and it covered the direction pad, so we moved.)

Live at **https://jakegriffith.github.io/maze-game/** (repository: [github.com/jakegriffith/maze-game](https://github.com/jakegriffith/maze-game)).

Claude publishes changes automatically: after each change it saves a new version to GitHub (`git commit` + `git push`), and the site updates within a minute or two. Every past version is kept on GitHub.

To publish by hand from Terminal:
```
cd ~/Desktop/"Maze Game"
git add -A
git commit -m "What changed"
git push
```

---

## Testing on Your Laptop

The pages need to be served by a small web server. Double-clicking the HTML files won't work.

```
cd ~/Desktop/"Maze Game"
python3 -m http.server 8000
```

Then open:
- `http://localhost:8000/` for the laptop QR screen
- `http://localhost:8000/phone.html` for the game

To test two players on one laptop, open `phone.html` in a normal window **and** in a private/incognito window. Two normal tabs share one anonymous ID and can't be paired with each other. Move with the arrow keys or by clicking the direction pad.

Phones can't open `localhost`, so test real phones on the GitHub Pages site. Press `Ctrl + C` in Terminal to stop the server.

---

## Firebase

Firebase Realtime Database lets the two phones share positions live. It's already set up for project `maze-game-6afe4`:
- Keys are in `src/firebase-config.js`. They aren't secret; the database rules protect the data.
- **Anonymous** sign-in is enabled (Authentication → Sign-in method). Players never make accounts.
- The rules in `database.rules.json` are published (Realtime Database → Rules). Only people using the game can read or write.

Firebase and the QR library load straight from the internet (see the `importmap` at the top of each HTML file), which is why no install or build is needed.

To watch a session live, open the Firebase console → **Realtime Database → Data**.

### Database Layout

```
/lobby/waiting              one slot: the person waiting for a Round 1 partner
/lobby/groups/{roomId}      pairs waiting to merge after Round 2: size, stage, since
/lobby/battles/{roomId}     teams waiting for an opponent after Round 3: size, stage, since

/rooms/{roomId}             one room per group or battle (a fresh id every merge)
  stage                     current round, 1–4
  grid                      maze size for this round
  mode                      "battle" in the Round 4 room
  next                      set when this group has moved into a new room
  ended                     "peace" if no other team arrived
  players/{uid}             name, slot, x, y, vx, vy, stage, ready (+ team in the battle)
  links/{stage}/{a__b}      true once those two balls have touched (finding rounds)
  found/{stage}             true once everyone is linked into one group
  out/{uid}                 true once knocked out (battle)
```

Each round's maze is built from `{roomId}-{stage}` at the room's `grid` size, so every phone in a group gets the same maze. Positions and speeds are stored in maze cells, not pixels, so phones with different screen sizes agree. When a phone disconnects, only that player is removed from the room. The last one out deletes the room.

---

## How the Code Is Organised

```
index.html              Laptop / projector page (QR code)
phone.html              Phone page (all game screens + styles)
database.rules.json     Firebase security rules (copy into the console)
src/
  main.js               Phone: decides solo vs multiplayer, runs the whole Round 1–4 journey incl. the battle
  config.js             Every tunable number (maze size, ball speed, group sizes, wait time…)
  maze.js               Generates a maze from a seed, so both phones get the same one
  game.js               Draws the maze and balls (linked rings / team colours); walls and movement
  input.js              Game Boy-style direction pad under the maze (+ arrow keys)
  tuning.js             Hidden tuning panel (solo only)
  router.js             Shows one screen at a time
  firebase.js           Connects to Firebase
  firebase-config.js    Firebase keys
  multiplayer.js        Pairs players, merges groups, shares positions, records links
  screens/
    display.js          Laptop QR screen
    entry.js            "What should we call you?"
    waiting.js          "Waiting for someone." / "Waiting for Sam."
    instructions.js     Round 1 instructions
    round2.js           Partner's name + Round 2 instructions + Ready
    group.js            Round 3: who's in your group + instructions + Ready
    battle.js           Round 4: your team, the rules + Ready
    message.js          "You found someone.", the ending, "…left.", errors
```

---

## Status

**Built and checked**
- Laptop QR page, phone game and solo demo, all running with no build step
- Rounds 1–3 with pairs merging into groups of 4, mazes growing 12 → 15
- Round 4 battle, 4 vs 4 on an 18×18 maze: tested end to end with 8 simulated phones against the real Firebase. A charging Red knocked out a still Blue; equal hits knocked out both; "Red wins." appeared on every phone.
- A player leaving mid-round (the rest carry on), and the 60-second carry-on when no group arrives

### What's Left

1. **Play it with real phones:** 2, then 4, then 8 for a battle.
2. **Artistic decisions:**
   - Wording of every screen, especially the battle and its ending.
   - Maze sizes (`mazeSizes` in `src/config.js`).
   - Is 60 seconds the right wait for another group or team (`mergeWaitSeconds`)?
   - Team colours (`red`, `blue` in `src/config.js`).
3. **Optional:** a live line on the laptop screen, such as "Someone is waiting." or how many groups are playing.

### Things to Know on the Day
- If a phone locks or switches apps mid-game, its connection may drop. The group carries on without them, and the phone rejoins if it reconnects in time. Ask players to keep the game open.
- With an odd number of players, one person waits until someone new scans.
- Many groups can play at once, each in its own private maze. Firebase's free plan allows 100 phones connected at once.
- A battle needs two groups to finish Round 3 within about a minute of each other. Starting people in waves of about 8 helps.
- After publishing an update, wait about 10 minutes (or refresh each phone) before playing. Phones can hold on to old files for a few minutes.
