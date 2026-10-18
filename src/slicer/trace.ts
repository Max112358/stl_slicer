import * as THREE from "three";
import type { Segment } from "../types.js";

// Welding tolerance for slice-plane vertices. Every triangle is cut
// independently, so the point shared by two neighbouring segments is
// computed twice in floating point and the two results can differ by
// ~1e-5 mm on a 100 mm model (STL coordinates are float32).
const SNAP = 1e-4;

export function tracePolygons(segments: Segment[]): THREE.Vector3[][] {
  const points: THREE.Vector3[] = [];
  const buckets = new Map<string, number[]>();
  const adj: number[][] = [];

  const bucketKey = (bx: number, by: number, bz: number) => `${bx},${by},${bz}`;

  function getIndex(p: THREE.Vector3): number {
    const bx = Math.round(p.x / SNAP);
    const by = Math.round(p.y / SNAP);
    const bz = Math.round(p.z / SNAP);

    // Check the 3x3x3 neighbourhood of grid cells so a point sitting on a
    // cell boundary still merges with its twin from the neighbouring
    // triangle. The old code hashed into a single cell and silently split
    // such points, which is what shattered the contours.
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          const cell = buckets.get(bucketKey(bx + dx, by + dy, bz + dz));
          if (!cell) continue;
          for (const i of cell) {
            if (points[i].distanceToSquared(p) < SNAP * SNAP) return i;
          }
        }
      }
    }

    const index = points.length;
    points.push(p.clone());
    adj.push([]);

    const key = bucketKey(bx, by, bz);
    const cell = buckets.get(key);
    if (cell) cell.push(index);
    else buckets.set(key, [index]);
    return index;
  }

  for (const seg of segments) {
    const i = getIndex(seg.start);
    const j = getIndex(seg.end);
    if (i === j) continue;
    // Duplicated segment (coincident triangles) — keep the graph simple.
    if (adj[i].includes(j)) continue;
    adj[i].push(j);
    adj[j].push(i);
  }

  const loops: THREE.Vector3[][] = [];

  function trace(start: number): THREE.Vector3[] | null {
    const loop: THREE.Vector3[] = [];
    let current = start;

    for (;;) {
      loop.push(points[current]);

      const next = adj[current].pop();
      if (next === undefined) break; // dead end on degenerate input

      const reverse = adj[next].indexOf(current);
      if (reverse !== -1) adj[next].splice(reverse, 1);

      current = next;
      if (current === start) break;
    }

    return loop.length >= 3 ? loop : null;
  }

  for (let start = 0; start < points.length; start++) {
    while (adj[start].length > 0) {
      const loop = trace(start);
      if (loop) loops.push(loop);
    }
  }

  return loops;
}
