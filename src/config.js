export const config = {
  // Maze
  gridSize: 12,        // cells per side in solo mode (multiplayer: see mazeSizes)
  wallThickness: 2,    // px (drawn line width)
  seed: 'hello',       // any string

  // Ball — sized and paced relative to a maze cell, so it fits any maze size
  ballSize: 0.31,      // ball radius as a fraction of a cell (0.31 ≈ 10px on a 12×12 phone maze)
  speed: 6.8,          // cells per second while holding a direction
  friction: 0.92,      // velocity multiplier per frame (higher = less friction)

  // Fog of war (0 = no fog / unlimited)
  visibleRadius: 0,

  // Multiplayer: the maze grows as more people share it.
  // [up to this many players, cells per side]
  mazeSizes: [
    [2, 12],   // a pair
    [4, 15],   // a group of 4
    [8, 18],   // a battle, 4 vs 4
    [12, 22],  // bigger battles (if teams ever arrive larger)
  ],

  // Multiplayer rounds
  //   1–2: pair · 3: group of 4 (find each other)
  //   4: battle — your group of 4 vs another group, Red vs Blue
  // In finding rounds you only see people once you've bumped into them.
  // In the battle everyone can see everyone.
  lastLinkRound: 3,      // last "find each other" round
  battleRound: 4,        // the battle
  maxGroup: 4,           // groups grow by a pair, up to this size
  mergeWaitSeconds: 60,  // how long to wait for another group / team before carrying on
  battleTie: 0.5,        // cells/s: if both hit this close in speed, both are out

  // Colors (not meant to be tuned live, just centralised)
  bg: '#f5f0e8',
  ink: '#111111',
  red: '#b3261e',
  blue: '#1f4e9c',
}

// Maze size for a number of players
export function gridFor(players) {
  for (const [upTo, grid] of config.mazeSizes) {
    if (players <= upTo) return grid
  }
  return config.mazeSizes[config.mazeSizes.length - 1][1]
}
