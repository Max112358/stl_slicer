export interface UIState {
  startHeight: number;
  thickness: number;
}

export type ChangeHandler = (state: UIState) => void;
export type FileHandler = (file: File) => void;
export type ActionHandler = () => void;

export class UIManager {
  private root: HTMLElement;
  private state: UIState = { startHeight: 0, thickness: 5 };
  private minZ = 0;
  private maxZ = 100;

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
  }

  handleFile(file: File): void {
    this.onFile?.(file);
  }

  setBounds(minZ: number, maxZ: number): void {
    this.minZ = minZ;
    this.maxZ = maxZ;

    this.state.startHeight = minZ;
    this.state.thickness = Math.min(this.state.thickness, maxZ - minZ);

    const startInput =
      this.root.querySelector<HTMLInputElement>("#start-height")!;
    const thicknessInput =
      this.root.querySelector<HTMLInputElement>("#thickness")!;

    startInput.min = String(minZ);
    startInput.max = String(maxZ);
    startInput.value = String(this.state.startHeight);
    startInput.step = String((maxZ - minZ) / 1000);

    thicknessInput.max = String(maxZ - minZ);
    thicknessInput.value = String(this.state.thickness);
    thicknessInput.step = String((maxZ - minZ) / 1000);

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
          <label>
            Start Height:
            <span id="start-height-val" class="value">0</span> mm
          </label>
          <input type="range" id="start-height" min="0" max="100" step="0.1" value="0" />
        </div>

        <div class="control-group">
          <label>
            Slice Thickness:
            <span id="thickness-val" class="value">5</span> mm
          </label>
          <input type="range" id="thickness" min="0.1" max="20" step="0.1" value="5" />
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
    const fileInput = this.root.querySelector<HTMLInputElement>("#file-input")!;
    const importBtn =
      this.root.querySelector<HTMLButtonElement>("#btn-import")!;
    const startInput =
      this.root.querySelector<HTMLInputElement>("#start-height")!;
    const thicknessInput =
      this.root.querySelector<HTMLInputElement>("#thickness")!;
    const prevBtn = this.root.querySelector<HTMLButtonElement>("#btn-prev")!;
    const nextBtn = this.root.querySelector<HTMLButtonElement>("#btn-next")!;
    const exportCurrentBtn = this.root.querySelector<HTMLButtonElement>(
      "#btn-export-current",
    )!;
    const exportAllBtn =
      this.root.querySelector<HTMLButtonElement>("#btn-export-all")!;

    importBtn.addEventListener("click", () => fileInput.click());

    fileInput.addEventListener("change", () => {
      const file = fileInput.files?.[0];
      if (file) this.onFile?.(file);
    });

    const update = () => {
      this.state.startHeight = parseFloat(startInput.value);
      this.state.thickness = parseFloat(thicknessInput.value);

      // Clamp start + thickness inside the model
      const maxStart = this.maxZ - this.state.thickness;
      if (this.state.startHeight > maxStart) {
        this.state.startHeight = maxStart;
        startInput.value = String(maxStart);
      }

      this.updateLabels();
      this.onChange?.({ ...this.state });
    };

    startInput.addEventListener("input", update);
    thicknessInput.addEventListener("input", update);

    prevBtn.addEventListener("click", () => {
      this.state.startHeight = Math.max(
        this.minZ,
        this.state.startHeight - this.state.thickness,
      );
      startInput.value = String(this.state.startHeight);
      this.updateLabels();
      this.onChange?.({ ...this.state });
    });

    nextBtn.addEventListener("click", () => {
      const maxStart = this.maxZ - this.state.thickness;
      this.state.startHeight = Math.min(
        maxStart,
        this.state.startHeight + this.state.thickness,
      );
      startInput.value = String(this.state.startHeight);
      this.updateLabels();
      this.onChange?.({ ...this.state });
    });

    exportCurrentBtn.addEventListener("click", () => this.onExportCurrent?.());
    exportAllBtn.addEventListener("click", () => this.onExportAll?.());
  }

  private updateLabels(): void {
    this.root.querySelector<HTMLElement>("#start-height-val")!.textContent =
      this.state.startHeight.toFixed(2);

    this.root.querySelector<HTMLElement>("#thickness-val")!.textContent =
      this.state.thickness.toFixed(2);

    this.root
      .querySelector<HTMLElement>("#controls")
      ?.classList.remove("hidden");
  }

  getState(): UIState {
    return { ...this.state };
  }
}
