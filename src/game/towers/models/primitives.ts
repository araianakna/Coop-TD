import * as THREE from "three";
import { createNoise3D } from "simplex-noise";

const rockNoise = createNoise3D(() => 0.17);

/** Icosahedron displaced with noise for a chunky, hand-carved rock/crystal look. */
export function roughRock(
  radius: number,
  detail: 0 | 1 | 2 = 1,
  jaggedness = 0.28,
  seedOffset = 0,
): THREE.BufferGeometry {
  const geo = new THREE.IcosahedronGeometry(radius, detail);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n = rockNoise(v.x * 1.6 + seedOffset, v.y * 1.6, v.z * 1.6 + seedOffset);
    v.multiplyScalar(1 + n * jaggedness);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

/** Tall faceted crystal shard (a lathed bipyramid). */
export function crystalShard(radius: number, height: number, facets = 6): THREE.BufferGeometry {
  const points = [
    new THREE.Vector2(0.0001, 0),
    new THREE.Vector2(radius, height * 0.3),
    new THREE.Vector2(radius * 0.34, height),
  ];
  const geo = new THREE.LatheGeometry(points, facets);
  geo.computeVertexNormals();
  return geo;
}

/** Ring of small billboard-ish quad panels — used for arcane rune glyphs. */
export function glyphRing(radius: number, count: number, size: number, material: THREE.Material): THREE.Group {
  const group = new THREE.Group();
  const geo = new THREE.PlaneGeometry(size, size);
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    const mesh = new THREE.Mesh(geo, material);
    mesh.position.set(Math.cos(a) * radius, 0, Math.sin(a) * radius);
    mesh.lookAt(0, mesh.position.y, 0);
    group.add(mesh);
  }
  return group;
}

/** Spiraling vine/coil tube climbing a shaft. */
export function spiralTube(
  baseRadius: number,
  height: number,
  turns = 2.2,
  tubeRadius = 0.05,
  segments = 48,
): THREE.BufferGeometry {
  const pts: THREE.Vector3[] = [];
  const steps = 48;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const a = t * Math.PI * 2 * turns;
    const r = baseRadius * (1 - t * 0.12);
    pts.push(new THREE.Vector3(Math.cos(a) * r, t * height, Math.sin(a) * r));
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  return new THREE.TubeGeometry(curve, segments, tubeRadius, 6, false);
}

/** Cluster-friendly flame-lick cone: a cone bent/tapered into a teardrop flicker shape. */
export function flameLick(radius: number, height: number): THREE.BufferGeometry {
  const geo = new THREE.ConeGeometry(radius, height, 8, 5);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const t = THREE.MathUtils.clamp(v.y / (height * 0.5) * 0.5 + 0.5, 0, 1);
    v.x += Math.sin(t * Math.PI * 2.3) * radius * 0.4 * t;
    v.z += Math.cos(t * Math.PI * 1.6) * radius * 0.34 * t;
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

/** Simple tapered plinth cylinder used as the base of nearly every tower. */
export function plinth(radiusTop: number, radiusBottom: number, height: number, sides = 8): THREE.BufferGeometry {
  return new THREE.CylinderGeometry(radiusTop, radiusBottom, height, sides);
}

/**
 * Square-tapered obelisk (a 4-sided prism with flat glyph-friendly faces) —
 * deliberately angular/architectural, distinct from the round faceted
 * crystalShard() so arcane towers don't silhouette-collide with ice ones.
 */
export function obelisk(topRadius: number, bottomRadius: number, height: number): THREE.BufferGeometry {
  const geo = new THREE.CylinderGeometry(topRadius, bottomRadius, height, 4, 1);
  geo.rotateY(Math.PI / 4);
  geo.computeVertexNormals();
  return geo;
}
