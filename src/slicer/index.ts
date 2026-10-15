import * as THREE from "three";
import type { SliceData, Triangle } from "../types.js";
import { intersectTrianglePlane } from "./intersect.js";
import { tracePolygons } from "./trace.js";
import { buildShapes, createSliceGeometry } from "./shapes.js";

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

  constructor(geometry: THREE.BufferGeometry) {
    geometry.computeBoundingBox();
    this.bounds = geometry.boundingBox!.clone();
    this.triangles = extractTriangles(geometry);
  }

  getBounds(): THREE.Box3 {
    return this.bounds.clone();
  }

  getMinZ(): number {
    return this.bounds.min.z;
  }

  getMaxZ(): number {
    return this.bounds.max.z;
  }

  sliceAt(z: number): SliceData {
    const segments = this.triangles
      .map((tri) => intersectTrianglePlane(tri, z))
      .filter((seg): seg is NonNullable<typeof seg> => seg !== null);

    const loops = tracePolygons(segments);
    const shapes = buildShapes(loops);

    return { z, shapes };
  }

  sliceAll(thickness: number): SliceData[] {
    const { min, max } = this.bounds;
    const slices: SliceData[] = [];
    let z = min.z;

    while (z <= max.z + 1e-6) {
      slices.push(this.sliceAt(Math.min(z, max.z)));
      z += thickness;
    }

    return slices;
  }

  createSliceGeometry(
    slice: SliceData,
    thickness: number,
  ): THREE.BufferGeometry | null {
    return createSliceGeometry(slice.z, slice.shapes, thickness);
  }
}
