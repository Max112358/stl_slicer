import * as THREE from "three";
import type { Segment, SliceAxis, Triangle } from "../types.js";

// Plane-side classification tolerance.
const EPS = 1e-5;

// Vertex-welding tolerance. STL coordinates are float32 (~7 significant
// digits), so the "same" intersection point computed from two neighboring
// triangles can differ by ~1e-5 at 100 mm scale.
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
    // Whole edge lying in the cut plane: its two endpoints are the
    // intersection.
    if (Math.abs(d0) < EPS && Math.abs(d1) < EPS) {
      add(p0);
      add(p1);
      return;
    }

    // A single endpoint on the plane contributes that endpoint.
    if (Math.abs(d0) < EPS) {
      add(p0);
      return;
    }
    if (Math.abs(d1) < EPS) {
      add(p1);
      return;
    }

    // Both endpoints strictly on the same side: no crossing here. This is
    // the test that must NOT be replaced by clamping t to [0,1] — clamping
    // fabricates a point on the vertex and the triangle's real segment
    // gets thrown away because it collects 3 points instead of 2.
    if (d0 * d1 > 0) return;

    // Strictly opposite signs, so t is genuinely inside (0, 1).
    const t = d0 / (d0 - d1);
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
