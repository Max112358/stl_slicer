import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { SliceAxis, SliceShape } from "../types.js";
import { makeSliceMatrix } from "./axis.js";

const DUP_EPS = 1e-6;

function signedArea2D(loop: THREE.Vector2[]): number {
  let area = 0;
  const n = loop.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += loop[i].x * loop[j].y - loop[j].x * loop[i].y;
  }
  return area * 0.5;
}

function cleanLoop(loop: THREE.Vector2[]): THREE.Vector2[] {
  const out: THREE.Vector2[] = [];
  for (const p of loop) {
    const prev = out[out.length - 1];
    if (prev && prev.distanceToSquared(p) < DUP_EPS * DUP_EPS) continue;
    out.push(p.clone());
  }
  if (
    out.length > 1 &&
    out[0].distanceToSquared(out[out.length - 1]) < DUP_EPS * DUP_EPS
  ) {
    out.pop();
  }
  return out;
}

// Classic even-odd ray cast (PNPOLY).
function pointInLoop(point: THREE.Vector2, loop: THREE.Vector2[]): boolean {
  let inside = false;
  const n = loop.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = loop[i].x;
    const yi = loop[i].y;
    const xj = loop[j].x;
    const yj = loop[j].y;
    if (
      yi > point.y !== yj > point.y &&
      point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi
    ) {
      inside = !inside;
    }
  }
  return inside;
}

function edgeMidpoint(loop: THREE.Vector2[]): THREE.Vector2 {
  const a = loop[0];
  const b = loop[1];
  return new THREE.Vector2((a.x + b.x) / 2, (a.y + b.y) / 2);
}

/**
 * Group traced contours into solids-with-holes.
 *
 * This deliberately does NOT use winding direction: tracing an unoriented
 * segment soup yields loops whose direction is essentially random, so the
 * "positive area = outer" test flipped from slice to slice and produced
 * exactly the garbled geometry you were seeing. Instead, count how deeply
 * each contour is nested in the others: even depth = solid island, odd
 * depth = hole. This also handles islands inside holes.
 */
export function buildShapes(loops: THREE.Vector2[][]): SliceShape[] {
  const contours = loops
    .map(cleanLoop)
    .filter((loop) => loop.length >= 3 && Math.abs(signedArea2D(loop)) > 1e-8);

  const count = contours.length;
  const probe = contours.map(edgeMidpoint);

  const depth = new Array<number>(count).fill(0);
  const parent = new Array<number>(count).fill(-1);

  for (let i = 0; i < count; i++) {
    let smallest = Infinity;
    for (let j = 0; j < count; j++) {
      if (i === j) continue;
      if (!pointInLoop(probe[i], contours[j])) continue;
      depth[i]++;
      const area = Math.abs(signedArea2D(contours[j]));
      if (area < smallest) {
        smallest = area;
        parent[i] = j;
      }
    }
  }

  const shapes: SliceShape[] = [];
  const shellByIndex = new Map<number, SliceShape>();

  for (let i = 0; i < count; i++) {
    if (depth[i] % 2 !== 0) continue;
    const shape: SliceShape = { outer: contours[i], holes: [] };
    shellByIndex.set(i, shape);
    shapes.push(shape);
  }

  for (let i = 0; i < count; i++) {
    if (depth[i] % 2 === 0) continue;

    // Climb to the nearest enclosing solid island.
    let shell = parent[i];
    const seen = new Set<number>();
    while (shell !== -1 && depth[shell] % 2 !== 0 && !seen.has(shell)) {
      seen.add(shell);
      shell = parent[shell];
    }

    shellByIndex.get(shell)?.holes.push(contours[i]);
  }

  return shapes;
}

function orient(
  loop: THREE.Vector2[],
  counterclockwise: boolean,
): THREE.Vector2[] {
  return signedArea2D(loop) > 0 === counterclockwise
    ? loop
    : [...loop].reverse();
}

export function createSliceGeometry(
  start: number,
  shapes: SliceShape[],
  thickness: number,
  axis: SliceAxis,
): THREE.BufferGeometry | null {
  const geometries: THREE.BufferGeometry[] = [];

  for (const { outer, holes } of shapes) {
    const contour = orient(cleanLoop(outer), true);
    if (contour.length < 3) continue;

    const shape = new THREE.Shape();
    shape.moveTo(contour[0].x, contour[0].y);
    for (let i = 1; i < contour.length; i++) {
      shape.lineTo(contour[i].x, contour[i].y);
    }
    shape.closePath();

    for (const hole of holes) {
      const points = orient(cleanLoop(hole), false);
      if (points.length < 3) continue;

      const path = new THREE.Path();
      path.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) {
        path.lineTo(points[i].x, points[i].y);
      }
      path.closePath();
      shape.holes.push(path);
    }

    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: thickness,
      bevelEnabled: false,
      steps: 1,
    });

    geometry.applyMatrix4(makeSliceMatrix(axis, start));
    geometries.push(geometry);
  }

  if (geometries.length === 0) return null;

  const merged = mergeGeometries(geometries);
  geometries.forEach((g) => g.dispose());
  return merged;
}
