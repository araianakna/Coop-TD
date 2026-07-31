import * as THREE from "three";
import { createRenderer } from "@/core/Renderer";
import { createLightingRig } from "@/core/Lighting";
import { getTowerDef, listBaseTowers } from "@/game/towers/TowerRegistry";
import { GRAND_FUSION_RECIPES } from "@/game/towers/GrandFusionMatrix";
import { createTowerModel, animateTowerModel, updateTowerVfxTime } from "@/game/towers/models";
import type { TowerDef } from "@/game/types";

/**
 * Standalone QA harness for the tower-progression-depth pass:
 *   ?section=grand      (default) — all 6 Grand Fusion towers x 3 tiers
 *   ?section=capstones  — all 6 base towers at tier 3, labeled with their
 *                          tier-3-only capstone ability
 *
 * Not part of the game build — a separate Vite HTML entry for visual review
 * and screenshotting only. Mirrors tower-gallery.ts's layout/camera approach.
 */
const params = new URLSearchParams(window.location.search);
const section = params.get("section") === "capstones" ? "capstones" : "grand";
const focus = params.get("focus") !== null ? Number(params.get("focus")) : null;
// Optional camera-distance multiplier for focus mode (?zoom=1.6 pulls the
// camera back 60% further) — QA-only convenience for inspecting a whole
// tower (all 3 tiers) without the default tight crop; purely additive,
// defaults to 1 (no change) so existing behavior/links are unaffected.
const zoom = params.get("zoom") !== null ? Number(params.get("zoom")) : 1;

const app = document.getElementById("app")!;
const hud = document.createElement("div");
hud.id = "hud";
app.appendChild(hud);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0710);
scene.fog = new THREE.FogExp2(0x0a0710, 0.012);
createLightingRig(scene);

const COL_SPACING = 2.7;
const ROW_SPACING = 3.1;

interface Placed {
  towerId: string;
  towerName: string;
  tier: 1 | 2 | 3;
  group: THREE.Group;
  anchor: THREE.Vector3;
  abilityLine?: string;
}

const placed: Placed[] = [];
let columnCount = 0;

function addFloor(width: number, centerX: number, centerZ: number) {
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(width, 14),
    new THREE.MeshStandardMaterial({ color: 0x141019, roughness: 0.95, metalness: 0.02 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(centerX, 0, centerZ);
  floor.receiveShadow = true;
  scene.add(floor);
}

function addPedestal(x: number, z: number) {
  const disc = new THREE.Mesh(
    new THREE.CylinderGeometry(0.78, 0.85, 0.06, 24),
    new THREE.MeshStandardMaterial({ color: 0x1c1624, roughness: 0.8, metalness: 0.1 }),
  );
  disc.position.set(x, 0.03, z);
  disc.receiveShadow = true;
  scene.add(disc);
}

if (section === "grand") {
  const grandTowers: TowerDef[] = GRAND_FUSION_RECIPES.map((r) => getTowerDef(r.resultTowerId)).filter(
    (t): t is TowerDef => !!t,
  );
  columnCount = grandTowers.length;
  hud.innerHTML = `<b>Runeward Grand Fusion Gallery</b><br/>${grandTowers.length} Grand Fusion towers &middot; 3 tiers each &middot; tier 1 (far) &rarr; tier 3 (near)<br/>?section=capstones for the base-tower capstone abilities`;

  addFloor(columnCount * COL_SPACING + 6, (columnCount - 1) * COL_SPACING * 0.5, -ROW_SPACING);

  grandTowers.forEach((def, col) => {
    if (focus !== null && col !== focus) return; // isolate a single column in focus mode
    const x = col * COL_SPACING;
    for (const tierDef of def.tiers) {
      const tier = tierDef.tier;
      const z = -(3 - tier) * ROW_SPACING;
      const group = createTowerModel(def.modelId, tier);
      group.scale.setScalar(tierDef.modelScale);
      group.position.set(x, 0, z);
      scene.add(group);
      addPedestal(x, z);
      placed.push({
        towerId: def.id,
        towerName: def.name,
        tier,
        group,
        anchor: new THREE.Vector3(x, 2.3 * tierDef.modelScale + 0.35, z),
      });
    }
  });
} else {
  // capstones: every base tower at tier 3, labeled with its minTier:3 ability
  const capstoneTowers = listBaseTowers();
  columnCount = capstoneTowers.length;
  hud.innerHTML = `<b>Runeward Tier-3 Capstone Abilities</b><br/>${capstoneTowers.length} base towers at tier 3, each with its capstone (minTier: 3) ability labeled<br/>?section=grand for the Grand Fusion towers`;

  addFloor(columnCount * COL_SPACING + 6, (columnCount - 1) * COL_SPACING * 0.5, 0);

  capstoneTowers.forEach((def, col) => {
    const x = col * COL_SPACING;
    const tierDef = def.tiers[2]; // tier 3
    const group = createTowerModel(def.modelId, 3);
    group.scale.setScalar(tierDef.modelScale);
    group.position.set(x, 0, 0);
    scene.add(group);
    addPedestal(x, 0);

    const capstone = def.abilities.find((a) => a.minTier === 3);
    placed.push({
      towerId: def.id,
      towerName: def.name,
      tier: 3,
      group,
      anchor: new THREE.Vector3(x, 2.3 * tierDef.modelScale + 0.35, 0),
      abilityLine: capstone ? `${capstone.name} (${(capstone.cooldownMs / 1000).toFixed(1)}s CD)` : "(no capstone found)",
    });
  });
}

const labelEls = placed.map((p) => {
  const el = document.createElement("div");
  el.className = "label";
  el.innerHTML = `<div class="name">${p.towerName}</div><div class="tier">T${p.tier}</div>${
    p.abilityLine ? `<div class="ability">${p.abilityLine}</div>` : ""
  }`;
  app.appendChild(el);
  return el;
});

const aspect = window.innerWidth / window.innerHeight;
const camera = new THREE.PerspectiveCamera(46, aspect, 0.1, 200);

let centerX = (columnCount - 1) * COL_SPACING * 0.5;
let camZ = section === "grand" ? -ROW_SPACING : 0;
let camY = 8.4;
let camDist = 13.5;
if (focus !== null && focus >= 0 && focus < columnCount) {
  centerX = focus * COL_SPACING;
  camY = 4.6 * zoom;
  camDist = 8.5 * zoom;
}
const camTarget = new THREE.Vector3(centerX, 1.7, camZ);
camera.position.set(centerX, camY, camZ + camDist);
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
