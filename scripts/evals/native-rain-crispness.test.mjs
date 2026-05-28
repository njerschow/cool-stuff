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

  assert.match(
    source,
    /float dropMask = clamp\(mask \+ splotchMask \* 0\.075, 0\.0, 1\.0\);/
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
  assert.match(source, /const size = 8 \+ Math\.random\(\) \* 17;/);
});

test("falling drops keep visible wet residue trails", async () => {
  const source = await rainWindowSource();
  const simulation = await readFile(
    path.join(root, "src/simulation/RaindropPaneSimulation.ts"),
    "utf8"
  );

  assert.match(source, /uniform sampler2D uResidueMap;/);
  assert.match(source, /vec4 residueMap = texture2D\(uResidueMap, uv\);/);
  assert.match(source, /vec4 dropletLayer = vec4\(/);
  assert.match(source, /max\(dropletMap\.a, residueMap\.a\)/);
  assert.match(source, /float trailVeil = smoothstep\(0\.38, 0\.78, compose\.a\)/);
  assert.match(source, /trailDistance: \[9, 16\],/);
  assert.match(source, /trailDropDensity: 0\.42,/);
  assert.match(source, /trailDropSize: \[0\.22, 0\.42\],/);
  assert.match(source, /trailSpread: 0\.98,/);
  assert.match(source, /float mistValue = texture2D\(uMistTex, uv\)\.r;/);
  assert.match(source, /float clearChannel = smoothstep\(0\.04, 0\.32, texture2D\(uClearChannelMap, uv\)\.r\);/);
  assert.match(source, /float mistAlpha = clamp\(mistValue \* \(0\.44 - clearChannel \* 0\.24\) \+ trailVeil \* 0\.13 - clearChannel \* 0\.02, 0\.0, 0\.66\);/);
  assert.match(source, /rainColor = mix\(rainColor, trailColor, trailVeil \* 0\.18\);/);
  assert.match(source, /vec3 clearChannelColor = mix\(background, sharpScene, 0\.82\) \+ glare \* 0\.23;/);
  assert.match(source, /rainColor = mix\(rainColor, clearChannelColor, clearChannel \* \(0\.44 \+ mistValue \* 0\.24\)\);/);
  assert.match(source, /float localOverlayOpacity = overlayOpacity \* \(1\.0 - clearReveal \* 0\.55\);/);
  assert.match(source, /uniform vec2 uClearTexelSize;/);
  assert.match(source, /uEraserSmooth: \{ value: new THREE\.Vector2\(0\.48, 0\.86\) \},/);
  assert.match(source, /uniform sampler2D uClearChannelMap;/);
  assert.match(source, /uniform sampler2D uTrailEraseMap;/);
  assert.match(source, /const trailEraseTarget = new THREE\.WebGLRenderTarget\(1, 1,/);
  assert.match(source, /const residueTarget = new THREE\.WebGLRenderTarget\(1, 1,/);
  assert.match(source, /const trailResidueFragmentShader = `/);
  assert.match(source, /fragmentShader: trailResidueFragmentShader,/);
  assert.match(source, /uResidueMap: \{ value: residueTarget\.texture \},/);
  assert.match(source, /const clearChannelTargetA = new THREE\.WebGLRenderTarget\(1, 1,/);
  assert.match(source, /const clearChannelTargetB = new THREE\.WebGLRenderTarget\(1, 1,/);
  assert.match(source, /const clearChannelHistoryMaterial = new THREE\.ShaderMaterial\(\{/);
  assert.match(source, /fragmentShader: clearChannelHistoryFragmentShader,/);
  assert.match(source, /let clearChannelReadTarget = clearChannelTargetA;/);
  assert.match(source, /let clearChannelWriteTarget = clearChannelTargetB;/);
  assert.match(source, /uTrailEraseMap: \{ value: trailEraseTarget\.texture \},/);
  assert.match(source, /uClearChannelMap: \{ value: clearChannelTargetA\.texture \},/);
  assert.match(source, /const updateTrailEraseMesh = \(\) => \{/);
  assert.match(source, /const updateClearChannelHistory = \(decayDelta: number\) => \{/);
  assert.match(source, /renderPostMaterial\(clearChannelHistoryMaterial, clearChannelWriteTarget\);/);
  assert.match(source, /renderer\.render\(trailEraseScene, dropCamera\);/);
  assert.match(source, /renderer\.setRenderTarget\(residueTarget\);/);
  assert.match(source, /trailEraseMesh\.material = trailResidueMaterial;/);
  assert.match(source, /updateClearChannelHistory\(delta\);/);
  assert.match(source, /const rainDelta =\n        nativeGlass && delta > 0 \? Math\.min\(delta \* 1\.65, 0\.05\) : 0;/);
  assert.match(source, /trailAlpha = max\(trailAlpha, sampleRainAlpha\(vec2\(0\.0, -px\.y \* 4\.5\), 0\.94\)\);/);
  assert.match(source, /mask = min\(mask \* 0\.86, 0\.86\);/);
  assert.match(source, /mistAddMaterial\.uniforms\.uAmount\.value = rainDelta \/ 5\.8;/);
  assert.match(source, /-decayDelta \/ 2\.9/);
  assert.doesNotMatch(source, /texture2D\(uClearChannelMap, vUv\)\.r \* 0\.98/);
  assert.match(simulation, /export type RenderTrail = \{/);
  assert.match(simulation, /type PaneTrail = RenderTrail & \{/);
  assert.match(simulation, /previousX: number;/);
  assert.match(simulation, /private readonly trails: PaneTrail\[\] = \[\];/);
  assert.match(simulation, /private addTrailSegment\(drop: PaneDrop\) \{/);
  assert.match(simulation, /this\.addTrailSegment\(drop\);/);
  assert.match(simulation, /private updateTrails\(delta: number\) \{/);
  assert.match(simulation, /get renderTrails\(\): RenderTrail\[\] \{/);
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
  assert.match(source, /rainColor \+= glare \* \(0\.46 \+ mask \* 0\.28 \+ trailVeil \* 0\.12\);/);
});
