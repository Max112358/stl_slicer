import * as THREE from "three";
import type { Segment } from "../types.js";

const EPS = 1e-6;

export function tracePolygons(segments: Segment[]): THREE.Vector3[][] {
  const points: THREE.Vector3[] = [];
  const indexByKey = new Map<string, number>();

  const snap = (n: number) => Math.round(n / EPS) * EPS;

  function getIndex(p: THREE.Vector3): number {
    const key = `${snap(p.x)},${snap(p.y)},${snap(p.z)}`;
    const existing = indexByKey.get(key);
    if (existing !== undefined) return existing;

    const i = points.length;
    points.push(p.clone());
    indexByKey.set(key, i);
    return i;
  }

  const adj: number[][] = [];
  for (let i = 0; i < points.length; i++) adj.push([]);

  edges: for (const seg of segments) {
    const i = getIndex(seg.start);
    const j = getIndex(seg.end);
    if (i === j) continue;

    for (const n of adj[i]) {
      if (n === j) continue edges;
    }

    adj[i].push(j);
    adj[j].push(i);
  }

  const used = new Set<string>();
  const loops: THREE.Vector3[][] = [];
  const edgeKey = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`);

  function trace(start: number): THREE.Vector3[] | null {
    const loop: THREE.Vector3[] = [];
    let current = start;

    do {
      const nextIndex = adj[current].findIndex(
        (n) => !used.has(edgeKey(current, n)),
      );
      if (nextIndex === -1) return null;

      const next = adj[current][nextIndex];
      used.add(edgeKey(current, next));

      adj[current].splice(nextIndex, 1);
      const reverseIndex = adj[next].indexOf(current);
      if (reverseIndex !== -1) adj[next].splice(reverseIndex, 1);

      loop.push(points[current]);
      current = next;
    } while (current !== start);

    return loop;
  }

  for (let start = 0; start < points.length; start++) {
    while (adj[start].length > 0) {
      const loop = trace(start);
      if (loop && loop.length >= 3) {
        loops.push(loop);
      }
    }
  }

  return loops;
}
