import { Grid } from "@/game/grid/Grid";
import type { GridCoord } from "@/game/types";

export interface MapDef {
  grid: Grid;
  spawn: GridCoord;
  base: GridCoord;
  waypoints: GridCoord[];
}

/** A winding S-path from the west edge to an east-facing base. */
export function buildMap01(): MapDef {
  const grid = new Grid(18, 14, 2);

  const pathCoords: GridCoord[] = [];
  const addRow = (z: number, xFrom: number, xTo: number) => {
    const step = xFrom <= xTo ? 1 : -1;
    for (let x = xFrom; step > 0 ? x <= xTo : x >= xTo; x += step) {
      pathCoords.push({ x, z });
    }
  };

  addRow(2, 0, 14);
  for (let z = 2; z <= 5; z++) pathCoords.push({ x: 14, z });
  addRow(5, 14, 3);
  for (let z = 5; z <= 8; z++) pathCoords.push({ x: 3, z });
  addRow(8, 3, 16);
  for (let z = 8; z <= 11; z++) pathCoords.push({ x: 16, z });
  addRow(11, 16, 9);

  for (const c of pathCoords) {
    grid.set(c.x, c.z, "path");
  }

  const spawn = pathCoords[0];
  const base = pathCoords[pathCoords.length - 1];
  grid.set(spawn.x, spawn.z, "spawn");
  grid.set(base.x, base.z, "base");

  return { grid, spawn, base, waypoints: pathCoords };
}
