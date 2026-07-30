import * as THREE from "three";
import { createRenderer } from "@/core/Renderer";
import { createLightingRig } from "@/core/Lighting";
import { buildMap01 } from "@/game/world/Map01";
import { buildTerrain } from "@/game/world/Terrain";
import { getTowerDef } from "@/game/towers/TowerRegistry";
import { createTowerModel, animateTowerModel, updateTowerVfxTime } from "@/game/towers/models";

/**
 * Standalone QA harness: places real towers on the real Map01 terrain and
 * frames them with the *exact* default gameplay camera (see
 * RtsCameraController's initial distance/yaw/pitch/fov in src/core/Camera.ts)
 * instead of the flattering close-up the tower-gallery harness uses. This is
 * what a player actually sees when they drop a tower on the board.
 *
 * Not part of the game build — a separate Vite HTML entry for visual review
 * and screenshotting only.
 *
 * URL params:
 *   mode    — "row" (default) places distinct towers side by side at a
 *             fixed tier, or "progression" places one tower at tier 1/2/3
 *             side by side.
 *   towers  — comma-separated tower ids for "row" mode
 *             (default: a mixed sample of base + fusion towers).
 *   tier    — tier (1|2|3) applied to every tower in "row" mode (default 1).
 *   tower   — single tower id for "progression" mode (default tower_fire).
 *   panx,panz — extra world-space camera target offset, for framing a
 *             specific row of cells without changing distance/yaw/pitch.
 */
const params = new URLSearchParams(window.location.search);
const mode = params.get("mode") ?? "row";
const tier = (Number(params.get("tier") ?? "1") as 1 | 2 | 3) ?? 1;
const panX = Number(params.get("panx") ?? "0");
const panZ = Number(params.get("panz") ?? "0");

const map = buildMap01();
const grid = map.grid;

const app = document.getElementById("app")!;
const hud = document.createElement("div");
hud.id = "hud";
app.appendChild(hud);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0710);
createLightingRig(scene);

const terrain = buildTerrain(grid);
scene.add(terrain.mesh);

interface Placed {
  towerId: string;
  towerName: string;
  tier: 1 | 2 | 3;
  group: THREE.Group;
  anchor: THREE.Vector3;
}
const placed: Placed[] = [];

function placeTower(towerId: string, useTier: 1 | 2 | 3, gx: number, gz: number) {
  const def = getTowerDef(towerId);
  if (!def) {
    console.error(`Unknown tower id: ${towerId}`);
    return;
  }
  const tierDef = def.tiers[useTier - 1];
  const [wx, wz] = grid.gridToWorld({ x: gx, z: gz });
  const group = createTowerModel(def.modelId, useTier);
  group.scale.setScalar(tierDef.modelScale);
  group.position.set(wx, 0, wz);
  scene.add(group);
  placed.push({
    towerId: def.id,
    towerName: def.name,
    tier: useTier,
    group,
    anchor: new THREE.Vector3(wx, 2.0 * tierDef.modelScale + 0.3, wz),
  });
}

// Buildable row near the grid's visual center, clear of Map01's path
// (path touches z=8 across the whole row, and columns x=3 / x=14 through
// z=5-8, so z=6 is clean from x=4..13).
const ROW_Z = 6;

if (mode === "progression") {
  const towerId = params.get("tower") ?? "tower_fire";
  const xs = [5, 8, 11];
  [1, 2, 3].forEach((t, i) => placeTower(towerId, t as 1 | 2 | 3, xs[i], ROW_Z));
  const def = getTowerDef(towerId);
  hud.innerHTML = `<b>Gameplay-framing QA — tier progression</b><br/>${def?.name ?? towerId} · T1 / T2 / T3 · real default camera`;
} else {
  const defaultSample = [
    "tower_fire",
    "tower_ice",
    "tower_lightning",
    "tower_nature",
    "tower_earth",
    "tower_arcane",
  ];
  const towerIds = (params.get("towers") ?? defaultSample.join(",")).split(",").filter(Boolean);
  // Evenly spaced columns centered on the grid, regardless of list length.
  const spacing = 3;
  const startX = 9 - ((towerIds.length - 1) * spacing) / 2;
  towerIds.forEach((id, i) => placeTower(id, tier, Math.round(startX + i * spacing), ROW_Z));
  hud.innerHTML = `<b>Gameplay-framing QA — tier ${tier}</b><br/>${towerIds.join(", ")} · real default camera`;
}

const labelEls = placed.map((p) => {
  const el = document.createElement("div");
  el.className = "label";
  el.textContent = `${p.towerName} T${p.tier}`;
  app.appendChild(el);
  return el;
});

// --- Exact default gameplay camera (see src/core/Camera.ts RtsCameraController defaults) ---
const FOV = 42;
const DISTANCE = 34;
const YAW = 0.12;
const PITCH = 1.02;

const aspect = window.innerWidth / window.innerHeight;
const camera = new THREE.PerspectiveCamera(FOV, aspect, 0.1, 200);
const target = new THREE.Vector3(panX, 0, panZ);
function applyCamera() {
  const hr = Math.cos(PITCH) * DISTANCE;
  const h = Math.sin(PITCH) * DISTANCE;
  camera.position.copy(target).add(new THREE.Vector3(Math.sin(YAW) * hr, h, Math.cos(YAW) * hr));
  camera.lookAt(target);
}
applyCamera();

const rendererBundle = createRenderer(app, scene, camera);

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  rendererBundle.resize(w, h);
}
window.addEventListener("resize", resize);
resize();

const clock = new THREE.Clock();

function updateLabels() {
  for (let i = 0; i < placed.length; i++) {
    const p = placed[i];
    const el = labelEls[i];
    const projected = p.anchor.clone().project(camera);
    if (projected.z > 1) {
      el.style.display = "none";
      continue;
    }
    const sx = (projected.x * 0.5 + 0.5) * window.innerWidth;
    const sy = (-projected.y * 0.5 + 0.5) * window.innerHeight;
    el.style.display = "block";
    el.style.left = `${sx}px`;
    el.style.top = `${sy}px`;
  }
}

declare global {
  interface Window {
    __qaFrameCount?: number;
  }
}
window.__qaFrameCount = 0;

function loop() {
  const elapsed = clock.getElapsedTime();
  updateTowerVfxTime(elapsed);
  for (const p of placed) animateTowerModel(p.group, elapsed);
  const tick = terrain.mesh.userData.tick as ((dt: number, elapsed: number) => void) | undefined;
  tick?.(0, elapsed);
  updateLabels();
  rendererBundle.composer.render();
  window.__qaFrameCount = (window.__qaFrameCount ?? 0) + 1;
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
