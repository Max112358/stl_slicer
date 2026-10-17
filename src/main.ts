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
    const minZ = slicer.getMinZ();
    const maxZ = slicer.getMaxZ();

    ui.setBounds(minZ, maxZ);

    const size = geometry.boundingBox!.getSize(new THREE.Vector3());
    const triCount = geometry.index
      ? geometry.index.count / 3
      : geometry.attributes.position.count / 3;

    ui.setStats(
      `<strong>Model:</strong> ${file.name}<br>` +
        `<strong>Triangles:</strong> ${Math.round(triCount).toLocaleString()}<br>` +
        `<strong>Bounds:</strong> ${size.x.toFixed(2)} × ${size.y.toFixed(2)} × ${size.z.toFixed(2)} mm<br>` +
        `<strong>Z range:</strong> ${minZ.toFixed(2)} to ${maxZ.toFixed(2)} mm`,
    );

    updateSlice();
    // CHANGE 1: removed the ui.setBusy(false) here — the finally block
    // below already handles it, so this line was redundant.
  } catch (err) {
    console.error(err);
    ui.setStats("Failed to load or slice file.");
  } finally {
    ui.setBusy(false);
  }
});

ui.onStateChange(() => {
  updateSlice();
});

ui.onExportCurrentSlice(() => {
  if (!currentSliceGeometry || !slicer) return;

  const state = ui.getState();
  const z = state.startHeight.toFixed(2);
  downloadSTL(
    currentSliceGeometry,
    `slice_z${z}_t${state.thickness.toFixed(1)}.stl`,
  );
});

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

function updateSlice(): void {
  if (!slicer) return;

  const state = ui.getState();
  const sliceData = slicer.sliceAt(state.startHeight);

  currentSliceGeometry?.dispose();
  currentSliceGeometry = slicer.createSliceGeometry(sliceData, state.thickness);

  scene.showSlice(currentSliceGeometry);
}

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
