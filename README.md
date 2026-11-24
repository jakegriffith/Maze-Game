# Maze

A phone game about belonging, made for a digital storytelling class. It moves from disembodiment to embodiment, and from two people to a crowd.

People in the same room scan a QR code on a shared screen. Each gets a maze on their own phone and rolls a small ball through it, trying to find the others. When balls touch, those people are **linked**. A round ends when everyone in the maze is linked into one group, like a chain of hands.

- **Round 1 (2 people):** You don't know who your partner is. You can't see them or talk to them.
- **Round 2 (same 2):** You learn your partner's name and may call out loud (but not look at each other's screens).
- **Round 3 (4):** Your pair joins another pair.
- **Round 4 (6):** A new pair joins your group.
- **Round 5 (8):** Another pair joins. Then the ending.

In every round you only see the people you've already linked with. Everyone else is invisible until you bump into them. Many groups play at once, on a rolling basis.

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
9. **"Waiting for others to join you."** The pair waits for another group to merge with.
10. **"Round 3. Your group: Sam, Ana, Ben and you."** Everyone starts apart in a new maze. You can only see someone once you've bumped into them. Call out. Ready → **"Waiting for everyone."**
11. **The maze.** Your ball is solid. People you've linked with appear as thin hollow rings, joined by thin lines. The round ends when everyone is linked: **"You found each other."**
12. Rounds 4 and 5 repeat steps 9–11 as the group grows to 6, then 8.
13. **"You found each other. All 8 of you."** Begin again returns to the start.

**How groups grow:** after Round 2, 3 or 4, a group joins the longest-waiting compatible group. One of the two must be a pair, and together they can be at most 8 (so 2+2 → 4, 4+2 → 6, 6+2 → 8). A pair that just finished Round 2 can join a bigger group and skip ahead. If nobody is ready within **60 seconds**, the group carries on to the next round as it is.

**If someone leaves:** the rest of the group keeps playing, and the round ends when everyone still there is linked. If you're the last one left, you see **"The other person left."**, **"Sam left."** or **"Everyone else left."** and a button to find someone new. Every waiting screen also has a small **Leave** link.

All wording lives in `src/screens/` and `src/main.js` and can be changed freely. Group sizes and the waiting time are in `src/config.js` (`maxGroup`, `lastRound`, `mergeWaitSeconds`).

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
  uid, name, roomId
/lobby/groups/{roomId}      groups waiting to grow after a round
  size, stage, since

/rooms/{roomId}             one room per group (a fresh id every time groups merge)
  stage                     current round, 1–5
  next                      set when this group has merged into a bigger room
  players/{uid}             name, slot (start spot), x, y, stage, ready
  links/{stage}/{a__b}      true once those two balls have touched this round
  found/{stage}             true once everyone is linked into one group
```

Each round's maze is built from `{roomId}-{stage}`, so every phone in a group gets the same maze. Positions are stored in maze cells, not pixels, so phones with different screen sizes agree. Start spots go corners first, then the middle of each edge, so up to 8 people start spread out. When a phone disconnects, only that player is removed from the room. The last one out deletes the room.

---

## How the Code Is Organised

```
index.html              Laptop / projector page (QR code)
phone.html              Phone page (all game screens + styles)
database.rules.json     Firebase security rules (copy into the console)
src/
  main.js               Phone: decides solo vs multiplayer, runs the whole Round 1–5 journey
  config.js             Every tunable number (maze size, ball speed, group sizes, wait time…)
  maze.js               Generates a maze from a seed, so both phones get the same one
  game.js               Draws the maze, your ball and linked players; walls and movement
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
    group.js            Rounds 3–5: who's in your group + instructions + Ready
    message.js          "You found someone.", the ending, "…left.", errors
```

---

## Status

**Built and checked**
- Laptop QR page, phone game and solo demo, all running with no build step, live on GitHub Pages
- Full Round 1–5 journey with groups growing 2 → 4 → 6 → 8, tested end to end with 8 simulated phones against the real Firebase
- Linked-player rings and lines, and invisibility until you bump into someone
- A player leaving mid-round (the rest carry on), and the 60-second carry-on when no group arrives

### What's Left

1. **Play it with real phones:** 2, then 4, then a room full.
2. **Artistic decisions:**
   - Wording of every screen, especially Rounds 3–5 and the ending.
   - Should later rounds use a bigger maze (`gridSize`) for 6–8 people?
   - Is 60 seconds the right wait for another group (`mergeWaitSeconds`)?
3. **Optional:** a live line on the laptop screen, such as "Someone is waiting." or how many groups are playing.

### Things to Know on the Day
- If a phone locks or switches apps mid-game, its connection may drop. The group carries on without them, and the phone rejoins if it reconnects in time. Ask players to keep the game open.
- With an odd number of players, one person waits until someone new scans.
- Many groups can play at once, each in its own private maze. Firebase's free plan allows 100 phones connected at once.
