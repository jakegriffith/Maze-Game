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

  // Multiplayer: draw the partner's ball as a hollow ring?
  // false = you only find them by bumping into them (current design)
  showPartner: false,

  // Colors (not meant to be tuned live, just centralised)
  bg: '#f5f0e8',
  ink: '#111111',
}
