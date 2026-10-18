import * as THREE from "three";
import type { SliceAxis } from "../types.js";

// Right-handed 2D frame per slice axis: (u, v) span the cut plane, w runs
// along the slice axis. det == +1, so rotated normals stay outward-facing.
const BASIS: Record<
  SliceAxis,
  { u: THREE.Vector3; v: THREE.Vector3; w: THREE.Vector3 }
> = {
  x: {
    u: new THREE.Vector3(0, 1, 0),
    v: new THREE.Vector3(0, 0, 1),
    w: new THREE.Vector3(1, 0, 0),
  },
  y: {
    u: new THREE.Vector3(1, 0, 0),
    v: new THREE.Vector3(0, 0, -1),
    w: new THREE.Vector3(0, 1, 0),
  },
  z: {
    u: new THREE.Vector3(1, 0, 0),
    v: new THREE.Vector3(0, 1, 0),
    w: new THREE.Vector3(0, 0, 1),
  },
};

export function projectPoint(p: THREE.Vector3, axis: SliceAxis): THREE.Vector2 {
  const { u, v } = BASIS[axis];
  return new THREE.Vector2(p.dot(u), p.dot(v));
}

// Maps ExtrudeGeometry's shape space (x=u, y=v, z=w) into world space and
// offsets it to `start` along the slice axis. applyMatrix4 also rotates
// the normals correctly.
export function makeSliceMatrix(axis: SliceAxis, start: number): THREE.Matrix4 {
  const { u, v, w } = BASIS[axis];
  const m = new THREE.Matrix4().makeBasis(u, v, w);
  m.setPosition(w.x * start, w.y * start, w.z * start);
  return m;
}
