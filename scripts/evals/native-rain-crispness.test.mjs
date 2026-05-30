import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

async function rainWindowSource() {
  return readFile(path.join(root, "src/components/RainWindow.tsx"), "utf8");
}

test("native raindrops keep the RaindropFX hard-mask threshold", async () => {
  const source = await rainWindowSource();

  assert.match(source, /float mask = smoothstep\(0\.96, 0\.99, compose\.a\);/);
  assert.doesNotMatch(source, /float dropMask = clamp\(mask \* 0\.[0-9]+/);
});

test("native drop shader mirrors the RaindropFX transparent refractive pass", async () => {
  const source = await rainWindowSource();

  assert.match(source, /uniform sampler2D uBackground;/);
  assert.match(
    source,
    /vec4 compose = vec4\(\n    raindrop\.rgb \+ dropletMap\.rgb - vec3\(2\.0\) \* raindrop\.rgb \* dropletMap\.rgb,\n    max\(dropletMap\.a, raindrop\.a\)\n  \);/
  );
  assert.match(
    source,
    /vec2 refractUv = vUv - \(compose\.xy - vec2\(0\.5\)\) \* vec2\(compose\.b \* 0\.6 \+ 0\.4\);/
  );
  assert.match(source, /vec3 lightDir = vec3\(-1\.0, 1\.0, 2\.0\) - 0\.0 \* vec3\(vUv\.xy, 0\.0\);/);
  assert.match(source, /color\.rgb \+= vec3\(\(lambert - 0\.8\) \* 0\.2\);/);
  assert.match(source, /gl_FragColor = vec4\(color\.rgb, mask \* overlayOpacity\);/);
  assert.doesNotMatch(source, /trailMask/);
  assert.doesNotMatch(source, /coreMask/);
  assert.match(source, /blending: THREE\.NormalBlending,[\s\S]+fragmentShader: glassFragmentShader,[\s\S]+transparent: true,/);
  assert.doesNotMatch(source, /vec3 color = mix\(sceneColor, rainColor/);
  assert.doesNotMatch(source, /deepenPaneBase/);
});

test("native compositor draws RaindropFX layers instead of one opaque pane", async () => {
  const source = await rainWindowSource();

  assert.match(source, /const mistComposeFragmentShader = `/);
  assert.match(source, /color\.rgb \+= vec3\(0\.01\);/);
  assert.match(source, /color\.a = texture2D\(uMistTex, vUv\)\.r \* overlayOpacity \* 0\.08;/);
  assert.match(source, /const mistComposeMaterial = new THREE\.ShaderMaterial\(\{/);
  assert.match(source, /copyToGlassTarget\(\);\n      renderBlur\(frostTargetB, 3, frostTargetA\);\n      renderBlur\(frostTargetB, 4, mistBackgroundTargetA\);/);
  assert.match(
    source,
    /copyMaterial\.uniforms\.uImage\.value = frostTargetA\.texture;\n      renderPostMaterial\(copyMaterial, null\);\n      renderPostMaterial\(mistComposeMaterial, null\);\n      renderer\.render\(screenScene, screenCamera\);/
  );
  assert.match(source, /renderer\.clear\(true, true, true\);\n      const previousCanvasAutoClear = renderer\.autoClear;/);
  assert.doesNotMatch(source, /renderGlare\(\);\n      copyToGlassTarget\(\);/);
});

test("raindrop normal texture is not mipmap-softened", async () => {
  const source = await rainWindowSource();

  assert.match(source, /raindropTexture\.generateMipmaps = false;/);
  assert.match(source, /raindropTexture\.minFilter = THREE\.LinearFilter;/);
});

test("native raindrops render slightly larger water lenses", async () => {
  const source = await rainWindowSource();

  assert.match(source, /spawnSize: \[60, 100\],/);
  assert.match(source, /const proceduralMicrodropletVertexShader = `/);
  assert.match(source, /attribute float aDropId;/);
  assert.match(source, /uniform vec4 uSpawnRect;/);
  assert.match(source, /uniform vec2 uSizeRange;/);
  assert.match(source, /uniform float uSeed;/);
  assert.match(source, /vertexShader: proceduralMicrodropletVertexShader,/);
  assert.match(source, /microdropMaterial\.uniforms\.uSpawnRect\.value\.set\(/);
  assert.match(source, /microdropMaterial\.uniforms\.uSizeRange\.value\.set\(10, 30\);/);
  assert.match(source, /microdropMaterial\.uniforms\.uSeed\.value = Math\.random\(\) \* 133;/);
  assert.doesNotMatch(source, /const size = 10 \+ Math\.random\(\) \* 20;/);
});

test("falling streaks use the RaindropFX mist-erasure loop", async () => {
  const source = await rainWindowSource();
  const simulation = await readFile(
    path.join(root, "src/simulation/RaindropPaneSimulation.ts"),
    "utf8"
  );

  assert.doesNotMatch(source, /uniform sampler2D uResidueMap;/);
  assert.doesNotMatch(source, /uniform sampler2D uClearChannelMap;/);
  assert.doesNotMatch(source, /const residueTarget = new THREE\.WebGLRenderTarget/);
  assert.doesNotMatch(source, /const trailEraseTarget = new THREE\.WebGLRenderTarget/);
  assert.doesNotMatch(source, /const clearChannelTargetA = new THREE\.WebGLRenderTarget/);
  assert.doesNotMatch(source, /clearChannelHistoryFragmentShader/);
  assert.match(source, /initialFillRatio: 0,/);
  assert.match(source, /initialSpread: 0\.5,/);
  assert.match(source, /trailDistance: \[20, 30\],/);
  assert.match(source, /trailDropDensity: 0\.2,/);
  assert.match(source, /trailDropSize: \[0\.3, 0\.5\],/);
  assert.match(source, /trailSpread: 0\.6,/);
  assert.match(source, /velocitySpread: 0\.3,/);
  assert.match(source, /dropScale\.set\(drop\.sizeX, drop\.sizeY, 1\);/);
  assert.doesNotMatch(source, /const trailEraseMapFragmentShader = `/);
  assert.doesNotMatch(source, /fragmentShader: trailEraseMapFragmentShader,/);
  assert.doesNotMatch(source, /const updateTrailEraseMesh = /);
  assert.doesNotMatch(source, /renderer\.render\(trailEraseScene, dropCamera\);/);
  assert.match(source, /renderer\.setRenderTarget\(raindropTarget\);\n      renderer\.setClearColor\(0x000000, 0\);\n      renderer\.clear\(true, true, true\);[\s\S]+renderer\.render\(dropScene, dropCamera\);/);
  assert.match(source, /const RAINDROP_FX_FRAME_DELTA = 0\.03;/);
  assert.match(source, /const rainDelta = nativeGlass && !paused \? RAINDROP_FX_FRAME_DELTA : 0;/);
  assert.match(source, /paneSimulation\.update\(rainDelta, rainTotalTime\);/);
  assert.match(source, /const mistTarget = new THREE\.WebGLRenderTarget\(1, 1, \{\n      depthBuffer: false,\n      stencilBuffer: false,\n      type: THREE\.HalfFloatType,/);
  assert.match(source, /uEraserSmooth: \{ value: new THREE\.Vector2\(0\.93, 1\) \},/);
  assert.match(source, /uEraseStrength: \{ value: 1 \},/);
  assert.match(source, /float mask = smoothstep\(uEraserSmooth\.x, uEraserSmooth\.y, texture2D\(uRainMap, vUv\)\.a\);/);
  assert.match(source, /gl_FragColor = vec4\(0\.0, 0\.0, 0\.0, mask \* uEraseStrength\);/);
  assert.match(source, /renderer\.setClearColor\(0x000000, 0\);/);
  assert.doesNotMatch(source, /nativeRainResponse/);
  assert.match(source, /mistAddMaterial\.uniforms\.uAmount\.value = rainDelta \/ 16\.5;/);
  assert.doesNotMatch(source, /mistEraseMaterial\.uniforms\.uEraseStrength\.value = 0;/);
  assert.match(source, /mistEraseMaterial\.uniforms\.uRainMap\.value = raindropTarget\.texture;/);
  assert.match(source, /mistEraseMaterial\.uniforms\.uEraserSmooth\.value\.set\(0\.93, 1\);/);
  assert.match(source, /mistEraseMaterial\.uniforms\.uEraseStrength\.value = 1;/);
  assert.doesNotMatch(source, /texture2D\(uTrailEraseMap/);
  assert.doesNotMatch(source, /clearChannelColor/);
  assert.match(simulation, /export type RenderTrail = \{/);
  assert.match(simulation, /type PaneTrail = RenderTrail & \{/);
  assert.match(simulation, /previousX: number;/);
  assert.match(simulation, /private readonly trails: PaneTrail\[\] = \[\];/);
  assert.match(simulation, /private addTrailSegment\(drop: PaneDrop\) \{/);
  assert.match(simulation, /this\.addTrailSegment\(drop\);/);
  assert.match(simulation, /private updateTrails\(delta: number\) \{/);
  assert.match(simulation, /get renderTrails\(\): RenderTrail\[\] \{/);
  assert.match(simulation, /get activeRenderTrails\(\): RenderTrail\[\] \{/);
  assert.match(simulation, /private getMovingTrails\(\): RenderTrail\[\] \{/);
  assert.match(simulation, /drop\.previousX = drop\.x;/);
  assert.match(simulation, /update\(delta: number, totalTime = this\.time \+ delta\)/);
  assert.match(simulation, /if \(drop\.nextMotionTime <= totalTime\) \{/);
});

test("street cars keep head and tail lights on the correct local ends", async () => {
  const source = await rainWindowSource();

  assert.match(source, /const lightMat = new THREE\.MeshBasicMaterial\(\{\n    color: 0xf8fbff,/);
  assert.match(source, /const reflectionMat = new THREE\.MeshBasicMaterial\(\{\n    blending: THREE\.AdditiveBlending,\n    color: 0xf6fbff,/);
  assert.match(source, /const tailReflectionMat = new THREE\.MeshBasicMaterial\(\{\n    blending: THREE\.AdditiveBlending,\n    color: 0xff2636,/);
  assert.match(source, /head\.position\.set\(1\.08, 0\.42, z\);/);
  assert.match(source, /reflection\.position\.set\(1\.64, 0\.028, z\);/);
  assert.match(source, /tail\.position\.set\(-1\.08, 0\.42, z\);/);
  assert.match(source, /tailReflection\.position\.set\(-1\.42, 0\.03, z\);/);
  assert.match(source, /group\.rotation\.y = config\.direction === 1 \? -Math\.PI \/ 2 : Math\.PI \/ 2;/);
  assert.doesNotMatch(source, /head\.position\.set\(config\.direction \*/);
  assert.doesNotMatch(source, /tail\.position\.set\(config\.direction \*/);
});
