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
    const geometry = createSliceGeometry(
      slice.start,
      slice.shapes,
      thickness,
      slice.axis,
    );
    if (!geometry) continue;

    const filename =
      `slice_${String(i + 1).padStart(3, "0")}_` +
      `${slice.axis}${slice.start.toFixed(2)}.stl`;
    folder.file(filename, geometryToSTLBlob(geometry));
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
