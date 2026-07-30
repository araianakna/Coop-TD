// Standalone dev harness for the VFX/shader library — served directly by
// Vite as its own entry (src/dev/vfx-gallery.html). Not wired into the main
// game; safe to run alongside it (`npm run dev` then visit
// /src/dev/vfx-gallery.html).
import * as THREE from "three";
import { createRenderer } from "@/core/Renderer";
import { createCamera, RtsCameraController } from "@/core/Camera";
import { createLightingRig } from "@/core/Lighting";
import { ELEMENTS, type Element } from "@/game/types";
import { ELEMENT_PALETTES } from "@/game/vfx/palette";
import { createElementMaterial } from "@/game/vfx/shaders";
import { VfxManager } from "@/game/vfx/VfxManager";
import { impactVfxId, fusionVfxId } from "@/game/vfx/ids";

const hostEl = document.getElementById("app");
const panelEl = document.getElementById("panel");
if (!hostEl || !panelEl) throw new Error("gallery: missing #app or #panel");
const host: HTMLElement = hostEl;
const panel: HTMLElement = panelEl;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0910);
scene.fog = new THREE.FogExp2(0x0a0910, 0.012);

const camera = createCamera(window.innerWidth / window.innerHeight);
const cameraController = new RtsCameraController(camera, host);
cameraController.setTarget(new THREE.Vector3(0, 0.5, 1));

const rendererBundle = createRenderer(host, scene, camera);
createLightingRig(scene);

// Neutral dark ground so bloom response is representative of in-game framing.
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(60, 60),
  new THREE.MeshStandardMaterial({ color: 0x121018, roughness: 0.95, metalness: 0.0 }),
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const grid = new THREE.GridHelper(40, 40, 0x2a2440, 0x181422);
(grid.material as THREE.Material).transparent = true;
(grid.material as THREE.Material).opacity = 0.5;
scene.add(grid);

function makeLabelSprite(text: string): THREE.Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "rgba(0,0,0,0)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.font = "bold 34px sans-serif";
  ctx.fillStyle = "#e8e6f0";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = "rgba(0,0,0,0.9)";
  ctx.shadowBlur = 8;
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(1.6, 0.4, 1);
  return sprite;
}

const SPACING = 3;
function laneX(i: number): number {
  return (i - (ELEMENTS.length - 1) / 2) * SPACING;
}

// --- Pedestal row: shader materials as "tower spire" surfaces -------------
const pedestalMaterials: Partial<Record<Element, THREE.ShaderMaterial>> = {};
const PEDESTAL_Z = -5;

ELEMENTS.forEach((el, i) => {
  const x = laneX(i);
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(0.55, 0.65, 0.35, 10),
    new THREE.MeshStandardMaterial({ color: 0x1c1926, roughness: 0.7 }),
  );
  base.position.set(x, 0.175, PEDESTAL_Z);
  base.castShadow = true;
  base.receiveShadow = true;
  scene.add(base);

  const spireMat = createElementMaterial(el);
  pedestalMaterials[el] = spireMat;
  const spire = new THREE.Mesh(new THREE.ConeGeometry(0.6, 1.7, 24, 4), spireMat);
  spire.position.set(x, 0.35 + 0.85, PEDESTAL_Z);
  spire.castShadow = true;
  scene.add(spire);

  const label = makeLabelSprite(el.toUpperCase());
  label.position.set(x, 2.5, PEDESTAL_Z);
  scene.add(label);
});

// --- Marker row: impact + projectile-landing spots -------------------------
const MARKER_Z = 2.5;
const markerPositions: Record<Element, [number, number, number]> = {} as Record<
  Element,
  [number, number, number]
>;

ELEMENTS.forEach((el, i) => {
  const x = laneX(i);
  const pos: [number, number, number] = [x, 0.8, MARKER_Z];
  markerPositions[el] = pos;

  const ringGeo = new THREE.RingGeometry(0.5, 0.6, 24);
  ringGeo.rotateX(-Math.PI / 2);
  const ringMat = new THREE.MeshBasicMaterial({
    color: ELEMENT_PALETTES[el].core,
    transparent: true,
    opacity: 0.4,
    side: THREE.DoubleSide,
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.position.set(x, 0.02, MARKER_Z);
  scene.add(ring);

  const label = makeLabelSprite(el);
  label.position.set(x, 0.35, MARKER_Z + 0.9);
  label.scale.set(1.0, 0.25, 1);
  scene.add(label);
});

// --- Projectile source ("turret") ------------------------------------------
const projectileSource: [number, number, number] = [-(ELEMENTS.length * SPACING) / 2 - 3, 1.1, -1];
{
  const turretBase = new THREE.Mesh(
    new THREE.CylinderGeometry(0.4, 0.5, 0.5, 8),
    new THREE.MeshStandardMaterial({ color: 0x241f34, roughness: 0.6 }),
  );
  turretBase.position.set(projectileSource[0], 0.25, -1);
  scene.add(turretBase);
  const label = makeLabelSprite("SOURCE");
  label.position.set(projectileSource[0], 1.9, -1);
  scene.add(label);
}

// --- Fusion altar ------------------------------------------------------------
const altarPos: [number, number, number] = [0, 0.9, 7];
{
  const altar = new THREE.Mesh(
    new THREE.CylinderGeometry(1.1, 1.3, 0.5, 20),
    new THREE.MeshStandardMaterial({ color: 0x1a1626, roughness: 0.55, metalness: 0.1 }),
  );
  altar.position.set(altarPos[0], 0.25, altarPos[1]);
  altar.receiveShadow = true;
  scene.add(altar);
  const label = makeLabelSprite("FUSION ALTAR");
  label.position.set(altarPos[0], 2.2, altarPos[1]);
  scene.add(label);
}

// --- VFX plumbing ------------------------------------------------------------
const vfxManager = new VfxManager(scene);

function triggerImpact(el: Element) {
  vfxManager.emitVfx(impactVfxId(el), markerPositions[el]);
}

function triggerProjectile(el: Element) {
  const target = markerPositions[el];
  vfxManager.projectiles.spawn(el, projectileSource, target, {
    speed: 13,
    onArrive: (pos) => vfxManager.impacts.trigger(el, pos),
  });
}

const FUSION_PAIRS: [Element, Element][] = [
  ["fire", "ice"],
  ["lightning", "arcane"],
  ["nature", "earth"],
  ["fire", "lightning"],
  ["ice", "nature"],
  ["earth", "arcane"],
];

function triggerFusion(a: Element, b: Element) {
  vfxManager.emitVfx(fusionVfxId(a, b), altarPos);
}

// --- Control panel ------------------------------------------------------------
function makeRow(labelText: string): HTMLDivElement {
  const row = document.createElement("div");
  row.className = "row";
  const label = document.createElement("div");
  label.className = "label";
  label.textContent = labelText;
  row.appendChild(label);
  panel.appendChild(row);
  return row;
}

function makeButton(row: HTMLDivElement, text: string, cls: string, id: string, onClick: () => void) {
  const btn = document.createElement("button");
  btn.textContent = text;
  btn.className = cls;
  btn.id = id;
  btn.addEventListener("click", onClick);
  row.appendChild(btn);
  return btn;
}

type Trigger = { id: string; run: () => void };
const allTriggers: Trigger[] = [];

const impactRow = makeRow("Impact");
for (const el of ELEMENTS) {
  const id = `btn-impact-${el}`;
  makeButton(impactRow, el, el, id, () => triggerImpact(el));
  allTriggers.push({ id, run: () => triggerImpact(el) });
}

const projectileRow = makeRow("Projectile");
for (const el of ELEMENTS) {
  const id = `btn-projectile-${el}`;
  makeButton(projectileRow, el, el, id, () => triggerProjectile(el));
  allTriggers.push({ id, run: () => triggerProjectile(el) });
}

const fusionRow = makeRow("Fusion");
for (const [a, b] of FUSION_PAIRS) {
  const id = `btn-fusion-${a}-${b}`;
  makeButton(fusionRow, `${a} + ${b}`, "fusion", id, () => triggerFusion(a, b));
  allTriggers.push({ id, run: () => triggerFusion(a, b) });
}

const cycleRow = makeRow("Auto-cycle");
const cycleLabel = document.createElement("label");
cycleLabel.className = "toggle";
const cycleCheckbox = document.createElement("input");
cycleCheckbox.type = "checkbox";
cycleCheckbox.id = "auto-cycle-toggle";
cycleLabel.appendChild(cycleCheckbox);
cycleLabel.appendChild(document.createTextNode("cycle every 1.5s through all effects"));
cycleRow.appendChild(cycleLabel);

let cycleIndex = 0;
let cycleTimer: number | null = null;
cycleCheckbox.addEventListener("change", () => {
  if (cycleCheckbox.checked) {
    cycleTimer = window.setInterval(() => {
      allTriggers[cycleIndex % allTriggers.length].run();
      cycleIndex++;
    }, 1500);
  } else if (cycleTimer !== null) {
    window.clearInterval(cycleTimer);
    cycleTimer = null;
  }
});

// --- Resize + render loop ----------------------------------------------------
function onResize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  rendererBundle.resize(w, h);
}
window.addEventListener("resize", onResize);
onResize();

const clock = new THREE.Clock();
function loop() {
  const dt = Math.min(clock.getDelta(), 0.05);
  cameraController.update(dt);

  for (const el of ELEMENTS) {
    pedestalMaterials[el]?.userData.update?.(dt);
  }
  vfxManager.update(dt);

  rendererBundle.composer.render();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// Expose for manual poking from the browser console / Playwright scripts.
(window as unknown as { __vfxGallery: unknown }).__vfxGallery = {
  scene,
  vfxManager,
  triggerImpact,
  triggerProjectile,
  triggerFusion,
};
