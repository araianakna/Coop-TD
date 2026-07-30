import type { CellKind, GridCoord } from "@/game/types";

export interface Cell {
  x: number;
  z: number;
  kind: CellKind;
  occupiedByTowerId?: string;
}

export class Grid {
  readonly width: number;
  readonly height: number;
  readonly cellSize: number;
  private cells: Cell[];

  constructor(width: number, height: number, cellSize = 2) {
    this.width = width;
    this.height = height;
    this.cellSize = cellSize;
    this.cells = new Array(width * height);
    for (let z = 0; z < height; z++) {
      for (let x = 0; x < width; x++) {
        this.cells[this.index(x, z)] = { x, z, kind: "buildable" };
      }
    }
  }

  private index(x: number, z: number): number {
    return z * this.width + x;
  }

  inBounds(x: number, z: number): boolean {
    return x >= 0 && x < this.width && z >= 0 && z < this.height;
  }

  get(x: number, z: number): Cell | undefined {
    if (!this.inBounds(x, z)) return undefined;
    return this.cells[this.index(x, z)];
  }

  set(x: number, z: number, kind: CellKind) {
    const c = this.get(x, z);
    if (c) c.kind = kind;
  }

  isBuildable(x: number, z: number): boolean {
    const c = this.get(x, z);
    return !!c && c.kind === "buildable" && !c.occupiedByTowerId;
  }

  placeTower(x: number, z: number, towerId: string): boolean {
    if (!this.isBuildable(x, z)) return false;
    this.get(x, z)!.occupiedByTowerId = towerId;
    return true;
  }

  removeTower(x: number, z: number) {
    const c = this.get(x, z);
    if (c) c.occupiedByTowerId = undefined;
  }

  gridToWorld(coord: GridCoord): [number, number] {
    return [
      (coord.x - this.width / 2 + 0.5) * this.cellSize,
      (coord.z - this.height / 2 + 0.5) * this.cellSize,
    ];
  }

  worldToGrid(x: number, z: number): GridCoord {
    return {
      x: Math.floor(x / this.cellSize + this.width / 2),
      z: Math.floor(z / this.cellSize + this.height / 2),
    };
  }

  *allCells(): IterableIterator<Cell> {
    yield* this.cells;
  }
}
