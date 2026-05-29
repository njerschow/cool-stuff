import { useEffect, useRef } from "react";
import * as THREE from "three";
import raindropDemoBgUrl from "../assets/raindrop-demo-bg.jpg";
import raindropTextureUrl from "../assets/raindrop.png";
import {
  RAIN_VISIBILITY_RANGE,
  RAIN_VISIBILITY_SLIDER,
  RAIN_VISIBILITY_SNAPSHOT_OVERLAY,
} from "../rainVisibility";
import { RaindropPaneSimulation } from "../simulation/RaindropPaneSimulation";

export type BackgroundMode = "demo" | "street";
export type RenderQuality = "balanced" | "cinematic";
export type TimeOfDay = "morning" | "midday" | "dusk" | "night";

export type RainWindowBenchmarkStats = {
  drawCalls: number;
  dropCount: number;
  fps: number;
  frameMs: number;
  geometries: number;
  nativeGlass: boolean;
  rainMapMp: number;
  renderMs: number;
  targetMp: number;
  textures: number;
  triangles: number;
};

type Car = {
  fadeMaterials: Array<{
    material: THREE.Material;
    opacity: number;
  }>;
  group: THREE.Group;
  baseSpeed: number;
  direction: 1 | -1;
  laneX: number;
  offset: number;
  wobble: number;
};

const CAR_TRACK_LENGTH = 118;
const CAR_TRACK_CENTER_Z = -42;
const CAR_FADE_NEAR_START_Z = 5;
const CAR_FADE_NEAR_END_Z = 17;
const CAR_FADE_FAR_START_Z = -84;
const CAR_FADE_FAR_END_Z = -101;
const CARS_PER_LANE = 6;
const MIN_CAR_OFFSET_SPACING = CAR_TRACK_LENGTH / CARS_PER_LANE;
const ROAD_LENGTH = 132;
const ROAD_CENTER_Z = -38;
const ROAD_DASH_COUNT = 34;
const BUILDING_DEPTH_COUNT = 17;
const STREET_LIGHT_COUNT = 13;
const SHOP_GLOW_COUNT = 20;

const qualitySettings = {
  balanced: {
    pixelRatio: 1.1,
    raindropMapScale: 2.14,
    spawnLimit: 2000,
    visualDropScale: 1,
    windowBudget: 900,
  },
  cinematic: {
    pixelRatio: 1.45,
    raindropMapScale: 1.62,
    spawnLimit: 2000,
    visualDropScale: 1,
    windowBudget: 1200,
  },
} satisfies Record<
  RenderQuality,
  {
    pixelRatio: number;
    raindropMapScale: number;
    spawnLimit: number;
    visualDropScale: number;
    windowBudget: number;
  }
>;

const timeProfiles = {
  morning: {
    background: 0x586a70,
    buildingColor: 0x26323a,
    cabinEmissive: 0x142935,
    exposure: 1.52,
    fog: 0x5c6d73,
    fogDensity: 0.022,
    hemiGround: 0x2d2825,
    hemiIntensity: 1.85,
    hemiSky: 0xaec6ce,
    roadColor: 0x161b1d,
    shopLight: 2.4,
    streetLight: 14,
    windowLightness: 0.54,
    windowSaturation: 0.35,
  },
  midday: {
    background: 0xa9bac0,
    buildingColor: 0x4b5c62,
    cabinEmissive: 0x0a1217,
    exposure: 1.7,
    fog: 0xa8b8bd,
    fogDensity: 0.015,
    hemiGround: 0x5d5750,
    hemiIntensity: 2.35,
    hemiSky: 0xe3edf0,
    roadColor: 0x30383a,
    shopLight: 0.18,
    streetLight: 0,
    windowLightness: 0.28,
    windowSaturation: 0.12,
  },
  dusk: {
    background: 0x081016,
    buildingColor: 0x131d24,
    cabinEmissive: 0x203a4a,
    exposure: 1.45,
    fog: 0x071018,
    fogDensity: 0.033,
    hemiGround: 0x15100f,
    hemiIntensity: 1.35,
    hemiSky: 0x7895aa,
    roadColor: 0x080b0e,
    shopLight: 5.6,
    streetLight: 45,
    windowLightness: 0.48,
    windowSaturation: 0.58,
  },
  night: {
    background: 0x020406,
    buildingColor: 0x080d12,
    cabinEmissive: 0x102436,
    exposure: 1.36,
    fog: 0x020509,
    fogDensity: 0.044,
    hemiGround: 0x070506,
    hemiIntensity: 0.88,
    hemiSky: 0x314763,
    roadColor: 0x040608,
    shopLight: 7.4,
    streetLight: 58,
    windowLightness: 0.56,
    windowSaturation: 0.72,
  },
} satisfies Record<
  TimeOfDay,
  {
    background: THREE.ColorRepresentation;
    buildingColor: THREE.ColorRepresentation;
    cabinEmissive: THREE.ColorRepresentation;
    exposure: number;
    fog: THREE.ColorRepresentation;
    fogDensity: number;
    hemiGround: THREE.ColorRepresentation;
    hemiIntensity: number;
    hemiSky: THREE.ColorRepresentation;
    roadColor: THREE.ColorRepresentation;
    shopLight: number;
    streetLight: number;
    windowLightness: number;
    windowSaturation: number;
  }
>;

type TimeProfile = (typeof timeProfiles)[TimeOfDay];

function hashSeed(input: string) {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createSeededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function withSeededRandom<T>(seed: string, run: () => T) {
  const originalRandom = Math.random;
  Math.random = createSeededRandom(hashSeed(seed));
  try {
    return run();
  } finally {
    Math.random = originalRandom;
  }
}

const glassFragmentShader = `
uniform sampler2D uScene;
uniform sampler2D uRainMap;
uniform sampler2D uDropletMap;
uniform sampler2D uFrost;
uniform sampler2D uGlare;
uniform sampler2D uMistBackground;
uniform sampler2D uMistTex;
uniform float uRainVisibility;
uniform float uRainVisibilityMin;
uniform float uRainVisibilityRange;
uniform float uRainOverlayOpacityBase;
uniform float uRainOverlayOpacityScale;
varying vec2 vUv;

vec3 deepenPaneBase(vec3 color) {
  return pow(max(color - vec3(0.03, 0.033, 0.038), vec3(0.0)), vec3(1.065));
}

void main() {
  vec2 uv = vUv;
  vec4 raindrop = texture2D(uRainMap, uv);
  vec4 dropletMap = texture2D(uDropletMap, uv);
  vec4 compose = vec4(
    raindrop.rgb + dropletMap.rgb - vec3(2.0) * raindrop.rgb * dropletMap.rgb,
    max(dropletMap.a, raindrop.a)
  );
  float mask = smoothstep(0.96, 0.99, compose.a);
  float splotchMask = smoothstep(0.78, 0.97, compose.a) * (1.0 - mask);
  float splotchEdge = smoothstep(0.72, 0.88, compose.a) * (1.0 - smoothstep(0.9, 0.99, compose.a));
  float trailVeil = smoothstep(0.38, 0.78, compose.a) * (1.0 - smoothstep(0.92, 0.99, compose.a));
  float dropMask = clamp(mask + splotchMask * 0.075, 0.0, 1.0);
  vec2 refractUv = uv - (compose.xy - vec2(0.5)) * (compose.b * 0.6 + 0.4);
  vec3 normal = normalize(vec3((compose.xy - vec2(0.5)) * vec2(2.0), 1.0));
  vec3 lightDir = vec3(-1.0, 1.0, 2.0);
  vec3 viewDir = vec3(0.0, 0.0, 1.0);
  vec3 halfDir = normalize(lightDir + viewDir);
  float lambert = clamp(dot(normalize(lightDir), normal), 0.0, 1.0);
  float specular = pow(max(dot(normal, halfDir), 0.0), 256.0);

  vec3 glare = texture2D(uGlare, uv).rgb;
  vec3 sharpScene = deepenPaneBase(texture2D(uScene, uv).rgb);
  vec3 sceneColor = sharpScene + glare * 0.18;
  vec3 background = deepenPaneBase(texture2D(uFrost, uv).rgb);
  vec3 mistBackground = deepenPaneBase(texture2D(uMistBackground, uv).rgb) + vec3(0.0015, 0.002, 0.0025);
  float mistValue = texture2D(uMistTex, uv).r;
  float wetMistRelief = clamp(trailVeil * 0.32 + splotchMask * 0.12 + mask * 0.08, 0.0, 0.32);
  float mistAlpha = clamp(mistValue * (0.76 - wetMistRelief), 0.0, 0.82);
  vec3 baseColor = mix(background, mistBackground, mistAlpha);
  vec3 dropColor = deepenPaneBase(texture2D(uFrost, refractUv).rgb);
  float lensContrast = 1.32 + mask * 0.28 + splotchMask * 0.16;
  dropColor = baseColor + (dropColor - baseColor) * lensContrast;
  dropColor += vec3((lambert - 0.8) * 0.2);
  dropColor *= 1.0 - splotchMask * 0.28 - splotchEdge * 0.12;
  dropColor += vec3(specular) * (mask * 0.08);
  vec3 rainColor = mix(baseColor, dropColor, dropMask);
  vec3 trailColor = mix(baseColor, dropColor, 0.32) * (1.0 - trailVeil * 0.18);
  rainColor = mix(rainColor, trailColor, trailVeil * 0.18);
  rainColor += glare * (0.46 + mask * 0.28 + trailVeil * 0.12);
  float normalizedVisibility = clamp((uRainVisibility - uRainVisibilityMin) / uRainVisibilityRange, 0.0, 1.0);
  float overlayOpacity = uRainOverlayOpacityBase + normalizedVisibility * uRainOverlayOpacityScale;
  float localOverlayOpacity = overlayOpacity;
  vec3 color = mix(sceneColor, rainColor, localOverlayOpacity);
  color += glare * (0.12 + normalizedVisibility * 0.1);

  gl_FragColor = vec4(color.rgb, 1.0);
  #include <colorspace_fragment>
}
`;

const glassVertexShader = `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const glareExtractFragmentShader = `
uniform sampler2D uScene;
varying vec2 vUv;

void main() {
  vec3 color = texture2D(uScene, vUv).rgb;
  float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
  float brightMask = smoothstep(0.28, 0.98, luma);
  float veilMask = smoothstep(0.1, 0.42, luma);
  gl_FragColor = vec4(color * (veilMask * 0.12 + brightMask * 1.05), 1.0);
}
`;

const glareBlurFragmentShader = `
uniform sampler2D uImage;
uniform vec2 uDirection;
uniform float uRadius;
uniform vec2 uTexelSize;
varying vec2 vUv;

void main() {
  vec2 stepUv = uDirection * uTexelSize * uRadius;
  vec3 color = texture2D(uImage, vUv).rgb * 0.227027;
  color += texture2D(uImage, vUv + stepUv * 1.384615).rgb * 0.316216;
  color += texture2D(uImage, vUv - stepUv * 1.384615).rgb * 0.316216;
  color += texture2D(uImage, vUv + stepUv * 3.230769).rgb * 0.07027;
  color += texture2D(uImage, vUv - stepUv * 3.230769).rgb * 0.07027;
  gl_FragColor = vec4(color, 1.0);
}
`;

const copyFragmentShader = `
uniform sampler2D uImage;
varying vec2 vUv;

void main() {
  gl_FragColor = texture2D(uImage, vUv);
}
`;

const pyramidBlurFragmentShader = `
uniform sampler2D uMainTex;
uniform vec4 uTexSize;
uniform float uSampleOffset;
varying vec2 vUv;

void main() {
  vec2 delta = vec2(-uSampleOffset, uSampleOffset);
  vec4 color =
    texture2D(uMainTex, clamp(vUv + uTexSize.zw * delta.xx, 0.0, 1.0)) +
    texture2D(uMainTex, clamp(vUv + uTexSize.zw * delta.yx, 0.0, 1.0)) +
    texture2D(uMainTex, clamp(vUv + uTexSize.zw * delta.yy, 0.0, 1.0)) +
    texture2D(uMainTex, clamp(vUv + uTexSize.zw * delta.xy, 0.0, 1.0));
  gl_FragColor = color * 0.25;
}
`;

const mistAddFragmentShader = `
uniform float uAmount;
varying vec2 vUv;

void main() {
  gl_FragColor = vec4(vec3(uAmount), uAmount);
}
`;

const mistEraseFragmentShader = `
uniform sampler2D uRainMap;
uniform vec2 uEraserSmooth;
varying vec2 vUv;

void main() {
  float mask = smoothstep(uEraserSmooth.x, uEraserSmooth.y, texture2D(uRainMap, vUv).a);
  gl_FragColor = vec4(0.0, 0.0, 0.0, mask);
}
`;

const demoBackgroundFragmentShader = `
uniform sampler2D uImage;
uniform float uImageAspect;
uniform float uViewportAspect;
varying vec2 vUv;

void main() {
  vec2 uv = vUv;

  if (uViewportAspect > uImageAspect) {
    float scale = uImageAspect / uViewportAspect;
    uv.y = (uv.y - 0.5) * scale + 0.5;
  }
  else {
    float scale = uViewportAspect / uImageAspect;
    uv.x = (uv.x - 0.5) * scale + 0.5;
  }

  gl_FragColor = vec4(texture2D(uImage, uv).rgb, 1.0);
}
`;

const raindropMapVertexShader = `
attribute float instanceSize;
varying vec2 vUv;
varying float vSize;

void main() {
  vUv = uv;
  vSize = instanceSize;
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
}
`;

const raindropMapFragmentShader = `
uniform sampler2D uMainTex;
varying vec2 vUv;
varying float vSize;

void main() {
  vec4 color = texture2D(uMainTex, vUv);
  gl_FragColor = vec4(color.rg * color.a, vSize * color.a, color.a);
}
`;

const microdropletMapFragmentShader = `
uniform sampler2D uMainTex;
varying vec2 vUv;

void main() {
  vec4 color = texture2D(uMainTex, vUv);
  color.rgb *= color.a;
  gl_FragColor = vec4(color.rg, 0.0, color.a);
}
`;

const trailEraseVertexShader = `
attribute float trailStrength;
varying vec2 vUv;
varying float vStrength;

void main() {
  vUv = uv;
  vStrength = trailStrength;
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
}
`;

const trailDropFragmentShader = `
varying vec2 vUv;
varying float vStrength;

void main() {
  vec2 centered = vUv - vec2(0.5);
  vec2 p = abs(centered);
  float edgeFalloff = 1.0 - smoothstep(0.24, 0.5, p.x);
  float centerWater = 1.0 - smoothstep(0.035, 0.24, p.x);
  float taper = smoothstep(0.0, 0.075, vUv.y) * (1.0 - smoothstep(0.93, 1.0, vUv.y));
  float fade = smoothstep(0.02, 0.32, vStrength);
  float alpha = clamp(max(edgeFalloff * 0.58, centerWater) * taper * fade * (0.78 + vStrength * 0.32), 0.0, 1.0);
  float ribble = sin((vUv.y + vUv.x * 0.19) * 42.0) * 0.014;
  vec2 normal = vec2(0.5 + centered.x * 0.66 + ribble, 0.5 - centered.y * 0.055);
  float depth = (0.16 + centerWater * 0.42 + edgeFalloff * 0.1) * alpha;
  gl_FragColor = vec4(normal * alpha, depth, alpha);
}
`;

const proceduralMicrodropletVertexShader = `
attribute float aDropId;
uniform vec4 uSpawnRect;
uniform vec2 uSizeRange;
uniform float uSeed;
varying vec2 vUv;

const float PHI = 1.61803398874989484820459;

float goldNoise(vec2 xy, float seed) {
  return fract(tan(distance(xy * PHI, xy) * seed) * xy.x);
}

void main() {
  float id = aDropId + 1.0;
  vec2 randomPos = vec2(
    goldNoise(vec2(1.0, id), uSeed + 1.0),
    goldNoise(vec2(id, 1.0), uSeed + 2.0)
  );
  vec2 randomSize = vec2(
    goldNoise(vec2(1.0, id), uSeed + 3.0),
    goldNoise(vec2(id, 1.0), uSeed + 4.0)
  );
  vec2 pos = uSpawnRect.xy + uSpawnRect.zw * randomPos;
  vec2 size = mix(vec2(uSizeRange.x), vec2(uSizeRange.y), randomSize);

  vUv = uv;
  vec2 p = position.xy * size + pos;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 0.0, 1.0);
}
`;

export function RainWindow({
  benchmarkId,
  backgroundMode,
  nativeGlass = true,
  onBenchmark,
  paused,
  quality,
  rainVisibility,
  timeOfDay,
}: {
  benchmarkId?: string;
  backgroundMode: BackgroundMode;
  nativeGlass?: boolean;
  onBenchmark?: (id: string, stats: RainWindowBenchmarkStats) => void;
  paused: boolean;
  quality: RenderQuality;
  rainVisibility: number;
  timeOfDay: TimeOfDay;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const pausedRef = useRef(paused);
  const rainVisibilityRef = useRef(rainVisibility);
  const benchmarkIdRef = useRef(benchmarkId);
  const benchmarkRef = useRef(onBenchmark);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    rainVisibilityRef.current = rainVisibility;
  }, [rainVisibility]);

  useEffect(() => {
    benchmarkIdRef.current = benchmarkId;
    benchmarkRef.current = onBenchmark;
  }, [benchmarkId, onBenchmark]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }

    const settings = qualitySettings[quality];
    const profile = timeProfiles[timeOfDay];
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance",
      preserveDrawingBuffer: !nativeGlass,
    });
    renderer.setClearColor(0x050708, 1);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, settings.pixelRatio));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = profile.exposure;
    renderer.info.autoReset = false;
    renderer.domElement.className = "street-canvas";
    host.appendChild(renderer.domElement);

    const worldScene = new THREE.Scene();
    worldScene.background = new THREE.Color(profile.background);
    worldScene.fog = new THREE.FogExp2(profile.fog, profile.fogDensity);

    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 140);
    camera.position.set(-4.45, 2.55, 7.4);
    camera.lookAt(2.15, 1.04, -30);

    const target = new THREE.WebGLRenderTarget(1, 1, {
      depthBuffer: true,
      samples: quality === "cinematic" ? 2 : 0,
      stencilBuffer: false,
    });
    target.texture.colorSpace = THREE.NoColorSpace;

    const glareTargetA = new THREE.WebGLRenderTarget(1, 1, {
      depthBuffer: false,
      stencilBuffer: false,
    });
    glareTargetA.texture.colorSpace = THREE.SRGBColorSpace;
    glareTargetA.texture.generateMipmaps = false;
    glareTargetA.texture.magFilter = THREE.LinearFilter;
    glareTargetA.texture.minFilter = THREE.LinearFilter;

    const glareTargetB = new THREE.WebGLRenderTarget(1, 1, {
      depthBuffer: false,
      stencilBuffer: false,
    });
    glareTargetB.texture.colorSpace = THREE.SRGBColorSpace;
    glareTargetB.texture.generateMipmaps = false;
    glareTargetB.texture.magFilter = THREE.LinearFilter;
    glareTargetB.texture.minFilter = THREE.LinearFilter;

    const frostTargetA = new THREE.WebGLRenderTarget(1, 1, {
      depthBuffer: false,
      stencilBuffer: false,
    });
    frostTargetA.texture.colorSpace = THREE.NoColorSpace;
    frostTargetA.texture.generateMipmaps = false;
    frostTargetA.texture.magFilter = THREE.LinearFilter;
    frostTargetA.texture.minFilter = THREE.LinearFilter;

    const frostTargetB = new THREE.WebGLRenderTarget(1, 1, {
      depthBuffer: false,
      stencilBuffer: false,
    });
    frostTargetB.texture.colorSpace = THREE.NoColorSpace;
    frostTargetB.texture.generateMipmaps = false;
    frostTargetB.texture.magFilter = THREE.LinearFilter;
    frostTargetB.texture.minFilter = THREE.LinearFilter;

    const mistBackgroundTargetA = new THREE.WebGLRenderTarget(1, 1, {
      depthBuffer: false,
      stencilBuffer: false,
    });
    mistBackgroundTargetA.texture.colorSpace = THREE.NoColorSpace;
    mistBackgroundTargetA.texture.generateMipmaps = false;
    mistBackgroundTargetA.texture.magFilter = THREE.LinearFilter;
    mistBackgroundTargetA.texture.minFilter = THREE.LinearFilter;

    const mistBackgroundTargetB = new THREE.WebGLRenderTarget(1, 1, {
      depthBuffer: false,
      stencilBuffer: false,
    });
    mistBackgroundTargetB.texture.colorSpace = THREE.NoColorSpace;
    mistBackgroundTargetB.texture.generateMipmaps = false;
    mistBackgroundTargetB.texture.magFilter = THREE.LinearFilter;
    mistBackgroundTargetB.texture.minFilter = THREE.LinearFilter;

    const raindropTarget = new THREE.WebGLRenderTarget(1, 1, {
      depthBuffer: false,
      stencilBuffer: false,
    });
    raindropTarget.texture.colorSpace = THREE.NoColorSpace;
    raindropTarget.texture.generateMipmaps = false;
    raindropTarget.texture.magFilter = THREE.LinearFilter;
    raindropTarget.texture.minFilter = THREE.LinearFilter;

    const mistTarget = new THREE.WebGLRenderTarget(1, 1, {
      depthBuffer: false,
      stencilBuffer: false,
      type: THREE.HalfFloatType,
    });
    mistTarget.texture.colorSpace = THREE.NoColorSpace;
    mistTarget.texture.generateMipmaps = false;
    mistTarget.texture.magFilter = THREE.LinearFilter;
    mistTarget.texture.minFilter = THREE.LinearFilter;

    const dropletTarget = new THREE.WebGLRenderTarget(1, 1, {
      depthBuffer: false,
      stencilBuffer: false,
    });
    dropletTarget.texture.colorSpace = THREE.NoColorSpace;
    dropletTarget.texture.generateMipmaps = false;
    dropletTarget.texture.magFilter = THREE.LinearFilter;
    dropletTarget.texture.minFilter = THREE.LinearFilter;

    const blurTargets = Array.from(
      { length: 4 },
      () =>
        new THREE.WebGLRenderTarget(1, 1, {
          depthBuffer: false,
          stencilBuffer: false,
        })
    );
    for (const blurTarget of blurTargets) {
      blurTarget.texture.colorSpace = THREE.NoColorSpace;
      blurTarget.texture.generateMipmaps = false;
      blurTarget.texture.magFilter = THREE.LinearFilter;
      blurTarget.texture.minFilter = THREE.LinearFilter;
    }

    const screenScene = new THREE.Scene();
    const screenCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    const demoTexture = new THREE.TextureLoader().load(raindropDemoBgUrl);
    demoTexture.colorSpace = THREE.SRGBColorSpace;
    demoTexture.generateMipmaps = true;
    demoTexture.magFilter = THREE.LinearFilter;
    demoTexture.minFilter = THREE.LinearMipmapLinearFilter;
    demoTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    const demoBackgroundScene = new THREE.Scene();
    const demoBackgroundMaterial = new THREE.ShaderMaterial({
      depthTest: false,
      depthWrite: false,
      fragmentShader: demoBackgroundFragmentShader,
      toneMapped: false,
      uniforms: {
        uImage: { value: demoTexture },
        uImageAspect: { value: 2160 / 998 },
        uViewportAspect: { value: 1 },
      },
      vertexShader: glassVertexShader,
    });
    const demoBackgroundQuad = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      demoBackgroundMaterial
    );
    demoBackgroundScene.add(demoBackgroundQuad);

    const glassMaterial = new THREE.ShaderMaterial({
      depthTest: false,
      depthWrite: false,
      fragmentShader: glassFragmentShader,
      toneMapped: false,
      uniforms: {
        uDropletMap: { value: dropletTarget.texture },
        uFrost: { value: frostTargetA.texture },
        uGlare: { value: glareTargetA.texture },
        uMistBackground: { value: mistBackgroundTargetA.texture },
        uMistTex: { value: mistTarget.texture },
        uRainMap: { value: raindropTarget.texture },
        uRainOverlayOpacityBase: {
          value: RAIN_VISIBILITY_SNAPSHOT_OVERLAY.base,
        },
        uRainOverlayOpacityScale: {
          value: RAIN_VISIBILITY_SNAPSHOT_OVERLAY.scale,
        },
        uRainVisibility: { value: rainVisibilityRef.current },
        uRainVisibilityMin: { value: RAIN_VISIBILITY_SLIDER.min },
        uRainVisibilityRange: { value: RAIN_VISIBILITY_RANGE },
        uScene: { value: target.texture },
      },
      vertexShader: glassVertexShader,
    });
    const screenQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), glassMaterial);
    screenScene.add(screenQuad);

    const copyMaterial = new THREE.ShaderMaterial({
      depthTest: false,
      depthWrite: false,
      fragmentShader: copyFragmentShader,
      toneMapped: false,
      uniforms: {
        uImage: { value: target.texture },
      },
      vertexShader: glassVertexShader,
    });
    const pyramidBlurMaterial = new THREE.ShaderMaterial({
      depthTest: false,
      depthWrite: false,
      fragmentShader: pyramidBlurFragmentShader,
      toneMapped: false,
      uniforms: {
        uMainTex: { value: target.texture },
        uSampleOffset: { value: 1 },
        uTexSize: { value: new THREE.Vector4(1, 1, 1, 1) },
      },
      vertexShader: glassVertexShader,
    });

    const glareExtractMaterial = new THREE.ShaderMaterial({
      depthTest: false,
      depthWrite: false,
      fragmentShader: glareExtractFragmentShader,
      toneMapped: false,
      uniforms: {
        uScene: { value: target.texture },
      },
      vertexShader: glassVertexShader,
    });
    const glareBlurMaterial = new THREE.ShaderMaterial({
      depthTest: false,
      depthWrite: false,
      fragmentShader: glareBlurFragmentShader,
      toneMapped: false,
      uniforms: {
        uDirection: { value: new THREE.Vector2(1, 0) },
        uImage: { value: glareTargetA.texture },
        uRadius: { value: 4.6 },
        uTexelSize: { value: new THREE.Vector2(1, 1) },
      },
      vertexShader: glassVertexShader,
    });
    const frostBlurMaterial = new THREE.ShaderMaterial({
      depthTest: false,
      depthWrite: false,
      fragmentShader: glareBlurFragmentShader,
      toneMapped: false,
      uniforms: {
        uDirection: { value: new THREE.Vector2(1, 0) },
        uImage: { value: target.texture },
        uRadius: { value: 8.5 },
        uTexelSize: { value: new THREE.Vector2(1, 1) },
      },
      vertexShader: glassVertexShader,
    });
    const glareScene = new THREE.Scene();
    const glareQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), glareExtractMaterial);
    glareScene.add(glareQuad);

    const mistScene = new THREE.Scene();
    const mistAddMaterial = new THREE.ShaderMaterial({
      blending: THREE.CustomBlending,
      blendDst: THREE.OneFactor,
      blendDstAlpha: THREE.OneFactor,
      blendEquation: THREE.AddEquation,
      blendEquationAlpha: THREE.AddEquation,
      blendSrc: THREE.OneFactor,
      blendSrcAlpha: THREE.OneFactor,
      depthTest: false,
      depthWrite: false,
      fragmentShader: mistAddFragmentShader,
      toneMapped: false,
      transparent: true,
      uniforms: {
        uAmount: { value: 0 },
      },
      vertexShader: glassVertexShader,
    });
    const mistEraseMaterial = new THREE.ShaderMaterial({
      blending: THREE.CustomBlending,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
      blendEquation: THREE.AddEquation,
      blendEquationAlpha: THREE.AddEquation,
      blendSrc: THREE.ZeroFactor,
      blendSrcAlpha: THREE.ZeroFactor,
      depthTest: false,
      depthWrite: false,
      fragmentShader: mistEraseFragmentShader,
      toneMapped: false,
      transparent: true,
      uniforms: {
        uEraserSmooth: { value: new THREE.Vector2(0.58, 0.94) },
        uRainMap: { value: raindropTarget.texture },
      },
      vertexShader: glassVertexShader,
    });
    const mistQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mistAddMaterial);
    mistScene.add(mistQuad);

    const paneSimulation = new RaindropPaneSimulation({
      initialFillRatio: 0,
      initialSpread: 0.34,
      spawnLimit: settings.spawnLimit,
      spawnSize: [39, 86],
      trailDistance: [9, 16],
      trailDropDensity: 0.42,
      trailDropSize: [0.22, 0.42],
      trailSpread: 0.98,
      velocitySpread: 0.22,
    });
    const dropScene = new THREE.Scene();
    const dropCamera = new THREE.OrthographicCamera(0, 1, 0, 1, -1, 1);
    dropCamera.position.z = 1;
    let raindropTextureReady = false;
    const raindropTexture = new THREE.TextureLoader().load(
      raindropTextureUrl,
      () => {
        raindropTextureReady = true;
      }
    );
    raindropTexture.colorSpace = THREE.NoColorSpace;
    raindropTexture.generateMipmaps = false;
    raindropTexture.magFilter = THREE.LinearFilter;
    raindropTexture.minFilter = THREE.LinearFilter;
    const maxDropInstances = 3000;
    const maxMicrodropInstances = 80;
    const maxTrailEraseInstances = 1800;
    const dropGeometry = new THREE.PlaneGeometry(1, 1);
    const instanceSize = new THREE.InstancedBufferAttribute(
      new Float32Array(maxDropInstances),
      1
    );
    const microdropIds = new Float32Array(maxMicrodropInstances);
    for (let index = 0; index < microdropIds.length; index += 1) {
      microdropIds[index] = index;
    }
    dropGeometry.setAttribute("instanceSize", instanceSize);
    dropGeometry.setAttribute(
      "aDropId",
      new THREE.InstancedBufferAttribute(microdropIds, 1)
    );
    const dropMaterial = new THREE.ShaderMaterial({
      blending: THREE.CustomBlending,
      blendDst: THREE.OneMinusSrcColorFactor,
      blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneMinusDstColorFactor,
      blendSrcAlpha: THREE.OneFactor,
      depthTest: false,
      depthWrite: false,
      fragmentShader: raindropMapFragmentShader,
      toneMapped: false,
      transparent: true,
      uniforms: {
        uMainTex: { value: raindropTexture },
        uSeed: { value: 1 },
        uSizeRange: { value: new THREE.Vector2(10, 30) },
        uSpawnRect: { value: new THREE.Vector4(0, 0, 1, 1) },
      },
      vertexShader: raindropMapVertexShader,
    });
    const dropMesh = new THREE.InstancedMesh(
      dropGeometry,
      dropMaterial,
      maxDropInstances
    );
    dropMesh.frustumCulled = false;
    dropScene.add(dropMesh);
    const microdropMaterial = new THREE.ShaderMaterial({
      blending: THREE.CustomBlending,
      blendDst: THREE.OneMinusSrcColorFactor,
      blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneMinusDstColorFactor,
      blendSrcAlpha: THREE.OneFactor,
      depthTest: false,
      depthWrite: false,
      fragmentShader: microdropletMapFragmentShader,
      toneMapped: false,
      transparent: true,
      uniforms: {
        uMainTex: { value: raindropTexture },
      },
      vertexShader: raindropMapVertexShader,
    });
    const microdropMesh = new THREE.InstancedMesh(
      dropGeometry,
      microdropMaterial,
      maxMicrodropInstances
    );
    microdropMesh.frustumCulled = false;
    const microdropScene = new THREE.Scene();
    microdropScene.add(microdropMesh);
    const trailEraseScene = new THREE.Scene();
    const trailEraseGeometry = new THREE.PlaneGeometry(1, 1);
    const trailStrength = new THREE.InstancedBufferAttribute(
      new Float32Array(maxTrailEraseInstances),
      1
    );
    trailEraseGeometry.setAttribute("trailStrength", trailStrength);
    const trailDropMaterial = new THREE.ShaderMaterial({
      blending: THREE.CustomBlending,
      blendDst: THREE.OneMinusSrcColorFactor,
      blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
      blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneMinusDstColorFactor,
      blendSrcAlpha: THREE.OneFactor,
      depthTest: false,
      depthWrite: false,
      fragmentShader: trailDropFragmentShader,
      toneMapped: false,
      transparent: true,
      vertexShader: trailEraseVertexShader,
    });
    const trailEraseMesh = new THREE.InstancedMesh(
      trailEraseGeometry,
      trailDropMaterial,
      maxTrailEraseInstances
    );
    trailEraseMesh.frustumCulled = false;
    trailEraseScene.add(trailEraseMesh);
    const dropMatrix = new THREE.Matrix4();

    const cars: Car[] = [];
    const dynamicDisposables: Array<THREE.Object3D | THREE.Material | THREE.BufferGeometry> = [];

    if (backgroundMode === "street") {
      withSeededRandom(`street-world-${timeOfDay}-${quality}`, () =>
        populateWorld(
          worldScene,
          cars,
          profile,
          settings.windowBudget,
          dynamicDisposables
        )
      );
    }

    const clock = new THREE.Clock();
    let animationId = 0;
    let benchmarkFrameMs = 0;
    let benchmarkFrames = 0;
    let benchmarkLastFrameAt = performance.now();
    let benchmarkLastReportAt = performance.now();
    let benchmarkRenderMs = 0;
    let lastPixelRatio = 0;
    let lastRainHeight = 0;
    let lastRainWidth = 0;
    let lastSafeHeight = 0;
    let lastSafeWidth = 0;
    let microdropSpawnBudget = 0;
    let rainMapHeight = 1;
    let sceneTime = 0;
    let targetMegapixels = 0;
    let rainMapMegapixels = 0;
    const dropPosition = new THREE.Vector3();
    const dropQuaternion = new THREE.Quaternion();
    const dropScale = new THREE.Vector3();
    const trailPosition = new THREE.Vector3();
    const trailQuaternion = new THREE.Quaternion();
    const trailScale = new THREE.Vector3();
    const zAxis = new THREE.Vector3(0, 0, 1);

    const resize = () => {
      const { width, height } = host.getBoundingClientRect();
      const safeWidth = Math.max(1, Math.floor(width));
      const safeHeight = Math.max(1, Math.floor(height));
      if (safeWidth <= 1 || safeHeight <= 1) {
        return;
      }
      const pixelRatio = Math.min(window.devicePixelRatio, settings.pixelRatio);

      renderer.setPixelRatio(pixelRatio);
      renderer.setSize(safeWidth, safeHeight, false);
      camera.aspect = safeWidth / safeHeight;
      camera.updateProjectionMatrix();

      const targetWidth = Math.max(1, Math.floor(safeWidth * pixelRatio));
      const targetHeight = Math.max(1, Math.floor(safeHeight * pixelRatio));
      const rainWidth = Math.max(1, Math.floor(targetWidth * settings.raindropMapScale));
      const rainHeight = Math.max(1, Math.floor(targetHeight * settings.raindropMapScale));
      targetMegapixels = (targetWidth * targetHeight) / 1_000_000;
      rainMapMegapixels = (rainWidth * rainHeight) / 1_000_000;

      if (
        safeWidth === lastSafeWidth &&
        safeHeight === lastSafeHeight &&
        pixelRatio === lastPixelRatio &&
        rainWidth === lastRainWidth &&
        rainHeight === lastRainHeight
      ) {
        return;
      }
      lastSafeWidth = safeWidth;
      lastSafeHeight = safeHeight;
      lastPixelRatio = pixelRatio;
      lastRainWidth = rainWidth;
      lastRainHeight = rainHeight;

      target.setSize(targetWidth, targetHeight);
      const glareWidth = Math.max(1, Math.floor(targetWidth * 0.52));
      const glareHeight = Math.max(1, Math.floor(targetHeight * 0.52));
      glareTargetA.setSize(glareWidth, glareHeight);
      glareTargetB.setSize(glareWidth, glareHeight);
      glareBlurMaterial.uniforms.uTexelSize.value.set(
        1 / glareWidth,
        1 / glareHeight
      );
      frostTargetA.setSize(rainWidth, rainHeight);
      frostTargetB.setSize(rainWidth, rainHeight);
      frostBlurMaterial.uniforms.uTexelSize.value.set(
        1 / rainWidth,
        1 / rainHeight
      );
      mistBackgroundTargetA.setSize(rainWidth, rainHeight);
      mistBackgroundTargetB.setSize(rainWidth, rainHeight);
      raindropTarget.setSize(rainWidth, rainHeight);
      mistTarget.setSize(rainWidth, rainHeight);
      dropletTarget.setSize(rainWidth, rainHeight);
      renderer.setRenderTarget(mistTarget);
      renderer.setClearColor(0x858585, 0.52);
      renderer.clear(true, true, true);
      renderer.setRenderTarget(dropletTarget);
      renderer.setClearColor(0x000000, 0);
      renderer.clear(true, true, true);
      microdropSpawnBudget = 0;
      microdropMesh.count = 0;
      renderer.setRenderTarget(null);
      paneSimulation.resize(rainWidth, rainHeight);
      rainMapHeight = rainHeight;
      demoBackgroundMaterial.uniforms.uViewportAspect.value =
        targetWidth / targetHeight;
      dropCamera.left = 0;
      dropCamera.right = rainWidth;
      dropCamera.top = rainHeight;
      dropCamera.bottom = 0;
      dropCamera.updateProjectionMatrix();
    };

    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();

    const updateRaindropMesh = () => {
      const drops = paneSimulation.renderDrops;
      const count = Math.min(drops.length, maxDropInstances);
      dropMesh.count = count;

      for (let index = 0; index < count; index += 1) {
        const drop = drops[index];
        dropPosition.set(drop.x, drop.y, 0);
        dropScale.set(drop.sizeX, drop.sizeY, 1);
        dropMatrix.compose(dropPosition, dropQuaternion, dropScale);
        dropMesh.setMatrixAt(index, dropMatrix);
        instanceSize.setX(index, drop.size);
      }

      dropMesh.instanceMatrix.needsUpdate = true;
      instanceSize.needsUpdate = true;
    };

    const updateMicrodropMesh = (rainDelta: number) => {
      if (rainDelta <= 0) {
        microdropMesh.count = 0;
        return 0;
      }

      microdropSpawnBudget = Math.min(
        maxMicrodropInstances,
        microdropSpawnBudget + 260 * rainDelta
      );
      const count = Math.min(7, Math.floor(microdropSpawnBudget));
      microdropMesh.count = count;
      microdropSpawnBudget -= count;

      for (let index = 0; index < count; index += 1) {
        const size = 8 + Math.random() * 17;
        dropPosition.set(
          Math.random() * Math.max(1, raindropTarget.width),
          Math.random() * rainMapHeight,
          0
        );
        dropScale.set(size, size, 1);
        dropMatrix.compose(dropPosition, dropQuaternion, dropScale);
        microdropMesh.setMatrixAt(index, dropMatrix);
      }

      if (count > 0) {
        microdropMesh.instanceMatrix.needsUpdate = true;
      }

      return count;
    };

    const updateTrailEraseMesh = () => {
      const trails = paneSimulation.renderTrails;
      const count = Math.min(trails.length, maxTrailEraseInstances);
      trailEraseMesh.count = count;

      for (let index = 0; index < count; index += 1) {
        const trail = trails[index];
        trailPosition.set(trail.x, trail.y, 0);
        trailQuaternion.setFromAxisAngle(zAxis, trail.angle);
        trailScale.set(trail.width, trail.length, 1);
        dropMatrix.compose(trailPosition, trailQuaternion, trailScale);
        trailEraseMesh.setMatrixAt(index, dropMatrix);
        trailStrength.setX(index, trail.strength);
      }

      if (count > 0) {
        trailEraseMesh.instanceMatrix.needsUpdate = true;
        trailStrength.needsUpdate = true;
      }

      return count;
    };

    const renderPostMaterial = (
      material: THREE.ShaderMaterial,
      destination: THREE.WebGLRenderTarget
    ) => {
      glareQuad.material = material;
      renderer.setRenderTarget(destination);
      renderer.render(glareScene, screenCamera);
    };

    const copyToGlassTarget = () => {
      copyMaterial.uniforms.uImage.value = target.texture;
      renderPostMaterial(copyMaterial, frostTargetB);
    };

    const renderGlare = () => {
      glareExtractMaterial.uniforms.uScene.value = target.texture;
      renderPostMaterial(glareExtractMaterial, glareTargetB);
      renderBlur(glareTargetB, 3, glareTargetA);
    };

    const renderBlur = (
      sourceTarget: THREE.WebGLRenderTarget,
      steps: number,
      destination: THREE.WebGLRenderTarget
    ) => {
      let source = sourceTarget;

      for (let index = 0; index < steps; index += 1) {
        const blurTarget = blurTargets[index];
        blurTarget.setSize(
          Math.max(1, Math.floor(source.width / 2)),
          Math.max(1, Math.floor(source.height / 2))
        );
        pyramidBlurMaterial.uniforms.uMainTex.value = source.texture;
        pyramidBlurMaterial.uniforms.uTexSize.value.set(
          source.width,
          source.height,
          1 / Math.max(1, source.width),
          1 / Math.max(1, source.height)
        );
        pyramidBlurMaterial.uniforms.uSampleOffset.value = 1;
        renderPostMaterial(pyramidBlurMaterial, blurTarget);
        source = blurTarget;
      }

      for (let index = steps - 2; index >= 0; index -= 1) {
        const blurTarget = blurTargets[index];
        pyramidBlurMaterial.uniforms.uMainTex.value = source.texture;
        pyramidBlurMaterial.uniforms.uTexSize.value.set(
          source.width,
          source.height,
          1 / Math.max(1, source.width),
          1 / Math.max(1, source.height)
        );
        renderPostMaterial(pyramidBlurMaterial, blurTarget);
        source = blurTarget;
      }

      pyramidBlurMaterial.uniforms.uMainTex.value = source.texture;
      pyramidBlurMaterial.uniforms.uTexSize.value.set(
        source.width,
        source.height,
        1 / Math.max(1, source.width),
        1 / Math.max(1, source.height)
      );
      renderPostMaterial(pyramidBlurMaterial, destination);
    };

    const reportBenchmark = (renderMs: number, frameMs: number) => {
      const handler = benchmarkRef.current;
      const id = benchmarkIdRef.current;
      if (!handler || !id) {
        return;
      }

      benchmarkFrames += 1;
      benchmarkFrameMs += frameMs;
      benchmarkRenderMs += renderMs;

      const now = performance.now();
      if (now - benchmarkLastReportAt < 700 || benchmarkFrames === 0) {
        return;
      }

      handler(id, {
        drawCalls: renderer.info.render.calls,
        dropCount: nativeGlass ? dropMesh.count : 0,
        fps: 1000 / Math.max(1, benchmarkFrameMs / benchmarkFrames),
        frameMs: benchmarkFrameMs / benchmarkFrames,
        geometries: renderer.info.memory.geometries,
        nativeGlass,
        rainMapMp: rainMapMegapixels,
        renderMs: benchmarkRenderMs / benchmarkFrames,
        targetMp: targetMegapixels,
        textures: renderer.info.memory.textures,
        triangles: renderer.info.render.triangles,
      });

      benchmarkFrameMs = 0;
      benchmarkFrames = 0;
      benchmarkLastReportAt = now;
      benchmarkRenderMs = 0;
    };

    const animate = () => {
      animationId = window.requestAnimationFrame(animate);
      const frameStartedAt = performance.now();
      const frameMs = frameStartedAt - benchmarkLastFrameAt;
      benchmarkLastFrameAt = frameStartedAt;
      renderer.info.reset();
      const rawDelta = Math.min(clock.getDelta(), 0.04);
      const delta = pausedRef.current ? 0 : rawDelta * (reducedMotion ? 0.28 : 1);
      const rainDelta =
        nativeGlass && raindropTextureReady && delta > 0
          ? Math.min(delta * 1.65, 0.05)
          : 0;
      sceneTime += delta;

      if (rainDelta > 0) {
        paneSimulation.update(rainDelta);
      }
      if (nativeGlass) {
        updateRaindropMesh();
      }

      renderer.setRenderTarget(nativeGlass ? target : null);
      renderer.setClearColor(0x050708, 1);
      if (backgroundMode === "demo") {
        renderer.render(demoBackgroundScene, screenCamera);
      } else {
        updateCars(cars, sceneTime);
        camera.position.x = -4.45 + Math.sin(sceneTime * 0.33) * 0.065;
        camera.position.y = 2.55 + Math.sin(sceneTime * 0.21) * 0.025;
        camera.lookAt(
          2.15 + Math.sin(sceneTime * 0.18) * 0.18,
          1.02,
          -30
        );
        renderer.render(worldScene, camera);
      }

      if (!nativeGlass) {
        reportBenchmark(performance.now() - frameStartedAt, frameMs);
        return;
      }

      renderGlare();
      copyToGlassTarget();
      renderBlur(frostTargetB, 3, frostTargetA);
      renderBlur(frostTargetB, 4, mistBackgroundTargetA);

      const microdropCount = updateMicrodropMesh(rainDelta);
      const trailEraseCount = updateTrailEraseMesh();
      renderer.setRenderTarget(raindropTarget);
      renderer.setClearColor(0x000000, 0);
      renderer.clear(true, true, true);
      const previousAutoClear = renderer.autoClear;
      renderer.autoClear = false;
      if (trailEraseCount > 0) {
        renderer.render(trailEraseScene, dropCamera);
      }
      if (microdropCount > 0) {
        renderer.setRenderTarget(dropletTarget);
        renderer.render(microdropScene, dropCamera);
      }
      if (rainDelta > 0) {
        mistAddMaterial.uniforms.uAmount.value = rainDelta / 16.5;
        renderer.setRenderTarget(mistTarget);
        mistQuad.material = mistAddMaterial;
        renderer.render(mistScene, screenCamera);
      }
      renderer.setRenderTarget(raindropTarget);
      renderer.render(dropScene, dropCamera);
      if (rainDelta > 0) {
        mistQuad.material = mistEraseMaterial;
        renderer.setRenderTarget(mistTarget);
        renderer.render(mistScene, screenCamera);
        renderer.setRenderTarget(dropletTarget);
        renderer.render(mistScene, screenCamera);
      }
      renderer.autoClear = previousAutoClear;

      glassMaterial.uniforms.uRainVisibility.value = rainVisibilityRef.current;
      renderer.setRenderTarget(null);
      renderer.render(screenScene, screenCamera);
      reportBenchmark(performance.now() - frameStartedAt, frameMs);
    };

    animate();

    return () => {
      window.cancelAnimationFrame(animationId);
      observer.disconnect();
      target.dispose();
      glareTargetA.dispose();
      glareTargetB.dispose();
      frostTargetA.dispose();
      frostTargetB.dispose();
      mistBackgroundTargetA.dispose();
      mistBackgroundTargetB.dispose();
      blurTargets.forEach((blurTarget) => blurTarget.dispose());
      raindropTarget.dispose();
      mistTarget.dispose();
      dropletTarget.dispose();
      demoTexture.dispose();
      demoBackgroundQuad.geometry.dispose();
      demoBackgroundMaterial.dispose();
      raindropTexture.dispose();
      screenQuad.geometry.dispose();
      glassMaterial.dispose();
      copyMaterial.dispose();
      pyramidBlurMaterial.dispose();
      glareQuad.geometry.dispose();
      glareExtractMaterial.dispose();
      glareBlurMaterial.dispose();
      frostBlurMaterial.dispose();
      mistQuad.geometry.dispose();
      mistAddMaterial.dispose();
      mistEraseMaterial.dispose();
      dropGeometry.dispose();
      dropMaterial.dispose();
      microdropMaterial.dispose();
      trailEraseGeometry.dispose();
      trailDropMaterial.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      dynamicDisposables.forEach((item) => {
        if ("dispose" in item && typeof item.dispose === "function") {
          item.dispose();
        }
      });
    };
  }, [backgroundMode, nativeGlass, quality, timeOfDay]);

  return (
    <div
      aria-label="Rain Window"
      className="scene-host"
      data-background-mode={backgroundMode}
      data-native-glass={nativeGlass}
      data-quality={quality}
      data-time={timeOfDay}
      ref={hostRef}
      role="img"
    />
  );
}

function populateWorld(
  scene: THREE.Scene,
  cars: Car[],
  profile: TimeProfile,
  windowBudget: number,
  disposables: Array<THREE.Object3D | THREE.Material | THREE.BufferGeometry>
) {
  const hemi = new THREE.HemisphereLight(
    profile.hemiSky,
    profile.hemiGround,
    profile.hemiIntensity
  );
  scene.add(hemi);

  const roadMaterial = new THREE.MeshPhysicalMaterial({
    clearcoat: 0.95,
    clearcoatRoughness: 0.12,
    color: profile.roadColor,
    metalness: 0.26,
    roughness: 0.18,
  });
  const road = new THREE.Mesh(
    new THREE.PlaneGeometry(15.5, ROAD_LENGTH),
    roadMaterial
  );
  road.rotation.x = -Math.PI / 2;
  road.position.set(0, 0, ROAD_CENTER_Z);
  scene.add(road);
  disposables.push(road.geometry, roadMaterial);
  createRoadDetails(scene, disposables);

  const sidewalkMaterial = new THREE.MeshStandardMaterial({
    color: 0x121719,
    metalness: 0.08,
    roughness: 0.48,
  });
  for (const x of [-9.8, 9.8]) {
    const left = new THREE.Mesh(
      new THREE.PlaneGeometry(4.4, ROAD_LENGTH),
      sidewalkMaterial
    );
    left.rotation.x = -Math.PI / 2;
    left.position.set(x, 0.015, ROAD_CENTER_Z);
    scene.add(left);
    disposables.push(left.geometry);
  }
  disposables.push(sidewalkMaterial);

  createBuildings(scene, profile, windowBudget, disposables);
  createStreetLights(scene, profile, disposables);
  createShopGlows(scene, profile, disposables);

  const palettes = [0x2b5f74, 0x702f44, 0x182e4f, 0x7d6a46, 0x33403b, 0x5f2931];
  const lanes: Array<{ direction: 1 | -1; laneX: number; phase: number; speed: number }> = [
    {
      direction: 1,
      laneX: -2.2,
      phase: Math.random() * MIN_CAR_OFFSET_SPACING,
      speed: 4.9 + Math.random() * 0.8,
    },
    {
      direction: -1,
      laneX: 2.25,
      phase: Math.random() * MIN_CAR_OFFSET_SPACING,
      speed: 5.2 + Math.random() * 0.8,
    },
  ];

  for (const [laneIndex, lane] of lanes.entries()) {
    for (let laneCarIndex = 0; laneCarIndex < CARS_PER_LANE; laneCarIndex += 1) {
      const carIndex = laneIndex * CARS_PER_LANE + laneCarIndex;
      cars.push(
        createCar({
          color: palettes[carIndex % palettes.length],
          direction: lane.direction,
          laneX: lane.laneX,
          offset: lane.phase + laneCarIndex * MIN_CAR_OFFSET_SPACING,
          speed: lane.speed,
          wobble: Math.random() * Math.PI * 2,
        }, profile, scene, disposables)
      );
    }
  }

  const sillMaterial = new THREE.MeshStandardMaterial({
    color: 0x060504,
    metalness: 0.1,
    roughness: 0.62,
  });
  const sill = new THREE.Mesh(new THREE.BoxGeometry(18, 0.28, 0.7), sillMaterial);
  sill.position.set(0, 0.18, 3.95);
  scene.add(sill);
  disposables.push(sill.geometry, sillMaterial);

}

function createRoadDetails(
  scene: THREE.Scene,
  disposables: Array<THREE.Object3D | THREE.Material | THREE.BufferGeometry>
) {
  const stripeMat = new THREE.MeshBasicMaterial({
    blending: THREE.AdditiveBlending,
    color: 0xe7d6a2,
    opacity: 0.38,
    side: THREE.DoubleSide,
    toneMapped: false,
    transparent: true,
  });
  const dashGeo = new THREE.PlaneGeometry(0.12, 2.6);
  disposables.push(stripeMat, dashGeo);

  for (let index = 0; index < ROAD_DASH_COUNT; index += 1) {
    const dash = new THREE.Mesh(dashGeo, stripeMat);
    dash.rotation.x = -Math.PI / 2;
    dash.position.set(0.08, 0.037, 4 - index * 3.2);
    scene.add(dash);
  }

}

function createBuildings(
  scene: THREE.Scene,
  profile: TimeProfile,
  windowBudget: number,
  disposables: Array<THREE.Object3D | THREE.Material | THREE.BufferGeometry>
) {
  const buildingGeo = new THREE.BoxGeometry(1, 1, 1);
  const buildingMat = new THREE.MeshStandardMaterial({
    color: profile.buildingColor,
    metalness: 0.08,
    roughness: 0.72,
  });
  disposables.push(buildingGeo, buildingMat);

  const windowGeo = new THREE.PlaneGeometry(0.42, 0.78);
  const windowMat = new THREE.MeshBasicMaterial({
    color: 0xffcb80,
    opacity: 0.95,
    side: THREE.DoubleSide,
    toneMapped: false,
    transparent: true,
    vertexColors: true,
  });
  const windowMesh = new THREE.InstancedMesh(windowGeo, windowMat, windowBudget);
  windowMesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  disposables.push(windowGeo, windowMat, windowMesh);

  const tempMatrix = new THREE.Matrix4();
  const tempQuat = new THREE.Quaternion();
  const tempScale = new THREE.Vector3(1, 1, 1);
  const tempColor = new THREE.Color();
  let windowIndex = 0;

  for (let depthIndex = 0; depthIndex < BUILDING_DEPTH_COUNT; depthIndex += 1) {
    for (const side of [-1, 1] as const) {
      const height = 6 + Math.random() * 8;
      const width = 3.4 + Math.random() * 2.6;
      const depth = 4.5 + Math.random() * 2.5;
      const z = -5.5 - depthIndex * 4.2 - Math.random() * 1.2;
      const x = side * (8.2 + Math.random() * 2.4);

      const building = new THREE.Mesh(buildingGeo, buildingMat);
      building.scale.set(width, height, depth);
      building.position.set(x, height / 2 - 0.05, z);
      scene.add(building);

      const rows = Math.floor(height / 1.15);
      const cols = Math.floor(depth / 0.86);
      const faceX = x - side * (width / 2 + 0.012);
      tempQuat.setFromEuler(new THREE.Euler(0, side === 1 ? -Math.PI / 2 : Math.PI / 2, 0));

      for (let row = 1; row < rows; row += 1) {
        for (let col = 0; col < cols; col += 1) {
          if (windowIndex >= windowBudget || Math.random() < 0.36) {
            continue;
          }

          const y = 0.72 + row * 1.05;
          const windowZ = z - depth / 2 + 0.62 + col * 0.86;
          tempMatrix.compose(
            new THREE.Vector3(faceX, y, windowZ),
            tempQuat,
            tempScale
          );
          windowMesh.setMatrixAt(windowIndex, tempMatrix);
          tempColor.setHSL(
            0.08 + Math.random() * 0.06,
            profile.windowSaturation,
            profile.windowLightness + Math.random() * 0.18
          );
          windowMesh.setColorAt(windowIndex, tempColor);
          windowIndex += 1;
        }
      }
    }
  }

  windowMesh.count = windowIndex;
  windowMesh.instanceMatrix.needsUpdate = true;
  if (windowMesh.instanceColor) {
    windowMesh.instanceColor.needsUpdate = true;
  }
  scene.add(windowMesh);
}

function createStreetLights(
  scene: THREE.Scene,
  profile: TimeProfile,
  disposables: Array<THREE.Object3D | THREE.Material | THREE.BufferGeometry>
) {
  const poleGeo = new THREE.CylinderGeometry(0.045, 0.065, 3.2, 8);
  const lampsOn = profile.streetLight > 0;
  const poleMat = new THREE.MeshStandardMaterial({
    color: lampsOn ? 0x1c1f20 : 0x30373a,
    metalness: 0.7,
    roughness: 0.36,
  });
  const lampGeo = new THREE.SphereGeometry(0.23, 18, 10);
  const lampMat = lampsOn
    ? new THREE.MeshBasicMaterial({ color: 0xffc477, toneMapped: false })
    : new THREE.MeshStandardMaterial({
        color: 0x576064,
        emissive: 0x000000,
        metalness: 0.08,
        roughness: 0.56,
      });
  disposables.push(poleGeo, poleMat, lampGeo, lampMat);

  for (let index = 0; index < STREET_LIGHT_COUNT; index += 1) {
    const z = -5.2 - index * 4.8;
    const x = index % 2 === 0 ? -5.35 : 5.35;
    const pole = new THREE.Mesh(poleGeo, poleMat);
    pole.position.set(x, 1.6, z);
    scene.add(pole);

    const lamp = new THREE.Mesh(lampGeo, lampMat);
    lamp.position.set(x, 3.32, z);
    scene.add(lamp);

    if (lampsOn && index < 10) {
      const light = new THREE.PointLight(0xffa55f, profile.streetLight, 12, 1.7);
      light.position.copy(lamp.position);
      scene.add(light);
    }
  }
}

function createShopGlows(
  scene: THREE.Scene,
  profile: TimeProfile,
  disposables: Array<THREE.Object3D | THREE.Material | THREE.BufferGeometry>
) {
  const signGeo = new THREE.PlaneGeometry(2.15, 0.46);
  const glowGeo = new THREE.PlaneGeometry(2.8, 0.9);
  const palette = [0x62d0c8, 0xff8f70, 0xf6c66f, 0x7db7ff];
  disposables.push(signGeo, glowGeo);

  for (let index = 0; index < SHOP_GLOW_COUNT; index += 1) {
    const side = index % 2 === 0 ? -1 : 1;
    const z = -6.5 - Math.floor(index / 2) * 5.6;
    const color = palette[index % palette.length];
    const signMat = new THREE.MeshBasicMaterial({
      blending: THREE.AdditiveBlending,
      color,
      opacity: 0.86,
      side: THREE.DoubleSide,
      toneMapped: false,
      transparent: true,
    });
    const haloMat = new THREE.MeshBasicMaterial({
      blending: THREE.AdditiveBlending,
      color,
      opacity: 0.18,
      side: THREE.DoubleSide,
      toneMapped: false,
      transparent: true,
    });
    const rotation = side === 1 ? -Math.PI / 2 : Math.PI / 2;
    const x = side * 5.85;

    const halo = new THREE.Mesh(glowGeo, haloMat);
    halo.position.set(x - side * 0.03, 1.52, z);
    halo.rotation.y = rotation;
    scene.add(halo);

    const sign = new THREE.Mesh(signGeo, signMat);
    sign.position.set(x - side * 0.05, 1.54, z);
    sign.rotation.y = rotation;
    scene.add(sign);

    if (index < 12) {
      const light = new THREE.PointLight(color, profile.shopLight, 5.5, 2.1);
      light.position.set(x - side * 0.45, 1.5, z);
      scene.add(light);
    }

    disposables.push(signMat, haloMat);
  }
}

function createCar(
  config: {
    color: THREE.ColorRepresentation;
    direction: 1 | -1;
    laneX: number;
    offset: number;
    speed: number;
    wobble: number;
  },
  profile: TimeProfile,
  scene: THREE.Scene,
  disposables: Array<THREE.Object3D | THREE.Material | THREE.BufferGeometry>
): Car {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshPhysicalMaterial({
    clearcoat: 0.5,
    clearcoatRoughness: 0.26,
    color: config.color,
    metalness: 0.45,
    opacity: 1,
    roughness: 0.34,
    transparent: true,
  });
  const cabinMat = new THREE.MeshStandardMaterial({
    color: 0x15212a,
    emissive: profile.cabinEmissive,
    emissiveIntensity: 0.46,
    metalness: 0.2,
    opacity: 1,
    roughness: 0.18,
    transparent: true,
  });
  const lightMat = new THREE.MeshBasicMaterial({
    color: 0xf8fbff,
    opacity: 1,
    toneMapped: false,
    transparent: true,
  });
  const reflectionMat = new THREE.MeshBasicMaterial({
    blending: THREE.AdditiveBlending,
    color: 0xf6fbff,
    depthWrite: false,
    opacity: 0.24,
    side: THREE.DoubleSide,
    toneMapped: false,
    transparent: true,
  });
  const tailMat = new THREE.MeshBasicMaterial({
    color: 0xff3347,
    opacity: 1,
    toneMapped: false,
    transparent: true,
  });
  const tailReflectionMat = new THREE.MeshBasicMaterial({
    blending: THREE.AdditiveBlending,
    color: 0xff2636,
    depthWrite: false,
    opacity: 0.18,
    side: THREE.DoubleSide,
    toneMapped: false,
    transparent: true,
  });
  const fadeMaterials = [
    { material: bodyMat, opacity: 1 },
    { material: cabinMat, opacity: 1 },
    { material: lightMat, opacity: 1 },
    { material: reflectionMat, opacity: 0.24 },
    { material: tailMat, opacity: 1 },
    { material: tailReflectionMat, opacity: 0.18 },
  ];

  const body = new THREE.Mesh(new THREE.BoxGeometry(2.05, 0.42, 0.9), bodyMat);
  body.position.y = 0.38;
  group.add(body);

  const cabin = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.42, 0.72), cabinMat);
  cabin.position.set(-0.18, 0.75, 0);
  group.add(cabin);

  for (const z of [-0.32, 0.32]) {
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.18), lightMat);
    head.position.set(1.08, 0.42, z);
    group.add(head);

    const reflection = new THREE.Mesh(new THREE.CircleGeometry(1, 24), reflectionMat);
    reflection.position.set(1.64, 0.028, z);
    reflection.rotation.x = -Math.PI / 2;
    reflection.scale.set(1.15, 0.18, 1);
    group.add(reflection);

    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.075, 0.16), tailMat);
    tail.position.set(-1.08, 0.42, z);
    group.add(tail);

    const tailReflection = new THREE.Mesh(
      new THREE.CircleGeometry(0.72, 20),
      tailReflectionMat
    );
    tailReflection.position.set(-1.42, 0.03, z);
    tailReflection.rotation.x = -Math.PI / 2;
    tailReflection.scale.set(0.74, 0.13, 1);
    group.add(tailReflection);
  }

  group.rotation.y = config.direction === 1 ? -Math.PI / 2 : Math.PI / 2;
  group.position.set(config.laneX, 0, 0);
  scene.add(group);

  group.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      disposables.push(child.geometry, child.material);
    }
  });

  return {
    baseSpeed: config.speed,
    direction: config.direction,
    fadeMaterials,
    group,
    laneX: config.laneX,
    offset: config.offset,
    wobble: config.wobble,
  };
}

function smoothstep(edge0: number, edge1: number, value: number) {
  const x = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return x * x * (3 - 2 * x);
}

function updateCars(cars: Car[], time: number) {
  for (const car of cars) {
    const z =
      ((((time * car.baseSpeed * car.direction + car.offset) % CAR_TRACK_LENGTH) +
        CAR_TRACK_LENGTH) %
        CAR_TRACK_LENGTH) -
      CAR_TRACK_LENGTH / 2 +
      CAR_TRACK_CENTER_Z;
    const nearFade =
      1 - smoothstep(CAR_FADE_NEAR_START_Z, CAR_FADE_NEAR_END_Z, z);
    const farFade = smoothstep(CAR_FADE_FAR_END_Z, CAR_FADE_FAR_START_Z, z);
    const opacity = Math.max(0, Math.min(1, nearFade * farFade));

    for (const { material, opacity: baseOpacity } of car.fadeMaterials) {
      material.opacity = baseOpacity * opacity;
    }

    car.group.visible = opacity > 0.015;
    car.group.position.x = car.laneX + Math.sin(time * 1.1 + car.wobble) * 0.035;
    car.group.position.z = z;
    car.group.position.y = Math.sin(time * 3 + car.wobble) * 0.012;
  }
}
