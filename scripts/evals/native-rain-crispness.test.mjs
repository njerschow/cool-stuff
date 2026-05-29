import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

async function rainWindowSource() {
  return readFile(path.join(root, "src/components/RainWindow.tsx"), "utf8");
}

test("native raindrops keep the original RaindropFX hard-mask threshold", async () => {
  const source = await rainWindowSource();

  assert.match(source, /float mask = smoothstep\(0\.96, 0\.99, compose\.a\);/);
  assert.doesNotMatch(source, /float dropMask = clamp\(mask \* 0\.[0-9]+/);
});

test("native raindrops use a full-strength drop mask with only faint splotch haze", async () => {
  const source = await rainWindowSource();

  assert.match(source, /float trailWater = trailVeil \* \(1\.0 - mask\);/);
  assert.match(
    source,
    /float dropMask = clamp\(mask \+ splotchMask \* 0\.075 \+ trailWater \* 0\.18, 0\.0, 1\.0\);/
  );
  assert.match(source, /float lensContrast = 1\.32 \+ mask \* 0\.28 \+ splotchMask \* 0\.16;/);
  assert.match(
    source,
    /dropColor = baseColor \+ \(dropColor - baseColor\) \* lensContrast;/
  );
  assert.match(source, /dropColor \+= vec3\(\(lambert - 0\.8\) \* 0\.2\);/);
});

test("raindrop normal texture is not mipmap-softened", async () => {
  const source = await rainWindowSource();

  assert.match(source, /raindropTexture\.generateMipmaps = false;/);
  assert.match(source, /raindropTexture\.minFilter = THREE\.LinearFilter;/);
});

test("native raindrops render slightly larger water lenses", async () => {
  const source = await rainWindowSource();

  assert.match(source, /spawnSize: \[39, 86\],/);
  assert.match(source, /uSizeRange: \{ value: new THREE\.Vector2\(8, 25\) \},/);
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
  assert.match(source, /vec4 compose = vec4\(\n    raindrop\.rgb \+ dropletMap\.rgb - vec3\(2\.0\) \* raindrop\.rgb \* dropletMap\.rgb,\n    max\(dropletMap\.a, raindrop\.a\)\n  \);/);
  assert.match(source, /float trailVeil = smoothstep\(0\.38, 0\.78, compose\.a\)/);
  assert.match(source, /trailDistance: \[9, 16\],/);
  assert.match(source, /trailDropDensity: 0\.2,/);
  assert.match(source, /trailDropSize: \[0\.28, 0\.48\],/);
  assert.match(source, /trailSpread: 0\.9,/);
  assert.match(source, /float mistValue = texture2D\(uMistTex, uv\)\.r;/);
  assert.match(source, /float wetMistRelief = clamp\(trailWater \* 0\.025 \+ splotchMask \* 0\.1 \+ mask \* 0\.08, 0\.0, 0\.16\);/);
  assert.match(source, /float mistAlpha = clamp\(mistValue \* \(0\.76 - wetMistRelief\), 0\.0, 0\.82\);/);
  assert.match(source, /vec3 trailColor = mix\(baseColor, dropColor, 0\.36\) \* \(1\.0 - trailWater \* 0\.14\);/);
  assert.match(source, /rainColor = mix\(rainColor, trailColor, trailWater \* 0\.3\);/);
  assert.match(source, /float localOverlayOpacity = overlayOpacity;/);
  assert.match(source, /const trailDropFragmentShader = `/);
  assert.match(source, /float beadWater = \(0\.58 \+ 0\.42 \* beadPhase\) \* centerWater;/);
  assert.match(source, /float wetFilm = edgeFalloff \* 0\.14 \+ beadWater \* 0\.62;/);
  assert.match(source, /float alpha = clamp\(wetFilm \* taper \* fade \* \(0\.44 \+ vStrength \* 0\.2\), 0\.0, 0\.58\);/);
  assert.match(source, /fragmentShader: trailDropFragmentShader,/);
  assert.match(source, /const updateTrailEraseMesh = \(\) => \{/);
  assert.match(source, /const trails = paneSimulation\.renderTrails;/);
  assert.match(source, /renderer\.setRenderTarget\(raindropTarget\);\n      renderer\.setClearColor\(0x000000, 0\);\n      renderer\.clear\(true, true, true\);[\s\S]+renderer\.render\(trailEraseScene, dropCamera\);[\s\S]+renderer\.render\(dropScene, dropCamera\);/);
  assert.match(source, /initialFillRatio: 0,/);
  assert.match(source, /let raindropTextureReady = false;/);
  assert.match(source, /raindropTextureReady = true;/);
  assert.match(source, /const rainDelta =\n        nativeGlass && raindropTextureReady && delta > 0\n          \? Math\.min\(delta \* 1\.65, 0\.05\)\n          : 0;/);
  assert.match(source, /const mistTarget = new THREE\.WebGLRenderTarget\(1, 1, \{\n      depthBuffer: false,\n      stencilBuffer: false,\n      type: THREE\.HalfFloatType,/);
  assert.match(source, /uEraserSmooth: \{ value: new THREE\.Vector2\(0\.93, 1\) \},/);
  assert.match(source, /float mask = smoothstep\(uEraserSmooth\.x, uEraserSmooth\.y, texture2D\(uRainMap, vUv\)\.a\);/);
  assert.match(source, /float fade = smoothstep\(0\.02, 0\.32, vStrength\);/);
  assert.match(source, /renderer\.setClearColor\(0x858585, 0\.52\);/);
  assert.match(source, /mistAddMaterial\.uniforms\.uAmount\.value = rainDelta \/ 16\.5;/);
  assert.match(source, /if \(rainDelta > 0\) \{\n        mistQuad\.material = mistEraseMaterial;/);
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
  assert.match(simulation, /const width = clamp\(drop\.sizeX \* 0\.09, 3, 10\);/);
  assert.match(simulation, /const length = distance \+ clamp\(drop\.sizeY \* 0\.36, 10, 30\);/);
  assert.match(simulation, /lifespan: rand\(0\.45, 1\.05\),/);
  assert.match(simulation, /width: clamp\(drop\.sizeX \* 0\.09, 3, 10\),/);
  assert.match(simulation, /drop\.previousX = drop\.x;/);
});

test("native glass mixes realtime background glare into the pane", async () => {
  const source = await rainWindowSource();

  assert.match(source, /uniform sampler2D uGlare;/);
  assert.match(source, /uGlare: \{ value: glareTargetA\.texture \},/);
  assert.match(source, /const renderGlare = \(\) => \{/);
  assert.match(source, /const glareWidth = Math\.max\(1, Math\.floor\(targetWidth \* 0\.52\)\);/);
  assert.match(source, /renderPostMaterial\(glareExtractMaterial, glareTargetB\);/);
  assert.match(source, /renderBlur\(glareTargetB, 3, glareTargetA\);/);
  assert.doesNotMatch(source, /glareBlurMaterial\.uniforms\.uRadius\.value = 5\.8;/);
  assert.doesNotMatch(source, /glareBlurMaterial\.uniforms\.uRadius\.value = 7\.6;/);
  assert.match(source, /renderGlare\(\);\n      copyToGlassTarget\(\);/);
  assert.match(source, /float brightMask = smoothstep\(0\.28, 0\.98, luma\);/);
  assert.match(source, /rainColor \+= glare \* \(0\.46 \+ mask \* 0\.28 \+ trailWater \* 0\.06\);/);
});

test("microdroplets spawn through a capped budget instead of flashing in large batches", async () => {
  const source = await rainWindowSource();

  assert.match(source, /let microdropSpawnBudget = 0;/);
  assert.match(source, /vertexShader: proceduralMicrodropletVertexShader,/);
  assert.match(source, /uSeed: \{ value: 1 \},/);
  assert.match(source, /uSpawnRect: \{ value: new THREE\.Vector4\(0, 0, 1, 1\) \},/);
  assert.match(source, /microdropSpawnBudget = Math\.min\(\n        maxMicrodropInstances,\n        microdropSpawnBudget \+ 260 \* rainDelta\n      \);/);
  assert.match(source, /const count = Math\.min\(7, Math\.floor\(microdropSpawnBudget\)\);/);
  assert.match(source, /microdropSpawnBudget -= count;/);
  assert.match(source, /microdropMaterial\.uniforms\.uSeed\.value = Math\.random\(\) \* 133;/);
  assert.match(source, /microdropSpawnBudget = 0;\n      microdropMesh\.count = 0;/);
  assert.doesNotMatch(source, /Math\.floor\(620 \* rainDelta\)/);
  assert.doesNotMatch(source, /microdropMesh\.setMatrixAt\(index, dropMatrix\);/);
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
