import * as THREE from "three";
import "@/ui/ui.css";
import { createRenderer } from "@/core/Renderer";
import { createLightingRig } from "@/core/Lighting";
import { createSkybox } from "@/game/world/Skybox";
import { buildTerrain } from "@/game/world/Terrain";
import { createFoliage } from "@/game/world/Foliage";
import { createAtmosphereFx } from "@/game/world/AtmosphereFx";
import { buildMap02 } from "@/game/world/Map02";
import { createStartScreen } from "@/ui/StartScreen";

/**
 * Standalone QA harness for the Map02 art/layout pass, plus a preview of
 * the StartScreen component with mock data. Not part of the game build.
 * Mirrors src/dev/environment-gallery.ts's static-camera-framing approach.
 *
 * URL params:
 *   view — "map02" (default) or "start"
 *   cam  — camera preset index (default 0), only used in view=map02
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
  { yaw: -0.65, pitch: 0.52, distance: 30, label: "low establishing shot (sky/atmosphere)" },
  { yaw: 1.15, pitch: 1.22, distance: 46, label: "high angle, wide" },
  { yaw: 2.4, pitch: 0.85, distance: 26, label: "close on the switchback / rock clusters" },
];

const params = new URLSearchParams(window.location.search);
const view = params.get("view") === "start" ? "start" : "map02";

const app = document.getElementById("app")!;
const hud = document.createElement("div");
hud.id = "hud";
app.appendChild(hud);

if (view === "start") {
  // --- StartScreen preview -------------------------------------------
  hud.innerHTML = `<b>Runeward StartScreen Gallery</b><br/>view=start — mock 2-map select`;

  const stage = document.createElement("div");
  stage.style.position = "absolute";
  stage.style.inset = "0";
  stage.style.background =
    "radial-gradient(60% 60% at 50% 30%, #241a38, transparent), radial-gradient(50% 70% at 80% 100%, #1a2d30, transparent), #120a1f";
  app.appendChild(stage);

  const startScreen = createStartScreen({
    maps: [
      {
        id: "map01",
        name: "The Winding Vale",
        description: "A single sweeping S-curve through open turf. Straightforward — punishes weak choke coverage.",
      },
      {
        id: "map02",
        name: "The Shattered Switchback",
        description: "A long, maze-like route threading between rocky outcrops. Rewards spread-out defenses.",
      },
    ],
    onSelect: (mapId) => {
      hud.innerHTML = `<b>Runeward StartScreen Gallery</b><br/>view=start — selected: ${mapId}`;
    },
  });
  stage.appendChild(startScreen.el);
  startScreen.show();

  (window as unknown as { __envReady: boolean }).__envReady = true;
} else {
  // --- Map02 3D scene ---------------------------------------------------
  const camIndex = THREE.MathUtils.clamp(Number(params.get("cam") ?? "0"), 0, CAMERA_PRESETS.length - 1);

  const map = buildMap02();

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x120a1f);
  scene.add(createSkybox());
  createLightingRig(scene);

  const terrainBuild = buildTerrain(map.grid);
  scene.add(terrainBuild.mesh);
  scene.add(createFoliage(map.grid));
  scene.add(createAtmosphereFx(map.grid));

  // Same placeholder buildable ring markers Game.ts draws, so the gallery
  // reads like the real play scene rather than bare ground.
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
    const blockedCount = [...map.grid.allCells()].filter((c) => c.kind === "blocked").length;
    hud.innerHTML = `<b>Runeward Map02 Gallery</b><br/>cam=${index} — ${preset.label}<br/>18x14 Map02, ${map.waypoints.length} waypoints, ${blockedCount} blocked cells`;
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
  (window as unknown as { __scene: THREE.Scene }).__scene = scene;
  (window as unknown as { __camera: THREE.PerspectiveCamera }).__camera = camera;

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
}
