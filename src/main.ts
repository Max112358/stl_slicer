/// <reference types="vite/client" />
import "./ui/styles.css";
import * as THREE from "three";

import { SceneManager } from "./scene/SceneManager.js";
import { Slicer } from "./slicer/index.js";
import { downloadSTL } from "./export/STLExporter.js";
import { downloadAllSlices } from "./export/ZipExporter.js";
import { UIManager } from "./ui/UIManager.js";

let slicer: Slicer | null = null;
let currentSliceGeometry: THREE.BufferGeometry | null = null;
let modelStats = "";

const scene = new SceneManager(document.getElementById("canvas-container")!);
const ui = new UIManager("sidebar");

ui.onFileSelected(async (file) => {
  ui.setBusy(true);
  try {
    const geometry = await scene.loadSTL(file);

    slicer = new Slicer(geometry);
    slicer.setAxis(ui.getState().axis);

    const min = slicer.getMin();
    const max = slicer.getMax();
    ui.setBounds(min, max);

    const size = geometry.boundingBox!.getSize(new THREE.Vector3());
    const triCount = geometry.index
      ? geometry.index.count / 3
      : geometry.attributes.position.count / 3;

    modelStats =
      `<strong>Model:</strong> ${file.name}<br>` +
      `<strong>Triangles:</strong> ${Math.round(triCount).toLocaleString()}<br>` +
      `<strong>Bounds:</strong> ${size.x.toFixed(2)} × ${size.y.toFixed(2)} × ${size.z.toFixed(2)} mm<br>` +
      `<strong>Height range:</strong> ${min.toFixed(2)} to ${max.toFixed(2)} mm<br>`;

    updateSlice();
  } catch (err) {
    console.error(err);
    modelStats = "";
    ui.setStats("Failed to load or slice file.");
  } finally {
    ui.setBusy(false);
  }
});

ui.onStateChange(() => {
  if (!slicer) return;

  if (slicer.getAxis() !== ui.getState().axis) {
    slicer.setAxis(ui.getState().axis);
    ui.setBounds(slicer.getMin(), slicer.getMax());
  }

  updateSlice();
});

ui.onExportCurrentSlice(() => {
  if (!slicer) return;

  if (!currentSliceGeometry) {
    ui.setStats(
      modelStats +
        '<br><span style="color:#ff6b6b"><strong>Nothing to export:</strong> ' +
        "this slab has no closed cross-section.</span>",
    );
    return;
  }

  const state = ui.getState();
  downloadSTL(
    currentSliceGeometry,
    `slice_${state.axis}${state.startHeight.toFixed(2)}_t${state.thickness.toFixed(1)}.stl`,
    scene.getSTLTransform(),
  );
});

ui.onExportAllSlices(async () => {
  if (!slicer) return;

  ui.setBusy(true);
  try {
    const state = ui.getState();
    const slices = slicer.sliceAll(state.thickness);
    await downloadAllSlices(slices, state.thickness, scene.getSTLTransform());
  } catch (err) {
    console.error(err);
    ui.setStats("Failed to export slices.");
  } finally {
    ui.setBusy(false);
  }
});

function updateSlice(): void {
  if (!slicer) return;

  const state = ui.getState();
  const sliceData = slicer.slice(state.startHeight, state.thickness);

  currentSliceGeometry?.dispose();
  currentSliceGeometry = slicer.createSliceGeometry(sliceData, state.thickness);
  scene.showSlice(currentSliceGeometry);

  const d = sliceData.diagnostics;
  const issues: string[] = [];
  if (d.autoClosedGaps > 0) {
    issues.push(`auto-closed ${d.autoClosedGaps} gap(s)`);
  }
  if (d.droppedOpenChains > 0) {
    issues.push(
      `${d.droppedOpenChains} open contour(s) dropped — mesh is not watertight here`,
    );
  }

  const gapHtml = issues.length
    ? `<br><span style="color:#ffb74d"><strong>Gaps:</strong> ${issues.join("; ")}</span>`
    : `<br><strong>Gaps:</strong> none`;

  const emptyHtml = currentSliceGeometry
    ? ""
    : `<br><span style="color:#ff6b6b"><strong>No closed cross-section</strong> at ` +
      `${state.startHeight.toFixed(2)} ± ${(state.thickness / 2).toFixed(2)} mm</span>`;

  ui.setStats(
    modelStats +
      `<strong>Cross sections:</strong> ${d.contourCount}<br>` +
      gapHtml +
      emptyHtml,
  );
}

// Drag-and-drop support
const canvasContainer = document.getElementById("canvas-container")!;
canvasContainer.addEventListener("dragover", (e) => e.preventDefault());

canvasContainer.addEventListener("drop", (e) => {
  e.preventDefault();
  const file = e.dataTransfer?.files[0];
  if (file && file.name.toLowerCase().endsWith(".stl")) {
    ui.handleFile(file);
  }
});
