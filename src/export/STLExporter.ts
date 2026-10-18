import * as THREE from "three";

export function geometryToSTLBlob(
  geometry: THREE.BufferGeometry,
  transform?: THREE.Matrix4,
): Blob {
  const position = geometry.attributes.position;
  const index = geometry.index;

  const triangleCount = index ? index.count / 3 : position.count / 3;
  const buffer = new ArrayBuffer(80 + 4 + triangleCount * 50);
  const view = new DataView(buffer);

  const header = new TextEncoder().encode("STL Slicer");
  for (let i = 0; i < Math.min(header.length, 80); i++) {
    view.setUint8(i, header[i]);
  }

  view.setUint32(80, triangleCount, true);

  const vA = new THREE.Vector3();
  const vB = new THREE.Vector3();
  const vC = new THREE.Vector3();

  let offset = 84;

  function writeFloat(value: number): void {
    view.setFloat32(offset, value, true);
    offset += 4;
  }

  function writeVector(v: THREE.Vector3): void {
    writeFloat(v.x);
    writeFloat(v.y);
    writeFloat(v.z);
  }

  function processTriangle(i0: number, i1: number, i2: number): void {
    vA.fromBufferAttribute(position, i0);
    vB.fromBufferAttribute(position, i1);
    vC.fromBufferAttribute(position, i2);

    if (transform) {
      vA.applyMatrix4(transform);
      vB.applyMatrix4(transform);
      vC.applyMatrix4(transform);
    }

    const normal = new THREE.Vector3()
      .subVectors(vB, vA)
      .cross(new THREE.Vector3().subVectors(vC, vA))
      .normalize();

    writeVector(normal);
    writeVector(vA);
    writeVector(vB);
    writeVector(vC);
    view.setUint16(offset, 0, true);
    offset += 2;
  }

  if (index) {
    for (let i = 0; i < index.count; i += 3) {
      processTriangle(index.getX(i), index.getX(i + 1), index.getX(i + 2));
    }
  } else {
    for (let i = 0; i < position.count; i += 3) {
      processTriangle(i, i + 1, i + 2);
    }
  }

  return new Blob([buffer], { type: "application/octet-stream" });
}

export function downloadSTL(
  geometry: THREE.BufferGeometry,
  filename: string,
  transform?: THREE.Matrix4,
): void {
  const blob = geometryToSTLBlob(geometry, transform);
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename.toLowerCase().endsWith(".stl")
    ? filename
    : `${filename}.stl`;
  a.click();

  URL.revokeObjectURL(url);
}
