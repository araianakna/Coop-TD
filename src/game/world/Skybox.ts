import * as THREE from "three";

const vertexShader = /* glsl */ `
  varying vec3 vWorldPosition;
  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

const fragmentShader = /* glsl */ `
  varying vec3 vWorldPosition;
  uniform vec3 topColor;
  uniform vec3 horizonColor;
  uniform vec3 bottomColor;
  uniform float offset;
  uniform float exponent;

  void main() {
    float h = normalize(vWorldPosition + vec3(0.0, offset, 0.0)).y;
    float t = clamp(h, 0.0, 1.0);
    vec3 skyMix = mix(horizonColor, topColor, pow(t, exponent));
    float b = clamp(-h, 0.0, 1.0);
    vec3 finalColor = mix(skyMix, bottomColor, pow(b, 0.5));
    gl_FragColor = vec4(finalColor, 1.0);
  }
`;

export function createSkybox(): THREE.Mesh {
  const geometry = new THREE.SphereGeometry(150, 32, 16);
  const material = new THREE.ShaderMaterial({
    uniforms: {
      topColor: { value: new THREE.Color(0x2a1a4a) },
      horizonColor: { value: new THREE.Color(0xff8a5c) },
      bottomColor: { value: new THREE.Color(0x120a1f) },
      offset: { value: 8 },
      exponent: { value: 0.7 },
    },
    vertexShader,
    fragmentShader,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = -1000;
  return mesh;
}
