import * as THREE from "three";
import type { SliceAxis, SliceDiagnostics, Triangle } from "../types.js";
import { extractSlab } from "./slab.js";

function extractTriangles(geometry: THREE.BufferGeometry): Triangle[] {
  const position = geometry.attributes.position;
  const index = geometry.index;
  const triangles: Triangle[] = [];
  const v = (i: number) => new THREE.Vector3().fromBufferAttribute(position, i);

  if (index) {
    for (let i = 0; i < index.count; i += 3) {
      triangles.push({
        a: v(index.getX(i)),
        b: v(index.getX(i + 1)),
        c: v(index.getX(i + 2)),
      });
    }
  } else {
    for (let i = 0; i < position.count; i += 3) {
      triangles.push({ a: v(i), b: v(i + 1), c: v(i + 2) });
    }
  }

  return triangles;
}

export interface SliceResult {
  axis: SliceAxis;
  start: number;
  thickness: number;
  geometry: THREE.BufferGeometry | null;
  diagnostics: SliceDiagnostics;
}

export class Slicer {
  private triangles: Triangle[];
  private bounds: THREE.Box3;
  private axis: SliceAxis = "y";
  private gapTolerance: number;

  constructor(geometry: THREE.BufferGeometry) {
    geometry.computeBoundingBox();
    this.bounds = geometry.boundingBox!.clone();
    this.triangles = extractTriangles(geometry);

    // Scale gap closing with the model: 0.2% of its largest dimension,
    // never smaller than welding precision.
    const size = this.bounds.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    this.gapTolerance = Math.max(2e-4, maxDim * 0.002);
  }

  getBounds(): THREE.Box3 {
    return this.bounds.clone();
  }

  getAxis(): SliceAxis {
    return this.axis;
  }

  setAxis(axis: SliceAxis): void {
    this.axis = axis;
  }

  getMin(): number {
    return this.bounds.min[this.axis];
  }

  getMax(): number {
    return this.bounds.max[this.axis];
  }

  slice(start: number, thickness: number): SliceResult {
    const lo = start;
    const hi = start + thickness;

    const extracted = extractSlab(
      this.triangles,
      this.axis,
      lo,
      hi,
      this.gapTolerance,
    );

    const d = extracted.diagnostics;
    if (d.autoClosedGaps > 0) {
      console.warn(
        `[slicer] ${d.autoClosedGaps} gap(s) auto-closed in slab ` +
          `${this.axis} ${lo.toFixed(2)}..${hi.toFixed(2)} mm ` +
          `(tolerance ${this.gapTolerance.toFixed(4)} mm).`,
      );
    }
    if (d.droppedOpenChains > 0) {
      console.warn(
        `[slicer] ${d.droppedOpenChains} open contour(s) dropped in slab ` +
          `${this.axis} ${lo.toFixed(2)}..${hi.toFixed(2)} mm — the mesh ` +
          `has cracks or missing facets crossed by this cut.`,
      );
    }

    return {
      axis: this.axis,
      start,
      thickness,
      geometry: extracted.geometry,
      diagnostics: extracted.diagnostics,
    };
  }

  sliceAll(thickness: number): SliceResult[] {
    const min = this.getMin();
    const max = this.getMax();
    const slices: SliceResult[] = [];

    // Integer number of slabs, so starts hit exact multiples and the last
    // slab is trimmed to end exactly at the top of the model.
    const count = Math.ceil((max - min) / thickness - 1e-9);

    for (let i = 0; i < count; i++) {
      const start = min + i * thickness;
      const slabThickness = Math.min(thickness, max - start);
      if (slabThickness <= 0) continue;
      slices.push(this.slice(start, slabThickness));
    }

    return slices;
  }
}
