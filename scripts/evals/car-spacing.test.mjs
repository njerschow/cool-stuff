import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

async function rainWindowSource() {
  return readFile(path.join(root, "src/components/RainWindow.tsx"), "utf8");
}

test("traffic lanes keep stable spacing to avoid overlapping cars", async () => {
  const source = await rainWindowSource();

  assert.match(source, /const CAR_TRACK_LENGTH = 118;/);
  assert.match(source, /const CAR_TRACK_CENTER_Z = -42;/);
  assert.match(source, /const CAR_FADE_NEAR_START_Z = 5;/);
  assert.match(source, /const CAR_FADE_NEAR_END_Z = 17;/);
  assert.match(source, /const CAR_FADE_FAR_START_Z = -84;/);
  assert.match(source, /const CAR_FADE_FAR_END_Z = -101;/);
  assert.match(source, /const CARS_PER_LANE = 6;/);
  assert.match(
    source,
    /const MIN_CAR_OFFSET_SPACING = CAR_TRACK_LENGTH \/ CARS_PER_LANE;/
  );
  assert.match(
    source,
    /offset: lane\.phase \+ laneCarIndex \* MIN_CAR_OFFSET_SPACING,/
  );
  assert.match(source, /speed: lane\.speed,/);
  assert.doesNotMatch(source, /speed: 4\.4 \+ Math\.random\(\) \* 2\.8,/);
  assert.match(source, /% CAR_TRACK_LENGTH/);
});

test("traffic fades through the longer wrap instead of popping out", async () => {
  const source = await rainWindowSource();

  assert.match(source, /fadeMaterials: Array<\{/);
  assert.match(source, /const fadeMaterials = \[/);
  assert.match(source, /function smoothstep\(edge0: number, edge1: number, value: number\)/);
  assert.match(
    source,
    /1 - smoothstep\(CAR_FADE_NEAR_START_Z, CAR_FADE_NEAR_END_Z, z\)/
  );
  assert.match(source, /smoothstep\(CAR_FADE_FAR_END_Z, CAR_FADE_FAR_START_Z, z\)/);
  assert.match(source, /material\.opacity = baseOpacity \* opacity;/);
  assert.match(source, /car\.group\.visible = opacity > 0\.015;/);
});

test("street dressing extends to the deeper traffic path", async () => {
  const source = await rainWindowSource();

  assert.match(source, /const ROAD_LENGTH = 132;/);
  assert.match(source, /const ROAD_CENTER_Z = -38;/);
  assert.match(source, /const ROAD_DASH_COUNT = 34;/);
  assert.match(source, /const BUILDING_DEPTH_COUNT = 17;/);
  assert.match(source, /const STREET_LIGHT_COUNT = 13;/);
  assert.match(source, /const SHOP_GLOW_COUNT = 20;/);
  assert.match(source, /new THREE\.PlaneGeometry\(15\.5, ROAD_LENGTH\)/);
  assert.match(source, /left\.position\.set\(x, 0\.015, ROAD_CENTER_Z\);/);
  assert.match(source, /depthIndex < BUILDING_DEPTH_COUNT/);
});

test("cars use paired headlight light sources for paired road reflections", async () => {
  const source = await rainWindowSource();

  assert.match(source, /for \(const z of \[-0\.32, 0\.32\]\)/);
  assert.match(source, /const reflection = new THREE\.Mesh\(new THREE\.CircleGeometry\(1, 24\), reflectionMat\);/);
  assert.match(source, /reflection\.position\.set\(1\.64, 0\.028, z\);/);
  assert.match(source, /reflection\.scale\.set\(1\.15, 0\.18, 1\);/);
  assert.match(source, /tailReflection\.position\.set\(-1\.42, 0\.03, z\);/);
  assert.match(source, /group\.rotation\.y = config\.direction === 1 \? -Math\.PI \/ 2 : Math\.PI \/ 2;/);
  assert.doesNotMatch(source, /reflection\.position\.set\(config\.direction \*/);
  assert.doesNotMatch(source, /const headLight = new THREE\.PointLight\(0xffe0aa, 2\.7, 5\.4, 2\.0\);/);
  assert.doesNotMatch(source, /headLight\.position\.set\(config\.direction \* 1\.2, 0\.48, 0\);/);
});
