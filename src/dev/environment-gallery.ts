import * as THREE from "three";
import { createRenderer } from "@/core/Renderer";
import { createLightingRig } from "@/core/Lighting";
import { createSkybox } from "@/game/world/Skybox";
import { buildTerrain } from "@/game/world/Terrain";
import { createFoliage } from "@/game/world/Foliage";
import { createAtmosphereFx } from "@/game/world/AtmosphereFx";
import { buildMap01 } from "@/game/world/Map01";

/**
 * Standalone QA harness for the environment art pass: builds the full
 * Map01 scene (terrain + skybox + foliage + atmosphere) with a static
 * RTS-style camera, so it can be screenshotted from a few angles without
 * touching Game.ts. Not part of the game build.
 *
 * URL params:
 *   cam — camera preset index (default 0), see CAMERA_PRESETS below.
 */

interface CamPreset {
  yaw: number;
  pitch: number;
  distance: number;
  label: string;
}

// Mirrors the yaw/pitch/distance framing math from core/Camera.ts
// (RtsCameraController), read-only reference — not imported/modified.
const CAMERA_PRESETS: CamPreset[] = [
  { yaw: 0.12, pitch: 1.02, distance: 34, label: "default RTS framing" },
  { yaw: -0.65, pitch: 0.7, distance: 24, label: "low angle, close" },
  { yaw: 1.15, pitch: 1.22, distance: 46, label: "high angle, wide" },
];

const params = new URLSearchParams(window.location.search);
const camIndex = THREE.MathUtils.clamp(Number(params.get("cam") ?? "0"), 0, CAMERA_PRESETS.length - 1);

const app = document.getElementById("app")!;
const hud = document.createElement("div");
hud.id = "hud";
app.appendChild(hud);

const map = buildMap01();

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x120a1f);
scene.add(createSkybox());
createLightingRig(scene);

const terrainBuild = buildTerrain(map.grid);
scene.add(terrainBuild.mesh);
scene.add(createFoliage(map.grid));
scene.add(createAtmosphereFx(map.grid));

// Same placeholder tower spires + buildable ring markers Game.ts draws, so
// the gallery reads like the real play scene rather than bare ground.
const ringGeo = new THREE.RingGeometry(0.55, 0.7, 24);
ringGeo.rotateX(-Math.PI / 2);
const ringMat = new THREE.MeshBasicMaterial({
  color: 0xffd27a,
  transparent: true,
  opacity: 0.35,
  side: THREE.DoubleSide,
});
for (const cell of map.grid.allCells()) {
  if (cell.kind !== "buildable") continue;
  const [wx, wz] = map.grid.gridToWorld(cell);
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.position.set(wx, 0.06, wz);
  scene.add(ring);
}

function setCamera(index: number) {
  const preset = CAMERA_PRESETS[index];
  const target = new THREE.Vector3(0, 0, 0);
  const horizontalRadius = Math.cos(preset.pitch) * preset.distance;
  const height = Math.sin(preset.pitch) * preset.distance;
  const offset = new THREE.Vector3(
    Math.sin(preset.yaw) * horizontalRadius,
    height,
    Math.cos(preset.yaw) * horizontalRadius,
  );
  camera.position.copy(target).add(offset);
  camera.lookAt(target);
  hud.innerHTML = `<b>Runeward Environment Gallery</b><br/>cam=${index} — ${preset.label}<br/>18x14 Map01, ${map.waypoints.length} path cells`;
}

const aspect = window.innerWidth / window.innerHeight;
const camera = new THREE.PerspectiveCamera(42, aspect, 0.1, 200);
setCamera(camIndex);

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

// Exposed for the Playwright QA script to switch angles without a reload.
(window as unknown as { __setCam: (i: number) => void }).__setCam = setCamera;

const clock = new THREE.Clock();

function tickTree(obj: THREE.Object3D, dt: number, elapsed: number) {
  const tick = obj.userData.tick as ((dt: number, elapsed: number) => void) | undefined;
  if (tick) tick(dt, elapsed);
  for (const child of obj.children) tickTree(child, dt, elapsed);
}

function loop() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const elapsed = clock.getElapsedTime();
  tickTree(scene, dt, elapsed);
  rendererBundle.composer.render();
  (window as unknown as { __envReady: boolean }).__envReady = true;
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
