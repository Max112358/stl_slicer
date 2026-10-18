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

    ui.setStats(
      `<strong>Model:</strong> ${file.name}<br>` +
        `<strong>Triangles:</strong> ${Math.round(triCount).toLocaleString()}<br>` +
        `<strong>Bounds:</strong> ${size.x.toFixed(2)} × ${size.y.toFixed(2)} × ${size.z.toFixed(2)} mm<br>` +
        `<strong>Height range:</strong> ${min.toFixed(2)} to ${max.toFixed(2)} mm`,
    );

    updateSlice();
  } catch (err) {
    console.error(err);
    ui.setStats("Failed to load or slice file.");
  } finally {
    ui.setBusy(false);
  }
});

ui.onStateChange(() => {
  if (!slicer) return;

  // Orientation change: re-base the slider onto the new axis, then slice.
  if (slicer.getAxis() !== ui.getState().axis) {
    slicer.setAxis(ui.getState().axis);
    ui.setBounds(slicer.getMin(), slicer.getMax());
  }

  updateSlice();
});

ui.onExportCurrentSlice(() => {
  if (!currentSliceGeometry || !slicer) return;

  const state = ui.getState();
  downloadSTL(
    currentSliceGeometry,
    `slice_${state.axis}${state.startHeight.toFixed(2)}_t${state.thickness.toFixed(1)}.stl`,
  );
});

function updateSlice(): void {
  if (!slicer) return;

  const state = ui.getState();
  const sliceData = slicer.slice(state.startHeight, state.thickness);

  currentSliceGeometry?.dispose();
  currentSliceGeometry = slicer.createSliceGeometry(sliceData, state.thickness);

  scene.showSlice(currentSliceGeometry);
}

ui.onExportAllSlices(async () => {
  if (!slicer) return;

  ui.setBusy(true);
  // CHANGE 2: wrapped in try/finally so the buttons re-enable even if
  // sliceAll() throws. Right now, any error in here permanently
  // disables the whole UI.
  try {
    const state = ui.getState();
    const slices = slicer.sliceAll(state.thickness);
    await downloadAllSlices(slices, state.thickness);
  } catch (err) {
    console.error(err);
    ui.setStats("Failed to export slices.");
  } finally {
    ui.setBusy(false);
  }
});

// Drag-and-drop support
const canvasContainer = document.getElementById("canvas-container")!;
canvasContainer.addEventListener("dragover", (e) => e.preventDefault());

// CHANGE 3: removed the first duplicate drop handler. You had two
// addEventListener("drop", ...) calls, so every dropped file was
// processed TWICE (loaded, sliced, and camera-fitted two times).
// Kept the one that uses the public handleFile() method.
canvasContainer.addEventListener("drop", (e) => {
  e.preventDefault();
  const file = e.dataTransfer?.files[0];
  if (file && file.name.toLowerCase().endsWith(".stl")) {
    ui.handleFile(file);
  }
});
