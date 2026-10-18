import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import * as THREE from "three";
import type { SliceAxis, SliceShape } from "../types.js";
import { makeSliceMatrix } from "./axis.js";

const EPS = 1e-6;

function signedArea2D(loop: THREE.Vector2[]): number {
  let area = 0;
  const n = loop.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += loop[i].x * loop[j].y - loop[j].x * loop[i].y;
  }
  return area * 0.5;
}

function pointInLoop(point: THREE.Vector2, loop: THREE.Vector2[]): boolean {
  let inside = false;
  const n = loop.length;

  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = loop[i].x;
    const yi = loop[i].y;
    const xj = loop[j].x;
    const yj = loop[j].y;

    // Plain even-odd ray cast. The old version added EPS to the
    // denominator, which flips the result on downward edges.
    if (
      yi > point.y !== yj > point.y &&
      point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi
    ) {
      inside = !inside;
    }
  }

  return inside;
}

// Remove consecutive duplicates and a closing point that repeats the
// first — earcut produces exactly the "solid rectangle" garbage you saw
// when fed self-intersecting or duplicated contours.
function cleanLoop(loop: THREE.Vector2[]): THREE.Vector2[] {
  const out: THREE.Vector2[] = [];
  for (const p of loop) {
    const prev = out[out.length - 1];
    if (prev && prev.distanceToSquared(p) < EPS) continue;
    out.push(p);
  }
  if (out.length > 1 && out[0].distanceToSquared(out[out.length - 1]) < EPS) {
    out.pop();
  }
  return out;
}

export function buildShapes(loops: THREE.Vector2[][]): SliceShape[] {
  const validLoops = loops
    .map((loop) => ({ loop: cleanLoop(loop), area: signedArea2D(loop) }))
    .filter(({ area }) => Math.abs(area) > 1e-8)
    .filter(({ loop }) => loop.length >= 3);

  const outers = validLoops
    .filter(({ area }) => area > 0)
    .sort((a, b) => a.area - b.area); // smallest first: holes bind to nearest outer

  const holes = validLoops.filter(({ area }) => area < 0);
  const consumedHoles = new Set<number>();

  return outers.map(({ loop: outer }) => {
    const shapeHoles: THREE.Vector2[][] = [];
    holes.forEach(({ loop: hole }, index) => {
      if (consumedHoles.has(index)) return;
      if (pointInLoop(hole[0], outer)) {
        shapeHoles.push(hole);
        consumedHoles.add(index);
      }
    });
    return { outer, holes: shapeHoles };
  });
}

export function createSliceGeometry(
  start: number,
  shapes: SliceShape[],
  thickness: number,
  axis: SliceAxis,
): THREE.BufferGeometry | null {
  const geometries: THREE.BufferGeometry[] = [];

  for (const { outer, holes } of shapes) {
    const contour = cleanLoop(
      signedArea2D(outer) < 0 ? [...outer].reverse() : outer,
    );
    if (contour.length < 3) continue;

    const shape = new THREE.Shape();
    shape.moveTo(contour[0].x, contour[0].y);
    for (let i = 1; i < contour.length; i++) {
      shape.lineTo(contour[i].x, contour[i].y);
    }
    shape.closePath();

    for (const hole of holes) {
      const holePts = cleanLoop(
        signedArea2D(hole) > 0 ? [...hole].reverse() : hole,
      );
      if (holePts.length < 3) continue;

      const path = new THREE.Path();
      path.moveTo(holePts[0].x, holePts[0].y);
      for (let i = 1; i < holePts.length; i++) {
        path.lineTo(holePts[i].x, holePts[i].y);
      }
      path.closePath();
      shape.holes.push(path);
    }

    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: thickness,
      bevelEnabled: false,
      steps: 1,
      curveSegments: 4,
    });

    // Map shape space into world space for this axis and offset to the
    // slab start. The old hard-coded translate(0, 0, startZ) only worked
    // for Z-up models sliced along Z.
    geometry.applyMatrix4(makeSliceMatrix(axis, start));
    geometries.push(geometry);
  }

  if (geometries.length === 0) return null;

  const merged = mergeGeometries(geometries);
  geometries.forEach((g) => g.dispose());
  return merged;
}
