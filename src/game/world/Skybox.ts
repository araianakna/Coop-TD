import * as THREE from "three";
import { GLSL_NOISE } from "@/game/world/shaderNoise";

/**
 * Dusk sky dome with a drifting procedural cloud layer, plus a distant
 * jagged mountain silhouette ring near the horizon for depth. Returned as a
 * Group (Object3D-compatible, same as the previous Mesh return) so
 * `scene.add(createSkybox())` in Game.ts keeps working untouched.
 */

const skyVertexShader = /* glsl */ `
  varying vec3 vWorldPosition;
  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

const skyFragmentShader = /* glsl */ `
  varying vec3 vWorldPosition;
  uniform vec3 topColor;
  uniform vec3 horizonColor;
  uniform vec3 bottomColor;
  uniform vec3 cloudColor;
  uniform float offset;
  uniform float exponent;
  uniform float uTime;
  ${GLSL_NOISE}

  void main() {
    vec3 dir = normalize(vWorldPosition);
    float h = normalize(vWorldPosition + vec3(0.0, offset, 0.0)).y;
    float t = clamp(h, 0.0, 1.0);
    vec3 skyMix = mix(horizonColor, topColor, pow(t, exponent));
    float b = clamp(-h, 0.0, 1.0);
    vec3 finalColor = mix(skyMix, bottomColor, pow(b, 0.5));

    // Drifting cloud layer: azimuth/elevation (spherical) projection so the
    // noise field reads as clouds sliding across the dome at a predictable
    // scale regardless of view angle, confined to a band above the horizon.
    float azimuth = atan(dir.z, dir.x);
    vec2 cloudUv = vec2(azimuth * 1.6, h * 2.6) + vec2(uTime * 0.02, uTime * 0.004);
    float clouds = rwFbm(cloudUv * 1.6, 5);
    clouds = smoothstep(-0.05, 0.4, clouds);
    float cloudMask = smoothstep(-0.35, 0.05, h) * smoothstep(1.0, 0.4, h);
    finalColor = mix(finalColor, cloudColor, clouds * cloudMask * 0.7);

    gl_FragColor = vec4(finalColor, 1.0);
  }
`;

function mulberry32(seed: number) {
  let s = seed;
  return function next() {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildMountainRing(radius: number, segments: number, seed: number): THREE.BufferGeometry {
  const rand = mulberry32(seed);
  const heights: number[] = [];
  for (let i = 0; i <= segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    const n =
      Math.sin(angle * 3.1 + seed) * 0.5 +
      Math.sin(angle * 7.7 + seed * 2.0) * 0.3 +
      Math.sin(angle * 13.3 - seed) * 0.2;
    const jag = (rand() - 0.5) * 2;
    heights.push(Math.max(2, 6 + n * 4 + jag * 2));
  }

  const positions: number[] = [];
  const yBase = -8;
  for (let i = 0; i < segments; i++) {
    const a0 = (i / segments) * Math.PI * 2;
    const a1 = ((i + 1) / segments) * Math.PI * 2;
    const x0 = Math.cos(a0) * radius;
    const z0 = Math.sin(a0) * radius;
    const x1 = Math.cos(a1) * radius;
    const z1 = Math.sin(a1) * radius;
    const h0 = heights[i];
    const h1 = heights[i + 1];
    // two triangles forming the jagged skirt segment
    positions.push(x0, yBase, z0, x1, yBase, z1, x0, h0, z0);
    positions.push(x0, h0, z0, x1, yBase, z1, x1, h1, z1);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.computeVertexNormals();
  return geo;
}

export function createSkybox(): THREE.Group {
  const group = new THREE.Group();

  const sphereGeometry = new THREE.SphereGeometry(150, 32, 16);
  const skyMaterial = new THREE.ShaderMaterial({
    uniforms: {
      topColor: { value: new THREE.Color(0x2a1a4a) },
      horizonColor: { value: new THREE.Color(0xff8a5c) },
      bottomColor: { value: new THREE.Color(0x120a1f) },
      cloudColor: { value: new THREE.Color(0xffd9c2) },
      offset: { value: 8 },
      exponent: { value: 0.7 },
      uTime: { value: 0 },
    },
    vertexShader: skyVertexShader,
    fragmentShader: skyFragmentShader,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const skySphere = new THREE.Mesh(sphereGeometry, skyMaterial);
  skySphere.renderOrder = -1000;
  group.add(skySphere);

  // Distant mountain silhouettes near the horizon, tinted by scene fog for depth.
  // Kept fairly close (just beyond the terrain's padded skirt) and tall so
  // they still poke into frame under this game's steep top-down camera tilt.
  const mountainGeo = buildMountainRing(44, 96, 77);
  const mountainMat = new THREE.MeshBasicMaterial({
    color: 0x2e2050,
    side: THREE.DoubleSide,
    fog: true,
  });
  const mountains = new THREE.Mesh(mountainGeo, mountainMat);
  mountains.renderOrder = -999;
  group.add(mountains);

  // Second, closer/lower ridge layer for parallax depth, slightly different hue.
  const mountainGeo2 = buildMountainRing(39, 80, 133);
  const mountainMat2 = new THREE.MeshBasicMaterial({
    color: 0x452f66,
    side: THREE.DoubleSide,
    fog: true,
    transparent: true,
    opacity: 0.9,
  });
  const mountains2 = new THREE.Mesh(mountainGeo2, mountainMat2);
  mountains2.renderOrder = -998;
  group.add(mountains2);

  group.userData.tick = (_dt: number, elapsed: number) => {
    skyMaterial.uniforms.uTime.value = elapsed;
  };

  return group;
}
