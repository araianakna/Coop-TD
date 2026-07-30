import * as THREE from "three";
import type { Grid } from "@/game/grid/Grid";
import type { CellKind } from "@/game/types";
import { GLSL_NOISE, makeFbm2D, ridge } from "@/game/world/shaderNoise";

/**
 * Ground terrain: a displaced, padded plane driven by a procedural
 * MeshStandardMaterial (built via onBeforeCompile injection so it keeps
 * full PBR lighting/shadow/fog support from the standard pipeline while
 * getting fully custom per-pixel coloring).
 *
 * Playable cell classification (buildable/path/blocked/spawn/base) is baked
 * into a small NEAREST-filtered DataTexture so cell boundaries stay crisp
 * (gameplay-critical readability) while noise supplies material variety
 * *within* each cell type.
 */

/** How many extra cells of "wild" terrain skirt the playable grid, for foliage/atmosphere & to avoid a hard mesh edge. */
export const TERRAIN_PADDING_CELLS = 5;

const KIND_CODE: Record<CellKind, number> = {
  buildable: 0,
  path: 1,
  blocked: 2,
  spawn: 3,
  base: 4,
};

const macroFbm = makeFbm2D(1337, 3);
const ridgeFbm = makeFbm2D(9001, 4);
const detailFbm = makeFbm2D(4242, 2);

function classifyKind(grid: Grid, gx: number, gz: number): CellKind | "wild" {
  if (gx < 0 || gx >= grid.width || gz < 0 || gz >= grid.height) return "wild";
  return grid.get(gx, gz)?.kind ?? "wild";
}

/** Normalized 0..1 distance *outside* the playable rect, 0 at the grid edge, 1 at the padding limit. */
function distanceOutsideGrid(grid: Grid, worldX: number, worldZ: number): number {
  const halfW = (grid.width * grid.cellSize) / 2;
  const halfD = (grid.height * grid.cellSize) / 2;
  const dx = Math.max(0, Math.abs(worldX) - halfW);
  const dz = Math.max(0, Math.abs(worldZ) - halfD);
  const d = Math.max(dx, dz);
  return THREE.MathUtils.clamp(d / (TERRAIN_PADDING_CELLS * grid.cellSize), 0, 1);
}

/**
 * World-space height field. Exported so Foliage.ts can place props flush
 * with the same surface the terrain mesh actually renders.
 */
export function sampleTerrainHeight(grid: Grid, worldX: number, worldZ: number): number {
  const gx = Math.floor(worldX / grid.cellSize + grid.width / 2);
  const gz = Math.floor(worldZ / grid.cellSize + grid.height / 2);
  const kind = classifyKind(grid, gx, gz);

  if (kind === "path" || kind === "spawn" || kind === "base") return 0;

  if (kind === "buildable") {
    const n = macroFbm(worldX * 0.05, worldZ * 0.05);
    const g = detailFbm(worldX * 0.4, worldZ * 0.4);
    return n * 0.08 + g * 0.015 + 0.02;
  }

  // "blocked" or "wild" (outside the playable rect): pronounced, rockier relief.
  const outside = distanceOutsideGrid(grid, worldX, worldZ);
  const amp = THREE.MathUtils.lerp(0.35, 0.95, outside);
  const r = ridge(ridgeFbm(worldX * 0.045, worldZ * 0.045));
  const n = macroFbm(worldX * 0.09, worldZ * 0.09);
  return r * amp * 0.75 + n * amp * 0.3 + 0.12;
}

function buildKindTexture(grid: Grid): THREE.DataTexture {
  const data = new Uint8Array(grid.width * grid.height);
  let i = 0;
  for (let z = 0; z < grid.height; z++) {
    for (let x = 0; x < grid.width; x++) {
      const cell = grid.get(x, z);
      data[i++] = KIND_CODE[cell?.kind ?? "buildable"];
    }
  }
  const tex = new THREE.DataTexture(data, grid.width, grid.height, THREE.RedFormat, THREE.UnsignedByteType);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

// GLSL: per-pixel terrain shading — flagstone/rune path, arcane spawn/base,
// bright readable buildable turf, rocky wild/blocked hillside. Injected into
// MeshStandardMaterial's fragment shader so it keeps standard PBR lighting.
const TERRAIN_SHADE_GLSL = /* glsl */ `
  struct TerrainShade { vec3 albedo; float rough; vec3 emissive; };

  TerrainShade shadeTerrain(vec3 worldPos, float slopeY, float time) {
    vec2 guv = vec2(
      (worldPos.x / uCellSize + uGridWidth * 0.5) / uGridWidth,
      (worldPos.z / uCellSize + uGridHeight * 0.5) / uGridHeight
    );
    bool inBounds = guv.x >= 0.0 && guv.x <= 1.0 && guv.y >= 0.0 && guv.y <= 1.0;
    float kc = -1.0;
    if (inBounds) {
      kc = floor(texture2D(uCellKindTex, clamp(guv, 0.0, 1.0)).r * 255.0 + 0.5);
    }

    float macro = rwFbm(worldPos.xz * 0.05, 3);
    float detail = rwFbm(worldPos.xz * 0.55 + 13.0, 2);
    float grain = rwFbm(worldPos.xz * 3.0 - 7.0, 2);

    vec3 grassLo  = vec3(0.129, 0.267, 0.180);
    vec3 grassHi  = vec3(0.243, 0.361, 0.180);
    vec3 mossCol  = vec3(0.161, 0.298, 0.235);
    vec3 dirtCol  = vec3(0.216, 0.161, 0.110);
    vec3 rockCol  = vec3(0.243, 0.231, 0.235);
    vec3 rockDark = vec3(0.129, 0.122, 0.133);
    vec3 stoneA   = vec3(0.243, 0.243, 0.278);
    vec3 stoneB   = vec3(0.184, 0.184, 0.220);
    vec3 mortar   = vec3(0.086, 0.082, 0.114);
    vec3 arcaneA  = vec3(0.290, 0.180, 0.420);
    vec3 arcaneB  = vec3(0.200, 0.110, 0.330);
    vec3 buildTint = vec3(0.259, 0.400, 0.216);

    vec3 albedo;
    float rough;
    vec3 emissive = vec3(0.0);

    vec2 cellLocal = fract(guv * vec2(uGridWidth, uGridHeight)) - 0.5;

    if (kc >= 0.5 && kc < 1.5) {
      // PATH — flagstone with mortar seams and a pulsing rune vein.
      float edgeDist = 0.5 - max(abs(cellLocal.x), abs(cellLocal.y));
      float mortarMask = smoothstep(0.0, 0.07, edgeDist);
      vec3 stoneBase = mix(stoneA, stoneB, smoothstep(-0.3, 0.3, detail));
      albedo = mix(mortar, stoneBase, mortarMask);
      albedo *= (0.9 + 0.15 * grain);
      rough = 0.5;
      float vein = smoothstep(0.82, 1.0, 1.0 - abs(cellLocal.x) * 2.05) * mortarMask;
      float pulse = 0.55 + 0.45 * sin(time * 1.6 + worldPos.x * 0.6 + worldPos.z * 0.6);
      emissive = vec3(0.35, 1.25, 1.6) * vein * pulse * 1.35;
    } else if (kc >= 2.5 && kc < 4.5) {
      // SPAWN / BASE — arcane portal stone with a glowing ring emblem.
      float d = length(cellLocal);
      vec3 stoneBase = mix(arcaneB, arcaneA, smoothstep(-0.3, 0.3, detail));
      albedo = stoneBase * (0.85 + 0.2 * grain);
      rough = 0.4;
      float ring = smoothstep(0.42, 0.37, d) - smoothstep(0.29, 0.24, d);
      float pulse = 0.7 + 0.3 * sin(time * 2.1);
      emissive = vec3(0.55, 0.25, 1.4) * (ring * 1.8 + 0.12) * pulse;
    } else if (kc >= -0.5 && kc < 0.5) {
      // BUILDABLE — bright, unmistakably "placeable" turf. Game.ts already
      // draws the ring/hit-area markers on top, so this stays a natural
      // grass blend rather than repeating a per-tile halo pattern.
      vec3 g = mix(grassLo, grassHi, smoothstep(-0.35, 0.35, macro));
      g = mix(g, mossCol, smoothstep(0.15, 0.55, detail) * 0.3);
      g *= buildTint * 1.55;
      g *= (0.94 + 0.08 * grain);
      albedo = g;
      rough = 0.8;
    } else {
      // BLOCKED / WILD — rolling hills, mossy dirt blending to exposed rock on slopes.
      vec3 g = mix(grassLo * 0.8, mossCol, smoothstep(-0.35, 0.35, macro));
      vec3 groundMix = mix(dirtCol, g, smoothstep(-0.15, 0.45, detail));
      float rockAmt = smoothstep(0.8, 0.4, slopeY);
      vec3 rockMix = mix(rockCol, rockDark, smoothstep(-0.3, 0.3, grain));
      albedo = mix(groundMix, rockMix, rockAmt);
      albedo *= (0.94 + 0.09 * grain);
      rough = mix(0.85, 0.95, rockAmt);
    }

    TerrainShade result;
    result.albedo = albedo;
    result.rough = rough;
    result.emissive = emissive;
    return result;
  }
`;

export interface TerrainBuild {
  mesh: THREE.Mesh;
  /** World-space padding radius (in the same units as gridToWorld) beyond the grid rect. */
  paddingWorld: number;
}

export function buildTerrain(grid: Grid): TerrainBuild {
  const segmentsPerCell = 2;
  const totalCellsX = grid.width + TERRAIN_PADDING_CELLS * 2;
  const totalCellsZ = grid.height + TERRAIN_PADDING_CELLS * 2;
  const worldWidth = totalCellsX * grid.cellSize;
  const worldDepth = totalCellsZ * grid.cellSize;
  const segX = totalCellsX * segmentsPerCell;
  const segZ = totalCellsZ * segmentsPerCell;

  const geometry = new THREE.PlaneGeometry(worldWidth, worldDepth, segX, segZ);
  geometry.rotateX(-Math.PI / 2);

  const pos = geometry.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    pos.setY(i, sampleTerrainHeight(grid, x, z));
  }
  pos.needsUpdate = true;
  geometry.computeVertexNormals();

  const normalAttr = geometry.attributes.normal as THREE.BufferAttribute;
  const slope = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    slope[i] = normalAttr.getY(i);
  }
  geometry.setAttribute("aSlope", new THREE.BufferAttribute(slope, 1));

  const kindTex = buildKindTexture(grid);

  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 1,
    metalness: 0,
  });

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uCellKindTex = { value: kindTex };
    shader.uniforms.uGridWidth = { value: grid.width };
    shader.uniforms.uGridHeight = { value: grid.height };
    shader.uniforms.uCellSize = { value: grid.cellSize };
    shader.uniforms.uTime = { value: 0 };
    material.userData.shader = shader;

    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nattribute float aSlope;\nvarying float vSlope;\nvarying vec3 vWorldPos;",
      )
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvSlope = aSlope;\nvWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;",
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>\nvarying float vSlope;\nvarying vec3 vWorldPos;\nuniform sampler2D uCellKindTex;\nuniform float uGridWidth;\nuniform float uGridHeight;\nuniform float uCellSize;\nuniform float uTime;\n${GLSL_NOISE}\n${TERRAIN_SHADE_GLSL}`,
      )
      .replace(
        "#include <roughnessmap_fragment>",
        `#include <roughnessmap_fragment>
        TerrainShade tShade = shadeTerrain(vWorldPos, vSlope, uTime);
        diffuseColor.rgb = tShade.albedo;
        roughnessFactor = tShade.rough;
        totalEmissiveRadiance = tShade.emissive;`,
      );
  };

  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  mesh.userData.tick = (_dt: number, elapsed: number) => {
    const shader = material.userData.shader as
      | { uniforms: { uTime: { value: number } } }
      | undefined;
    if (shader) shader.uniforms.uTime.value = elapsed;
  };

  return { mesh, paddingWorld: TERRAIN_PADDING_CELLS * grid.cellSize };
}

export function createTerrain(grid: Grid): THREE.Mesh {
  return buildTerrain(grid).mesh;
}
