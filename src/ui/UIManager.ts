import type { SliceAxis } from "../types.js";

export interface UIState {
  startHeight: number;
  /** Effective thickness: nominal clamped to the room left above start. */
  thickness: number;
  axis: SliceAxis;
}

export type ChangeHandler = (state: UIState) => void;
export type FileHandler = (file: File) => void;
export type ActionHandler = () => void;

export class UIManager {
  private root: HTMLElement;
  private state: UIState = { startHeight: 0, thickness: 5, axis: "y" };
  private minZ = 0;
  private maxZ = 100;
  // Thickness the user asked for. Slice actually cut is this clamped to the
  // room between the slice start and the top of the model, so slices tile
  // the model exactly — no overlap, no gap.
  private nominalThickness = 5;

  private onChange?: ChangeHandler;
  private onFile?: FileHandler;
  private onExportCurrent?: ActionHandler;
  private onExportAll?: ActionHandler;

  constructor(rootId: string) {
    const root = document.getElementById(rootId);
    if (!root) throw new Error(`Element #${rootId} not found`);
    this.root = root;

    this.render();
    this.bindEvents();
    this.updateAxisButtons();
  }

  handleFile(file: File): void {
    this.onFile?.(file);
  }

  // Bounds are along the CURRENT slice axis. main.ts calls this on load
  // and again whenever the orientation buttons change the axis.
  setBounds(minZ: number, maxZ: number): void {
    this.minZ = minZ;
    this.maxZ = maxZ;

    const range = Math.max(maxZ - minZ, 1e-6);

    this.state.startHeight = minZ;
    this.nominalThickness = Math.min(this.nominalThickness, range);
    this.state.thickness = this.nominalThickness;

    const startSlider =
      this.root.querySelector<HTMLInputElement>("#start-height")!;
    const thicknessSlider =
      this.root.querySelector<HTMLInputElement>("#thickness")!;
    const startText = this.root.querySelector<HTMLInputElement>("#start-text")!;
    const thicknessText =
      this.root.querySelector<HTMLInputElement>("#thickness-text")!;

    for (const input of [startSlider, startText]) {
      input.min = String(minZ);
      input.step = String(range / 1000);
    }
    for (const input of [thicknessSlider, thicknessText]) {
      input.min = String(0);
      input.step = String(range / 1000);
    }
    startSlider.max = String(maxZ);
    thicknessSlider.max = String(range);
    startText.max = String(maxZ);
    thicknessText.max = String(range);

    this.updateLabels();
  }

  onStateChange(handler: ChangeHandler): void {
    this.onChange = handler;
  }

  onFileSelected(handler: FileHandler): void {
    this.onFile = handler;
  }

  onExportCurrentSlice(handler: ActionHandler): void {
    this.onExportCurrent = handler;
  }

  onExportAllSlices(handler: ActionHandler): void {
    this.onExportAll = handler;
  }

  setStats(html: string): void {
    const stats = this.root.querySelector<HTMLElement>("#stats")!;
    stats.innerHTML = html;
  }

  setBusy(busy: boolean): void {
    const progress = this.root.querySelector<HTMLElement>("#progress")!;
    progress.style.display = busy ? "block" : "none";

    this.root.querySelectorAll("button, input").forEach((el) => {
      (el as HTMLButtonElement | HTMLInputElement).disabled = busy;
    });
  }

  private q<T extends HTMLElement>(selector: string): T {
    return this.root.querySelector<T>(selector)!;
  }

  // Effective thickness = user thickness clamped to the room left before
  // the top of the model. The slice START is never adjusted backwards.
  private syncThickness(): void {
    const remaining = this.maxZ - this.state.startHeight;
    this.state.thickness = Math.min(
      this.nominalThickness,
      Math.max(remaining, 0),
    );

    const hint = this.q<HTMLElement>("#trim-hint");
    const trimmed = this.nominalThickness - this.state.thickness;
    if (trimmed > 1e-9) {
      hint.textContent =
        `trimmed to ${this.state.thickness.toFixed(2)} mm ` +
        `(ends at top of model)`;
    } else {
      hint.textContent = "";
    }
  }

  // Mirror the current values into every control WITHOUT fighting a field
  // the user is currently typing in.
  private updateLabels(): void {
    const setValue = (
      selector: string,
      value: number,
      decimals: number,
    ): void => {
      const el = this.q<HTMLInputElement>(selector);
      if (document.activeElement === el) return;
      el.value = value.toFixed(decimals);
    };

    setValue("#start-height", this.state.startHeight, 3);
    setValue("#start-text", this.state.startHeight, 2);
    setValue("#thickness", this.state.thickness, 3);
    setValue("#thickness-text", this.state.thickness, 2);

    this.q<HTMLElement>("#controls")?.classList.remove("hidden");
  }

  // The user typed into a number box: parse, clamp, flow through the
  // usual path. Invalid/draft input (empty, half-typed `-`) is ignored
  // until it parses.
  private commitText(kind: "start" | "thickness"): void {
    const input = this.q<HTMLInputElement>(
      kind === "start" ? "#start-text" : "#thickness-text",
    );
    const value = parseFloat(input.value);
    if (!Number.isFinite(value)) return;

    if (kind === "start") {
      this.state.startHeight = Math.min(Math.max(value, this.minZ), this.maxZ);
      input.value = this.state.startHeight.toFixed(2);
    } else {
      const max = Math.max(this.maxZ - this.minZ, 1e-6);
      this.nominalThickness = Math.min(Math.max(value, 0), max);
      input.value = this.nominalThickness.toFixed(2);
    }

    this.syncThickness();
    this.updateLabels();
    this.onChange?.({ ...this.state });
  }

  private render(): void {
    this.root.innerHTML = `
      <h1>STL Slicer</h1>
      <div class="subtitle">Vite + TypeScript — no backend</div>

      <div class="control-group">
        <button id="btn-import">Import STL File</button>
        <input type="file" id="file-input" accept=".stl" class="hidden" />
      </div>

      <div id="stats">Drop an STL file onto the viewer or click Import.</div>

      <div id="controls" class="hidden">
        <div class="control-group">
          <label>Slice Orientation</label>
          <div class="control-group button-row" id="axis-buttons">
            <button data-axis="y" class="secondary">Up–Down</button>
            <button data-axis="x" class="secondary">Left–Right</button>
            <button data-axis="z" class="secondary">Front–Back</button>
          </div>
        </div>

        <div class="control-group">
          <label for="start-text">Slice Start (mm)</label>
          <div class="inline-controls">
            <input type="number" id="start-text" class="num-input"
                   min="0" max="100" step="0.1" value="0" />
            <input type="range" id="start-height"
                   min="0" max="100" step="0.1" value="0" />
          </div>
        </div>

        <div class="control-group">
          <label for="thickness-text">Slice Thickness (mm)</label>
          <div class="inline-controls">
            <input type="number" id="thickness-text" class="num-input"
                   min="0" max="20" step="0.1" value="5" />
            <input type="range" id="thickness"
                   min="0" max="20" step="0.1" value="5" />
          </div>
          <div class="hint" id="trim-hint"></div>
        </div>

        <div class="control-group button-row">
          <button id="btn-prev" class="secondary">← Prev</button>
          <button id="btn-next" class="secondary">Next →</button>
        </div>

        <div class="control-group">
          <button id="btn-export-current">Export This Slice</button>
          <button id="btn-export-all" class="secondary">Export All Slices (.zip)</button>
        </div>
      </div>

      <div id="progress" class="hidden">Slicing…</div>
    `;
  }

  private bindEvents(): void {
    const fileInput = this.q<HTMLInputElement>("#file-input");
    const importBtn = this.q<HTMLButtonElement>("#btn-import");
    const startSlider = this.q<HTMLInputElement>("#start-height");
    const thicknessSlider = this.q<HTMLInputElement>("#thickness");
    const startText = this.q<HTMLInputElement>("#start-text");
    const thicknessText = this.q<HTMLInputElement>("#thickness-text");
    const prevBtn = this.q<HTMLButtonElement>("#btn-prev");
    const nextBtn = this.q<HTMLButtonElement>("#btn-next");
    const exportCurrentBtn = this.q<HTMLButtonElement>("#btn-export-current");
    const exportAllBtn = this.q<HTMLButtonElement>("#btn-export-all");

    importBtn.addEventListener("click", () => fileInput.click());

    fileInput.addEventListener("change", () => {
      const file = fileInput.files?.[0];
      if (file) this.onFile?.(file);
    });

    this.root
      .querySelectorAll<HTMLButtonElement>("[data-axis]")
      .forEach((btn) => {
        btn.addEventListener("click", () => {
          const axis = btn.dataset.axis as SliceAxis;
          if (this.state.axis === axis) return;
          this.state.axis = axis;
          this.updateAxisButtons();
          // main.ts re-bases the slider bounds for the new axis.
          this.onChange?.({ ...this.state });
        });
      });

    // Sliders: live update while dragging.
    const updateFromSliders = () => {
      this.state.startHeight = parseFloat(startSlider.value);
      const nominal = parseFloat(thicknessSlider.value);
      if (nominal > 0) this.nominalThickness = nominal;

      this.syncThickness();
      this.updateLabels();
      this.onChange?.({ ...this.state });
    };

    startSlider.addEventListener("input", updateFromSliders);
    thicknessSlider.addEventListener("input", updateFromSliders);

    // Number boxes: apply on Enter/focus-out. A separate `input` listener
    // keeps the preview live as long as the text parses.
    for (const [input, kind] of [
      [startText, "start"],
      [thicknessText, "thickness"],
    ] as const) {
      input.addEventListener("input", () => {
        if (Number.isFinite(parseFloat(input.value))) this.commitText(kind);
      });
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") input.blur();
      });
      input.addEventListener("blur", () => this.commitText(kind));
    }

    prevBtn.addEventListener("click", () => {
      // Step back one full user-chosen slice so Prev lands on real
      // boundaries even when the tail slice was trimmed.
      this.state.startHeight = Math.max(
        this.minZ,
        this.state.startHeight - this.nominalThickness,
      );
      this.syncThickness();
      this.updateLabels();
      this.onChange?.({ ...this.state });
    });

    nextBtn.addEventListener("click", () => {
      // Jump to the end of the current slice. Never clamps the start
      // backwards — the thickness shrinks instead (syncThickness).
      const next = this.state.startHeight + Math.max(this.state.thickness, 0);
      if (next > this.maxZ - 1e-9) return;
      this.state.startHeight = next;
      this.syncThickness();
      this.updateLabels();
      this.onChange?.({ ...this.state });
    });

    exportCurrentBtn.addEventListener("click", () => this.onExportCurrent?.());
    exportAllBtn.addEventListener("click", () => this.onExportAll?.());
  }

  private updateAxisButtons(): void {
    this.root
      .querySelectorAll<HTMLButtonElement>("[data-axis]")
      .forEach((btn) => {
        btn.classList.toggle("active", btn.dataset.axis === this.state.axis);
      });
  }

  getState(): UIState {
    return { ...this.state };
  }
}
