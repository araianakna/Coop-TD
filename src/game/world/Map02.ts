import { Grid } from "@/game/grid/Grid";
import type { GridCoord } from "@/game/types";
import type { MapDef } from "@/game/world/Map01";

export type { MapDef };

/**
 * A longer, more winding switchback path than Map01's simple S-curve —
 * spawn in the north-west, six full reversals of direction as it threads
 * between a handful of "blocked" rock-obstacle clusters, ending at a
 * south-central base. Same grid footprint as Map01 (18x14, cellSize 2) so
 * camera framing math elsewhere keeps working unchanged.
 */
export function buildMap02(): MapDef {
  const grid = new Grid(18, 14, 2);

  const pathCoords: GridCoord[] = [];
  const addRow = (z: number, xFrom: number, xTo: number) => {
    const step = xFrom <= xTo ? 1 : -1;
    for (let x = xFrom; step > 0 ? x <= xTo : x >= xTo; x += step) {
      pathCoords.push({ x, z });
    }
  };
  const addCol = (x: number, zFrom: number, zTo: number) => {
    const step = zFrom <= zTo ? 1 : -1;
    for (let z = zFrom; step > 0 ? z <= zTo : z >= zTo; z += step) {
      pathCoords.push({ x, z });
    }
  };

  addRow(1, 0, 5); // spawn on the west edge, run east
  addCol(5, 1, 4); // south
  addRow(4, 5, 2); // west
  addCol(2, 4, 7); // south
  addRow(7, 2, 8); // east
  addCol(8, 7, 3); // north
  addRow(3, 8, 13); // east
  addCol(13, 3, 6); // south
  addRow(6, 13, 10); // west
  addCol(10, 6, 10); // south
  addRow(10, 10, 15); // east
  addCol(15, 10, 12); // south
  addRow(12, 15, 9); // west into the base

  for (const c of pathCoords) {
    grid.set(c.x, c.z, "path");
  }

  const spawn = pathCoords[0];
  const base = pathCoords[pathCoords.length - 1];
  grid.set(spawn.x, spawn.z, "spawn");
  grid.set(base.x, base.z, "base");

  // Rock-obstacle clusters — carved as "blocked" cells so the shared
  // terrain shader (see Terrain.ts's TERRAIN_SHADE_GLSL "blocked"/"wild"
  // branch) renders them as rocky, unbuildable outcrops without any
  // terrain-file changes. Placed clear of the path and spread across the
  // playable rect so towers have to route around them instead of the field
  // being wide-open buildable space.
  const blockedClusters: GridCoord[][] = [
    // north-east outcrop, between the first two switchbacks
    [
      { x: 15, z: 1 },
      { x: 16, z: 1 },
      { x: 15, z: 2 },
      { x: 16, z: 2 },
    ],
    // east-edge ridge, flanking the mid-map corridor
    [
      { x: 16, z: 6 },
      { x: 17, z: 6 },
      { x: 16, z: 7 },
      { x: 17, z: 7 },
      { x: 16, z: 8 },
    ],
    // south-west boulder field
    [
      { x: 0, z: 10 },
      { x: 1, z: 10 },
      { x: 0, z: 11 },
      { x: 1, z: 11 },
      { x: 2, z: 11 },
      { x: 1, z: 12 },
    ],
    // south-central island, boxed in by the last two switchbacks
    [
      { x: 5, z: 9 },
      { x: 6, z: 9 },
      { x: 5, z: 10 },
      { x: 6, z: 10 },
      { x: 5, z: 11 },
    ],
  ];

  for (const cluster of blockedClusters) {
    for (const cell of cluster) {
      if (grid.get(cell.x, cell.z)?.kind === "buildable") {
        grid.set(cell.x, cell.z, "blocked");
      }
    }
  }

  return { grid, spawn, base, waypoints: pathCoords };
}
