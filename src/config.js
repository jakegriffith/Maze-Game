export const config = {
  // Maze
  gridSize: 12,        // number of cells per side
  wallThickness: 2,    // px (drawn line width)
  seed: 'hello',       // any string

  // Ball
  ballRadius: 10,      // px (was 7; bigger = easier for partners to bump into each other)
  maxSpeed: 220,       // px per second
  friction: 0.92,      // velocity multiplier per frame (higher = less friction)

  // Pad
  // (Direction pad: holding a button rolls at maxSpeed)

  // Fog of war (0 = no fog / unlimited)
  visibleRadius: 0,

  // Multiplayer groups
  // You only see people once you've linked up with them (bumped into them).
  lastRound: 5,          // the game ends after this round
  maxGroup: 8,           // groups grow by a pair each round, up to this size
  mergeWaitSeconds: 60,  // how long a group waits for another to join before carrying on

  // Colors (not meant to be tuned live, just centralised)
  bg: '#f5f0e8',
  ink: '#111111',
}
