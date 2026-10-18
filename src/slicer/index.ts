import * as THREE from "three";
import type {
  Segment,
  SliceAxis,
  SliceData,
  SliceDiagnostics,
  Triangle,
} from "../types.js";
import { intersectTrianglePlane } from "./intersect.js";
import { tracePolygons } from "./trace.js";
import {
  buildShapes,
  createSliceGeometry as buildSliceGeometry,
} from "./shapes.js";

// Keep cut planes a hair inside the exact min/max: a plane exactly at the
// boundary only grazes vertices and produces no usable segments.
const BOUNDARY_EPS = 1e-4;

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
    // but never smaller than the welding tolerance. Small cracks get
    // stitched; genuinely missing surface does not.
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

  // A slab spans [start, start + thickness], but sample the cross-section
  // at its MIDDLE — never at the slab boundary.
  getCutPosition(start: number, thickness: number): number {
    const min = this.getMin();
    const max = this.getMax();
    const lo = min + BOUNDARY_EPS;
    const hi = max - BOUNDARY_EPS;
    if (hi <= lo) return (min + max) / 2;
    return Math.min(Math.max(start + thickness / 2, lo), hi);
  }

  slice(start: number, thickness: number): SliceData {
    const position = this.getCutPosition(start, thickness);

    const segments = this.triangles
      .map((tri) => intersectTrianglePlane(tri, position, this.axis))
      .filter((seg): seg is Segment => seg !== null);

    const traced = tracePolygons(segments, this.axis, this.gapTolerance);
    const shapes = buildShapes(traced.loops);

    const diagnostics: SliceDiagnostics = {
      contourCount: shapes.length,
      autoClosedGaps: traced.autoClosedGaps,
      droppedOpenChains: traced.droppedOpenChains,
    };

    if (traced.autoClosedGaps > 0) {
      console.warn(
        `[slicer] ${traced.autoClosedGaps} gap(s) auto-closed at ` +
          `${this.axis}=${position.toFixed(3)} mm ` +
          `(tolerance ${this.gapTolerance.toFixed(4)} mm).`,
      );
    }
    if (traced.droppedOpenChains > 0) {
      console.warn(
        `[slicer] ${traced.droppedOpenChains} open contour(s) dropped at ` +
          `${this.axis}=${position.toFixed(3)} mm — the mesh has cracks or ` +
          `missing facets crossed by this cut.`,
      );
    }

    return { axis: this.axis, start, position, shapes, diagnostics };
  }

  sliceAll(thickness: number): SliceData[] {
    const min = this.getMin();
    const max = this.getMax();
    const slices: SliceData[] = [];

    for (let start = min; start < max - BOUNDARY_EPS; start += thickness) {
      slices.push(this.slice(start, thickness));
    }

    return slices;
  }

  createSliceGeometry(
    slice: SliceData,
    thickness: number,
  ): THREE.BufferGeometry | null {
    return buildSliceGeometry(slice.start, slice.shapes, thickness, slice.axis);
  }
}
