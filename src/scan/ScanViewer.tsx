import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

type TextureRes = "8k" | "4k" | "2k";
type Ground = "off" | "flat" | "tiled" | "baked";

const TEXTURE_URL: Record<TextureRes, string> = {
  "8k": "/models/scan.glb",
  "4k": "/models/scan-4k.glb",
  "2k": "/models/scan-2k.glb",
};
const BAKED_URL = "/models/scan-ground.glb";

type LoadState =
  | { status: "idle" }
  | { status: "loading"; label: string }
  | { status: "ready"; label: string; stats: ModelStats }
  | { status: "empty" }
  | { status: "error"; message: string };

type ModelStats = { meshes: number; triangles: number; sizeLabel: string };

/** Sampled floor data used to build the extended-ground planes. */
type FloorSample = { color: THREE.Color; tile: THREE.Texture | null };

type Engine = {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  grid: THREE.GridHelper;
  loader: GLTFLoader;
  fadeAlpha: THREE.Texture;
  current: THREE.Object3D | null;
  groundMesh: THREE.Mesh | null;
  sample: FloorSample | null;
  floorY: number;
  modelSize: number;
  frameId: number;
};

const formatThousands = (v: number) => v.toLocaleString("en-US");
const isGround = (o: THREE.Object3D) => o.name.toLowerCase().includes("ground");

/** Bounding box of the capture only, excluding any ground geometry. */
function modelBox(object: THREE.Object3D): THREE.Box3 {
  const box = new THREE.Box3();
  object.traverse((child) => {
    if ((child as THREE.Mesh).isMesh && !isGround(child)) {
      box.expandByObject(child);
    }
  });
  return box;
}

/** Radial white→transparent alpha so the big plane fades out at its edges. */
function makeFadeAlpha(): THREE.Texture {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createRadialGradient(
    size / 2,
    size / 2,
    size * 0.05,
    size / 2,
    size / 2,
    size / 2
  );
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.55, "rgba(255,255,255,1)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.NoColorSpace;
  return tex;
}

/**
 * Pulls a small floor patch from the capture's texture atlas by sampling near
 * the disc rim (the outermost vertices, which are floor — the model sits
 * inside the disc). Returns a tileable texture + its average colour.
 */
function sampleFloor(object: THREE.Object3D): FloorSample {
  let mesh: THREE.Mesh | null = null;
  object.traverse((child) => {
    const m = child as THREE.Mesh;
    if (!mesh && m.isMesh && !isGround(m) && m.geometry) mesh = m;
  });
  const fallback: FloorSample = {
    color: new THREE.Color(0x575450),
    tile: null,
  };
  if (!mesh) return fallback;

  const geometry = (mesh as THREE.Mesh).geometry;
  const material = (mesh as THREE.Mesh).material as THREE.MeshStandardMaterial;
  const pos = geometry.getAttribute("position");
  const uv = geometry.getAttribute("uv");
  const image = material?.map?.image as
    | HTMLImageElement
    | ImageBitmap
    | undefined;
  if (!pos || !uv || !image) return fallback;

  geometry.computeBoundingBox();
  const bb = geometry.boundingBox!;
  const cx = (bb.min.x + bb.max.x) / 2;
  const cz = (bb.min.z + bb.max.z) / 2;

  let maxR = 0;
  for (let i = 0; i < pos.count; i++) {
    const dx = pos.getX(i) - cx;
    const dz = pos.getZ(i) - cz;
    const r = Math.hypot(dx, dz);
    if (r > maxR) maxR = r;
  }

  // Average UV of the rim band (outer 8% of radius) — reliably floor.
  let u = 0;
  let v = 0;
  let n = 0;
  const threshold = maxR * 0.92;
  for (let i = 0; i < pos.count; i++) {
    const dx = pos.getX(i) - cx;
    const dz = pos.getZ(i) - cz;
    if (Math.hypot(dx, dz) >= threshold) {
      u += uv.getX(i);
      v += uv.getY(i);
      n++;
    }
  }
  if (n === 0) return fallback;
  u /= n;
  v /= n;

  const iw = (image as { width: number }).width;
  const ih = (image as { height: number }).height;
  const patch = 96;
  // glTF V is flipped relative to canvas Y.
  const sx = Math.min(Math.max(u * iw - patch / 2, 0), iw - patch);
  const sy = Math.min(Math.max((1 - v) * ih - patch / 2, 0), ih - patch);

  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = patch;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(
    image as CanvasImageSource,
    sx,
    sy,
    patch,
    patch,
    0,
    0,
    patch,
    patch
  );

  const data = ctx.getImageData(0, 0, patch, patch).data;
  let r = 0;
  let g = 0;
  let b = 0;
  const px = patch * patch;
  for (let i = 0; i < data.length; i += 4) {
    r += data[i];
    g += data[i + 1];
    b += data[i + 2];
  }
  const color = new THREE.Color(
    (r / px / 255) ** 2.2,
    (g / px / 255) ** 2.2,
    (b / px / 255) ** 2.2
  );

  const tile = new THREE.CanvasTexture(canvas);
  tile.wrapS = tile.wrapT = THREE.MirroredRepeatWrapping;
  tile.colorSpace = THREE.SRGBColorSpace;

  return { color, tile };
}

function fitCamera(engine: Engine, object: THREE.Object3D) {
  const box = modelBox(object);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());

  object.position.sub(center);
  const moved = modelBox(object);
  const maxDim = Math.max(size.x, size.y, size.z) || 1;

  const fov = (engine.camera.fov * Math.PI) / 180;
  const distance = (maxDim / 2 / Math.tan(fov / 2)) * 1.6;
  engine.camera.near = maxDim / 100;
  engine.camera.far = maxDim * 200;
  engine.camera.position.set(distance * 0.8, distance * 0.6, distance);
  engine.camera.updateProjectionMatrix();

  engine.controls.target.set(0, 0, 0);
  engine.controls.maxDistance = distance * 6;
  engine.controls.update();

  engine.floorY = moved.min.y;
  engine.modelSize = maxDim;
  engine.grid.position.y = moved.min.y;
}

export function ScanViewer() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<Engine | null>(null);
  const groundRef = useRef<Ground>("off");
  const [loadState, setLoadState] = useState<LoadState>({ status: "idle" });
  const [textureRes, setTextureRes] = useState<TextureRes>("8k");
  const [ground, setGround] = useState<Ground>("off");
  const [autoRotate, setAutoRotate] = useState(true);
  const [wireframe, setWireframe] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  groundRef.current = ground;

  const applyWireframe = useCallback((on: boolean) => {
    const engine = engineRef.current;
    if (!engine?.current) return;
    engine.current.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (mesh.isMesh && !isGround(mesh)) {
        const mats = Array.isArray(mesh.material)
          ? mesh.material
          : [mesh.material];
        for (const m of mats) (m as THREE.MeshStandardMaterial).wireframe = on;
      }
    });
  }, []);

  const clearGround = useCallback(() => {
    const engine = engineRef.current;
    if (!engine?.groundMesh) return;
    engine.scene.remove(engine.groundMesh);
    engine.groundMesh.geometry.dispose();
    (engine.groundMesh.material as THREE.Material).dispose();
    engine.groundMesh = null;
  }, []);

  const applyGround = useCallback(
    (mode: Ground) => {
      const engine = engineRef.current;
      if (!engine) return;
      clearGround();
      // "baked" lives inside the GLB; "off" shows nothing extra.
      if (mode === "off" || mode === "baked" || !engine.sample) return;

      const span = Math.max(engine.modelSize * 14, 2);
      const geo = new THREE.PlaneGeometry(span, span);
      geo.rotateX(-Math.PI / 2);

      const material = new THREE.MeshStandardMaterial({
        roughness: 0.96,
        metalness: 0,
        transparent: true,
        alphaMap: engine.fadeAlpha,
        depthWrite: false,
      });
      if (mode === "flat") {
        material.color = engine.sample.color;
      } else if (mode === "tiled" && engine.sample.tile) {
        const tile = engine.sample.tile.clone();
        tile.needsUpdate = true;
        tile.wrapS = tile.wrapT = THREE.MirroredRepeatWrapping;
        const reps = Math.max(span / (engine.modelSize * 0.5), 4);
        tile.repeat.set(reps, reps);
        material.map = tile;
        material.color = new THREE.Color(0xffffff);
      } else {
        material.color = engine.sample.color;
      }

      const plane = new THREE.Mesh(geo, material);
      plane.name = "ground-scene";
      // Just under the disc floor so the real capture renders on top.
      plane.position.y = engine.floorY - engine.modelSize * 0.004;
      plane.renderOrder = -1;
      engine.scene.add(plane);
      engine.groundMesh = plane;
    },
    [clearGround]
  );

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
            const mats = Array.isArray(mesh.material)
              ? mesh.material
              : [mesh.material];
            for (const m of mats) m?.dispose();
          }
        });
      }
      clearGround();
      engine.scene.add(object);
      engine.current = object;
      fitCamera(engine, object);
      engine.sample = sampleFloor(object);
      applyWireframe(wireframe);
      applyGround(groundRef.current);

      let meshes = 0;
      let triangles = 0;
      object.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (mesh.isMesh && mesh.geometry && !isGround(mesh)) {
          meshes += 1;
          const idx = mesh.geometry.getIndex();
          const p = mesh.geometry.getAttribute("position");
          if (idx) triangles += idx.count / 3;
          else if (p) triangles += p.count / 3;
        }
      });
      setLoadState({
        status: "ready",
        label,
        stats: { meshes, triangles: Math.round(triangles), sizeLabel },
      });
    },
    [applyGround, applyWireframe, clearGround, wireframe]
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
      reader.onload = () =>
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
      reader.onerror = () =>
        setLoadState({
          status: "error",
          message: `Failed to read "${file.name}".`,
        });
      reader.readAsArrayBuffer(file);
    },
    [swapModel]
  );

  // Build the three.js engine once.
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0d0f14);

    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

    const camera = new THREE.PerspectiveCamera(
      45,
      mount.clientWidth / mount.clientHeight,
      0.01,
      1000
    );
    camera.position.set(0.3, 0.2, 0.4);

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
    (grid.material as THREE.Material).opacity = 0.4;
    scene.add(grid);

    const engine: Engine = {
      renderer,
      scene,
      camera,
      controls,
      grid,
      loader: new GLTFLoader(),
      fadeAlpha: makeFadeAlpha(),
      current: null,
      groundMesh: null,
      sample: null,
      floorY: 0,
      modelSize: 1,
      frameId: 0,
    };
    engineRef.current = engine;

    const animate = () => {
      engine.frameId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    const resize = () => {
      if (!mount.clientWidth || !mount.clientHeight) return;
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(mount);

    loadFromUrl(TEXTURE_URL["8k"], "scan.glb (8K)", { optional: true });

    return () => {
      cancelAnimationFrame(engine.frameId);
      observer.disconnect();
      controls.dispose();
      pmrem.dispose();
      renderer.dispose();
      if (renderer.domElement.parentElement === mount)
        mount.removeChild(renderer.domElement);
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reload when texture resolution or the baked/non-baked choice changes.
  useEffect(() => {
    if (!engineRef.current) return;
    if (ground === "baked") loadFromUrl(BAKED_URL, "scan-ground.glb (baked)");
    else
      loadFromUrl(
        TEXTURE_URL[textureRes],
        `scan.glb (${textureRes.toUpperCase()})`
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [textureRes, ground === "baked"]);

  // Toggle scene ground (off / flat / tiled) without a reload.
  useEffect(() => {
    if (ground !== "baked") applyGround(ground);
  }, [ground, applyGround]);

  useEffect(() => {
    const engine = engineRef.current;
    if (engine) engine.controls.autoRotate = autoRotate;
  }, [autoRotate]);

  useEffect(() => applyWireframe(wireframe), [wireframe, applyWireframe]);

  const resetView = useCallback(() => {
    const engine = engineRef.current;
    if (engine?.current) fitCamera(engine, engine.current);
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

      <div className="scan-panel">
        <label className="scan-field">
          <span>Ground</span>
          <select
            value={ground}
            onChange={(e) => setGround(e.target.value as Ground)}
          >
            <option value="off">Off — capture only</option>
            <option value="flat">A · Flat plane (color match)</option>
            <option value="tiled">C · Tiled real floor</option>
            <option value="baked">B · Baked into GLB</option>
          </select>
        </label>
        <label className="scan-field">
          <span>Texture</span>
          <select
            value={textureRes}
            disabled={ground === "baked"}
            onChange={(e) => setTextureRes(e.target.value as TextureRes)}
          >
            <option value="8k">8K · full (9 MB)</option>
            <option value="4k">4K · 4 MB</option>
            <option value="2k">2K · 3 MB</option>
          </select>
        </label>
      </div>

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
          <span>
            {loadState.stats.meshes} mesh
            {loadState.stats.meshes === 1 ? "" : "es"}
          </span>
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
            Export your Scaniverse capture as <code>GLB</code> and drop it here
            or use <strong>Load .glb</strong>.
          </p>
          <p className="scan-hint">
            Default path: <code>public/models/scan.glb</code>.
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
