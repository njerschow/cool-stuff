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

  assert.match(source, /const CAR_TRACK_LENGTH = 68;/);
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

test("cars use paired headlight light sources for paired road reflections", async () => {
  const source = await rainWindowSource();

  assert.match(source, /for \(const z of \[-0\.32, 0\.32\]\)/);
  assert.match(source, /const reflection = new THREE\.Mesh\(new THREE\.CircleGeometry\(1, 24\), reflectionMat\);/);
  assert.match(source, /reflection\.position\.set\(config\.direction \* 1\.64, 0\.028, z\);/);
  assert.match(source, /reflection\.scale\.set\(1\.15, 0\.18, 1\);/);
  assert.doesNotMatch(source, /const headLight = new THREE\.PointLight\(0xffe0aa, 2\.7, 5\.4, 2\.0\);/);
  assert.doesNotMatch(source, /headLight\.position\.set\(config\.direction \* 1\.2, 0\.48, 0\);/);
});
