# Maze

A two-player phone game about belonging, made for a digital storytelling class. It moves from disembodiment to embodiment.

Two people in the same room each scan a QR code on a shared screen. Each gets a maze on their own phone, starting at opposite corners. They roll a small ball through the maze with their thumb and try to find each other. When the two balls touch, they have found someone.

- **Round 1:** You don't know who your partner is. You can't see them or talk to them.
- **Round 2:** You learn your partner's name and can call out loud (but not look at each other's screens) to find each other in a new maze.

Many pairs can play at once, on a rolling basis.

---

## The Pages

| File | Address | Who sees it |
|---|---|---|
| `index.html` | `yourname.github.io/maze-game/` | The laptop or projector: "Find someone." and a large QR code. Leave it up all session. |
| `phone.html` | `yourname.github.io/maze-game/phone.html` | Players' phones. The QR code sends people here. |
| `phone.html?solo` | `yourname.github.io/maze-game/phone.html?solo` | You, while tuning: one player alone with a goal and a hidden tuning panel (press `T` or tap the top-right corner). |

The QR code always points at `phone.html` on whatever site the laptop page is open on, so it never needs updating.

---

## The Experience, Start to Finish

1. **The laptop shows "Find someone."** next to a QR code.
2. **"What should we call you?"** The player types a name.
3. **"Waiting for someone."** They're paired with the next person who arrives.
4. **"Round 1."** Someone else is in this maze, starting from the far corner. You won't be able to see them, so try to find them anyway: you'll know when you bump into each other. They tap Begin.
5. **The maze.** A cross-shaped direction pad sits underneath. Hold a direction to roll; let go to coast to a stop. Pressing between two arms moves diagonally.
6. **"You found someone."** They tap Continue.
7. **"Their name is Sam."** Round 2 instructions: you may call out to each other, but don't look at each other's screens. They tap Ready.
8. **"Waiting for Sam."** Until both have tapped Ready.
9. **A new maze.** Same starting corners, but now the room is talking.
10. **"You found Sam."** They tap Begin again to return to the start.

If the other phone closes or loses connection, the player sees **"The other person left."** (or **"Sam left."** once they know the name) and a button to find someone new.

All wording lives in `src/screens/` and `src/main.js` and can be changed freely.

---

## Visual Language

Like a Kindle: black on off-white (`#f5f0e8`), Georgia serif only, thin lines, large type, lots of whitespace. No color, gradients, shadows or animation. Changes happen instantly, like an e-ink refresh. Designed for a phone in portrait first.

---

## Putting It Online (GitHub Pages)

There's no build step. GitHub Pages serves the files exactly as they are, for free, with nothing added to the page. (Netlify started putting a "Powered by Netlify" badge on new free sites in August 2026, and it covered the direction pad, so we moved.)

**First time:**
1. On [github.com](https://github.com), click **New repository**. Name it `maze-game`, choose **Public**, and click **Create repository**.
2. On the empty repository page, click **uploading an existing file**.
3. In Finder, open the **Maze Game** folder and press **Cmd + A** to select everything inside it. Drag the selected items onto the GitHub page. Drag the contents, not the folder itself.
4. Wait for the files to finish uploading, then click **Commit changes**.
5. Go to the repository's **Settings** tab, then **Pages** in the left menu. Under "Build and deployment", set Source to **Deploy from a branch**, Branch to **main**, folder to **/(root)**, then click **Save**.
6. After a minute or two, the site is live at `https://yourname.github.io/maze-game/` (with your GitHub username).

**After changes:** in the repository, click **Add file → Upload files**, drag the changed files or folders (for example the `src` folder) onto the page, and click **Commit changes**. Files with the same name are replaced. The site updates within a minute or two at the same address.

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
/lobby/waiting            one slot: the player waiting for a partner
  uid, name, roomId

/rooms/{roomId}           one room per pair (a fresh id every pairing)
  seed1, seed2            which maze to build in each round
  status                  round1 | between | round2 | finished
  met1, met2              become true when the balls touch in that round
  players/
    a/  uid, name, x, y, round, ready
    b/  uid, name, x, y, round, ready
```

Positions are stored in maze cells, not pixels, so phones with different screen sizes agree. Player A starts top-left, and player B starts bottom-right. When a phone disconnects, its room is deleted automatically and the partner is told.

---

## How the Code Is Organised

```
index.html              Laptop / projector page (QR code)
phone.html              Phone page (all game screens + styles)
database.rules.json     Firebase security rules (copy into the console)
src/
  main.js               Phone: decides solo vs two-player, runs the two-player journey
  config.js             Every tunable number (maze size, ball speed, friction, showPartner…)
  maze.js               Generates a maze from a seed, so both phones get the same one
  game.js               Draws the maze and ball, handles walls and movement
  input.js              Game Boy-style direction pad under the maze (+ arrow keys)
  tuning.js             Hidden tuning panel (solo only)
  router.js             Shows one screen at a time
  firebase.js           Connects to Firebase
  firebase-config.js    Firebase keys
  multiplayer.js        Pairs players, shares positions, notices when they meet
  screens/
    display.js          Laptop QR screen
    entry.js            "What should we call you?"
    waiting.js          "Waiting for someone." / "Waiting for Sam."
    instructions.js     Round 1 instructions
    round2.js           Partner's name + Round 2 instructions + Ready
    message.js          "You found someone.", the ending, "…left.", errors
```

---

## Status

**Built and checked**
- Laptop QR page, phone game and solo demo, all running with no build step
- Full two-round journey, ending, Begin again, partner-left message
- Firebase sign-in, rules and pairing confirmed working against the real database

### What's Left

1. **Put it on GitHub Pages** (see above).
2. **Play it start to finish:** first two browser windows, then two phones, then a room full of phones.
3. **Artistic decisions:**
   - Should you see your partner's ball? Currently **no** in both rounds. Set `showPartner: true` in `src/config.js` to draw them as a thin hollow ring, and combine it with fog-of-war (`visibleRadius`) if they should appear only up close.
   - Wording of every screen.
   - Should Round 2 use a different maze size or speed?
4. **Optional:** a live line on the laptop screen, such as "Someone is waiting." or how many pairs are playing.

### Things to Know on the Day
- If a phone locks or switches apps mid-game, its connection may drop and the partner will see "…left." Ask players to keep the game open.
- With an odd number of players, one person waits until someone new scans.
- Many pairs can play at once, each in its own private maze. This was stress-tested with 10 players joining together: 5 separate pairs, with no one paired twice. Firebase's free plan allows 100 phones connected at once (about 50 pairs).
