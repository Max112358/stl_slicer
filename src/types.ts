import * as THREE from "three";

export type SliceAxis = "x" | "y" | "z";

export interface Triangle {
  a: THREE.Vector3;
  b: THREE.Vector3;
  c: THREE.Vector3;
}

export interface Segment {
  start: THREE.Vector3;
  end: THREE.Vector3;
}

export interface SliceDiagnostics {
  contourCount: number;
  autoClosedGaps: number;
  droppedOpenChains: number;
}

export interface SliceData {
  axis: SliceAxis;
  start: number; // slab bottom, along the axis
  position: number; // where the cross-section was actually sampled
  shapes: SliceShape[];
  diagnostics: SliceDiagnostics;
}

export interface SliceShape {
  outer: THREE.Vector2[];
  holes: THREE.Vector2[][];
}

export interface SliceSettings {
  startHeight: number;
  thickness: number;
}
