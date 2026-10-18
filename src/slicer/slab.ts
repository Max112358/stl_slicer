import * as THREE from "three";
import type {
  Segment,
  SliceAxis,
  SliceDiagnostics,
  Triangle,
} from "../types.js";
import { intersectTrianglePlane } from "./intersect.js";
import { tracePolygons } from "./trace.js";
import { buildShapes, signedArea2D } from "./shapes.js";
import { makeSliceMatrix } from "./axis.js";

// Slivers this small (mm^2) are numerical noise from clipping.
const AREA_EPS = 1e-12;

export interface SlabExtraction {
  geometry: THREE.BufferGeometry | null;
  diagnostics: SliceDiagnostics;
}

// Sutherland–Hodgman clip of a convex polygon against p[axis] >= value
// (keepAbove) or p[axis] <= value (!keepAbove).
function clipHalf(
  poly: THREE.Vector3[],
  axis: SliceAxis,
  value: number,
  keepAbove: boolean,
): THREE.Vector3[] {
  const out: THREE.Vector3[] = [];
  const inside = (p: THREE.Vector3) =>
    keepAbove ? p[axis] >= value : p[axis] <= value;

  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const aIn = inside(a);
    const bIn = inside(b);

    if (aIn) out.push(a.clone());
    if (aIn === bIn) continue;

    const t = (value - a[axis]) / (b[axis] - a[axis]);
    const p = new THREE.Vector3().lerpVectors(a, b, t);
    p[axis] = value; // snap exactly onto the boundary plane
    out.push(p);
  }
  return out;
}

function clipTriangleToSlab(
  tri: Triangle,
  axis: SliceAxis,
  lo: number,
  hi: number,
): THREE.Vector3[] | null {
  const min = Math.min(tri.a[axis], tri.b[axis], tri.c[axis]);
  const max = Math.max(tri.a[axis], tri.b[axis], tri.c[axis]);
  if (min > hi || max < lo) return null;

  let poly = clipHalf([tri.a, tri.b, tri.c], axis, lo, true);
  if (poly.length < 3) return null;

  poly = clipHalf(poly, axis, hi, false);
  return poly.length < 3 ? null : poly;
}

function pushFace(
  positions: number[],
  a: THREE.Vector3,
  b: THREE.Vector3,
  c: THREE.Vector3,
): void {
  const ab = new THREE.Vector3().subVectors(b, a);
  const ac = new THREE.Vector3().subVectors(c, a);
  const normal = new THREE.Vector3().crossVectors(ab, ac);
  if (normal.lengthSq() < AREA_EPS) return; // degenerate sliver

  positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
}

function orient(loop: THREE.Vector2[], ccw: boolean): THREE.Vector2[] {
  return signedArea2D(loop) > 0 === ccw ? loop : [...loop].reverse();
}

/**
 * The flat face where the slab cuts through the model: contours at `at`,
 * triangulated, positioned at that height with `facesUp` giving the
 * outward side.
 */
function pushCap(
  triangles: Triangle[],
  axis: SliceAxis,
  at: number,
  facesUp: boolean,
  gapTolerance: number,
  positions: number[],
): SliceDiagnostics {
  const segments = triangles
    .map((tri) => intersectTrianglePlane(tri, at, axis))
    .filter((seg): seg is Segment => seg !== null);

  const traced = tracePolygons(segments, axis, gapTolerance);
  const shapes = buildShapes(traced.loops);
  const matrix = makeSliceMatrix(axis, at);

  for (const { outer, holes } of shapes) {
    const contour = orient(outer, true);

    // triangulateShape indexes its faces into the point list
    // [contour, ...holes] flattened in order, so build that list of
    // POINTS (not loops):
    const flat: THREE.Vector2[] = contour.slice();
    for (const hole of holes) {
      for (const p of hole) flat.push(p);
    }

    // triangulateShape indexes into [contour, ...holes] flattened in order.
    const faces = THREE.ShapeUtils.triangulateShape(contour, holes);

    for (const face of faces) {
      const i = face[0];
      const j = face[1];
      const k = face[2];

      // Earcut's winding isn't guaranteed; orient each triangle so its
      // normal points out of the slab.
      const winding = signedArea2D([flat[i], flat[j], flat[k]]);
      const flip = winding < 0 === facesUp;

      const ja = flat[flip ? k : j];
      const ka = flat[flip ? j : k];

      const a = new THREE.Vector3(flat[i].x, flat[i].y, 0).applyMatrix4(matrix);
      const b = new THREE.Vector3(ja.x, ja.y, 0).applyMatrix4(matrix);
      const c = new THREE.Vector3(ka.x, ka.y, 0).applyMatrix4(matrix);

      pushFace(positions, a, b, c);
    }
  }

  return {
    contourCount: shapes.length,
    autoClosedGaps: traced.autoClosedGaps,
    droppedOpenChains: traced.droppedOpenChains,
  };
}

/**
 * Extract the exact volume of the model between `lo` and `hi`.
 *
 * Boundary of that volume = the model's own surface clipped to the slab
 * (which is why curves come out curved) + the two flat cut faces where the
 * slab snipped through. This is the exact limit of "add up infinitely thin
 * slices" — no subdivision factor, no stairsteps.
 */
export function extractSlab(
  triangles: Triangle[],
  axis: SliceAxis,
  lo: number,
  hi: number,
  gapTolerance: number,
): SlabExtraction {
  const positions: number[] = [];

  for (const tri of triangles) {
    const poly = clipTriangleToSlab(tri, axis, lo, hi);
    if (!poly) continue;

    // A triangle clipped by two half-planes is convex, so a fan is exact.
    for (let i = 1; i + 1 < poly.length; i++) {
      pushFace(positions, poly[0], poly[i], poly[i + 1]);
    }
  }

  const bottom = pushCap(triangles, axis, lo, false, gapTolerance, positions);
  const top = pushCap(triangles, axis, hi, true, gapTolerance, positions);

  const diagnostics: SliceDiagnostics = {
    contourCount: Math.max(bottom.contourCount, top.contourCount),
    autoClosedGaps: bottom.autoClosedGaps + top.autoClosedGaps,
    droppedOpenChains: bottom.droppedOpenChains + top.droppedOpenChains,
  };

  if (positions.length === 0) return { geometry: null, diagnostics };

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.computeVertexNormals();

  return { geometry, diagnostics };
}
