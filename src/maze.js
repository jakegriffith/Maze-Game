// Seeded RNG (mulberry32)
function makeRng(seed) {
  let h = 0
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(31, h) + seed.charCodeAt(i) | 0
  }
  let s = h >>> 0
  return function () {
    s += 0x6d2b79f5
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// Each cell: { visited, walls: [top, right, bottom, left] }
function makeGrid(cols, rows) {
  const grid = []
  for (let r = 0; r < rows; r++) {
    grid[r] = []
    for (let c = 0; c < cols; c++) {
      grid[r][c] = { visited: false, walls: [true, true, true, true] }
    }
  }
  return grid
}

// Directions: 0=top, 1=right, 2=bottom, 3=left
const DR = [-1, 0, 1, 0]
const DC = [0, 1, 0, -1]
const OPP = [2, 3, 0, 1]

function carve(grid, r, c, rng, rows, cols) {
  grid[r][c].visited = true
  const dirs = [0, 1, 2, 3].sort(() => rng() - 0.5)
  for (const d of dirs) {
    const nr = r + DR[d]
    const nc = c + DC[d]
    if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && !grid[nr][nc].visited) {
      grid[r][c].walls[d] = false
      grid[nr][nc].walls[OPP[d]] = false
      carve(grid, nr, nc, rng, rows, cols)
    }
  }
}

export function generateMaze(seed, cols, rows) {
  const rng = makeRng(String(seed))
  const grid = makeGrid(cols, rows)
  carve(grid, 0, 0, rng, rows, cols)
  return grid
}
