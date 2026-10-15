import JSZip from "jszip";
import { geometryToSTLBlob } from "./STLExporter.js";
import type { SliceData } from "../types.js";
import { createSliceGeometry } from "../slicer/shapes.js";

export async function downloadAllSlices(
  slices: SliceData[],
  thickness: number,
): Promise<void> {
  const zip = new JSZip();
  const folder = zip.folder(`slices_${thickness.toFixed(1)}mm`);

  if (!folder) return;

  for (let i = 0; i < slices.length; i++) {
    const slice = slices[i];
    const geometry = createSliceGeometry(slice.z, slice.shapes, thickness);
    if (!geometry) continue;

    const z = slice.z.toFixed(2);
    const filename = `slice_${String(i + 1).padStart(3, "0")}_z${z}.stl`;
    folder.file(filename, geometryToSTLBlob(geometry));
  }

  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `slices_${thickness.toFixed(1)}mm.zip`;
  a.click();

  URL.revokeObjectURL(url);
}
