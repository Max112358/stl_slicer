import type { Matrix4 } from "three";
import JSZip from "jszip";
import { geometryToSTLBlob } from "./STLExporter.js";
import type { SliceResult } from "../slicer/index.js";

export async function downloadAllSlices(
  slices: SliceResult[],
  thickness: number,
  transform?: Matrix4,
): Promise<void> {
  const zip = new JSZip();
  const folder = zip.folder(`slices_${thickness.toFixed(1)}mm`);

  if (!folder) return;

  for (let i = 0; i < slices.length; i++) {
    const geometry = slices[i].geometry;
    if (!geometry) continue;

    const filename =
      `slice_${String(i + 1).padStart(3, "0")}_${slices[i].axis}` +
      `${slices[i].start.toFixed(2)}.stl`;
    folder.file(filename, geometryToSTLBlob(geometry, transform));
    geometry.dispose();
  }

  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `slices_${thickness.toFixed(1)}mm.zip`;
  a.click();

  URL.revokeObjectURL(url);
}
