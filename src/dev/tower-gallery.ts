import * as THREE from "three";
import { createRenderer } from "@/core/Renderer";
import { createLightingRig } from "@/core/Lighting";
import { listAllTowers } from "@/game/towers/TowerRegistry";
import { createTowerModel, animateTowerModel, updateTowerVfxTime } from "@/game/towers/models";

/**
 * Standalone QA harness: renders every tower x tier as a specimen grid.
 * Not part of the game build — a separate Vite HTML entry for visual review
 * and screenshotting only.
 *
 * URL params:
 *   start  — first tower column index to show (default 0)
 *   count  — how many tower columns to show (default 7)
 */
const params = new URLSearchParams(window.location.search);
const start = Number(params.get("start") ?? "0");
const count = Number(params.get("count") ?? "7");

const towers = listAllTowers();
const visibleTowers = towers.slice(start, start + count);

const app = document.getElementById("app")!;
const hud = document.createElement("div");
hud.id = "hud";
hud.innerHTML = `<b>Runeward Tower Gallery</b><br/>Showing towers ${start + 1}-${start + visibleTowers.length} of ${towers.length} &middot; 3 tiers each<br/>?start=&count= to page through`;
app.appendChild(hud);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0710);
scene.fog = new THREE.FogExp2(0x0a0710, 0.012);
createLightingRig(scene);

const COL_SPACING = 2.6;
const ROW_SPACING = 3.0;

// Neutral dark floor so towers read purely against material/lighting, not a
// colored ground.
const floorWidth = Math.max(visibleTowers.length * COL_SPACING + 6, 14);
const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(floorWidth, 14),
  new THREE.MeshStandardMaterial({ color: 0x141019, roughness: 0.95, metalness: 0.02 }),
);
floor.rotation.x = -Math.PI / 2;
floor.position.set((visibleTowers.length - 1) * COL_SPACING * 0.5, 0, -ROW_SPACING);
floor.receiveShadow = true;
scene.add(floor);

interface Placed {
  towerId: string;
  towerName: string;
  tier: 1 | 2 | 3;
  group: THREE.Group;
  anchor: THREE.Vector3; // world position used for label projection
}

const placed: Placed[] = [];

visibleTowers.forEach((def, col) => {
  const x = col * COL_SPACING;
  for (const tierDef of def.tiers) {
    const tier = tierDef.tier;
    // Tier 1 sits farthest from camera (smaller apparent size), tier 3
    // nearest (larger apparent size) — perspective reinforces the actual
    // scale growth instead of fighting it.
    const z = -(3 - tier) * ROW_SPACING;
    const group = createTowerModel(def.modelId, tier);
    group.scale.setScalar(tierDef.modelScale);
    group.position.set(x, 0, z);
    scene.add(group);

    // small pedestal disc so every tower sits on a consistent visual base
    const disc = new THREE.Mesh(
      new THREE.CylinderGeometry(0.72, 0.78, 0.06, 24),
      new THREE.MeshStandardMaterial({ color: 0x1c1624, roughness: 0.8, metalness: 0.1 }),
    );
    disc.position.set(x, 0.03, z);
    disc.receiveShadow = true;
    scene.add(disc);

    placed.push({
      towerId: def.id,
      towerName: def.name,
      tier,
      group,
      anchor: new THREE.Vector3(x, 1.9 * tierDef.modelScale + 0.3, z),
    });
  }
});

const labelEls = placed.map((p) => {
  const el = document.createElement("div");
  el.className = "label";
  el.innerHTML = `<div class="name">${p.towerName}</div><div class="tier">T${p.tier}${p.tier === 1 ? "" : ""}</div>`;
  app.appendChild(el);
  return el;
});

const aspect = window.innerWidth / window.innerHeight;
const camera = new THREE.PerspectiveCamera(38, aspect, 0.1, 200);

const centerX = (visibleTowers.length - 1) * COL_SPACING * 0.5;
const camTarget = new THREE.Vector3(centerX, 1.6, -ROW_SPACING);
camera.position.set(centerX, 6.4, 9.5);
camera.lookAt(camTarget);

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
    if (sx < -60 || sx > window.innerWidth + 60 || sy < -40 || sy > window.innerHeight + 40) {
      el.style.display = "none";
      continue;
    }
    el.style.display = "block";
    el.style.left = `${sx}px`;
    el.style.top = `${sy}px`;
  }
}

function loop() {
  const elapsed = clock.getElapsedTime();
  updateTowerVfxTime(elapsed);
  for (const p of placed) animateTowerModel(p.group, elapsed);
  updateLabels();
  rendererBundle.composer.render();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
