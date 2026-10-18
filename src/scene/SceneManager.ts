import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { STLLoader } from "three/addons/loaders/STLLoader.js";

export class SceneManager {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private controls: OrbitControls;
  private originalMesh: THREE.Mesh | null = null;
  private sliceMesh: THREE.Mesh | null = null;

  // Maps viewer/world coordinates back into the coordinate system of the
  // STL file the user loaded. Slicing happens in viewer space, but anything
  // we write back out must be expressed in the file's own space, or it will
  // not line up with the model in any other viewer.
  private stlTransform = new THREE.Matrix4();

  constructor(private container: HTMLElement) {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0a14);

    this.camera = new THREE.PerspectiveCamera(
      45,
      this.container.clientWidth / this.container.clientHeight,
      0.1,
      100000,
    );

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;

    this.setupLights();
    this.setupGrid();
    this.handleResize();

    this.animate();
  }

  /**
   * World -> original STL file coordinates.
   *
   * Pass this to the exporters so a slice exports exactly where the cross
   * section is inside the file you imported.
   */
  getSTLTransform(): THREE.Matrix4 {
    return this.stlTransform.clone();
  }

  private setupLights(): void {
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const dir = new THREE.DirectionalLight(0xffffff, 0.9);
    dir.position.set(50, 200, 100);
    this.scene.add(dir);
  }

  private setupGrid(): void {
    const grid = new THREE.GridHelper(400, 40, 0x333355, 0x1a1a2e);
    // Sit the grid a hair below y=0 so a slab whose bottom face is exactly
    // at 0 doesn't z-fight with the grid lines when viewed from below.
    grid.position.y = -0.01;
    this.scene.add(grid);
  }

  async loadSTL(file: File): Promise<THREE.BufferGeometry> {
    const loader = new STLLoader();
    const geometry = loader.parse(await file.arrayBuffer());

    // STL files are conventionally Z-up; three.js is Y-up. Stand the model
    // upright so its height axis is world +Y. Record the rotation instead of
    // using rotateX() so we can undo it on export.
    const rotation = new THREE.Matrix4().makeRotationX(-Math.PI / 2);
    geometry.applyMatrix4(rotation);

    // Ground it: center over the grid origin, lift so the lowest point sits
    // at y = 0. Compute this AFTER the rotation, because rotating changes the
    // bounding box.
    geometry.computeBoundingBox();
    const bb = geometry.boundingBox!;
    const center = bb.getCenter(new THREE.Vector3());
    const grounding = new THREE.Matrix4().makeTranslation(
      -center.x,
      -bb.min.y,
      -center.z,
    );
    geometry.applyMatrix4(grounding);
    geometry.computeBoundingBox();

    // Full loading transform is `grounding * rotation`, so world -> file is
    // its inverse.
    this.stlTransform.multiplyMatrices(grounding, rotation).invert();

    if (this.originalMesh) {
      this.scene.remove(this.originalMesh);
      this.originalMesh.geometry.dispose();
      (this.originalMesh.material as THREE.Material).dispose();
    }

    const material = new THREE.MeshPhongMaterial({
      color: 0x555566,
      transparent: true,
      opacity: 0.25,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    this.originalMesh = new THREE.Mesh(geometry, material);
    this.scene.add(this.originalMesh);

    this.fitCamera(geometry);

    return geometry;
  }

  setOriginalMeshVisible(visible: boolean): void {
    if (this.originalMesh) {
      this.originalMesh.visible = visible;
    }
  }

  showSlice(geometry: THREE.BufferGeometry | null): void {
    if (this.sliceMesh) {
      this.scene.remove(this.sliceMesh);
      this.sliceMesh.geometry.dispose();
      (this.sliceMesh.material as THREE.Material).dispose();
      this.sliceMesh = null;
    }

    if (!geometry) return;

    const material = new THREE.MeshPhongMaterial({
      color: 0x00d4aa,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.92,
      shininess: 80,
    });

    this.sliceMesh = new THREE.Mesh(geometry, material);
    this.scene.add(this.sliceMesh);
  }

  private fitCamera(geometry: THREE.BufferGeometry): void {
    geometry.computeBoundingBox();
    const center = geometry.boundingBox!.getCenter(new THREE.Vector3());
    const size = geometry.boundingBox!.getSize(new THREE.Vector3());

    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const dist = maxDim * 2.2;

    this.camera.position.set(center.x + dist, center.y + dist, center.z + dist);
    this.camera.lookAt(center);
    this.controls.target.copy(center);
    this.controls.update();

    this.handleResize();
  }

  private handleResize(): void {
    const resize = () => {
      const width = this.container.clientWidth;
      const height = this.container.clientHeight;
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(width, height);
    };
    window.addEventListener("resize", resize);
    resize();
  }

  private animate = (): void => {
    requestAnimationFrame(this.animate);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  };
}
