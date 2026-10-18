import * as THREE from "three";
import type { Segment, SliceAxis, Triangle } from "../types.js";

// Plane-side classification tolerance.
const EPS = 1e-5;
// Vertex-welding tolerance. STL coordinates are float32 (~7 significant
// digits), so the "same" intersection point computed from two neighboring
// triangles can differ by ~1e-5 at 100 mm scale. The old 1e-6 was tighter
// than the data's precision, so duplicates never merged and polygon
// tracing silently fell apart.
const WELD = 1e-4;

export function intersectTrianglePlane(
  triangle: Triangle,
  position: number,
  axis: SliceAxis,
): Segment | null {
  const { a, b, c } = triangle;

  const pa = a[axis];
  const pb = b[axis];
  const pc = c[axis];

  const lo = Math.min(pa, pb, pc);
  const hi = Math.max(pa, pb, pc);
  if (position < lo - EPS || position > hi + EPS) return null;

  const da = pa - position;
  const db = pb - position;
  const dc = pc - position;

  // Triangle lies flat in the cut plane — contributes no segment.
  if (Math.abs(da) < EPS && Math.abs(db) < EPS && Math.abs(dc) < EPS) {
    return null;
  }

  const pts: THREE.Vector3[] = [];

  function add(p: THREE.Vector3): void {
    for (const q of pts) {
      if (q.distanceToSquared(p) < WELD * WELD) return;
    }
    pts.push(p);
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

    // Clamp the parameter: an unclamped lerp could extend the segment a
    // hair beyond the triangle when the plane grazes a vertex.
    const t = Math.min(1, Math.max(0, d0 / denom));

    const p = new THREE.Vector3().lerpVectors(p0, p1, t);
    p[axis] = position; // snap exactly onto the cut plane
    add(p);
  }

  edge(a, b, da, db);
  edge(b, c, db, dc);
  edge(c, a, dc, da);

  if (pts.length !== 2) return null;

  return { start: pts[0], end: pts[1] };
}
