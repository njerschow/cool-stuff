import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

const DEFAULT_MODEL_URL = "/models/scan.glb";

type LoadState =
  | { status: "idle" }
  | { status: "loading"; label: string }
  | { status: "ready"; label: string; stats: ModelStats }
  | { status: "empty" }
  | { status: "error"; message: string };

type ModelStats = {
  meshes: number;
  triangles: number;
  sizeLabel: string;
};

/**
 * Holds the long-lived three.js objects for a single mounted viewer. Kept in a
 * ref so React re-renders never tear down the WebGL context.
 */
type Engine = {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  grid: THREE.GridHelper;
  loader: GLTFLoader;
  current: THREE.Object3D | null;
  frameId: number;
  resize: () => void;
};

function formatThousands(value: number): string {
  return value.toLocaleString("en-US");
}

function fitCameraToObject(engine: Engine, object: THREE.Object3D) {
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());

  // Recenter the model on the origin so orbit + grid feel natural.
  object.position.sub(center);
  box.setFromObject(object);

  const maxDim = Math.max(size.x, size.y, size.z) || 1;
  const fov = (engine.camera.fov * Math.PI) / 180;
  const distance = (maxDim / 2 / Math.tan(fov / 2)) * 1.6;

  engine.camera.near = maxDim / 100;
  engine.camera.far = maxDim * 100;
  engine.camera.position.set(distance * 0.8, distance * 0.6, distance);
  engine.camera.updateProjectionMatrix();

  engine.controls.target.set(0, 0, 0);
  engine.controls.maxDistance = distance * 4;
  engine.controls.update();

  // Drop the grid to sit just under the model's lowest point.
  const refreshed = new THREE.Box3().setFromObject(object);
  engine.grid.position.y = refreshed.min.y;
}

function summarize(object: THREE.Object3D, sizeLabel: string): ModelStats {
  let meshes = 0;
  let triangles = 0;
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.isMesh && mesh.geometry) {
      meshes += 1;
      const geom = mesh.geometry;
      const index = geom.getIndex();
      const position = geom.getAttribute("position");
      if (index) triangles += index.count / 3;
      else if (position) triangles += position.count / 3;
    }
  });
  return { meshes, triangles: Math.round(triangles), sizeLabel };
}

export function ScanViewer() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<Engine | null>(null);
  const [loadState, setLoadState] = useState<LoadState>({ status: "idle" });
  const [autoRotate, setAutoRotate] = useState(true);
  const [wireframe, setWireframe] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const applyWireframe = useCallback((on: boolean) => {
    const engine = engineRef.current;
    if (!engine?.current) return;
    engine.current.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (mesh.isMesh) {
        const materials = Array.isArray(mesh.material)
          ? mesh.material
          : [mesh.material];
        for (const material of materials) {
          (material as THREE.MeshStandardMaterial).wireframe = on;
        }
      }
    });
  }, []);

  const swapModel = useCallback(
    (object: THREE.Object3D, label: string, sizeLabel: string) => {
      const engine = engineRef.current;
      if (!engine) return;
      if (engine.current) {
        engine.scene.remove(engine.current);
        engine.current.traverse((child) => {
          const mesh = child as THREE.Mesh;
          if (mesh.isMesh) {
            mesh.geometry?.dispose();
            const materials = Array.isArray(mesh.material)
              ? mesh.material
              : [mesh.material];
            for (const material of materials) material?.dispose();
          }
        });
      }
      engine.scene.add(object);
      engine.current = object;
      fitCameraToObject(engine, object);
      applyWireframe(wireframe);
      setLoadState({
        status: "ready",
        label,
        stats: summarize(object, sizeLabel),
      });
    },
    [applyWireframe, wireframe]
  );

  const loadFromUrl = useCallback(
    (url: string, label: string, opts?: { optional?: boolean }) => {
      const engine = engineRef.current;
      if (!engine) return;
      setLoadState({ status: "loading", label });
      engine.loader.load(
        url,
        (gltf) => swapModel(gltf.scene, label, ""),
        undefined,
        () => {
          if (opts?.optional) setLoadState({ status: "empty" });
          else
            setLoadState({
              status: "error",
              message: `Could not load ${label}.`,
            });
        }
      );
    },
    [swapModel]
  );

  const loadFromFile = useCallback(
    (file: File) => {
      const engine = engineRef.current;
      if (!engine) return;
      const lower = file.name.toLowerCase();
      if (!lower.endsWith(".glb") && !lower.endsWith(".gltf")) {
        setLoadState({
          status: "error",
          message: `Unsupported file "${file.name}". Export a .glb from Scaniverse.`,
        });
        return;
      }
      setLoadState({ status: "loading", label: file.name });
      const sizeLabel = `${(file.size / (1024 * 1024)).toFixed(1)} MB`;
      const reader = new FileReader();
      reader.onload = () => {
        engine.loader.parse(
          reader.result as ArrayBuffer,
          "",
          (gltf) => swapModel(gltf.scene, file.name, sizeLabel),
          () =>
            setLoadState({
              status: "error",
              message: `Failed to parse "${file.name}".`,
            })
        );
      };
      reader.onerror = () =>
        setLoadState({
          status: "error",
          message: `Failed to read "${file.name}".`,
        });
      reader.readAsArrayBuffer(file);
    },
    [swapModel]
  );

  // Build the three.js engine once on mount.
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0d0f14);

    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(
      new RoomEnvironment(),
      0.04
    ).texture;

    const camera = new THREE.PerspectiveCamera(
      45,
      mount.clientWidth / mount.clientHeight,
      0.1,
      1000
    );
    camera.position.set(3, 2, 4);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.autoRotateSpeed = 1.2;

    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(4, 6, 4);
    scene.add(key);
    scene.add(new THREE.AmbientLight(0xffffff, 0.4));

    const grid = new THREE.GridHelper(20, 40, 0x2a3550, 0x1a2030);
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.45;
    scene.add(grid);

    const loader = new GLTFLoader();

    const resize = () => {
      if (!mount.clientWidth || !mount.clientHeight) return;
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    };

    const engine: Engine = {
      renderer,
      scene,
      camera,
      controls,
      grid,
      loader,
      current: null,
      frameId: 0,
      resize,
    };
    engineRef.current = engine;

    const animate = () => {
      engine.frameId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    const observer = new ResizeObserver(resize);
    observer.observe(mount);

    loadFromUrl(DEFAULT_MODEL_URL, "scan.glb", { optional: true });

    return () => {
      cancelAnimationFrame(engine.frameId);
      observer.disconnect();
      controls.dispose();
      pmrem.dispose();
      renderer.dispose();
      if (renderer.domElement.parentElement === mount) {
        mount.removeChild(renderer.domElement);
      }
      engineRef.current = null;
    };
    // Mount-once: loadFromUrl is stable enough; deliberately no deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const engine = engineRef.current;
    if (engine) engine.controls.autoRotate = autoRotate;
  }, [autoRotate]);

  useEffect(() => {
    applyWireframe(wireframe);
  }, [wireframe, applyWireframe]);

  const resetView = useCallback(() => {
    const engine = engineRef.current;
    if (engine?.current) fitCameraToObject(engine, engine.current);
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      setDragOver(false);
      const file = event.dataTransfer.files?.[0];
      if (file) loadFromFile(file);
    },
    [loadFromFile]
  );

  const ready = loadState.status === "ready";

  return (
    <main
      className="scan-app"
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
    >
      <div className="scan-canvas" ref={mountRef} />

      <header className="scan-header">
        <a className="scan-brand" href="/">
          ← Cool Stuff
        </a>
        <div className="scan-title">
          <span>Scan Viewer</span>
          <small>Scaniverse capture · iPhone photogrammetry</small>
        </div>
      </header>

      <div className="scan-toolbar">
        <button
          type="button"
          data-active={autoRotate}
          onClick={() => setAutoRotate((v) => !v)}
        >
          {autoRotate ? "Stop spin" : "Auto-spin"}
        </button>
        <button
          type="button"
          data-active={wireframe}
          onClick={() => setWireframe((v) => !v)}
          disabled={!ready}
        >
          Wireframe
        </button>
        <button type="button" onClick={resetView} disabled={!ready}>
          Reset view
        </button>
        <label className="scan-upload">
          Load .glb
          <input
            type="file"
            accept=".glb,.gltf"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) loadFromFile(file);
              e.target.value = "";
            }}
          />
        </label>
      </div>

      {ready && (
        <div className="scan-stats">
          <strong>{loadState.label}</strong>
          <span>{formatThousands(loadState.stats.triangles)} tris</span>
          <span>{loadState.stats.meshes} mesh{loadState.stats.meshes === 1 ? "" : "es"}</span>
          {loadState.stats.sizeLabel && <span>{loadState.stats.sizeLabel}</span>}
        </div>
      )}

      {loadState.status === "loading" && (
        <div className="scan-overlay">Loading {loadState.label}…</div>
      )}

      {loadState.status === "empty" && (
        <div className="scan-overlay scan-empty">
          <h2>No model yet</h2>
          <p>
            Export your Scaniverse capture as <code>GLB</code> and either drop it
            anywhere on this page or use <strong>Load .glb</strong>.
          </p>
          <p className="scan-hint">
            To make it the default, save the file to{" "}
            <code>public/models/scan.glb</code>.
          </p>
        </div>
      )}

      {loadState.status === "error" && (
        <div className="scan-overlay scan-error">
          <h2>Couldn’t load that</h2>
          <p>{loadState.message}</p>
        </div>
      )}

      {dragOver && <div className="scan-dropzone">Drop .glb to load</div>}
    </main>
  );
}
