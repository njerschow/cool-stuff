# Cool Stuff

A Vercel-ready portfolio shell for interactive visual projects.

The first project, **Rain Window**, is a Three.js scene staged like a rainy street viewed from inside a coffee shop. It now looks diagonally down the street and includes a time-of-day toggle for dusk, night, morning, and midday. It uses a lightweight physical illusion instead of full ray tracing:

- the street, cars, buildings, wet road, windows, rain, and lights render once into an offscreen target;
- the glass pane uses a port of the `SardineFish/raindrop-fx` drop simulation, raindrop texture, and refractive compose shader idea;
- road-level ripple instances create the floor splash cue without drawing obvious falling rain;

The current default uses the `SardineFish/raindrop-fx` demo background as a temporary calibration target for the rain/glass pass. The original raindrop-fx README attributes that background to <https://www.pixiv.net/artworks/84765992>; replace it before treating the portfolio as a public final asset.

## Commands

```bash
npm install
npm run dev
npm run build
```

Vercel can deploy this folder directly with the included `vercel.json`.
