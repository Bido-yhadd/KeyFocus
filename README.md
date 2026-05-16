# KeyFocus

Focus is Key.

## Look-away detector

The reusable webcam/classification logic lives in `src/lookAwayDetector.js`.

## Desktop app

Run the standalone Electron app with:

```sh
npm run desktop
```

After entering an email, the Electron window minimizes while the detector keeps running. When `onLookAway` fires, the app window is restored and `src/game/index.js` starts the game placeholder.

```js
import { createLookAwayDetector } from "./src/lookAwayDetector.js";

const detector = await createLookAwayDetector({
  videoElement: document.querySelector("video"),
  onLookAway: ({ metrics }) => {
    // Trigger your app action here.
    console.log("Person looked away", metrics);
  },
  onLookBack: ({ metrics }) => {
    console.log("Person looked back", metrics);
  },
  onMetrics: (metrics) => {
    console.log(metrics.headYaw, metrics.eyeGaze, metrics.pitch);
  }
});

await detector.start();
```

The current working preset is exported as `LOOK_AWAY_PRESETS.workedFine`:

```js
{
  headThreshold: 0.18,
  eyeThreshold: 0.24,
  pitchThreshold: 0.18,
  debounceFrames: 4
}
```

Use `detector.setOptions(...)` to tune thresholds at runtime.
