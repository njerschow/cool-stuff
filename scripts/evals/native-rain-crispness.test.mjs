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

  assert.match(source, /float trailVeil = smoothstep\(0\.56, 0\.9, compose\.a\)/);
  assert.match(source, /trailDistance: \[13, 22\],/);
  assert.match(source, /trailDropDensity: 0\.34,/);
  assert.match(source, /trailDropSize: \[0\.18, 0\.34\],/);
  assert.match(source, /trailSpread: 0\.78,/);
  assert.match(source, /mistAddMaterial\.uniforms\.uAmount\.value = rainDelta \/ 7\.5;/);
});

test("native glass mixes realtime background glare into the pane", async () => {
  const source = await rainWindowSource();

  assert.match(source, /uniform sampler2D uGlare;/);
  assert.match(source, /uGlare: \{ value: glareTargetA\.texture \},/);
  assert.match(source, /const renderGlare = \(\) => \{/);
  assert.match(source, /renderGlare\(\);\n      copyToGlassTarget\(\);/);
  assert.match(source, /float brightMask = smoothstep\(0\.28, 0\.98, luma\);/);
  assert.match(source, /rainColor \+= glare \* \(0\.46 \+ mask \* 0\.28 \+ trailVeil \* 0\.12\);/);
});
