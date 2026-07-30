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
  //
  // Scaling/centering must be derived from the model's own bounding box,
  // not world origin: several builders (e.g. flying creatures) bake a
  // nonzero hover offset into their geometry, so naively scaling around
  // (0,0,0) blows that offset up right along with the model and launches
  // it off its pedestal.
  model.group.position.set(0, 0, 0);
  model.group.updateWorldMatrix(true, true);
  box.setFromObject(model.group);
  box.getSize(size);
  const rawHeight = Math.max(size.y, 0.0001);
  const targetHeight = def.isBoss ? BOSS_TARGET_HEIGHT : REGULAR_TARGET_HEIGHT;
  const normalizedScale = targetHeight / rawHeight;
  const centerX = (box.min.x + box.max.x) / 2;
  const centerZ = (box.min.z + box.max.z) / 2;

  const pivot = new THREE.Group();
  pivot.position.set(
    x - centerX * normalizedScale,
    0.16 - box.min.y * normalizedScale,
    z - centerZ * normalizedScale,
  );
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
    slotX: x,
    slotZ: z,
    anchor: new THREE.Vector3(x, targetHeight * 0.5 + 0.16, z),
    label,
    displayHeight: targetHeight,
  };
});

// Camera framing: fit the whole grid's real bounding box into view (accounts
// for both width and the fact that near-row objects sit much closer to the
// camera than far-row ones) instead of a hand-tuned guess that either
// zoomed in on one row or left everything a speck.
const overallBox = new THREE.Box3();
for (const e of entries) overallBox.expandByObject(e.pivot);
const boxSize = new THREE.Vector3();
const boxCenter = new THREE.Vector3();
overallBox.getSize(boxSize);
overallBox.getCenter(boxCenter);

function overview() {
  const vFov = THREE.MathUtils.degToRad(camera.fov);
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);
  // Depth (boxSize.z) also eats into vertical headroom because near-row
  // subjects sit much closer to the camera than far-row ones once we tilt
  // down — fold it into the vertical fit distance with a healthy margin.
  const distForHeight = (boxSize.y / 2 + boxSize.z * 0.5) / Math.tan(vFov / 2);
  const distForWidth = boxSize.x / 2 / Math.tan(hFov / 2);
  const dist = Math.max(distForHeight, distForWidth) * 1.25 + boxSize.z * 0.5;
  camera.position.set(boxCenter.x, boxCenter.y + boxSize.y * 0.55, boxCenter.z + dist);
  camera.lookAt(boxCenter.x, boxCenter.y * 0.5, boxCenter.z);
}
overview();

function focus(i: number) {
  const e = entries[i];
  if (!e) return;
  const h = e.displayHeight;
  const dist = h * 1.35 + 0.9;
  camera.position.set(e.slotX + dist * 0.55, e.anchor.y + h * 0.15, e.slotZ + dist * 0.85);
  camera.lookAt(e.slotX, e.anchor.y, e.slotZ);
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
