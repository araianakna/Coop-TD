// Shared GLSL noise helpers injected into tower core shaders. Cheap hash-based
// value noise + fbm — not as pretty as full simplex but far fewer ALU ops,
// which matters when dozens of towers are on screen (and 63 in the QA gallery).
export const NOISE_GLSL = /* glsl */ `
  float twHash(vec3 p) {
    p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }

  float twNoise3(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(
        mix(twHash(i + vec3(0.0, 0.0, 0.0)), twHash(i + vec3(1.0, 0.0, 0.0)), f.x),
        mix(twHash(i + vec3(0.0, 1.0, 0.0)), twHash(i + vec3(1.0, 1.0, 0.0)), f.x),
        f.y
      ),
      mix(
        mix(twHash(i + vec3(0.0, 0.0, 1.0)), twHash(i + vec3(1.0, 0.0, 1.0)), f.x),
        mix(twHash(i + vec3(0.0, 1.0, 1.0)), twHash(i + vec3(1.0, 1.0, 1.0)), f.x),
        f.y
      ),
      f.z
    );
  }

  float twFbm(vec3 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) {
      v += a * twNoise3(p);
      p *= 2.03;
      a *= 0.5;
    }
    return v;
  }
`;
