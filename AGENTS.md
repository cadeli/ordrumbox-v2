# AGENTS.md — orDrumbox v2

## Project overview

Browser-based beat maker and step sequencer. Vanilla JS (no framework), ES Modules, Vite-bundled SPA. Audio via Web Audio API + AudioWorklet DSP. Desktop wrapper via Electron.

## Quick commands

```bash
npm run dev            # Vite dev server (port 3000)
npm test               # vitest run (all unit tests)
npm run test:watch     # vitest watch mode
npm run test:coverage  # vitest with v8 coverage report
npx playwright test    # e2e tests (auto-starts dev server)
npx playwright test --project=desktop-chromium   # desktop only
npx playwright test --project=mobile-chromium    # mobile only
npm run build          # vite build → dist/
```

## Architecture

```
index.html → src/main.js (bootstrap after "Start" click)
                ↓
        state/app_state.js       ← global state singleton
        state/service_registry.js ← manual dependency injection
        state/service_loader.js  ← async service init
        state/sound_registry.js  ← sample/instrument registry
                ↓
        audio/engine.js          ← core audio engine
        audio/mixer.js           ← bus chain (master/compressor/limiter)
        audio/player.js          ← playback controller
        audio/strip.js           ← per-track audio strip
        audio/voices/            ← voice classes (sample, synth worklet)
        audio/worklets/          ← AudioWorklet processors (DSP)
                ↓
        logic/seq.js             ← sequencer (tick scheduling via Web Worker)
        patterns/engine.js       ← pattern computation (flatNotes, variation)
        patterns/manager.js      ← pattern CRUD
                ↓
        ui/                      ← vanilla JS panel components
        ui/synth_editor/         ← soft synth UI
        ui/track_editor/         ← track editor UI
        ui/pattern_panel/        ← pattern grid
        ui/toolbar/              ← transport + view switch
```

### Key constants

- `TICK = 32` — ticks per step (`src/core/constants.js`)
- `LFO_TARGET_TO_INT` — maps LFO target strings to integers for worklet processor (`src/audio/voices/worklet_synth_voice.js:14`)
- `WAVE_TO_INT = { sine: 0, triangle: 1, sawtooth: 2, square: 3, random: 4 }` — `random` (shape=4) falls through to square in DSP (production bug, not implemented)
- `SYNTH_GROUP_DEFAULTS` — many params gated by other defaults: `vco3.gain=0`, `fm.amount=0`, `lfo.target='NOT'`, `noise.mix=0` (`src/ui/synth_editor/constants.js:34-49`)



## Testing

### Unit tests (vitest)

- **Config**: `vite.config.js` under `test` key (no separate vitest.config.js)
- **Setup**: `tests/setup.js` — stubs canvas, ResizeObserver, injects CSS for jsdom
- **101 test files**, ~2730 tests in `tests/`
- **Run**: `npm test` or `npx vitest run`

Test helpers in `tests/helpers/`:
- `cmd_test_helpers.js` — command test utilities
- `make_pattern.js` — pattern fixture builder
- `midi_test_helpers.js`, `midi_builder.js`, `midi_reader.js` — MIDI test utilities
- `wav_builder.js` — WAV file builder for tests
- `worklet_mocks.js` — AudioWorklet mocks

### E2E tests (playwright)

- **Config**: `playwright.config.js`
- **12 spec files** in `e2e/`
- **Workers: 1** (serial) — AudioContext tests are sensitive to parallelism
- **Timeout**: 30s per test, 5s per expect
- **Base URL**: `http://localhost:3000`
- **Web server**: auto-starts `npm run dev`

Projects:
- `desktop-chromium` — Desktop Chrome, matches non-`.mobile.` spec files
- `mobile-chromium` — Pixel 7 viewport, matches `.mobile.spec.js` files

#### E2E boot sequence

```js
// e2e/fixtures.js
import { bootApp } from './fixtures.js'
// clicks #waiting-screen-start-btn → waits for window.__e2e.ready
```

`window.__e2e` exposes: `ready`, `appState`, `serviceRegistry`, `soundRegistry`, `playbackEvents`


#### E2E helpers

- `e2e/helpers/synth_render.js` — `renderSynthBatch(overrides, noteCount, options)` renders N notes in one OfflineAudioContext
- `e2e/fixtures.js` — `bootApp(page)`, `audioContextState(page)`


## Code conventions

- **Language**: vanilla JS, ES Modules (`import`/`export`), no transpiler
- **English only**: all code, comments, variable/function/class names must be exclusively in English. No other languages in source code. 
- **Class pattern**: ES classes with private fields (`#field`)
- **State**: centralized in `app_state.js`, accessed via `serviceRegistry`
- **UI panels**: extend `BasePanel` or follow its pattern (no framework)
- **Naming**: `snake_case` for files, `camelCase` for variables/functions, `PascalCase` for classes
- **Generators**: imported dynamically via `service_loader.js`
- **Worklet code**: processor source files in `src/audio/worklets/processors/` are template strings (not ES modules)


## JavaScript Guidelines (Vanilla JS)

### 1. Default Rule: Clean & Modern Vanilla JS
By default, code must prioritize readability, maintainability, and ES2020+ standards.

* **Modern Syntax:** Use destructuring, template literals, `const`/`let` (never `var`), optional chaining (`?.`), and nullish coalescing (`??`).
* **Functional & Immutable Style:** Prefer declarative array methods (`.map()`, `.filter()`, `.reduce()`, `.find()`) over imperative loops. Avoid mutating existing objects or arrays—use spread syntax (`...`) instead.
* **Asynchronous Code:** Consistently use `async`/`await` with explicit error handling (`try...catch`) over `.then()` chains.
* **DOM & Events:**
  * Prefer `querySelector` and `querySelectorAll`.
  * Use **event delegation** on parent elements instead of binding listeners to individual items.
  * Use `classList` (`add`, `remove`, `toggle`) to manage styles rather than directly mutating `element.style`.

---

### 2. Exception: Performance-Critical Hot Paths
**Trigger Condition:** Apply these rules *only* in bottleneck areas (e.g., high-frequency loops, 60fps animations/rendering, processing large datasets,processing sound, bulk DOM operations).

In these specific paths **only**:

* **Iteration:** Replace `.map()`, `.forEach()`, or `.reduce()` with classic `for` loops (`for (let i = 0; i < len; i++)`) or `while` loops to eliminate closure overhead and function call stack costs.
* **In-Place Mutation:** Direct array/object mutations and object reuse are allowed to reduce memory allocation and Garbage Collector pressure.
* **DOM Access Optimization:**
  * Use `getElementById` or `getElementsByClassName` when selector lookup speed is critical.
  * Cache all DOM references outside hot loops.
  * Batch DOM reads and writes to prevent layout thrashing (forced synchronous reflows), or use `DocumentFragment` and `requestAnimationFrame`.
* **Mandatory Commenting:** Any deviation from clean code standards for performance reasons MUST include a brief inline comment explaining the bottleneck justification



## File structure reference

```
src/
  audio/           — Web Audio API engine, voices, worklets, export
  cache/           — IndexedDB caching
  core/            — constants, utils, IDB wrapper, logger, timer worker
  loader/          — asset/resource loading
  logic/           — seq, LFO, history, commands, generators, MIDI, services
  model/           — data models (flatnote, instrument, track schema)
  patterns/        — pattern engine, manager, defaults, variation
  state/           — app state, service registry/loader, sound registry
  ui/              — all UI panels and components

e2e/               — Playwright end-to-end specs
  fixtures.js      — bootApp() helper
  helpers/         — synth_render.js (batched OfflineAudioContext)
  *.spec.js        — test files

tests/             — Vitest unit tests
  setup.js         — jsdom setup (canvas stub, CSS injection)
  helpers/         — test utilities (MIDI, WAV, worklet mocks)
  *.test.js        — test files

assets/            — data/, images/, kits/
tools/             — live-vs-export.html (manual browser tool)
```

