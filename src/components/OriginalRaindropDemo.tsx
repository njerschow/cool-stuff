import { type CSSProperties, useEffect, useRef } from "react";
import {
  getBlendRainDropOpacity,
  getBlendRainOverlayOpacity,
  getSnapshotRainOverlayOpacity,
  RAIN_VISIBILITY_SLIDER,
} from "../rainVisibility";

type RaindropFxInstance = {
  destroy?: () => void;
  resize: (width: number, height: number) => void;
  setBackground?: (background: string | CanvasImageSource) => Promise<void>;
  setLiveBackground?: (background: CanvasImageSource) => Promise<void>;
  start: () => Promise<void>;
  stop?: () => void;
};

type RaindropFxConstructor = new (options: {
  background: string;
  canvas: HTMLCanvasElement;
  [key: string]: unknown;
}) => RaindropFxInstance;

export type RaindropFxBenchmarkStats = {
  canvasMp: number;
  captureHz: number;
  captureMs: number;
};

declare global {
  interface Window {
    RaindropFX?: RaindropFxConstructor;
  }
}

let raindropFxScript: Promise<void> | undefined;
const maxOverlayTextureEdge = 2600;
const maxOverlayTexturePixels = 4_800_000;
let neutralRainBackground: string | undefined;

function loadRaindropFxScript() {
  if (window.RaindropFX) {
    return Promise.resolve();
  }

  if (!raindropFxScript) {
    raindropFxScript = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.async = true;
      script.src = "/vendor/raindrop-fx/index.js?v=live-background-1";
      script.onload = () => resolve();
      script.onerror = () =>
        reject(new Error("Could not load raindrop-fx demo renderer."));
      document.head.appendChild(script);
    });
  }

  return raindropFxScript;
}

function createNeutralRainBackground() {
  if (neutralRainBackground) {
    return neutralRainBackground;
  }

  const canvas = document.createElement("canvas");
  canvas.width = 480;
  canvas.height = 720;
  const context = canvas.getContext("2d");
  if (!context) {
    return "";
  }

  const gradient = context.createLinearGradient(0, 0, canvas.width, canvas.height);
  gradient.addColorStop(0, "#808588");
  gradient.addColorStop(0.46, "#8a8d8e");
  gradient.addColorStop(1, "#7d8487");
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);

  for (let index = 0; index < 80; index += 1) {
    const x = Math.random() * canvas.width;
    const y = Math.random() * canvas.height;
    const radius = 24 + Math.random() * 120;
    const glow = context.createRadialGradient(x, y, 0, x, y, radius);
    const brightness = Math.random() > 0.5 ? 142 : 82;
    glow.addColorStop(0, `rgba(${brightness}, ${brightness + 6}, ${brightness + 8}, 0.12)`);
    glow.addColorStop(1, "rgba(128, 128, 128, 0)");
    context.fillStyle = glow;
    context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }

  neutralRainBackground = canvas.toDataURL("image/jpeg", 0.82);
  return neutralRainBackground;
}

export function OriginalRaindropDemo() {
  return (
    <RaindropFxCanvas
      ariaLabel="Raindrop FX demo"
      background="/vendor/raindrop-fx/84765992_p0.jpg"
      className="raindrop-fx-demo"
    />
  );
}

export function OriginalRaindropOverlay({
  benchmarkId,
  canvasId,
  captureIntervalMs = 700,
  effectScale = 1,
  onBenchmark,
  options,
  sourceSelector,
  variant = "blend",
  visibility = RAIN_VISIBILITY_SLIDER.defaultValue,
}: {
  benchmarkId?: string;
  canvasId?: string;
  captureIntervalMs?: number;
  effectScale?: number;
  onBenchmark?: (id: string, stats: RaindropFxBenchmarkStats) => void;
  options?: Record<string, unknown>;
  sourceSelector?: string;
  variant?: "blend" | "snapshot";
  visibility?: number;
}) {
  const style = {
    "--rain-overlay-opacity":
      variant === "snapshot"
        ? String(getSnapshotRainOverlayOpacity(visibility))
        : String(getBlendRainOverlayOpacity(visibility)),
    "--rain-drop-opacity":
      variant === "snapshot"
        ? "1"
        : String(getBlendRainDropOpacity(visibility)),
  } as CSSProperties;

  return (
    <RaindropFxCanvas
      ariaLabel="Street seen through rain glass"
      background={createNeutralRainBackground()}
      benchmarkId={benchmarkId}
      canvasId={canvasId}
      captureIntervalMs={captureIntervalMs}
      className={`raindrop-fx-demo raindrop-fx-overlay raindrop-fx-overlay--${variant}`}
      effectScale={effectScale}
      onBenchmark={onBenchmark}
      options={options}
      sourceSelector={sourceSelector}
      style={style}
    />
  );
}

export function RealtimeGlareOverlay({
  intensity = 0.72,
  sourceSelector,
}: {
  intensity?: number;
  sourceSelector: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const workCanvas = document.createElement("canvas");
    const workContext = workCanvas.getContext("2d", {
      willReadFrequently: true,
    });
    const outputContext = canvasRef.current?.getContext("2d");
    let animationFrame = 0;
    let lastPaint = 0;

    const paint = (time: number) => {
      animationFrame = window.requestAnimationFrame(paint);
      if (!workContext || !outputContext || time - lastPaint < 42) {
        return;
      }

      const outputCanvas = canvasRef.current;
      const source = document.querySelector(sourceSelector);
      if (!(outputCanvas && source instanceof HTMLCanvasElement)) {
        return;
      }

      const rect = outputCanvas.getBoundingClientRect();
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.25);
      const width = Math.max(1, Math.floor(rect.width * pixelRatio));
      const height = Math.max(1, Math.floor(rect.height * pixelRatio));
      if (outputCanvas.width !== width || outputCanvas.height !== height) {
        outputCanvas.width = width;
        outputCanvas.height = height;
      }

      const sampleWidth = 180;
      const sampleHeight = Math.max(1, Math.round(sampleWidth * (height / width)));
      if (workCanvas.width !== sampleWidth || workCanvas.height !== sampleHeight) {
        workCanvas.width = sampleWidth;
        workCanvas.height = sampleHeight;
      }

      workContext.clearRect(0, 0, sampleWidth, sampleHeight);
      workContext.drawImage(source, 0, 0, sampleWidth, sampleHeight);

      const image = workContext.getImageData(0, 0, sampleWidth, sampleHeight);
      const { data } = image;
      for (let index = 0; index < data.length; index += 4) {
        const red = data[index];
        const green = data[index + 1];
        const blue = data[index + 2];
        const luma = red * 0.2126 + green * 0.7152 + blue * 0.0722;
        const warmBias = Math.max(0, red - blue) * 0.18;
        const bright = Math.max(0, (luma + warmBias - 34) / 170);
        const shaped = Math.pow(Math.min(1, bright), 1.7);
        data[index] = Math.min(255, red * (1.1 + shaped * 1.6) + shaped * 34);
        data[index + 1] = Math.min(255, green * (1.08 + shaped * 1.35) + shaped * 24);
        data[index + 2] = Math.min(255, blue * (1.05 + shaped * 1.18) + shaped * 18);
        data[index + 3] = Math.min(210, shaped * 210 * intensity);
      }
      workContext.putImageData(image, 0, 0);

      outputContext.clearRect(0, 0, width, height);
      outputContext.globalCompositeOperation = "screen";
      outputContext.imageSmoothingEnabled = true;

      outputContext.globalAlpha = 0.56 * intensity;
      outputContext.filter = `blur(${Math.max(9, width * 0.013)}px)`;
      outputContext.drawImage(workCanvas, 0, 0, width, height);

      outputContext.globalAlpha = 0.34 * intensity;
      outputContext.filter = `blur(${Math.max(22, width * 0.035)}px)`;
      outputContext.drawImage(workCanvas, -width * 0.08, -height * 0.08, width * 1.16, height * 1.16);

      outputContext.globalAlpha = 0.2 * intensity;
      outputContext.filter = `blur(${Math.max(7, width * 0.011)}px)`;
      outputContext.drawImage(workCanvas, 0, -height * 0.32, width, height * 1.64);

      outputContext.globalAlpha = 1;
      outputContext.filter = "none";
      outputContext.globalCompositeOperation = "source-over";
      lastPaint = time;
    };

    animationFrame = window.requestAnimationFrame(paint);
    return () => window.cancelAnimationFrame(animationFrame);
  }, [intensity, sourceSelector]);

  return (
    <div className="realtime-glare-overlay" aria-hidden="true">
      <canvas ref={canvasRef} />
    </div>
  );
}

export function MirroredRainOverlay({
  opacity = 1,
  sourceSelector,
}: {
  opacity?: number;
  sourceSelector: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const context = canvasRef.current?.getContext("2d");
    let animationFrame = 0;
    let lastPaint = 0;

    const paint = (time: number) => {
      animationFrame = window.requestAnimationFrame(paint);
      if (!context || time - lastPaint < 34) {
        return;
      }

      const canvas = canvasRef.current;
      const source = document.querySelector(sourceSelector);
      if (!(canvas && source instanceof HTMLCanvasElement)) {
        return;
      }

      const rect = canvas.getBoundingClientRect();
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.4);
      const width = Math.max(1, Math.floor(rect.width * pixelRatio));
      const height = Math.max(1, Math.floor(rect.height * pixelRatio));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }

      context.clearRect(0, 0, width, height);
      context.imageSmoothingEnabled = true;
      context.drawImage(source, 0, 0, width, height);
      lastPaint = time;
    };

    animationFrame = window.requestAnimationFrame(paint);
    return () => window.cancelAnimationFrame(animationFrame);
  }, [sourceSelector]);

  return (
    <div
      aria-hidden="true"
      className="mirrored-rain-overlay"
      style={{ opacity }}
    >
      <canvas ref={canvasRef} />
    </div>
  );
}

function RaindropFxCanvas({
  ariaLabel,
  background,
  benchmarkId,
  canvasId = "canvas",
  captureIntervalMs,
  className,
  effectScale = 1,
  onBenchmark,
  options,
  sourceSelector,
  style,
}: {
  ariaLabel: string;
  background: string;
  benchmarkId?: string;
  canvasId?: string;
  captureIntervalMs?: number;
  className: string;
  effectScale?: number;
  onBenchmark?: (id: string, stats: RaindropFxBenchmarkStats) => void;
  options?: Record<string, unknown>;
  sourceSelector?: string;
  style?: CSSProperties;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const benchmarkIdRef = useRef(benchmarkId);
  const benchmarkRef = useRef(onBenchmark);
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    benchmarkIdRef.current = benchmarkId;
    benchmarkRef.current = onBenchmark;
  }, [benchmarkId, onBenchmark]);

  useEffect(() => {
    let cancelled = false;
    let benchmarkCaptureCount = 0;
    let benchmarkCaptureMs = 0;
    let benchmarkInterval = 0;
    let effect: RaindropFxInstance | undefined;
    let observer: ResizeObserver | undefined;
    let captureInterval = 0;
    let captureTimeouts: number[] = [];
    let hasLoggedCaptureError = false;
    let isRefreshingBackground = false;

    const setCanvasSize = () => {
      const canvas = canvasRef.current;
      if (!canvas) {
        return { height: 0, width: 0 };
      }

      const rect = canvas.getBoundingClientRect();
      const scale = Math.max(1, effectScale);
      const desiredWidth = Math.max(1, rect.width * scale);
      const desiredHeight = Math.max(1, rect.height * scale);
      const textureBudgetScale = Math.min(
        1,
        maxOverlayTextureEdge / Math.max(desiredWidth, desiredHeight),
        Math.sqrt(maxOverlayTexturePixels / (desiredWidth * desiredHeight))
      );
      const width = Math.max(1, Math.floor(desiredWidth * textureBudgetScale));
      const height = Math.max(1, Math.floor(desiredHeight * textureBudgetScale));
      canvas.width = width;
      canvas.height = height;
      return { height, width };
    };

    const reportBenchmark = () => {
      const canvas = canvasRef.current;
      const handler = benchmarkRef.current;
      const id = benchmarkIdRef.current;
      if (!canvas || !handler || !id) {
        benchmarkCaptureCount = 0;
        benchmarkCaptureMs = 0;
        return;
      }

      handler(id, {
        canvasMp: (canvas.width * canvas.height) / 1_000_000,
        captureHz: benchmarkCaptureCount / 0.8,
        captureMs:
          benchmarkCaptureCount > 0
            ? benchmarkCaptureMs / benchmarkCaptureCount
            : 0,
      });
      benchmarkCaptureCount = 0;
      benchmarkCaptureMs = 0;
    };

    const start = async () => {
      await loadRaindropFxScript();
      if (cancelled || !window.RaindropFX || !canvasRef.current) {
        return;
      }

      const { height, width } = setCanvasSize();
      effect = new window.RaindropFX({
        ...options,
        background,
        canvas: canvasRef.current,
      });
      await effect.start();

      const refreshBackgroundFromSource = async () => {
        if (
          cancelled ||
          isRefreshingBackground ||
          !sourceSelector ||
          !(effect?.setLiveBackground ?? effect?.setBackground)
        ) {
          return false;
        }

        const source = document.querySelector(sourceSelector);
        if (!(source instanceof HTMLCanvasElement)) {
          return false;
        }

        if (source.width < 2 || source.height < 2) {
          return false;
        }

        isRefreshingBackground = true;
        try {
          const setLiveBackground =
            effect.setLiveBackground ?? effect.setBackground;
          const captureStartedAt = performance.now();
          await setLiveBackground?.call(effect, source);
          benchmarkCaptureCount += 1;
          benchmarkCaptureMs += performance.now() - captureStartedAt;
          return true;
        } catch (error) {
          if (!hasLoggedCaptureError) {
            hasLoggedCaptureError = true;
            console.warn("Could not refresh raindrop background.", error);
          }
          return false;
        } finally {
          isRefreshingBackground = false;
        }
      };

      if (sourceSelector) {
        if (captureIntervalMs && captureIntervalMs > 0) {
          captureTimeouts = [
            window.setTimeout(refreshBackgroundFromSource, 180),
          ];
          captureInterval = window.setInterval(
            refreshBackgroundFromSource,
            captureIntervalMs
          );
        } else {
          const retryDelays = [220, 700, 1400, 2400, 3800];
          captureTimeouts = retryDelays.map((delay) =>
            window.setTimeout(async () => {
              const didCapture = await refreshBackgroundFromSource();
              if (didCapture) {
                captureTimeouts.forEach((timeout) =>
                  window.clearTimeout(timeout)
                );
                captureTimeouts = [];
              }
            }, delay)
          );
        }
      }

      observer = new ResizeObserver(() => {
        const size = setCanvasSize();
        effect?.resize(size.width, size.height);
      });
      if (hostRef.current) {
        observer.observe(hostRef.current);
      }
      effect.resize(width, height);
      benchmarkInterval = window.setInterval(reportBenchmark, 800);
    };

    void start();

    return () => {
      cancelled = true;
      window.clearInterval(captureInterval);
      window.clearInterval(benchmarkInterval);
      captureTimeouts.forEach((timeout) => window.clearTimeout(timeout));
      observer?.disconnect();
      effect?.destroy?.();
      effect?.stop?.();
    };
  }, [background, captureIntervalMs, effectScale, options, sourceSelector]);

  return (
    <div
      aria-label={ariaLabel}
      className={className}
      ref={hostRef}
      role="img"
      style={style}
    >
      <canvas id={canvasId} ref={canvasRef} />
    </div>
  );
}
