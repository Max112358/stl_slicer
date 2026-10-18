import * as THREE from "three";
import type {
  Segment,
  SliceAxis,
  SliceData,
  SliceShape,
  Triangle,
} from "../types.js";
import { intersectTrianglePlane } from "./intersect.js";
import { tracePolygons } from "./trace.js";
import {
  buildShapes,
  createSliceGeometry as buildSliceGeometry,
} from "./shapes.js";
import { projectPoint } from "./axis.js";

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
      triangles.push({
        a: v(i),
        b: v(i + 1),
        c: v(i + 2),
      });
    }
  }

  return triangles;
}

export class Slicer {
  private triangles: Triangle[];
  private bounds: THREE.Box3;
  private axis: SliceAxis = "y";

  constructor(geometry: THREE.BufferGeometry) {
    geometry.computeBoundingBox();
    this.bounds = geometry.boundingBox!.clone();
    this.triangles = extractTriangles(geometry);
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
  // at its MIDDLE — never at the slab boundary. Sampling the exact start
  // height fails whenever it coincides with min/max or a flat face, which
  // is why some heights produced no preview no matter the thickness.
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

    const loops = tracePolygons(segments);
    const loops2D = loops.map((loop) =>
      loop.map((p) => projectPoint(p, this.axis)),
    );
    const shapes = buildShapes(loops2D);

    return { axis: this.axis, start, position, shapes };
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
