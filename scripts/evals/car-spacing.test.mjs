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
