import {
  CloudRain,
  Gauge,
  Image as ImageIcon,
  Pause,
  Play,
  Sparkles,
  SunMoon,
} from "lucide-react";
import { useState } from "react";
import {
  type BackgroundMode,
  RainWindow,
  type RenderQuality,
  type TimeOfDay,
} from "./components/RainWindow";
import {
  OriginalRaindropDemo,
  OriginalRaindropOverlay,
  RealtimeGlareOverlay,
} from "./components/OriginalRaindropDemo";

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

export default function App() {
  const [backgroundMode, setBackgroundMode] =
    useState<BackgroundMode>(initialBackgroundMode);
  const [paused, setPaused] = useState(false);
  const [quality, setQuality] = useState<RenderQuality>("balanced");
  const [rainVisibility, setRainVisibility] = useState(1.45);
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay>("dusk");
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
            max="2.4"
            min="0.35"
            onChange={(event) => setRainVisibility(Number(event.target.value))}
            step="0.05"
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
  return (
    <section className="comparison-grid" aria-label="Rain comparison">
      <div className="comparison-panel" data-rain-variant="snapshot">
        <RainWindow
          backgroundMode="street"
          nativeGlass={false}
          paused={paused}
          quality={quality}
          rainVisibility={rainVisibility}
          timeOfDay={timeOfDay}
        />
        <OriginalRaindropOverlay
          canvasId="snapshot-rain-canvas"
          captureIntervalMs={liveRainRefreshMs}
          effectScale={2.35}
          sourceSelector='[data-rain-variant="snapshot"] .street-canvas'
          variant="snapshot"
          visibility={rainVisibility}
        />
        <div className="comparison-label">Live RaindropFX</div>
      </div>
      <div className="comparison-panel" data-rain-variant="no-snapshot">
        <RainWindow
          backgroundMode="street"
          nativeGlass
          paused={paused}
          quality={quality}
          rainVisibility={rainVisibility}
          timeOfDay={timeOfDay}
        />
        <div className="comparison-label">Native Glass</div>
      </div>
    </section>
  );
}
