import type { Grid } from "@/game/grid/Grid";
import type { GridCoord } from "@/game/types";

interface Node {
  x: number;
  z: number;
  g: number;
  f: number;
  parent: Node | null;
}

function key(x: number, z: number): string {
  return `${x},${z}`;
}

/** A* pathfinding over the grid; treats "path" and "spawn"/"base" cells as
 * walkable and "blocked"/tower-occupied "buildable" cells as obstacles. */
export function findPath(
  grid: Grid,
  start: GridCoord,
  goal: GridCoord,
): GridCoord[] | null {
  const open = new Map<string, Node>();
  const closed = new Set<string>();

  const startNode: Node = { x: start.x, z: start.z, g: 0, f: heuristic(start, goal), parent: null };
  open.set(key(start.x, start.z), startNode);

  const neighborsOf = (n: Node): [number, number][] => [
    [n.x + 1, n.z],
    [n.x - 1, n.z],
    [n.x, n.z + 1],
    [n.x, n.z - 1],
  ];

  const walkable = (x: number, z: number): boolean => {
    const cell = grid.get(x, z);
    if (!cell) return false;
    if (cell.kind === "blocked") return false;
    if (cell.kind === "buildable" && cell.occupiedByTowerId) return false;
    return true;
  };

  while (open.size > 0) {
    let current: Node | null = null;
    for (const node of open.values()) {
      if (!current || node.f < current.f) current = node;
    }
    if (!current) break;

    if (current.x === goal.x && current.z === goal.z) {
      const path: GridCoord[] = [];
      let n: Node | null = current;
      while (n) {
        path.unshift({ x: n.x, z: n.z });
        n = n.parent;
      }
      return path;
    }

    open.delete(key(current.x, current.z));
    closed.add(key(current.x, current.z));

    for (const [nx, nz] of neighborsOf(current)) {
      if (closed.has(key(nx, nz))) continue;
      if (!walkable(nx, nz)) continue;
      const g = current.g + 1;
      const existing = open.get(key(nx, nz));
      if (!existing || g < existing.g) {
        const node: Node = {
          x: nx,
          z: nz,
          g,
          f: g + heuristic({ x: nx, z: nz }, goal),
          parent: current,
        };
        open.set(key(nx, nz), node);
      }
    }
  }
  return null;
}

function heuristic(a: GridCoord, b: GridCoord): number {
  return Math.abs(a.x - b.x) + Math.abs(a.z - b.z);
}
