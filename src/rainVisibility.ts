export const RAIN_VISIBILITY_SLIDER = {
  defaultValue: 1.45,
  max: 2.4,
  min: 0.35,
  step: 0.05,
} as const;

export const RAIN_VISIBILITY_RANGE =
  RAIN_VISIBILITY_SLIDER.max - RAIN_VISIBILITY_SLIDER.min;

export const RAIN_VISIBILITY_SNAPSHOT_OVERLAY = {
  base: 0.72,
  scale: 0.28,
} as const;

export const RAIN_VISIBILITY_BLEND_OVERLAY = {
  base: 0.42,
  scale: 0.22,
} as const;

export const RAIN_VISIBILITY_BLEND_DROPS = {
  base: 0.48,
  scale: 0.32,
} as const;

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

export function normalizeRainVisibility(value: number) {
  return clamp01(
    (value - RAIN_VISIBILITY_SLIDER.min) / RAIN_VISIBILITY_RANGE
  );
}

export function getSnapshotRainOverlayOpacity(value: number) {
  return (
    RAIN_VISIBILITY_SNAPSHOT_OVERLAY.base +
    normalizeRainVisibility(value) * RAIN_VISIBILITY_SNAPSHOT_OVERLAY.scale
  );
}

export function getNativeGlassOverlayOpacity(value: number) {
  return getSnapshotRainOverlayOpacity(value);
}

export function getBlendRainOverlayOpacity(value: number) {
  return (
    RAIN_VISIBILITY_BLEND_OVERLAY.base +
    normalizeRainVisibility(value) * RAIN_VISIBILITY_BLEND_OVERLAY.scale
  );
}

export function getBlendRainDropOpacity(value: number) {
  return (
    RAIN_VISIBILITY_BLEND_DROPS.base +
    normalizeRainVisibility(value) * RAIN_VISIBILITY_BLEND_DROPS.scale
  );
}
