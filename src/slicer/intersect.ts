import * as THREE from "three";
import type { Segment, Triangle } from "../types.js";

const EPS = 1e-6;

export function intersectTrianglePlane(
  triangle: Triangle,
  z: number,
): Segment | null {
  const { a, b, c } = triangle;

  const zMin = Math.min(a.z, b.z, c.z);
  const zMax = Math.max(a.z, b.z, c.z);

  if (z < zMin - EPS || z > zMax + EPS) return null;

  const da = a.z - z;
  const db = b.z - z;
  const dc = c.z - z;

  // Triangle lies flat in the plane — skip it.
  if (Math.abs(da) < EPS && Math.abs(db) < EPS && Math.abs(dc) < EPS) {
    return null;
  }

  const pts: THREE.Vector3[] = [];

  function add(p: THREE.Vector3): void {
    for (const q of pts) {
      if (q.distanceTo(p) < EPS) return;
    }
    pts.push(p.clone());
  }

  function edge(
    p0: THREE.Vector3,
    p1: THREE.Vector3,
    d0: number,
    d1: number,
  ): void {
    if (Math.abs(d0) < EPS && Math.abs(d1) < EPS) {
      add(p0);
      add(p1);
      return;
    }

    const denom = d0 - d1;
    if (Math.abs(denom) < EPS) return;

    const t = d0 / denom;
    if (t < -EPS || t > 1 + EPS) return;

    add(
      new THREE.Vector3(p0.x + (p1.x - p0.x) * t, p0.y + (p1.y - p0.y) * t, z),
    );
  }

  edge(a, b, da, db);
  edge(b, c, db, dc);
  edge(c, a, dc, da);

  if (pts.length !== 2) return null;

  return { start: pts[0], end: pts[1] };
}
