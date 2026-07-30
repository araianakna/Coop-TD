import * as THREE from "three";
import { createNoise2D } from "simplex-noise";
import type { Grid } from "@/game/grid/Grid";

const GRASS_A = new THREE.Color(0x2f6b4f);
const GRASS_B = new THREE.Color(0x3f8a5f);
const PATH_COLOR = new THREE.Color(0x4a3a5e);
const BASE_COLOR = new THREE.Color(0x8a6bd9);

export function createTerrain(grid: Grid): THREE.Mesh {
  const segmentsX = grid.width;
  const segmentsZ = grid.height;
  const worldWidth = grid.width * grid.cellSize;
  const worldDepth = grid.height * grid.cellSize;

  const geometry = new THREE.PlaneGeometry(
    worldWidth,
    worldDepth,
    segmentsX,
    segmentsZ,
  );
  geometry.rotateX(-Math.PI / 2);

  const noise2D = createNoise2D(() => 0.42);
  const pos = geometry.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const gx = Math.floor(x / grid.cellSize + grid.width / 2);
    const gz = Math.floor(z / grid.cellSize + grid.height / 2);
    const cell = grid.get(gx, gz);
    const kind = cell?.kind ?? "buildable";

    let height = 0;
    let color = GRASS_A;

    if (kind === "path") {
      height = 0;
      color = PATH_COLOR;
    } else if (kind === "base" || kind === "spawn") {
      height = 0.05;
      color = BASE_COLOR;
    } else {
      const n = noise2D(x * 0.08, z * 0.08);
      height = n * 0.35 + 0.15;
      color = GRASS_A.clone().lerp(GRASS_B, (n + 1) / 2);
    }

    pos.setY(i, height);
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }

  pos.needsUpdate = true;
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();

  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.85,
    metalness: 0.05,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  return mesh;
}
