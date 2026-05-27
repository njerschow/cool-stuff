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

  assert.match(source, /const MIST_INITIAL_FILL = 0\.68;/);
  assert.match(source, /const MIST_ALPHA_SCALE = 0\.34;/);
  assert.match(source, /const MIST_TRAIL_VEIL = 0\.02;/);
  assert.match(source, /const MIST_ACCUMULATION_DIVISOR = 10\.5;/);
  assert.match(source, /float trailVeil = smoothstep\(0\.56, 0\.9, compose\.a\)/);
  assert.match(source, /trailDistance: \[13, 22\],/);
  assert.match(source, /trailDropDensity: 0\.34,/);
  assert.match(source, /trailDropSize: \[0\.18, 0\.34\],/);
  assert.match(source, /trailSpread: 0\.78,/);
  assert.match(source, /texture2D\(uMistTex, uv\)\.r \* \$\{MIST_ALPHA_SCALE\.toFixed\(2\)\}/);
  assert.match(source, /trailVeil \* \$\{MIST_TRAIL_VEIL\.toFixed\(2\)\}/);
  assert.match(source, /rainColor = mix\(rainColor, trailColor, trailVeil \* 0\.18\);/);
  assert.match(source, /uniform vec2 uClearTexelSize;/);
  assert.match(source, /uEraserSmooth: \{ value: new THREE\.Vector2\(0\.4, 0\.78\) \},/);
  assert.match(source, /trailAlpha = max\(trailAlpha, sampleRainAlpha\(vec2\(0\.0, -px\.y \* 9\.0\), 0\.76\)\);/);
  assert.match(source, /mask = min\(mask \* 1\.55, 1\.0\);/);
  assert.match(source, /new THREE\.Color\(\s*MIST_INITIAL_FILL,\s*MIST_INITIAL_FILL,\s*MIST_INITIAL_FILL\s*\)/);
  assert.match(source, /renderer\.setClearColor\(mistSeedColor, MIST_INITIAL_FILL\);/);
  assert.match(source, /mistAddMaterial\.uniforms\.uAmount\.value = rainDelta \/ MIST_ACCUMULATION_DIVISOR;/);
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
