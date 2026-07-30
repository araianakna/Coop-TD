import * as THREE from "three";
import type { Grid } from "@/game/grid/Grid";
import { sampleTerrainHeight, TERRAIN_PADDING_CELLS } from "@/game/world/Terrain";

/**
 * Scattered low-poly props (rocks, crystal clusters, dead trees, glowing
 * mushrooms) built entirely from primitive geometry via THREE.InstancedMesh
 * — no external assets. Placement is confined to the "wild" skirt outside
 * the playable grid rect (see Terrain.ts's TERRAIN_PADDING_CELLS) so the
 * path and buildable tiles themselves always stay completely clear.
 */

function mulberry32(seed: number) {
  let s = seed;
  return function next() {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Anchor {
  x: number;
  z: number;
  outside: number; // 0..1, distance-from-grid-edge fraction used for density falloff
}

/** Candidate anchor points across the wild skirt, excluding a buffer right at the grid edge. */
function scatterAnchors(grid: Grid, rand: () => number): Anchor[] {
  const halfW = (grid.width * grid.cellSize) / 2;
  const halfD = (grid.height * grid.cellSize) / 2;
  const padWorld = TERRAIN_PADDING_CELLS * grid.cellSize;
  const outerW = halfW + padWorld;
  const outerD = halfD + padWorld;
  const cellStep = 1.6;
  const edgeBuffer = 1.4; // keep a clear strip right at the grid boundary

  const spawnWorld = grid.gridToWorld({ x: 0, z: grid.height / 2 });
  const clearPoints: [number, number][] = [spawnWorld];

  const anchors: Anchor[] = [];
  for (let x = -outerW; x <= outerW; x += cellStep) {
    for (let z = -outerD; z <= outerD; z += cellStep) {
      const insideGrid = Math.abs(x) < halfW && Math.abs(z) < halfD;
      if (insideGrid) continue;
      const dx = Math.max(0, Math.abs(x) - halfW);
      const dz = Math.max(0, Math.abs(z) - halfD);
      const distOut = Math.max(dx, dz);
      if (distOut < edgeBuffer) continue;
      const outside = THREE.MathUtils.clamp(distOut / padWorld, 0, 1);

      const jx = x + (rand() - 0.5) * cellStep * 0.9;
      const jz = z + (rand() - 0.5) * cellStep * 0.9;

      let tooClose = false;
      for (const [cx, cz] of clearPoints) {
        if (Math.hypot(jx - cx, jz - cz) < 3.5) {
          tooClose = true;
          break;
        }
      }
      if (tooClose) continue;

      // Density falloff: sparse right past the buffer, thicker mid-skirt, thinning into fog at the far edge.
      const density = Math.sin(Math.PI * THREE.MathUtils.clamp(outside * 1.15, 0, 1)) * 0.85 + 0.15;
      if (rand() > density * 0.55) continue;

      anchors.push({ x: jx, z: jz, outside });
    }
  }
  return anchors;
}

type PropType = "rock" | "crystal" | "treeTrunk" | "treeBranch" | "mushroomStem" | "mushroomCap";

const _pos = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _euler = new THREE.Euler();

function pushTransform(
  bucket: THREE.Matrix4[],
  colors: THREE.Color[] | null,
  color: THREE.Color | null,
  x: number,
  y: number,
  z: number,
  rotY: number,
  rotX: number,
  rotZ: number,
  scaleX: number,
  scaleY: number,
  scaleZ: number,
) {
  _pos.set(x, y, z);
  _euler.set(rotX, rotY, rotZ);
  _quat.setFromEuler(_euler);
  _scale.set(scaleX, scaleY, scaleZ);
  const m = new THREE.Matrix4().compose(_pos, _quat, _scale);
  bucket.push(m);
  if (colors && color) colors.push(color);
}

export function createFoliage(grid: Grid): THREE.Group {
  const rand = mulberry32(0x50a1e5);
  const anchors = scatterAnchors(grid, rand);

  const buckets: Record<PropType, THREE.Matrix4[]> = {
    rock: [],
    crystal: [],
    treeTrunk: [],
    treeBranch: [],
    mushroomStem: [],
    mushroomCap: [],
  };
  const rockColors: THREE.Color[] = [];
  const crystalColors: THREE.Color[] = [];
  const mushroomCapColors: THREE.Color[] = [];

  const rockPalette = [0x59544f, 0x4a4640, 0x6b6259, 0x403d3a].map((c) => new THREE.Color(c));
  const crystalPalette = [0x6ad0ff, 0x8a5cff, 0x54ffb0, 0xff8a5c].map((c) => new THREE.Color(c));
  const mushroomPalette = [0xff6bd6, 0x6adfff, 0xa4ff6b, 0xffb26a].map((c) => new THREE.Color(c));

  for (const anchor of anchors) {
    const roll = rand();
    const groundY = sampleTerrainHeight(grid, anchor.x, anchor.z);

    if (roll < 0.4) {
      // Rock cluster: one boulder + occasional pebbles.
      const s = 0.5 + rand() * 0.9 + anchor.outside * 0.3;
      pushTransform(
        buckets.rock,
        rockColors,
        rockPalette[Math.floor(rand() * rockPalette.length)],
        anchor.x,
        groundY + s * 0.18,
        anchor.z,
        rand() * Math.PI * 2,
        (rand() - 0.5) * 0.3,
        (rand() - 0.5) * 0.3,
        s,
        s * (0.75 + rand() * 0.4),
        s,
      );
      const pebbleCount = rand() < 0.5 ? 1 : 0;
      for (let i = 0; i < pebbleCount; i++) {
        const ox = anchor.x + (rand() - 0.5) * 0.9;
        const oz = anchor.z + (rand() - 0.5) * 0.9;
        const ps = 0.18 + rand() * 0.25;
        pushTransform(
          buckets.rock,
          rockColors,
          rockPalette[Math.floor(rand() * rockPalette.length)],
          ox,
          sampleTerrainHeight(grid, ox, oz) + ps * 0.18,
          oz,
          rand() * Math.PI * 2,
          0,
          0,
          ps,
          ps * 0.8,
          ps,
        );
      }
    } else if (roll < 0.58) {
      // Crystal shard cluster — elemental accent.
      const shardCount = 2 + Math.floor(rand() * 3);
      const clusterColor = crystalPalette[Math.floor(rand() * crystalPalette.length)];
      for (let i = 0; i < shardCount; i++) {
        const ox = anchor.x + (rand() - 0.5) * 0.5;
        const oz = anchor.z + (rand() - 0.5) * 0.5;
        const h = 0.5 + rand() * 0.7;
        const tilt = (rand() - 0.5) * 0.5;
        pushTransform(
          buckets.crystal,
          crystalColors,
          clusterColor,
          ox,
          sampleTerrainHeight(grid, ox, oz) + h * 0.42,
          oz,
          rand() * Math.PI * 2,
          tilt,
          tilt,
          0.16 + rand() * 0.12,
          h,
          0.16 + rand() * 0.12,
        );
      }
    } else if (roll < 0.8) {
      // Dead tree — trunk + a few bare angled branches.
      const trunkH = 1.3 + rand() * 1.4;
      const lean = (rand() - 0.5) * 0.25;
      pushTransform(
        buckets.treeTrunk,
        null,
        null,
        anchor.x,
        groundY + trunkH * 0.5,
        anchor.z,
        rand() * Math.PI * 2,
        lean,
        lean * 0.6,
        0.7 + rand() * 0.3,
        trunkH,
        0.7 + rand() * 0.3,
      );
      const branchCount = 2 + Math.floor(rand() * 3);
      for (let i = 0; i < branchCount; i++) {
        const along = 0.45 + rand() * 0.45;
        const by = groundY + trunkH * along;
        const bAngle = rand() * Math.PI * 2;
        const bTilt = 0.7 + rand() * 0.6;
        const bLen = 0.5 + rand() * 0.5;
        const bx = anchor.x + Math.cos(bAngle) * bLen * 0.35;
        const bz = anchor.z + Math.sin(bAngle) * bLen * 0.35;
        pushTransform(
          buckets.treeBranch,
          null,
          null,
          bx,
          by,
          bz,
          bAngle,
          bTilt,
          0,
          0.6 + rand() * 0.3,
          bLen,
          0.6 + rand() * 0.3,
        );
      }
    } else {
      // Mushroom cluster — small glowing accents in shaded undergrowth.
      const count = 2 + Math.floor(rand() * 3);
      const capColor = mushroomPalette[Math.floor(rand() * mushroomPalette.length)];
      for (let i = 0; i < count; i++) {
        const ox = anchor.x + (rand() - 0.5) * 0.7;
        const oz = anchor.z + (rand() - 0.5) * 0.7;
        const gy = sampleTerrainHeight(grid, ox, oz);
        const s = 0.5 + rand() * 0.8;
        pushTransform(buckets.mushroomStem, null, null, ox, gy + 0.11 * s, oz, rand() * Math.PI * 2, 0, 0, s, s, s);
        pushTransform(
          buckets.mushroomCap,
          mushroomCapColors,
          capColor,
          ox,
          gy + 0.2 * s,
          oz,
          rand() * Math.PI * 2,
          0,
          0,
          s,
          s,
          s,
        );
      }
    }
  }

  const group = new THREE.Group();
  group.name = "foliage";

  const rockGeo = new THREE.DodecahedronGeometry(0.4, 0);
  const rockMat = new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0.05, vertexColors: true });
  addInstanced(group, rockGeo, rockMat, buckets.rock, rockColors);

  const crystalGeo = new THREE.OctahedronGeometry(0.22, 0);
  const crystalMat = new THREE.MeshStandardMaterial({
    roughness: 0.25,
    metalness: 0.1,
    vertexColors: true,
    emissiveIntensity: 0.9,
    emissive: new THREE.Color(0xffffff),
  });
  crystalMat.onBeforeCompile = (shader) => {
    // Cheap emissive-follows-albedo trick so each instance glows in its own hue
    // without needing per-instance emissive attributes.
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <emissivemap_fragment>",
      "#include <emissivemap_fragment>\n totalEmissiveRadiance = diffuseColor.rgb * 1.1;",
    );
  };
  addInstanced(group, crystalGeo, crystalMat, buckets.crystal, crystalColors);

  const trunkGeo = new THREE.CylinderGeometry(0.05, 0.09, 1, 5);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x2c2320, roughness: 0.95 });
  addInstanced(group, trunkGeo, trunkMat, buckets.treeTrunk, null);

  const branchGeo = new THREE.CylinderGeometry(0.02, 0.045, 1, 4);
  branchGeo.translate(0, 0.5, 0);
  branchGeo.rotateX(Math.PI / 2);
  const branchMat = new THREE.MeshStandardMaterial({ color: 0x241c19, roughness: 0.95 });
  addInstanced(group, branchGeo, branchMat, buckets.treeBranch, null);

  const stemGeo = new THREE.CylinderGeometry(0.03, 0.045, 0.22, 6);
  const stemMat = new THREE.MeshStandardMaterial({ color: 0xe7ddc8, roughness: 0.8 });
  addInstanced(group, stemGeo, stemMat, buckets.mushroomStem, null);

  const capGeo = new THREE.SphereGeometry(0.13, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.5);
  capGeo.translate(0, 0.11, 0);
  const capMat = new THREE.MeshStandardMaterial({
    roughness: 0.5,
    metalness: 0,
    vertexColors: true,
    emissive: new THREE.Color(0xffffff),
    emissiveIntensity: 0.6,
  });
  capMat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <emissivemap_fragment>",
      "#include <emissivemap_fragment>\n totalEmissiveRadiance = diffuseColor.rgb * 0.7;",
    );
  };
  addInstanced(group, capGeo, capMat, buckets.mushroomCap, mushroomCapColors);

  return group;
}

function addInstanced(
  group: THREE.Group,
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  matrices: THREE.Matrix4[],
  colors: THREE.Color[] | null,
) {
  if (matrices.length === 0) return;
  const mesh = new THREE.InstancedMesh(geometry, material, matrices.length);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  for (let i = 0; i < matrices.length; i++) {
    mesh.setMatrixAt(i, matrices[i]);
    if (colors) mesh.setColorAt(i, colors[i]);
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  group.add(mesh);
}
