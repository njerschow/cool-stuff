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

test("native rain variables are exposed through the tuning panel", async () => {
  const appSource = await readFile(path.join(root, "src/App.tsx"), "utf8");
  const tuningSource = await readFile(path.join(root, "src/rainTuning.ts"), "utf8");

  assert.match(appSource, /<RainTuningPanel/);
  assert.match(appSource, /RAIN_TUNING_CONTROLS/);
  assert.match(appSource, /className="tuning-help"/);
  assert.match(appSource, /title=\{control\.description\}/);
  assert.match(tuningSource, /export const DEFAULT_RAIN_TUNING: RainTuning = \{/);
  assert.match(tuningSource, /export const RAIN_TUNING_CONTROLS: RainTuningControl\[] = \[/);
  for (const key of [
    "rainFrameDelta",
    "rainMapScale",
    "backgroundGain",
    "backgroundLift",
    "rainMaskStart",
    "refractBase",
    "mistAlpha",
    "mistAddDivisor",
    "eraserStart",
    "microdropRate",
    "spawnLimit",
    "gravity",
    "trailDropDensity",
    "velocitySpread",
  ]) {
    assert.match(tuningSource, new RegExp(`${key}:`));
    assert.match(tuningSource, new RegExp(`key: "${key}"`));
  }
});

test("focused rain tuning workbench isolates categories and persists the active tune", async () => {
  const appSource = await readFile(path.join(root, "src/App.tsx"), "utf8");
  const tuningSource = await readFile(path.join(root, "src/rainTuning.ts"), "utf8");
  const overlaySource = await readFile(
    path.join(root, "src/components/OriginalRaindropDemo.tsx"),
    "utf8"
  );
  const vercelSource = await readFile(path.join(root, "vercel.json"), "utf8");

  assert.match(appSource, /window\.location\.pathname === "\/tune\/rain"/);
  assert.match(appSource, /new URLSearchParams\(window\.location\.search\)\.get\("tune"\) === "rain"/);
  assert.match(appSource, /const rainTuningStorageKey = "cool-stuff:rain-tuning:v1";/);
  assert.match(appSource, /const rainTuningGroupStorageKey = "cool-stuff:rain-tuning-group:v1";/);
  assert.match(appSource, /const rainTuningPanelPositionStorageKey =\n  "cool-stuff:rain-tuning-panel-position:v1";/);
  assert.match(appSource, /function readStoredRainTuning\(\)/);
  assert.match(appSource, /window\.localStorage\.setItem\(rainTuningStorageKey, JSON\.stringify\(value\)\)/);
  assert.match(appSource, /function readStoredTuningPanelPosition\(\): TuningPanelPosition \| null/);
  assert.match(appSource, /function writeStoredTuningPanelPosition\(value: TuningPanelPosition \| null\)/);
  assert.match(appSource, /function RainTuningWorkbench/);
  assert.match(appSource, /showTuneMode\s+\?\s+"tune"/);
  assert.match(appSource, /showComparison\s+\?\s+"compare"/);
  assert.match(appSource, /<RainTuningWorkbench/);
  assert.match(appSource, /onPointerDown=\{handlePanelDragStart\}/);
  assert.match(appSource, /onPointerMove=\{handlePanelDragMove\}/);
  assert.match(appSource, /window\.addEventListener\("pointermove", handlePointerMove\)/);
  assert.match(appSource, /window\.addEventListener\("pointerup", handlePointerEnd\)/);
  assert.match(appSource, /data-moved=\{panelPosition \? "true" : undefined\}/);
  assert.match(appSource, /RAIN_TUNING_GROUP_QUESTIONS\[activeGroup\]/);
  assert.match(appSource, /focusedFxOptionsByGroup\[activeGroup\]/);
  assert.match(appSource, /sourceSelector='\[data-tuning-variant="reference"\] \.street-canvas'/);
  assert.match(appSource, /function getFocusedNativeTuning/);
  assert.match(appSource, /focused\.mistAlpha = 0;/);
  assert.match(appSource, /focused\.microdropRate = 0;/);
  assert.doesNotMatch(appSource, /focused\.rainOverlayBase = 0;/);
  assert.doesNotMatch(appSource, /focused\.rainOverlayScale = 0;/);
  assert.match(appSource, /Reset Question/);
  assert.match(appSource, /Reset Position/);
  assert.match(appSource, /Reset Defaults/);
  assert.match(tuningSource, /export const RAIN_TUNING_GROUPS: RainTuningGroup\[] = \[/);
  assert.match(tuningSource, /export const RAIN_TUNING_GROUP_LABELS: Record<RainTuningGroup, string> = \{/);
  assert.match(tuningSource, /export const RAIN_TUNING_GROUP_QUESTIONS: Record<RainTuningGroup, string> = \{/);
  assert.match(overlaySource, /options\?: Record<string, unknown>;/);
  assert.match(overlaySource, /options=\{options\}/);
  assert.match(vercelSource, /"source": "\/tune\/:path\*"/);
  assert.match(vercelSource, /"destination": "\/index.html"/);
});

test("original RaindropFX route preserves the untouched reference render", async () => {
  const appSource = await readFile(path.join(root, "src/App.tsx"), "utf8");
  const styleSource = await readFile(path.join(root, "src/styles.css"), "utf8");
  const demoSource = await readFile(
    path.join(root, "src/components/OriginalRaindropDemo.tsx"),
    "utf8"
  );
  const vercelSource = await readFile(path.join(root, "vercel.json"), "utf8");

  assert.match(appSource, /window\.location\.pathname === "\/rain\/original"/);
  assert.match(appSource, /const showOriginalRain = initialOriginalRainMode;/);
  assert.match(appSource, /showOriginalRain\s+\?\s+"original"/);
  assert.match(
    appSource,
    /showOriginalRain \? \(\n        <OriginalRaindropDemo \/>/
  );
  assert.match(demoSource, /background="\/vendor\/raindrop-fx\/84765992_p0\.jpg"/);
  assert.match(styleSource, /\.portfolio\[data-view="original"\]/);
  assert.match(styleSource, /\.portfolio\[data-view="original"\] \.site-header/);
  assert.match(styleSource, /\.portfolio\[data-view="original"\] \.scene-toolbar/);
  assert.match(vercelSource, /"source": "\/rain\/:path\*"/);
  assert.match(vercelSource, /"destination": "\/index.html"/);
});

test("directory route exposes all memorable project paths", async () => {
  const appSource = await readFile(path.join(root, "src/App.tsx"), "utf8");
  const styleSource = await readFile(path.join(root, "src/styles.css"), "utf8");
  const vercelSource = await readFile(path.join(root, "vercel.json"), "utf8");

  assert.match(appSource, /window\.location\.pathname === "\/directory"/);
  assert.match(appSource, /const showDirectory = initialDirectoryMode;/);
  assert.match(appSource, /showDirectory\s+\?\s+"directory"/);
  assert.match(appSource, /<ProjectDirectory \/>/);
  for (const path of ["/", "/?compare=rain", "/tune/rain", "/rain/original"]) {
    assert.match(appSource, new RegExp(`href: "${path.replace(/[/?]/g, "\\$&")}"`));
  }
  assert.match(styleSource, /\.portfolio\[data-view="directory"\]/);
  assert.match(styleSource, /\.directory-list/);
  assert.match(vercelSource, /"source": "\/directory"/);
  assert.match(vercelSource, /"destination": "\/index.html"/);
});

test("comparison route stays focused on the visual side-by-side", async () => {
  const appSource = await readFile(path.join(root, "src/App.tsx"), "utf8");

  assert.match(appSource, /!\s*showTuneMode && !showComparison \? \(/);
  assert.match(appSource, /function RainComparison/);
  assert.doesNotMatch(appSource, /<BenchmarkPanel/);
  assert.doesNotMatch(appSource, /function BenchmarkPanel/);
  assert.doesNotMatch(appSource, /benchmarkId=/);
  assert.doesNotMatch(appSource, /onBenchmark=/);
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
  assert.match(source, /uniform float uBackgroundGain;/);
  assert.match(source, /uniform float uBackgroundLift;/);
  assert.match(source, /color\.rgb = color\.rgb \* uBackgroundGain \+ vec3\(uBackgroundLift\);/);
  assert.match(
    source,
    /float overlayOpacity = uRainOverlayOpacityBase \+ normalizedVisibility \* uRainOverlayOpacityScale;/
  );
  assert.match(
    source,
    /gl_FragColor = vec4\(color\.rgb, mask \* overlayOpacity\);/
  );
  assert.match(source, /color\.a = texture2D\(uMistTex, vUv\)\.r \* overlayOpacity \* uMistAlpha;/);
  assert.doesNotMatch(source, /normalizeRainVisibility\(visibleRain\)/);
  assert.doesNotMatch(source, /mistRecoveryRate:/);
  assert.doesNotMatch(source, /trailEraseStrength:/);
  assert.doesNotMatch(source, /visibilityGain/);
  assert.doesNotMatch(source, /0\.72 \+ normalizedVisibility \* 0\.22/);
  assert.doesNotMatch(source, /overlayOpacity \* mix\(1\.0, 0\.82, mask\)/);
});
