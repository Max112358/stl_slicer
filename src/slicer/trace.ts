import * as THREE from "three";
import type { Segment, SliceAxis } from "../types.js";
import { projectPoint } from "./axis.js";

// Vertex welding tolerance, in slice-plane units (mm).
//
// Every triangle is cut independently, so the point shared by two
// neighbouring segments is computed twice in float math and the results
// can differ by ~1e-5 mm on a 100 mm model (STL coordinates are float32).
const SNAP = 1e-4;

export interface TraceResult {
  loops: THREE.Vector2[][];
  autoClosedGaps: number;
  droppedOpenChains: number;
}

function normalizeAngle(a: number): number {
  const twoPi = Math.PI * 2;
  return ((((a + Math.PI) % twoPi) + twoPi) % twoPi) - Math.PI;
}

export function tracePolygons(
  segments: Segment[],
  axis: SliceAxis,
  gapTolerance = 0,
): TraceResult {
  const points: THREE.Vector2[] = [];
  const buckets = new Map<string, number[]>();
  const adj: number[][] = [];

  const bucketKey = (bx: number, by: number) => `${bx},${by}`;

  function getIndex(p: THREE.Vector3): number {
    const q = projectPoint(p, axis);
    const bx = Math.round(q.x / SNAP);
    const by = Math.round(q.y / SNAP);

    // Search the 3x3 cell neighbourhood: a point sitting on a cell
    // boundary must still merge with its twin computed by the
    // neighbouring triangle.
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const cell = buckets.get(bucketKey(bx + dx, by + dy));
        if (!cell) continue;
        for (const i of cell) {
          if (points[i].distanceToSquared(q) < SNAP * SNAP) return i;
        }
      }
    }

    const index = points.length;
    points.push(q);

    const key = bucketKey(bx, by);
    const cell = buckets.get(key);
    if (cell) cell.push(index);
    else buckets.set(key, [index]);
    return index;
  }

  for (const seg of segments) {
    const i = getIndex(seg.start);
    const j = getIndex(seg.end);
    if (i === j) continue;
    if (adj[i].includes(j)) continue; // coincident duplicate
    adj[i].push(j);
    adj[j].push(i);
  }

  const used = new Set<string>();
  const edgeKey = (a: number, b: number) => (a < b ? `${a}:${b}` : `${b}:${a}`);

  function freeNeighbors(v: number): number[] {
    return adj[v].filter((n) => !used.has(edgeKey(v, n)));
  }

  const angle = (from: number, to: number) =>
    Math.atan2(points[to].y - points[from].y, points[to].x - points[from].x);

  // Walk one chain. At a branch vertex (non-manifold or self-touching
  // geometry) pick the edge that turns the most, so the walk stays on one
  // contour instead of jumping onto an unrelated one.
  function walk(start: number): { path: number[]; closed: boolean } {
    const path: number[] = [start];
    let current = start;
    let prev = -1;

    for (;;) {
      const candidates = freeNeighbors(current);
      if (candidates.length === 0) break;

      let next = candidates[0];
      if (candidates.length > 1 && prev !== -1) {
        const inAngle = angle(prev, current);
        let bestTurn = -Infinity;
        for (const cand of candidates) {
          const turn = normalizeAngle(angle(current, cand) - inAngle);
          if (turn > bestTurn) {
            bestTurn = turn;
            next = cand;
          }
        }
      }

      used.add(edgeKey(current, next));
      prev = current;
      current = next;

      if (current === start) return { path, closed: true };
      path.push(current);
    }

    return { path, closed: false };
  }

  const loops: THREE.Vector2[][] = [];
  let autoClosedGaps = 0;
  let droppedOpenChains = 0;

  for (let v = 0; v < points.length; v++) {
    while (freeNeighbors(v).length > 0) {
      const { path, closed } = walk(v);
      if (path.length < 3) continue;

      const loop = path.map((i) => points[i]);
      const first = points[path[0]];
      const last = points[path[path.length - 1]];
      const gap = first.distanceTo(last);

      if (closed) {
        loops.push(loop);
      } else if (gap <= gapTolerance) {
        // Crack in the mesh, small enough to stitch shut.
        loops.push(loop);
        autoClosedGaps++;
      } else {
        droppedOpenChains++;
      }
    }
  }

  return { loops, autoClosedGaps, droppedOpenChains };
}
