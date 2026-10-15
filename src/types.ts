import * as THREE from "three";

export interface Triangle {
  a: THREE.Vector3;
  b: THREE.Vector3;
  c: THREE.Vector3;
}

export interface Segment {
  start: THREE.Vector3;
  end: THREE.Vector3;
}

export interface SliceData {
  z: number;
  shapes: SliceShape[];
}

export interface SliceShape {
  outer: THREE.Vector3[];
  holes: THREE.Vector3[][];
}

export interface SliceSettings {
  startHeight: number;
  thickness: number;
}
