import * as THREE from "three";

export interface LightingRig {
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  fill: THREE.DirectionalLight;
}

export function createLightingRig(scene: THREE.Scene): LightingRig {
  const hemi = new THREE.HemisphereLight(0x9fc9ff, 0x2a1f3d, 0.5);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xfff1d6, 1.6);
  sun.position.set(-22, 34, 18);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -40;
  sun.shadow.camera.right = 40;
  sun.shadow.camera.top = 40;
  sun.shadow.camera.bottom = -40;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 100;
  sun.shadow.bias = -0.0015;
  sun.shadow.normalBias = 0.02;
  scene.add(sun);
  scene.add(sun.target);

  const fill = new THREE.DirectionalLight(0x6f8fff, 0.35);
  fill.position.set(20, 12, -20);
  scene.add(fill);

  scene.fog = new THREE.FogExp2(0x1b1330, 0.018);

  return { sun, hemi, fill };
}
