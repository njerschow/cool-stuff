// Builds derived variants of the Scaniverse capture for the Scan Viewer demo.
//
//   node scripts/build-scan-variants.mjs
//
// Texture-resolution variants are produced with the gltf-transform CLI:
//   npx @gltf-transform/cli resize public/models/scan.glb public/models/scan-4k.glb --width 4096 --height 4096
//   npx @gltf-transform/cli resize public/models/scan.glb public/models/scan-2k.glb --width 2048 --height 2048
//
// This script bakes the "extended ground" plane (approach B) directly into the
// GLB so it travels with the file in any glTF viewer / AR.

import { Document, NodeIO } from "@gltf-transform/core";

const SRC = "public/models/scan.glb";
const OUT = "public/models/scan-ground.glb";

// From `gltf-transform inspect`: bbox min Y (= floor height) ≈ 0.07085, the
// capture is Y-up and centered near the XZ origin. Plane sits just under that.
const FLOOR_Y = 0.0705;
const HALF = 1.5; // 3m × 3m plane — ~9× the ~0.33m model footprint.

const io = new NodeIO();
const doc = await io.read(SRC);
const root = doc.getRoot();
const scene = root.listScenes()[0];
const buffer = root.listBuffers()[0] ?? doc.createBuffer();

const positions = doc
  .createAccessor("ground-position")
  .setType("VEC3")
  .setArray(
    new Float32Array([
      -HALF, FLOOR_Y, -HALF,
      HALF, FLOOR_Y, -HALF,
      HALF, FLOOR_Y, HALF,
      -HALF, FLOOR_Y, HALF,
    ])
  )
  .setBuffer(buffer);

const normals = doc
  .createAccessor("ground-normal")
  .setType("VEC3")
  .setArray(
    new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0])
  )
  .setBuffer(buffer);

const indices = doc
  .createAccessor("ground-index")
  .setType("SCALAR")
  .setArray(new Uint32Array([0, 1, 2, 0, 2, 3]))
  .setBuffer(buffer);

// Neutral stone tone. The live viewer's "Flat" mode samples the capture's real
// floor color; here we bake a fixed, close-enough match for portability.
const material = doc
  .createMaterial("ground-extension")
  .setBaseColorFactor([0.34, 0.33, 0.31, 1])
  .setRoughnessFactor(0.95)
  .setMetallicFactor(0)
  .setDoubleSided(true);

const prim = doc
  .createPrimitive()
  .setAttribute("POSITION", positions)
  .setAttribute("NORMAL", normals)
  .setIndices(indices)
  .setMaterial(material);

const mesh = doc.createMesh("ground-extension").addPrimitive(prim);
const node = doc.createNode("ground-extension").setMesh(mesh);
scene.addChild(node);

await io.write(OUT, doc);
console.log(`Wrote ${OUT} (baked ground plane ${HALF * 2}m²).`);
