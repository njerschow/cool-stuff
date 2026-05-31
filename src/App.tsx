import CloudRain from "lucide-react/dist/esm/icons/cloud-rain.js";
import Gauge from "lucide-react/dist/esm/icons/gauge.js";
import ImageIcon from "lucide-react/dist/esm/icons/image.js";
import Pause from "lucide-react/dist/esm/icons/pause.js";
import Play from "lucide-react/dist/esm/icons/play.js";
import SlidersHorizontal from "lucide-react/dist/esm/icons/sliders-horizontal.js";
import Sparkles from "lucide-react/dist/esm/icons/sparkles.js";
import SunMoon from "lucide-react/dist/esm/icons/sun-moon.js";
import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
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
} from "./components/OriginalRaindropDemo";
import { RAIN_VISIBILITY_SLIDER } from "./rainVisibility";
import {
  DEFAULT_RAIN_TUNING,
  RAIN_TUNING_CONTROLS,
  RAIN_TUNING_GROUP_LABELS,
  RAIN_TUNING_GROUP_QUESTIONS,
  RAIN_TUNING_GROUPS,
  type RainTuning,
  type RainTuningControl,
  type RainTuningGroup,
} from "./rainTuning";

const projects = [
  { number: "01", name: "Rain Window", tone: "rain study" },
  { number: "02", name: "Signal Garden", tone: "queued" },
  { number: "03", name: "Light Archive", tone: "queued" },
];

const timeCycle: TimeOfDay[] = ["dusk", "night", "morning", "midday"];
const liveRainRefreshMs = 22;
const rainTuningStorageKey = "cool-stuff:rain-tuning:v1";
const rainTuningGroupStorageKey = "cool-stuff:rain-tuning-group:v1";
const rainTuningPanelPositionStorageKey =
  "cool-stuff:rain-tuning-panel-position:v1";

const initialBackgroundMode: BackgroundMode =
  new URLSearchParams(window.location.search).get("mode") === "demo"
    ? "demo"
    : "street";
const initialCompareMode =
  new URLSearchParams(window.location.search).get("compare") === "rain";
const initialTuneMode =
  window.location.pathname === "/tune/rain" ||
  new URLSearchParams(window.location.search).get("tune") === "rain";

const focusedFxOptionsByGroup: Record<RainTuningGroup, Record<string, unknown>> = {
  droplets: {
    mist: false,
  },
  mist: {
    dropletsPerSeconds: 0,
    mist: true,
    raindropDiffuseLight: [0, 0, 0],
    raindropSpecularLight: [0, 0, 0],
    refractBase: 0,
    refractScale: 0,
  },
  render: {},
  shader: {
    dropletsPerSeconds: 0,
    mist: false,
  },
  simulation: {
    dropletsPerSeconds: 0,
    mist: false,
  },
};

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

type TuningPanelPosition = {
  x: number;
  y: number;
};

export default function App() {
  const [backgroundMode, setBackgroundMode] =
    useState<BackgroundMode>(initialBackgroundMode);
  const [paused, setPaused] = useState(false);
  const [quality, setQuality] = useState<RenderQuality>("balanced");
  const [rainVisibility, setRainVisibility] = useState<number>(
    RAIN_VISIBILITY_SLIDER.defaultValue
  );
  const [rainTuning, setRainTuning] = useState<RainTuning>(
    readStoredRainTuning
  );
  const [activeTuningGroup, setActiveTuningGroup] =
    useState<RainTuningGroup>(readStoredRainTuningGroup);
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay>("morning");
  const showTuneMode = initialTuneMode && backgroundMode === "street";
  const showComparison =
    !showTuneMode && initialCompareMode && backgroundMode === "street";
  const handleRainTuningChange = useCallback(
    (key: keyof RainTuning, value: number) => {
      setRainTuning((current) => ({ ...current, [key]: value }));
    },
    []
  );
  const handleResetAllRainTuning = useCallback(() => {
    setRainTuning({ ...DEFAULT_RAIN_TUNING });
  }, []);
  const handleResetRainTuningGroup = useCallback((group: RainTuningGroup) => {
    setRainTuning((current) => {
      const next = { ...current };
      for (const control of RAIN_TUNING_CONTROLS) {
        if (control.group === group) {
          next[control.key] = DEFAULT_RAIN_TUNING[control.key];
        }
      }
      return next;
    });
  }, []);

  useEffect(() => {
    writeStoredRainTuning(rainTuning);
  }, [rainTuning]);

  useEffect(() => {
    writeStoredRainTuningGroup(activeTuningGroup);
  }, [activeTuningGroup]);

  return (
    <main
      className="portfolio"
      data-background-mode={backgroundMode}
      data-view={showTuneMode ? "tune" : showComparison ? "compare" : "single"}
    >
      {backgroundMode === "demo" ? (
        <OriginalRaindropDemo />
      ) : showTuneMode ? (
        <RainTuningWorkbench
          activeGroup={activeTuningGroup}
          onChange={handleRainTuningChange}
          onGroupChange={setActiveTuningGroup}
          onResetAll={handleResetAllRainTuning}
          onResetGroup={handleResetRainTuningGroup}
          paused={paused}
          quality={quality}
          rainTuning={rainTuning}
          rainVisibility={rainVisibility}
          timeOfDay={timeOfDay}
        />
      ) : showComparison ? (
        <RainComparison
          paused={paused}
          quality={quality}
          rainTuning={rainTuning}
          rainVisibility={rainVisibility}
          timeOfDay={timeOfDay}
        />
      ) : (
        <>
          <RainWindow
            backgroundMode={backgroundMode}
            nativeGlass
            paused={paused}
            quality={quality}
            rainTuning={rainTuning}
            rainVisibility={rainVisibility}
            timeOfDay={timeOfDay}
          />
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
      {!showTuneMode ? (
        <RainTuningPanel
          onChange={handleRainTuningChange}
          value={rainTuning}
        />
      ) : null}
    </main>
  );
}

function readStoredRainTuning() {
  try {
    const raw = window.localStorage.getItem(rainTuningStorageKey);
    if (!raw) {
      return DEFAULT_RAIN_TUNING;
    }

    const stored = JSON.parse(raw) as Partial<Record<keyof RainTuning, unknown>>;
    const next = { ...DEFAULT_RAIN_TUNING };
    for (const key of Object.keys(DEFAULT_RAIN_TUNING) as Array<keyof RainTuning>) {
      const value = stored[key];
      if (typeof value === "number" && Number.isFinite(value)) {
        next[key] = value;
      }
    }
    return next;
  } catch {
    return DEFAULT_RAIN_TUNING;
  }
}

function writeStoredRainTuning(value: RainTuning) {
  try {
    window.localStorage.setItem(rainTuningStorageKey, JSON.stringify(value));
  } catch {
    // Local storage can be disabled in private windows; tuning still works in memory.
  }
}

function readStoredRainTuningGroup(): RainTuningGroup {
  try {
    const stored = window.localStorage.getItem(rainTuningGroupStorageKey);
    if (RAIN_TUNING_GROUPS.includes(stored as RainTuningGroup)) {
      return stored as RainTuningGroup;
    }
  } catch {
    // Keep the first focused question when local storage is unavailable.
  }
  return RAIN_TUNING_GROUPS[0];
}

function writeStoredRainTuningGroup(value: RainTuningGroup) {
  try {
    window.localStorage.setItem(rainTuningGroupStorageKey, value);
  } catch {
    // Local storage can be disabled in private windows; the selected question still works in memory.
  }
}

function readStoredTuningPanelPosition(): TuningPanelPosition | null {
  try {
    const raw = window.localStorage.getItem(rainTuningPanelPositionStorageKey);
    if (!raw) {
      return null;
    }

    const stored = JSON.parse(raw) as Partial<TuningPanelPosition>;
    if (
      typeof stored.x === "number" &&
      Number.isFinite(stored.x) &&
      typeof stored.y === "number" &&
      Number.isFinite(stored.y)
    ) {
      return { x: stored.x, y: stored.y };
    }
  } catch {
    // The default centered position is good when the saved layout cannot be read.
  }
  return null;
}

function writeStoredTuningPanelPosition(value: TuningPanelPosition | null) {
  try {
    if (!value) {
      window.localStorage.removeItem(rainTuningPanelPositionStorageKey);
      return;
    }
    window.localStorage.setItem(
      rainTuningPanelPositionStorageKey,
      JSON.stringify(value)
    );
  } catch {
    // Dragging still works even if local storage is unavailable.
  }
}

function RainTuningPanel({
  onChange,
  value,
}: {
  onChange: (key: keyof RainTuning, value: number) => void;
  value: RainTuning;
}) {
  const groups = RAIN_TUNING_CONTROLS.reduce(
    (grouped, control) => {
      grouped[control.group].push(control);
      return grouped;
    },
    {
      droplets: [],
      mist: [],
      render: [],
      shader: [],
      simulation: [],
    } as Record<RainTuningGroup, RainTuningControl[]>
  );

  return (
    <details className="tuning-panel" open>
      <summary title="Native right-side rain and glass tuning controls">
        <SlidersHorizontal size={16} aria-hidden="true" />
        <span>Native Variables</span>
      </summary>
      <div className="tuning-panel-body">
        {(Object.keys(groups) as RainTuningGroup[]).map((group) => (
          <section className="tuning-group" key={group}>
            <h2>{RAIN_TUNING_GROUP_LABELS[group]}</h2>
            <RainTuningControls
              controls={groups[group]}
              onChange={onChange}
              value={value}
            />
          </section>
        ))}
      </div>
    </details>
  );
}

function RainTuningWorkbench({
  activeGroup,
  onChange,
  onGroupChange,
  onResetAll,
  onResetGroup,
  paused,
  quality,
  rainTuning,
  rainVisibility,
  timeOfDay,
}: {
  activeGroup: RainTuningGroup;
  onChange: (key: keyof RainTuning, value: number) => void;
  onGroupChange: (group: RainTuningGroup) => void;
  onResetAll: () => void;
  onResetGroup: (group: RainTuningGroup) => void;
  paused: boolean;
  quality: RenderQuality;
  rainTuning: RainTuning;
  rainVisibility: number;
  timeOfDay: TimeOfDay;
}) {
  const activeIndex = Math.max(0, RAIN_TUNING_GROUPS.indexOf(activeGroup));
  const activeControls = RAIN_TUNING_CONTROLS.filter(
    (control) => control.group === activeGroup
  );
  const focusedNativeTuning = getFocusedNativeTuning(rainTuning, activeGroup);
  const panelRef = useRef<HTMLElement | null>(null);
  const dragRef = useRef<TuningPanelPosition | null>(null);
  const [isDraggingPanel, setIsDraggingPanel] = useState(false);
  const [panelPosition, setPanelPosition] =
    useState<TuningPanelPosition | null>(readStoredTuningPanelPosition);

  const clampPanelPosition = useCallback((position: TuningPanelPosition) => {
    const panel = panelRef.current;
    const panelWidth = panel?.offsetWidth ?? 720;
    const panelHeight = panel?.offsetHeight ?? 420;
    const margin = 12;
    const maxX = Math.max(margin, window.innerWidth - panelWidth - margin);
    const maxY = Math.max(margin, window.innerHeight - panelHeight - margin);
    return {
      x: Math.min(Math.max(position.x, margin), maxX),
      y: Math.min(Math.max(position.y, margin), maxY),
    };
  }, []);

  const moveActiveGroup = (direction: -1 | 1) => {
    const nextIndex =
      (activeIndex + direction + RAIN_TUNING_GROUPS.length) %
      RAIN_TUNING_GROUPS.length;
    onGroupChange(RAIN_TUNING_GROUPS[nextIndex]);
  };

  const updatePanelDrag = useCallback(
    (clientX: number, clientY: number) => {
      const drag = dragRef.current;
      if (!drag) {
        return;
      }

      setPanelPosition(
        clampPanelPosition({
          x: clientX - drag.x,
          y: clientY - drag.y,
        })
      );
    },
    [clampPanelPosition]
  );

  const finishPanelDrag = useCallback(() => {
    dragRef.current = null;
    setIsDraggingPanel(false);
  }, []);

  const handlePanelDragStart = (event: ReactPointerEvent<HTMLElement>) => {
    const panel = panelRef.current;
    if (!panel) {
      return;
    }

    event.preventDefault();
    const rect = panel.getBoundingClientRect();
    dragRef.current = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setIsDraggingPanel(true);
  };

  const handlePanelDragMove = (event: ReactPointerEvent<HTMLElement>) => {
    updatePanelDrag(event.clientX, event.clientY);
  };

  const handlePanelDragEnd = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    finishPanelDrag();
  };

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      writeStoredTuningPanelPosition(panelPosition);
    }, 120);
    return () => window.clearTimeout(timeout);
  }, [panelPosition]);

  useEffect(() => {
    const handleResize = () => {
      setPanelPosition((position) =>
        position ? clampPanelPosition(position) : position
      );
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [clampPanelPosition]);

  useEffect(() => {
    if (!isDraggingPanel) {
      return undefined;
    }

    const handlePointerMove = (event: PointerEvent) => {
      updatePanelDrag(event.clientX, event.clientY);
    };
    const handlePointerEnd = () => {
      finishPanelDrag();
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerEnd);
    window.addEventListener("pointercancel", handlePointerEnd);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerEnd);
      window.removeEventListener("pointercancel", handlePointerEnd);
    };
  }, [finishPanelDrag, isDraggingPanel, updatePanelDrag]);

  const panelStyle = panelPosition
    ? ({
        "--tuning-panel-left": `${panelPosition.x}px`,
        "--tuning-panel-top": `${panelPosition.y}px`,
      } as CSSProperties)
    : undefined;

  return (
    <section className="tuning-workbench" aria-label="Focused rain tuning">
      <div className="tuning-workbench-grid">
        <div className="comparison-panel" data-tuning-variant="reference">
          <RainWindow
            backgroundMode="street"
            nativeGlass={false}
            paused={paused}
            quality={quality}
            rainTuning={DEFAULT_RAIN_TUNING}
            rainVisibility={rainVisibility}
            timeOfDay={timeOfDay}
          />
          <OriginalRaindropOverlay
            canvasId={`tuning-reference-${activeGroup}`}
            captureIntervalMs={liveRainRefreshMs}
            effectScale={2.35}
            key={activeGroup}
            options={focusedFxOptionsByGroup[activeGroup]}
            sourceSelector='[data-tuning-variant="reference"] .street-canvas'
            variant="snapshot"
            visibility={rainVisibility}
          />
          <div className="comparison-label">RaindropFX Focus</div>
        </div>
        <div className="comparison-panel" data-tuning-variant="native">
          <RainWindow
            backgroundMode="street"
            nativeGlass
            paused={paused}
            quality={quality}
            rainTuning={focusedNativeTuning}
            rainVisibility={rainVisibility}
            timeOfDay={timeOfDay}
          />
          <div className="comparison-label">Native Focus</div>
        </div>
      </div>

      <aside
        aria-label="Tuning question"
        className="tuning-workbench-panel"
        data-dragging={isDraggingPanel || undefined}
        data-moved={panelPosition ? "true" : undefined}
        ref={panelRef}
        style={panelStyle}
      >
        <header
          className="tuning-workbench-header"
          onPointerCancel={handlePanelDragEnd}
          onPointerDown={handlePanelDragStart}
          onPointerMove={handlePanelDragMove}
          onPointerUp={handlePanelDragEnd}
          title="Drag to move settings"
        >
          <div>
            <span>
              {activeIndex + 1} / {RAIN_TUNING_GROUPS.length}
            </span>
            <h2>{RAIN_TUNING_GROUP_LABELS[activeGroup]}</h2>
          </div>
          <span className="tuning-save-state">Saved locally</span>
        </header>

        <p className="tuning-question">
          {RAIN_TUNING_GROUP_QUESTIONS[activeGroup]}
        </p>

        <div className="tuning-category-tabs" role="tablist" aria-label="Tuning categories">
          {RAIN_TUNING_GROUPS.map((group) => (
            <button
              aria-selected={group === activeGroup}
              className="tuning-category-tab"
              key={group}
              onClick={() => onGroupChange(group)}
              role="tab"
              title={RAIN_TUNING_GROUP_QUESTIONS[group]}
              type="button"
            >
              {RAIN_TUNING_GROUP_LABELS[group]}
            </button>
          ))}
        </div>

        <div className="tuning-focused-controls">
          <RainTuningControls
            controls={activeControls}
            onChange={onChange}
            value={rainTuning}
          />
        </div>

        <div className="tuning-actions">
          <button onClick={() => moveActiveGroup(-1)} type="button">
            Previous
          </button>
          <button onClick={() => moveActiveGroup(1)} type="button">
            Next
          </button>
          <button onClick={() => onResetGroup(activeGroup)} type="button">
            Reset Question
          </button>
          <button onClick={() => setPanelPosition(null)} type="button">
            Reset Position
          </button>
          <button onClick={onResetAll} type="button">
            Reset Defaults
          </button>
        </div>
      </aside>
    </section>
  );
}

function RainTuningControls({
  controls,
  onChange,
  value,
}: {
  controls: RainTuningControl[];
  onChange: (key: keyof RainTuning, value: number) => void;
  value: RainTuning;
}) {
  return (
    <>
      {controls.map((control) => (
        <label
          className="tuning-control"
          key={control.key}
          title={control.description}
        >
          <span className="tuning-label">
            <span>{control.label}</span>
            <span className="tuning-help" aria-label={control.description}>
              ?
            </span>
          </span>
          <input
            aria-label={control.label}
            max={control.max}
            min={control.min}
            onChange={(event) =>
              onChange(control.key, Number(event.target.value))
            }
            step={control.step}
            type="range"
            value={value[control.key]}
          />
          <output>{formatTuningValue(value[control.key])}</output>
        </label>
      ))}
    </>
  );
}

function getFocusedNativeTuning(
  rainTuning: RainTuning,
  activeGroup: RainTuningGroup
) {
  const focused = { ...DEFAULT_RAIN_TUNING };
  for (const control of RAIN_TUNING_CONTROLS) {
    if (control.group === activeGroup) {
      focused[control.key] = rainTuning[control.key];
    }
  }

  if (activeGroup === "droplets") {
    focused.mistAlpha = 0;
  }

  if (activeGroup === "mist") {
    focused.microdropRate = 0;
  }

  if (activeGroup === "shader") {
    focused.mistAlpha = 0;
    focused.microdropRate = 0;
  }

  if (activeGroup === "simulation") {
    focused.mistAlpha = 0;
    focused.microdropRate = 0;
  }

  return focused;
}

function RainComparison({
  paused,
  quality,
  rainTuning,
  rainVisibility,
  timeOfDay,
}: {
  paused: boolean;
  quality: RenderQuality;
  rainTuning: RainTuning;
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
          rainTuning={rainTuning}
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
          rainTuning={rainTuning}
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

function formatTuningValue(value: number) {
  if (Math.abs(value) >= 100) {
    return value.toFixed(0);
  }

  if (Math.abs(value) >= 10) {
    return value.toFixed(1);
  }

  return value.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
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
