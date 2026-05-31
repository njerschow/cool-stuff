export type RainTuning = {
  backgroundBlurSteps: number;
  backgroundGain: number;
  backgroundLift: number;
  colliderSize: number;
  diffuseMidpoint: number;
  diffuseStrength: number;
  eraserEnd: number;
  eraserStart: number;
  eraserStrength: number;
  evaporate: number;
  gravity: number;
  initialFillRatio: number;
  initialSpread: number;
  maxDropInstances: number;
  maxMicrodropInstances: number;
  microdropRate: number;
  microdropSeedMax: number;
  microdropSizeMax: number;
  microdropSizeMin: number;
  mistAddDivisor: number;
  mistAlpha: number;
  mistBlurSteps: number;
  mistBrightness: number;
  motionIntervalMax: number;
  motionIntervalMin: number;
  rainFrameDelta: number;
  rainMapScale: number;
  rainMaskEnd: number;
  rainMaskStart: number;
  rainOverlayBase: number;
  rainOverlayScale: number;
  refractBase: number;
  refractScale: number;
  shrinkRate: number;
  slipRate: number;
  spawnIntervalMax: number;
  spawnIntervalMin: number;
  spawnLimit: number;
  spawnSizeMax: number;
  spawnSizeMin: number;
  trailDistanceMax: number;
  trailDistanceMin: number;
  trailDropDensity: number;
  trailDropSizeMax: number;
  trailDropSizeMin: number;
  trailSpread: number;
  velocitySpread: number;
  xShiftMax: number;
  xShiftMin: number;
};

export const DEFAULT_RAIN_TUNING: RainTuning = {
  backgroundBlurSteps: 3,
  backgroundGain: 1,
  backgroundLift: 0,
  colliderSize: 1,
  diffuseMidpoint: 0.8,
  diffuseStrength: 0.2,
  eraserEnd: 1,
  eraserStart: 0.93,
  eraserStrength: 1,
  evaporate: 10,
  gravity: 2400,
  initialFillRatio: 0,
  initialSpread: 0.5,
  maxDropInstances: 3000,
  maxMicrodropInstances: 80,
  microdropRate: 500,
  microdropSeedMax: 133,
  microdropSizeMax: 30,
  microdropSizeMin: 10,
  mistAddDivisor: 16.5,
  mistAlpha: 0.08,
  mistBlurSteps: 4,
  mistBrightness: 0.01,
  motionIntervalMax: 0.4,
  motionIntervalMin: 0.1,
  rainFrameDelta: 0.03,
  rainMapScale: 1,
  rainMaskEnd: 0.99,
  rainMaskStart: 0.96,
  rainOverlayBase: 0.72,
  rainOverlayScale: 0.28,
  refractBase: 0.4,
  refractScale: 0.6,
  shrinkRate: 0.01,
  slipRate: 0,
  spawnIntervalMax: 0.1,
  spawnIntervalMin: 0.1,
  spawnLimit: 2000,
  spawnSizeMax: 100,
  spawnSizeMin: 60,
  trailDistanceMax: 30,
  trailDistanceMin: 20,
  trailDropDensity: 0.2,
  trailDropSizeMax: 0.5,
  trailDropSizeMin: 0.3,
  trailSpread: 0.6,
  velocitySpread: 0.3,
  xShiftMax: 0.1,
  xShiftMin: 0,
};

export type RainTuningGroup =
  | "render"
  | "shader"
  | "mist"
  | "droplets"
  | "simulation";

export const RAIN_TUNING_GROUPS: RainTuningGroup[] = [
  "droplets",
  "mist",
  "render",
  "shader",
  "simulation",
];

export const RAIN_TUNING_GROUP_LABELS: Record<RainTuningGroup, string> = {
  droplets: "Droplets",
  mist: "Mist",
  render: "Render",
  shader: "Shader",
  simulation: "Simulation",
};

export const RAIN_TUNING_GROUP_QUESTIONS: Record<RainTuningGroup, string> = {
  droplets: "Do the beads and larger water lenses have the right size, count, and crispness before mist gets involved?",
  mist: "Does the pane start fogged, clear under falling water, and slowly fog back in the same way?",
  render: "Does the render target scale and background blur make both sides comparable before judging the water?",
  shader: "Does the refraction, mask edge, and lighting make each drop read like glass instead of a flat decal?",
  simulation: "Do drops spawn, merge, stretch, fall, and shed child drops with the right physical rhythm?",
};

export type RainTuningControl = {
  description: string;
  group: RainTuningGroup;
  key: keyof RainTuning;
  label: string;
  max: number;
  min: number;
  step: number;
};

export const RAIN_TUNING_CONTROLS: RainTuningControl[] = [
  {
    description: "Multiplier for the native rain render target resolution. Higher values make drops crisper and cost more GPU work.",
    group: "render",
    key: "rainMapScale",
    label: "rain map scale",
    max: 2.5,
    min: 0.45,
    step: 0.01,
  },
  {
    description: "Fixed rain simulation timestep per rendered frame. RaindropFX uses 0.03.",
    group: "render",
    key: "rainFrameDelta",
    label: "rain frame dt",
    max: 0.08,
    min: 0,
    step: 0.001,
  },
  {
    description: "Pyramid blur passes for the refracted rain background.",
    group: "render",
    key: "backgroundBlurSteps",
    label: "background blur",
    max: 6,
    min: 0,
    step: 1,
  },
  {
    description: "Multiplier applied to the underlying street render before rain and mist are composited. This is the direct background brightness control.",
    group: "render",
    key: "backgroundGain",
    label: "background gain",
    max: 2,
    min: 0.25,
    step: 0.01,
  },
  {
    description: "Additive lift applied to the underlying street render. This raises dark shadows without only brightening highlights.",
    group: "render",
    key: "backgroundLift",
    label: "background lift",
    max: 0.3,
    min: -0.08,
    step: 0.005,
  },
  {
    description: "Pyramid blur passes for the foggy mist layer behind cleared streaks.",
    group: "mist",
    key: "mistBlurSteps",
    label: "mist blur",
    max: 6,
    min: 0,
    step: 1,
  },
  {
    description: "Base alpha for the native water and mist overlay at the left side of the rain visibility slider. Refraction strength stays source-accurate.",
    group: "shader",
    key: "rainOverlayBase",
    label: "overlay base",
    max: 1.2,
    min: 0,
    step: 0.01,
  },
  {
    description: "Additional overlay opacity added as the rain visibility slider increases.",
    group: "shader",
    key: "rainOverlayScale",
    label: "overlay scale",
    max: 1,
    min: 0,
    step: 0.01,
  },
  {
    description: "Lower alpha threshold where the raindrop texture begins to become visible.",
    group: "shader",
    key: "rainMaskStart",
    label: "mask start",
    max: 1,
    min: 0,
    step: 0.001,
  },
  {
    description: "Upper alpha threshold where the raindrop texture becomes fully visible.",
    group: "shader",
    key: "rainMaskEnd",
    label: "mask end",
    max: 1,
    min: 0,
    step: 0.001,
  },
  {
    description: "Minimum refraction strength through each drop.",
    group: "shader",
    key: "refractBase",
    label: "refract base",
    max: 1.2,
    min: 0,
    step: 0.01,
  },
  {
    description: "Extra refraction strength driven by the blue/height channel in the raindrop texture.",
    group: "shader",
    key: "refractScale",
    label: "refract scale",
    max: 1.4,
    min: 0,
    step: 0.01,
  },
  {
    description: "Lighting midpoint subtracted from the drop normal lighting before it is added to the background.",
    group: "shader",
    key: "diffuseMidpoint",
    label: "diffuse midpoint",
    max: 1.4,
    min: 0,
    step: 0.01,
  },
  {
    description: "How strongly the drop normal lighting darkens or brightens the refracted background.",
    group: "shader",
    key: "diffuseStrength",
    label: "diffuse strength",
    max: 0.8,
    min: 0,
    step: 0.01,
  },
  {
    description: "Small brightness lift added to the blurred mist background.",
    group: "mist",
    key: "mistBrightness",
    label: "mist brightness",
    max: 0.12,
    min: 0,
    step: 0.001,
  },
  {
    description: "Final alpha multiplier for the persistent mist texture. This controls how fogged the pane looks.",
    group: "mist",
    key: "mistAlpha",
    label: "mist alpha",
    max: 1,
    min: 0,
    step: 0.005,
  },
  {
    description: "Divisor used when adding mist every frame. Lower values make mist return faster after streaks clear it.",
    group: "mist",
    key: "mistAddDivisor",
    label: "mist add divisor",
    max: 40,
    min: 1,
    step: 0.1,
  },
  {
    description: "Lower alpha threshold where a falling drop begins clearing mist and microdroplets.",
    group: "mist",
    key: "eraserStart",
    label: "eraser start",
    max: 1,
    min: 0,
    step: 0.001,
  },
  {
    description: "Upper alpha threshold where a falling drop fully clears mist and microdroplets.",
    group: "mist",
    key: "eraserEnd",
    label: "eraser end",
    max: 1,
    min: 0,
    step: 0.001,
  },
  {
    description: "Strength of the multiplicative eraser pass. One matches RaindropFX.",
    group: "mist",
    key: "eraserStrength",
    label: "eraser strength",
    max: 1,
    min: 0,
    step: 0.01,
  },
  {
    description: "Procedural tiny droplet spawn rate per rain timestep.",
    group: "droplets",
    key: "microdropRate",
    label: "microdrop rate",
    max: 1200,
    min: 0,
    step: 10,
  },
  {
    description: "Maximum procedural tiny droplets drawn in a frame.",
    group: "droplets",
    key: "maxMicrodropInstances",
    label: "microdrop cap",
    max: 240,
    min: 0,
    step: 1,
  },
  {
    description: "Minimum size of fresh tiny droplets.",
    group: "droplets",
    key: "microdropSizeMin",
    label: "microdrop min",
    max: 80,
    min: 1,
    step: 1,
  },
  {
    description: "Maximum size of fresh tiny droplets.",
    group: "droplets",
    key: "microdropSizeMax",
    label: "microdrop max",
    max: 120,
    min: 1,
    step: 1,
  },
  {
    description: "Random seed range for the procedural tiny droplet shader.",
    group: "droplets",
    key: "microdropSeedMax",
    label: "microdrop seed",
    max: 500,
    min: 1,
    step: 1,
  },
  {
    description: "Maximum number of large falling drops that can be drawn.",
    group: "droplets",
    key: "maxDropInstances",
    label: "large drop cap",
    max: 6000,
    min: 100,
    step: 100,
  },
  {
    description: "Maximum large drops allowed in the simulation.",
    group: "simulation",
    key: "spawnLimit",
    label: "spawn limit",
    max: 5000,
    min: 100,
    step: 50,
  },
  {
    description: "Minimum seconds between new large drop spawns.",
    group: "simulation",
    key: "spawnIntervalMin",
    label: "spawn interval min",
    max: 1,
    min: 0.01,
    step: 0.01,
  },
  {
    description: "Maximum seconds between new large drop spawns.",
    group: "simulation",
    key: "spawnIntervalMax",
    label: "spawn interval max",
    max: 1,
    min: 0.01,
    step: 0.01,
  },
  {
    description: "Minimum initial radius for large spawned drops.",
    group: "simulation",
    key: "spawnSizeMin",
    label: "spawn size min",
    max: 180,
    min: 5,
    step: 1,
  },
  {
    description: "Maximum initial radius for large spawned drops.",
    group: "simulation",
    key: "spawnSizeMax",
    label: "spawn size max",
    max: 240,
    min: 5,
    step: 1,
  },
  {
    description: "Fraction of the drop budget pre-filled on resize. Zero matches RaindropFX.",
    group: "simulation",
    key: "initialFillRatio",
    label: "initial fill",
    max: 1,
    min: 0,
    step: 0.01,
  },
  {
    description: "Initial horizontal and vertical spread used when a drop is created.",
    group: "simulation",
    key: "initialSpread",
    label: "initial spread",
    max: 2,
    min: 0,
    step: 0.01,
  },
  {
    description: "Gravity pulling drops down the glass.",
    group: "simulation",
    key: "gravity",
    label: "gravity",
    max: 6000,
    min: 0,
    step: 50,
  },
  {
    description: "How quickly drops lose mass.",
    group: "simulation",
    key: "evaporate",
    label: "evaporate",
    max: 80,
    min: 0,
    step: 1,
  },
  {
    description: "How close two drops must be before they merge.",
    group: "simulation",
    key: "colliderSize",
    label: "collider size",
    max: 3,
    min: 0.1,
    step: 0.05,
  },
  {
    description: "How much drop resistance suppresses sliding.",
    group: "simulation",
    key: "slipRate",
    label: "slip rate",
    max: 1,
    min: 0,
    step: 0.01,
  },
  {
    description: "Rate at which stretched drops narrow back down. Lower values shrink faster.",
    group: "simulation",
    key: "shrinkRate",
    label: "shrink rate",
    max: 1,
    min: 0.001,
    step: 0.001,
  },
  {
    description: "Minimum seconds before a drop rerolls its resistance and sideways drift.",
    group: "simulation",
    key: "motionIntervalMin",
    label: "motion min",
    max: 2,
    min: 0.01,
    step: 0.01,
  },
  {
    description: "Maximum seconds before a drop rerolls its resistance and sideways drift.",
    group: "simulation",
    key: "motionIntervalMax",
    label: "motion max",
    max: 2,
    min: 0.01,
    step: 0.01,
  },
  {
    description: "Minimum sideways drift factor.",
    group: "simulation",
    key: "xShiftMin",
    label: "x shift min",
    max: 0.8,
    min: 0,
    step: 0.01,
  },
  {
    description: "Maximum sideways drift factor.",
    group: "simulation",
    key: "xShiftMax",
    label: "x shift max",
    max: 0.8,
    min: 0,
    step: 0.01,
  },
  {
    description: "Minimum distance a falling drop travels before shedding a smaller trail drop.",
    group: "simulation",
    key: "trailDistanceMin",
    label: "trail distance min",
    max: 120,
    min: 1,
    step: 1,
  },
  {
    description: "Maximum distance a falling drop travels before shedding a smaller trail drop.",
    group: "simulation",
    key: "trailDistanceMax",
    label: "trail distance max",
    max: 160,
    min: 1,
    step: 1,
  },
  {
    description: "Mass density multiplier for child drops split from a falling parent.",
    group: "simulation",
    key: "trailDropDensity",
    label: "trail density",
    max: 1,
    min: 0.01,
    step: 0.01,
  },
  {
    description: "Minimum child-drop size as a fraction of the parent width.",
    group: "simulation",
    key: "trailDropSizeMin",
    label: "trail size min",
    max: 1,
    min: 0.01,
    step: 0.01,
  },
  {
    description: "Maximum child-drop size as a fraction of the parent width.",
    group: "simulation",
    key: "trailDropSizeMax",
    label: "trail size max",
    max: 1,
    min: 0.01,
    step: 0.01,
  },
  {
    description: "How stretched child trail drops become when split from a moving parent.",
    group: "simulation",
    key: "trailSpread",
    label: "trail spread",
    max: 2,
    min: 0,
    step: 0.01,
  },
  {
    description: "How much falling speed vertically stretches large drops.",
    group: "simulation",
    key: "velocitySpread",
    label: "velocity spread",
    max: 1.5,
    min: 0,
    step: 0.01,
  },
];
