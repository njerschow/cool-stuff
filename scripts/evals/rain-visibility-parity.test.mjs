import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

async function importRainVisibilityModule() {
  const source = await readFile(
    path.join(root, "src/rainVisibility.ts"),
    "utf8"
  );
  const tsModule = await import("typescript");
  const ts = tsModule.default ?? tsModule;
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2020,
      target: ts.ScriptTarget.ES2020,
    },
  });
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(
    transpiled.outputText
  ).toString("base64")}`;
  return import(moduleUrl);
}

function almostEqual(actual, expected, message) {
  assert.ok(
    Math.abs(actual - expected) < 1e-10,
    `${message}: expected ${expected}, received ${actual}`
  );
}

const rainVisibility = await importRainVisibilityModule();

test("rain visibility slider keeps the RaindropFX domain contract", () => {
  assert.deepEqual(rainVisibility.RAIN_VISIBILITY_SLIDER, {
    defaultValue: 1.45,
    max: 2.4,
    min: 0.35,
    step: 0.05,
  });
  almostEqual(rainVisibility.RAIN_VISIBILITY_RANGE, 2.05, "range");
});

test("rain visibility normalization clamps to the slider range", () => {
  almostEqual(rainVisibility.normalizeRainVisibility(0.35), 0, "min");
  almostEqual(rainVisibility.normalizeRainVisibility(2.4), 1, "max");
  almostEqual(
    rainVisibility.normalizeRainVisibility(1.45),
    0.5365853658536586,
    "default"
  );
  almostEqual(rainVisibility.normalizeRainVisibility(-1), 0, "below min");
  almostEqual(rainVisibility.normalizeRainVisibility(8), 1, "above max");
});

test("snapshot and native glass use the same finished-overlay opacity curve", () => {
  const { max, min, step } = rainVisibility.RAIN_VISIBILITY_SLIDER;
  const expectedSlope =
    rainVisibility.RAIN_VISIBILITY_SNAPSHOT_OVERLAY.scale /
    rainVisibility.RAIN_VISIBILITY_RANGE;

  almostEqual(
    rainVisibility.getSnapshotRainOverlayOpacity(min),
    0.72,
    "snapshot min opacity"
  );
  almostEqual(
    rainVisibility.getSnapshotRainOverlayOpacity(max),
    1,
    "snapshot max opacity"
  );
  almostEqual(
    rainVisibility.getSnapshotRainOverlayOpacity(1.45),
    0.8702439024390244,
    "snapshot default opacity"
  );

  for (let value = min; value <= max + 1e-9; value += step) {
    const snapshotOpacity =
      rainVisibility.getSnapshotRainOverlayOpacity(value);
    const nativeOpacity = rainVisibility.getNativeGlassOverlayOpacity(value);
    almostEqual(
      nativeOpacity,
      snapshotOpacity,
      `native opacity matches snapshot at ${value.toFixed(2)}`
    );

    if (value + step <= max + 1e-9) {
      const delta =
        rainVisibility.getSnapshotRainOverlayOpacity(value + step) -
        snapshotOpacity;
      almostEqual(delta / step, expectedSlope, `opacity slope at ${value}`);
    }
  }
});

test("components share the slider constants instead of drifting locally", async () => {
  const appSource = await readFile(path.join(root, "src/App.tsx"), "utf8");
  assert.match(appSource, /RAIN_VISIBILITY_SLIDER\.defaultValue/);
  assert.match(appSource, /max=\{RAIN_VISIBILITY_SLIDER\.max\}/);
  assert.match(appSource, /min=\{RAIN_VISIBILITY_SLIDER\.min\}/);
  assert.match(appSource, /step=\{RAIN_VISIBILITY_SLIDER\.step\}/);

  const overlaySource = await readFile(
    path.join(root, "src/components/OriginalRaindropDemo.tsx"),
    "utf8"
  );
  assert.match(overlaySource, /getSnapshotRainOverlayOpacity/);
  assert.match(overlaySource, /getBlendRainOverlayOpacity/);
  assert.match(overlaySource, /getBlendRainDropOpacity/);
});

test("main street experience uses the same-context native glass path", async () => {
  const appSource = await readFile(path.join(root, "src/App.tsx"), "utf8");

  assert.match(appSource, /<RainWindow\n            backgroundMode=\{backgroundMode\}\n            nativeGlass\n            paused=\{paused\}/);
  assert.doesNotMatch(appSource, /sourceSelector="\.street-canvas"/);
  assert.doesNotMatch(appSource, /<RealtimeGlareOverlay/);
});

test("native shader exposes the same overlay curve as uniforms", async () => {
  const source = await readFile(
    path.join(root, "src/components/RainWindow.tsx"),
    "utf8"
  );

  assert.match(source, /uniform float uRainVisibilityMin;/);
  assert.match(source, /uniform float uRainVisibilityRange;/);
  assert.match(source, /uniform float uRainOverlayOpacityBase;/);
  assert.match(source, /uniform float uRainOverlayOpacityScale;/);
  assert.match(
    source,
    /float overlayOpacity = uRainOverlayOpacityBase \+ normalizedVisibility \* uRainOverlayOpacityScale;/
  );
  assert.match(
    source,
    /gl_FragColor = vec4\(color\.rgb, mask \* overlayOpacity\);/
  );
  assert.match(source, /color\.a = texture2D\(uMistTex, vUv\)\.r \* overlayOpacity \* 0\.08;/);
  assert.doesNotMatch(source, /normalizeRainVisibility\(visibleRain\)/);
  assert.doesNotMatch(source, /microdropRate:/);
  assert.doesNotMatch(source, /mistRecoveryRate:/);
  assert.doesNotMatch(source, /trailEraseStrength:/);
  assert.doesNotMatch(source, /visibilityGain/);
  assert.doesNotMatch(source, /0\.72 \+ normalizedVisibility \* 0\.22/);
  assert.doesNotMatch(source, /overlayOpacity \* mix\(1\.0, 0\.82, mask\)/);
});
