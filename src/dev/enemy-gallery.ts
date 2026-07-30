// Standalone dev harness: renders every enemy model side-by-side on neutral
// pedestals, idle-animated, using the real lighting rig + postprocessing
// pipeline. Not wired into the game — pure self-QA tool.
//   npm run dev, then open /src/dev/enemy-gallery.html
//
// QA hooks exposed on window.__gallery:
//   focus(i)   — snap the camera to a tight hero shot of entries[i]
//   overview() — restore the wide grid framing

import * as THREE from "three";
import { createRenderer } from "@/core/Renderer";
import { createLightingRig } from "@/core/Lighting";
import { ENEMY_REGISTRY } from "@/game/enemies/EnemyRegistry";
import { createEnemyModel } from "@/game/enemies/models";

const app = document.getElementById("app")!;
const labelsHost = document.getElementById("labels")!;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0c0910);

const camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.1, 300);

createLightingRig(scene);

const { renderer, composer, resize } = createRenderer(app, scene, camera);

function onResize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  resize(w, h);
}
window.addEventListener("resize", onResize);
onResize();

// Ground plane (neutral dark backdrop, receives shadows).
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(100, 60),
  new THREE.MeshStandardMaterial({ color: 0x14101c, roughness: 0.95, metalness: 0.02 }),
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const REGULAR_TARGET_HEIGHT = 1.7; // world units every non-boss silhouette is normalized to
const BOSS_TARGET_HEIGHT = 3.6; // bosses read taller/heavier even after normalization

const COLS = 5;
const SPACING_X = 2.8;
const SPACING_Z = 2.8;

const box = new THREE.Box3();
const size = new THREE.Vector3();

const entries = ENEMY_REGISTRY.map((def, i) => {
  const col = i % COLS;
  const row = Math.floor(i / COLS);
  const x = (col - (COLS - 1) / 2) * SPACING_X;
  const z = row * SPACING_Z - 1.2;

  const pedestal = new THREE.Mesh(
    new THREE.CylinderGeometry(0.85, 0.95, 0.16, 24),
    new THREE.MeshStandardMaterial({ color: 0x241d30, roughness: 0.8, metalness: 0.1 }),
  );
  pedestal.position.set(x, 0.08, z);
  pedestal.receiveShadow = true;
  scene.add(pedestal);

  const model = createEnemyModel(def.modelId);
  scene.add(model.group);

  // Normalize apparent size so every card reads at a comparable scale
  // regardless of the creature's true in-game world-unit size — bosses are
  // deliberately normalized to a taller target so they still read as
  // bigger-budget/more-threatening next to regulars.
  model.group.position.set(0, 0, 0);
  model.group.updateWorldMatrix(true, true);
  box.setFromObject(model.group);
  box.getSize(size);
  const rawHeight = Math.max(size.y, 0.0001);
  const targetHeight = def.isBoss ? BOSS_TARGET_HEIGHT : REGULAR_TARGET_HEIGHT;
  const normalizedScale = targetHeight / rawHeight;

  const pivot = new THREE.Group();
  pivot.position.set(x, 0.16, z);
  pivot.scale.setScalar(normalizedScale);
  pivot.add(model.group);
  scene.add(pivot);

  const label = document.createElement("div");
  label.className = "label";
  label.textContent = `${def.name}${def.isBoss ? " (BOSS)" : ""}`;
  labelsHost.appendChild(label);

  return {
    def,
    model,
    pivot,
    anchor: new THREE.Vector3(x, targetHeight * 0.5 + 0.16, z),
    label,
    displayHeight: targetHeight,
  };
});

// Camera framing: closer, lower-pitch "trading card" angle so silhouettes
// and material detail actually read, instead of a steep zoomed-out top-down
// view where every creature is a handful of pixels.
const rows = Math.ceil(ENEMY_REGISTRY.length / COLS);
const gridWidth = COLS * SPACING_X;
const gridDepth = rows * SPACING_Z;
const overviewPos = new THREE.Vector3(0, gridDepth * 0.62 + 1.6, gridDepth * 0.95 + gridWidth * 0.18);
const overviewTarget = new THREE.Vector3(0, 0.9, gridDepth * 0.32 - 1.2);

function overview() {
  camera.position.copy(overviewPos);
  camera.lookAt(overviewTarget);
}
overview();

function focus(i: number) {
  const e = entries[i];
  if (!e) return;
  const h = e.displayHeight;
  const dist = h * 1.35 + 0.9;
  camera.position.set(e.pivot.position.x + dist * 0.55, e.anchor.y + h * 0.15, e.pivot.position.z + dist * 0.85);
  camera.lookAt(e.pivot.position.x, e.anchor.y, e.pivot.position.z);
}

const clock = new THREE.Clock();

function projectLabel(v: THREE.Vector3, out: THREE.Vector3) {
  out.copy(v).project(camera);
}

const tmp = new THREE.Vector3();
let labelsVisible = true;

function tick() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const elapsed = clock.elapsedTime;

  for (const e of entries) {
    e.model.update(dt, elapsed);
    if (labelsVisible) {
      projectLabel(e.anchor, tmp);
      const sx = (tmp.x * 0.5 + 0.5) * window.innerWidth;
      const sy = (-tmp.y * 0.5 + 0.5) * window.innerHeight;
      e.label.style.left = `${sx}px`;
      e.label.style.top = `${sy}px`;
      e.label.style.display = tmp.z < 1 ? "block" : "none";
    } else {
      e.label.style.display = "none";
    }
  }

  composer.render();
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

function setLabelsVisible(v: boolean) {
  labelsVisible = v;
}

// QA hooks for the headless screenshot script.
(window as unknown as { __gallery: unknown }).__gallery = {
  scene,
  camera,
  entries,
  renderer,
  focus,
  overview,
  setLabelsVisible,
};
