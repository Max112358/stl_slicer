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

  private setupLights(): void {
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const dir = new THREE.DirectionalLight(0xffffff, 0.9);
    dir.position.set(50, 200, 100);
    this.scene.add(dir);
  }

  private setupGrid(): void {
    this.scene.add(new THREE.GridHelper(400, 40, 0x333355, 0x1a1a2e));
  }

  async loadSTL(file: File): Promise<THREE.BufferGeometry> {
    const loader = new STLLoader();
    const geometry = loader.parse(await file.arrayBuffer());

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
