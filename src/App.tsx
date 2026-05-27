import CloudRain from "lucide-react/dist/esm/icons/cloud-rain.js";
import Gauge from "lucide-react/dist/esm/icons/gauge.js";
import ImageIcon from "lucide-react/dist/esm/icons/image.js";
import Pause from "lucide-react/dist/esm/icons/pause.js";
import Play from "lucide-react/dist/esm/icons/play.js";
import Sparkles from "lucide-react/dist/esm/icons/sparkles.js";
import SunMoon from "lucide-react/dist/esm/icons/sun-moon.js";
import { useCallback, useEffect, useState } from "react";
import {
  type BackgroundMode,
  RainWindow,
  type RainWindowBenchmarkStats,
  type RenderQuality,
  type TimeOfDay,
} from "./components/RainWindow";
import {
  OriginalRaindropDemo,
  OriginalRaindropOverlay,
  type RaindropFxBenchmarkStats,
  RealtimeGlareOverlay,
} from "./components/OriginalRaindropDemo";
import { RAIN_VISIBILITY_SLIDER } from "./rainVisibility";

const projects = [
  { number: "01", name: "Rain Window", tone: "rain study" },
  { number: "02", name: "Signal Garden", tone: "queued" },
  { number: "03", name: "Light Archive", tone: "queued" },
];

const timeCycle: TimeOfDay[] = ["dusk", "night", "morning", "midday"];
const liveRainRefreshMs = 22;

const initialBackgroundMode: BackgroundMode =
  new URLSearchParams(window.location.search).get("mode") === "demo"
    ? "demo"
    : "street";
const initialCompareMode =
  new URLSearchParams(window.location.search).get("compare") === "rain";

type BenchmarkState = {
  native?: RainWindowBenchmarkStats;
  snapshotFx?: RaindropFxBenchmarkStats;
  snapshotScene?: RainWindowBenchmarkStats;
};

type GlobalBenchmark = {
  fps: number;
  frameMs: number;
  heapMb?: number;
};

export default function App() {
  const [backgroundMode, setBackgroundMode] =
    useState<BackgroundMode>(initialBackgroundMode);
  const [paused, setPaused] = useState(false);
  const [quality, setQuality] = useState<RenderQuality>("balanced");
  const [rainVisibility, setRainVisibility] = useState<number>(
    RAIN_VISIBILITY_SLIDER.defaultValue
  );
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay>("morning");
  const showComparison = initialCompareMode && backgroundMode === "street";

  return (
    <main
      className="portfolio"
      data-background-mode={backgroundMode}
      data-view={showComparison ? "compare" : "single"}
    >
      {backgroundMode === "demo" ? (
        <OriginalRaindropDemo />
      ) : showComparison ? (
        <RainComparison
          paused={paused}
          quality={quality}
          rainVisibility={rainVisibility}
          timeOfDay={timeOfDay}
        />
      ) : (
        <>
          <RainWindow
            backgroundMode={backgroundMode}
            nativeGlass={false}
            paused={paused}
            quality={quality}
            rainVisibility={rainVisibility}
            timeOfDay={timeOfDay}
          />
          <OriginalRaindropOverlay
            captureIntervalMs={liveRainRefreshMs}
            effectScale={2.35}
            sourceSelector=".street-canvas"
            variant="snapshot"
            visibility={rainVisibility}
          />
          <RealtimeGlareOverlay sourceSelector=".street-canvas" />
        </>
      )}

      <header className="site-header" aria-label="Portfolio">
        <a className="brand" href="/" aria-label="Cool Stuff home">
          <Sparkles size={18} aria-hidden="true" />
          <span>Cool Stuff</span>
        </a>
        <nav className="project-tabs" aria-label="Projects">
          {projects.map((project, index) => (
            <button
              aria-current={index === 0 ? "page" : undefined}
              className="project-tab"
              disabled={index !== 0}
              key={project.number}
              title={project.name}
              type="button"
            >
              <span>{project.number}</span>
              <strong>{project.name}</strong>
            </button>
          ))}
        </nav>
      </header>

      <section className="project-title" aria-label="Current project">
        <span>{projects[0].number}</span>
        <h1>{projects[0].name}</h1>
        <p>{projects[0].tone}</p>
      </section>

      <div className="scene-toolbar" aria-label="Scene controls">
        <button
          aria-label={paused ? "Resume scene" : "Pause scene"}
          className="icon-button"
          onClick={() => setPaused((value) => !value)}
          title={paused ? "Resume scene" : "Pause scene"}
          type="button"
        >
          {paused ? <Play size={18} /> : <Pause size={18} />}
        </button>
        <button
          aria-label={`Switch time of day. Current: ${timeOfDay}`}
          className="icon-button time-button"
          onClick={() =>
            setTimeOfDay((value) => {
              const index = timeCycle.indexOf(value);
              return timeCycle[(index + 1) % timeCycle.length];
            })
          }
          title={`Time of day: ${timeOfDay}`}
          type="button"
        >
          <SunMoon size={18} />
          <span>{timeOfDay}</span>
        </button>
        <button
          aria-label={`Switch background. Current: ${backgroundMode}`}
          className="icon-button time-button"
          onClick={() =>
            setBackgroundMode((value) =>
              value === "demo" ? "street" : "demo"
            )
          }
          title={`Background: ${backgroundMode}`}
          type="button"
        >
          <ImageIcon size={18} />
          <span>{backgroundMode}</span>
        </button>
        <button
          aria-label="Toggle render quality"
          className="icon-button"
          data-active={quality === "cinematic"}
          onClick={() =>
            setQuality((value) =>
              value === "balanced" ? "cinematic" : "balanced"
            )
          }
          title="Toggle render quality"
          type="button"
        >
          <Gauge size={18} />
        </button>
        <label className="rain-slider" title="Rain visibility">
          <CloudRain size={18} aria-hidden="true" />
          <input
            aria-label="Rain visibility"
            max={RAIN_VISIBILITY_SLIDER.max}
            min={RAIN_VISIBILITY_SLIDER.min}
            onChange={(event) => setRainVisibility(Number(event.target.value))}
            step={RAIN_VISIBILITY_SLIDER.step}
            type="range"
            value={rainVisibility}
          />
        </label>
      </div>
    </main>
  );
}

function RainComparison({
  paused,
  quality,
  rainVisibility,
  timeOfDay,
}: {
  paused: boolean;
  quality: RenderQuality;
  rainVisibility: number;
  timeOfDay: TimeOfDay;
}) {
  const [benchmarks, setBenchmarks] = useState<BenchmarkState>({});
  const [globalBenchmark, setGlobalBenchmark] = useState<GlobalBenchmark>({
    fps: 0,
    frameMs: 0,
  });

  const handleRainBenchmark = useCallback(
    (id: string, stats: RainWindowBenchmarkStats) => {
      setBenchmarks((value) => ({ ...value, [id]: stats }));
    },
    []
  );

  const handleFxBenchmark = useCallback(
    (id: string, stats: RaindropFxBenchmarkStats) => {
      setBenchmarks((value) => ({ ...value, [id]: stats }));
    },
    []
  );

  useEffect(() => {
    let animationFrame = 0;
    let frameCount = 0;
    let frameSum = 0;
    let lastFrameAt = performance.now();
    let lastReportAt = performance.now();

    const measure = (time: number) => {
      const frameMs = time - lastFrameAt;
      lastFrameAt = time;
      frameCount += 1;
      frameSum += frameMs;

      if (time - lastReportAt >= 1000 && frameCount > 0) {
        const averageFrameMs = frameSum / frameCount;
        const memory = (
          performance as Performance & {
            memory?: { usedJSHeapSize: number };
          }
        ).memory;
        setGlobalBenchmark({
          fps: 1000 / Math.max(1, averageFrameMs),
          frameMs: averageFrameMs,
          heapMb: memory
            ? memory.usedJSHeapSize / (1024 * 1024)
            : undefined,
        });
        frameCount = 0;
        frameSum = 0;
        lastReportAt = time;
      }

      animationFrame = window.requestAnimationFrame(measure);
    };

    animationFrame = window.requestAnimationFrame(measure);
    return () => window.cancelAnimationFrame(animationFrame);
  }, []);

  return (
    <section className="comparison-grid" aria-label="Rain comparison">
      <div className="comparison-panel" data-rain-variant="snapshot">
        <RainWindow
          benchmarkId="snapshotScene"
          backgroundMode="street"
          nativeGlass={false}
          onBenchmark={handleRainBenchmark}
          paused={paused}
          quality={quality}
          rainVisibility={rainVisibility}
          timeOfDay={timeOfDay}
        />
        <OriginalRaindropOverlay
          benchmarkId="snapshotFx"
          canvasId="snapshot-rain-canvas"
          captureIntervalMs={liveRainRefreshMs}
          effectScale={2.35}
          onBenchmark={handleFxBenchmark}
          sourceSelector='[data-rain-variant="snapshot"] .street-canvas'
          variant="snapshot"
          visibility={rainVisibility}
        />
        <div className="comparison-label">Live RaindropFX</div>
      </div>
      <div className="comparison-panel" data-rain-variant="no-snapshot">
        <RainWindow
          benchmarkId="native"
          backgroundMode="street"
          nativeGlass
          onBenchmark={handleRainBenchmark}
          paused={paused}
          quality={quality}
          rainVisibility={rainVisibility}
          timeOfDay={timeOfDay}
        />
        <div className="comparison-label">Native Glass</div>
      </div>
      <BenchmarkPanel benchmarks={benchmarks} global={globalBenchmark} />
    </section>
  );
}

function formatMetric(value: number | undefined, digits = 1) {
  return value === undefined || Number.isNaN(value)
    ? "..."
    : value.toFixed(digits);
}

function BenchmarkPanel({
  benchmarks,
  global,
}: {
  benchmarks: BenchmarkState;
  global: GlobalBenchmark;
}) {
  const snapshotScene = benchmarks.snapshotScene;
  const snapshotFx = benchmarks.snapshotFx;
  const native = benchmarks.native;

  return (
    <aside className="benchmark-panel" aria-label="Live benchmark">
      <header className="benchmark-header">
        <strong>Live Bench</strong>
        <span>{formatMetric(global.fps)} fps</span>
      </header>
      <div className="benchmark-columns">
        <section className="benchmark-column">
          <h2>RaindropFX</h2>
          <Metric label="scene fps" value={formatMetric(snapshotScene?.fps)} />
          <Metric label="scene ms" value={formatMetric(snapshotScene?.renderMs)} />
          <Metric label="capture ms" value={formatMetric(snapshotFx?.captureMs)} />
          <Metric label="capture hz" value={formatMetric(snapshotFx?.captureHz)} />
          <Metric label="canvas mp" value={formatMetric(snapshotFx?.canvasMp, 2)} />
        </section>
        <section className="benchmark-column">
          <h2>Native</h2>
          <Metric label="scene fps" value={formatMetric(native?.fps)} />
          <Metric label="render ms" value={formatMetric(native?.renderMs)} />
          <Metric label="draw calls" value={formatMetric(native?.drawCalls, 0)} />
          <Metric
            label="triangles"
            value={
              formatMetric(
                native ? native.triangles / 1000 : undefined,
                1
              ) + "k"
            }
          />
          <Metric label="targets mp" value={formatMetric(native?.rainMapMp, 2)} />
        </section>
      </div>
      <footer className="benchmark-footer">
        <span>main {formatMetric(global.frameMs)} ms</span>
        {global.heapMb !== undefined ? (
          <span>heap {formatMetric(global.heapMb, 0)} mb</span>
        ) : null}
      </footer>
    </aside>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="benchmark-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
