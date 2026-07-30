// Standalone dev harness for AbilityVfx — served directly by Vite as its own
// entry (src/dev/ability-vfx-gallery.html). Not wired into the main game;
// safe to run alongside it (`npm run dev` then visit
// /src/dev/ability-vfx-gallery.html). Lays all 21 tower abilities out on a
// grid, one marker per ability, and drives them through the same
// VfxManager.emitVfx path Game.ts's triggerAbility -> emitAbilityVfx chain
// would use once wired up (see the report on Game.ts's current bypass).
import * as THREE from "three";
import { createRenderer } from "@/core/Renderer";
import { createCamera, RtsCameraController } from "@/core/Camera";
import { createLightingRig } from "@/core/Lighting";
import { VfxManager } from "@/game/vfx/VfxManager";

const hostEl = document.getElementById("app");
const panelEl = document.getElementById("panel");
if (!hostEl || !panelEl) throw new Error("gallery: missing #app or #panel");
const host: HTMLElement = hostEl;
const panel: HTMLElement = panelEl;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0910);
scene.fog = new THREE.FogExp2(0x0a0910, 0.01);

const camera = createCamera(window.innerWidth / window.innerHeight);
const cameraController = new RtsCameraController(camera, host);
cameraController.setTarget(new THREE.Vector3(0, 0.5, 0));

const rendererBundle = createRenderer(host, scene, camera);
createLightingRig(scene);

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(80, 40),
  new THREE.MeshStandardMaterial({ color: 0x121018, roughness: 0.95, metalness: 0.0 }),
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const grid = new THREE.GridHelper(80, 40, 0x2a2440, 0x181422);
(grid.material as THREE.Material).transparent = true;
(grid.material as THREE.Material).opacity = 0.4;
scene.add(grid);

function makeLabelSprite(text: string, color = "#e8e6f0"): THREE.Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = 320;
  canvas.height = 72;
  const ctx = canvas.getContext("2d")!;
  ctx.font = "bold 26px sans-serif";
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = "rgba(0,0,0,0.9)";
  ctx.shadowBlur = 8;
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(1.8, 0.4, 1);
  return sprite;
}

// ---------------------------------------------------------------------------
// The 21 abilities, laid out on a 7-column x 3-row grid.
// ---------------------------------------------------------------------------

interface AbilityEntry {
  vfxId: string;
  towerName: string;
  abilityName: string;
  statusKind: string;
  swatch: string; // hex for the button border / marker ring tint
}

const ABILITIES: AbilityEntry[] = [
  { vfxId: "vfx.fire.ability_ignite", towerName: "Ember Spire", abilityName: "Ignite", statusKind: "burn", swatch: "#ff8a2e" },
  { vfxId: "vfx.ice.ability_chill", towerName: "Frost Pillar", abilityName: "Deep Chill", statusKind: "chill", swatch: "#aef2ff" },
  { vfxId: "vfx.lightning.ability_overcharge", towerName: "Storm Conduit", abilityName: "Overcharge", statusKind: "shock", swatch: "#c9e2ff" },
  { vfxId: "vfx.nature.ability_toxin", towerName: "Thornroot Totem", abilityName: "Toxin Bloom", statusKind: "poison", swatch: "#8bff9a" },
  { vfxId: "vfx.earth.ability_sunder", towerName: "Stonewarden", abilityName: "Sunder", statusKind: "sunder", swatch: "#b87a3f" },
  { vfxId: "vfx.arcane.ability_silence", towerName: "Rune Obelisk", abilityName: "Silence", statusKind: "silence", swatch: "#d68bff" },
  { vfxId: "vfx.fire_ice.ability_scald", towerName: "Steamcaller", abilityName: "Scald", statusKind: "burn+chill", swatch: "#ffd9c2" },
  { vfxId: "vfx.fire_lightning.ability_discharge", towerName: "Plasma Arc", abilityName: "Discharge", statusKind: "shock+fire", swatch: "#ffcf8f" },
  { vfxId: "vfx.fire_nature.ability_spread", towerName: "Wildfire Warden", abilityName: "Spreading Blaze", statusKind: "burn(jump)", swatch: "#d6ff8a" },
  { vfxId: "vfx.fire_earth.ability_eruption", towerName: "Magma Forge", abilityName: "Eruption", statusKind: "burn+splash", swatch: "#ffb066" },
  { vfxId: "vfx.fire_arcane.ability_brand", towerName: "Hellfire Sigil", abilityName: "Hellbrand", statusKind: "burn+silence", swatch: "#ff9ad6" },
  { vfxId: "vfx.ice_lightning.ability_shatterbolt", towerName: "Frostshock Pylon", abilityName: "Shatterbolt", statusKind: "freeze->shock", swatch: "#cfe8ff" },
  { vfxId: "vfx.ice_nature.ability_bind", towerName: "Permafrost Grove", abilityName: "Rootfrost", statusKind: "root", swatch: "#bff2d0" },
  { vfxId: "vfx.ice_earth.ability_avalanche", towerName: "Glacier Bastion", abilityName: "Avalanche", statusKind: "sunder+ice", swatch: "#c9d8ff" },
  { vfxId: "vfx.ice_arcane.ability_bind", towerName: "Frostweave Loom", abilityName: "Rune-Frost Bind", statusKind: "freeze+silence", swatch: "#d8e0ff" },
  { vfxId: "vfx.lightning_nature.ability_lash", towerName: "Thornstorm Totem", abilityName: "Static Lash", statusKind: "root+shock", swatch: "#c9ffb0" },
  { vfxId: "vfx.lightning_earth.ability_quake", towerName: "Seismic Coil", abilityName: "Chain Quake", statusKind: "sunder+lightning", swatch: "#e0c98f" },
  { vfxId: "vfx.lightning_arcane.ability_surge", towerName: "Arcflux Spire", abilityName: "Surge", statusKind: "shock+silence", swatch: "#cfc2ff" },
  { vfxId: "vfx.nature_earth.ability_smother", towerName: "Overgrowth Colossus", abilityName: "Smother", statusKind: "root+poison", swatch: "#a8d68a" },
  { vfxId: "vfx.nature_arcane.ability_wither", towerName: "Druidic Sanctum", abilityName: "Wither", statusKind: "poison+silence", swatch: "#b8a0d0" },
  { vfxId: "vfx.earth_arcane.ability_brand", towerName: "Runeforge Monolith", abilityName: "Forge Brand", statusKind: "sunder+silence", swatch: "#c9a8d8" },
];

const COLS = 7;
const SPACING_X = 4.2;
const SPACING_Z = 4.6;

interface Marker {
  entry: AbilityEntry;
  pos: THREE.Vector3;
}

const markers: Marker[] = ABILITIES.map((entry, i) => {
  const col = i % COLS;
  const row = Math.floor(i / COLS);
  const x = (col - (COLS - 1) / 2) * SPACING_X;
  const z = row * SPACING_Z - SPACING_Z;
  const pos = new THREE.Vector3(x, 0.6, z);

  // Deliberately NOT tinted by the ability's swatch color — this is a static
  // level-decoration marker, not part of the VFX. Using a neutral grey (not
  // any ability's actual palette color) keeps it visually unambiguous from
  // the triggered effect during QA screenshotting.
  const ringGeo = new THREE.RingGeometry(0.42, 0.5, 24);
  ringGeo.rotateX(-Math.PI / 2);
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0x3a3a42,
    transparent: true,
    opacity: 0.5,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.position.set(x, 0.02, z);
  scene.add(ring);

  const pedestal = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22, 0.28, 0.55, 8),
    new THREE.MeshStandardMaterial({ color: 0x1c1926, roughness: 0.7 }),
  );
  pedestal.position.set(x, 0.275, z);
  pedestal.castShadow = true;
  pedestal.receiveShadow = true;
  scene.add(pedestal);

  const label = makeLabelSprite(`${entry.abilityName}`, "#f4eaff");
  label.position.set(x, 1.55, z);
  label.scale.set(2.0, 0.42, 1);
  scene.add(label);

  const subLabel = makeLabelSprite(`${entry.towerName} · ${entry.statusKind}`, "#8b8698");
  subLabel.position.set(x, 1.18, z);
  subLabel.scale.set(2.0, 0.3, 1);
  scene.add(subLabel);

  return { entry, pos };
});

// --- VFX plumbing ------------------------------------------------------------
const vfxManager = new VfxManager(scene);

function triggerAbility(vfxId: string) {
  const marker = markers.find((m) => m.entry.vfxId === vfxId);
  const pos = marker ? marker.pos : [0, 0.6, 0];
  vfxManager.emitVfx(vfxId, [pos instanceof THREE.Vector3 ? pos.x : pos[0], pos instanceof THREE.Vector3 ? pos.y : pos[1], pos instanceof THREE.Vector3 ? pos.z : pos[2]]);
}

/** Snaps the orbit camera to look at `pos` from `dist` units away — bypasses
 * the controller's smoothing since this is QA tooling, not gameplay. */
function focusOn(pos: THREE.Vector3, dist = 5.5) {
  cameraController.setTarget(pos.clone());
  (cameraController as unknown as { distance: number }).distance = dist;
}

// --- Control panel ------------------------------------------------------------
function makeRow(): HTMLDivElement {
  const row = document.createElement("div");
  row.className = "row";
  panel.appendChild(row);
  return row;
}

const buttonRow = makeRow();
for (const marker of markers) {
  const btn = document.createElement("button");
  btn.textContent = marker.entry.abilityName;
  btn.style.borderColor = marker.entry.swatch;
  btn.id = `btn-${marker.entry.vfxId.replace(/[^a-z0-9]/gi, "-")}`;
  btn.addEventListener("click", () => {
    focusOn(marker.pos);
    triggerAbility(marker.entry.vfxId);
  });
  buttonRow.appendChild(btn);
}

const cycleRow = makeRow();
const cycleLabel = document.createElement("label");
cycleLabel.className = "toggle";
const cycleCheckbox = document.createElement("input");
cycleCheckbox.type = "checkbox";
cycleCheckbox.id = "auto-cycle-toggle";
cycleLabel.appendChild(cycleCheckbox);
cycleLabel.appendChild(document.createTextNode("cycle every 2s through all 21 abilities"));
cycleRow.appendChild(cycleLabel);

let cycleIndex = 0;
let cycleTimer: number | null = null;
cycleCheckbox.addEventListener("change", () => {
  if (cycleCheckbox.checked) {
    cycleTimer = window.setInterval(() => {
      const marker = markers[cycleIndex % markers.length];
      focusOn(marker.pos);
      triggerAbility(marker.entry.vfxId);
      cycleIndex++;
    }, 2000);
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

// Wide overview to start.
focusOn(new THREE.Vector3(0, 0.6, (Math.ceil(ABILITIES.length / COLS) - 1) * SPACING_Z * 0.5 - SPACING_Z * 0.5), 26);

const clock = new THREE.Clock();
function loop() {
  // NOTE: capped higher than the main game loop's 0.05s clamp (see
  // game/Game.ts) because this standalone harness sometimes runs under
  // slow software-rendered headless browsers for QA screenshots, where
  // real frame intervals can exceed 50ms; a tight clamp there would make
  // simulated time drift far behind wall-clock time during QA capture.
  const dt = Math.min(clock.getDelta(), 0.2);
  cameraController.update(dt);
  vfxManager.update(dt);
  rendererBundle.composer.render();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// Expose for manual poking from the browser console / Playwright scripts.
(window as unknown as { __abilityGallery: unknown }).__abilityGallery = {
  scene,
  camera,
  cameraController,
  vfxManager,
  markers: markers.map((m) => ({ vfxId: m.entry.vfxId, abilityName: m.entry.abilityName, pos: [m.pos.x, m.pos.y, m.pos.z] })),
  triggerAbility,
  focusOn: (vfxId: string, dist = 5.5) => {
    const marker = markers.find((m) => m.entry.vfxId === vfxId);
    if (marker) focusOn(marker.pos, dist);
  },
};
