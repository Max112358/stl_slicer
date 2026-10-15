import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import * as THREE from "three";
import type { SliceShape } from "../types.js";

const EPS = 1e-6;

function signedArea2D(loop: THREE.Vector3[]): number {
  let area = 0;
  const n = loop.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += loop[i].x * loop[j].y - loop[j].x * loop[i].y;
  }
  return area * 0.5;
}

function pointInLoop(point: THREE.Vector3, loop: THREE.Vector3[]): boolean {
  let inside = false;
  const n = loop.length;

  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = loop[i].x;
    const yi = loop[i].y;
    const xj = loop[j].x;
    const yj = loop[j].y;

    if (
      yi > point.y !== yj > point.y &&
      point.x < ((xj - xi) * (point.y - yi)) / (yj - yi + EPS) + xi
    ) {
      inside = !inside;
    }
  }

  return inside;
}

function cleanLoop(loop: THREE.Vector3[]): THREE.Vector3[] {
  let result = loop;
  if (
    result.length > 1 &&
    result[0].distanceTo(result[result.length - 1]) < EPS
  ) {
    result = result.slice(0, -1);
  }
  return result;
}

export function buildShapes(loops: THREE.Vector3[][]): SliceShape[] {
  const validLoops = loops
    .map((loop) => ({ loop: cleanLoop(loop), area: signedArea2D(loop) }))
    .filter(({ area }) => Math.abs(area) > 1e-8);

  const outers = validLoops
    .filter(({ area }) => area > 0)
    .sort((a, b) => a.area - b.area);

  const holes = validLoops.filter(({ area }) => area < 0);

  const consumedHoles = new Set<number>();

  return outers.map(({ loop: outer }) => {
    const shapeHoles: THREE.Vector3[][] = [];

    holes.forEach(({ loop: hole }, index) => {
      if (consumedHoles.has(index)) return;
      if (pointInLoop(hole[0], outer)) {
        shapeHoles.push(hole);
        consumedHoles.add(index);
      }
    });

    return { outer, holes: shapeHoles };
  });
}

export function createSliceGeometry(
  startZ: number,
  shapes: SliceShape[],
  thickness: number,
): THREE.BufferGeometry | null {
  const geometries: THREE.BufferGeometry[] = [];

  for (const { outer, holes } of shapes) {
    const shape = new THREE.Shape();

    let contour = signedArea2D(outer) < 0 ? outer.slice().reverse() : outer;
    contour = cleanLoop(contour);

    shape.moveTo(contour[0].x, contour[0].y);
    for (let i = 1; i < contour.length; i++) {
      shape.lineTo(contour[i].x, contour[i].y);
    }
    shape.closePath();

    for (const hole of holes) {
      let holePoints = signedArea2D(hole) > 0 ? hole.slice().reverse() : hole;
      holePoints = cleanLoop(holePoints);

      const path = new THREE.Path();
      path.moveTo(holePoints[0].x, holePoints[0].y);
      for (let i = 1; i < holePoints.length; i++) {
        path.lineTo(holePoints[i].x, holePoints[i].y);
      }
      path.closePath();
      shape.holes.push(path);
    }

    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: thickness,
      bevelEnabled: false,
      steps: 1,
      curveSegments: 4,
    });

    geometry.translate(0, 0, startZ);
    geometries.push(geometry);
  }

  if (geometries.length === 0) return null;

  return mergeGeometries(geometries);
}
