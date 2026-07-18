# orDrumbox v2 — Agent Guide

## What This Is

Browser-based drum machine / step sequencer. Vanilla JS (ES6 modules), no framework. Audio via Web Audio API + AudioWorklets. Vite for dev/build. Vitest for tests. Electron wrapper for desktop.

## Commands

| Task | Command |
|------|---------|
| Dev server (port 3000) | `npm run dev` |
| Run all tests | `npm test` |
| Run tests in watch mode | `npm run test:watch` |
| Test coverage | `npm run test:coverage` |
| Production build | `npm run build` |
| Electron dev | `npm run electron:dev` |
| Electron build | `npm run electron:build` |
| MCP server (standalone) | `node ordrumboxMcpserver.mjs` |

No lint or typecheck commands are configured (eslint is in devDeps but has no config file).

## Test Setup

- 63 test files in `tests/*.test.js`
- Vitest uses `vite.config.js` defaults (no separate vitest config)
- Audio tests use `node-web-audio-api` for `OfflineAudioContext` — must set globals:
  ```js
  import nodeWaa from 'node-web-audio-api'
  globalThis.OfflineAudioContext = nodeWaa.OfflineAudioContext
  globalThis.AudioWorkletNode = nodeWaa.AudioWorkletNode
  ```
- Tests that touch global state must reset it:
  ```js
  soundRegistry.reset()
  serviceRegistry.reset()
  serviceRegistry.mfPatterns = new MfPatterns()
  ```
- Mock pattern: create `makeParam()`, `makeNode()`, `makeStrip()`, `makeMixer()` helpers locally in each test file (no shared mock utility)
- Canvas mock: `tests/setup.js` stubs `document.createElement('canvas')` returning a mock 2D context (used by spectrum analyzer and waveform overlay). Wired into `vite.config.js` as `setupFiles`.

## Architecture

```
src/
  main.js              — App entry, creates all panels, wires events, keyboard shortcuts
  core/                — Constants, utils, sequencer (seq.js), timer worker
  audio/               — Engine, mixer, strip, sound, voices, worklets, export
  patterns/            — Pattern manager, engine, exporter, defaults, fixer, variation
  logic/               — Commands (cmd.js), generators, MIDI, services, transport
  state/               — app_state.js, service_registry.js, sound_registry.js, playback_events.js
  ui/                  — Panels: toolbar, pattern, note/track editors, tools, output, about, synth
  loader/              — resources_loader.js (loads patterns, drumkits, sounds)
  model/               — flatnote.js, instrument.js
```

**Key singletons** (state layer):
- `appState` — current patterns, selected track/pattern, UI flags
- `serviceRegistry` — audioCtx, mfCmd, mfSeq, mfPatterns, mfResourcesLoader, audioEngine, midiManager
- `soundRegistry` — sounds, generatedSounds, drumkitList
- `playbackEvents` — event bus for pattern/track/drumkit changes

## Gotchas

- **Production build strips `console.log`** (terser `drop_console: true`). Don't add debugging that relies on console output in prod code.
- **Worklet processors register at module import time** (top-level `WorkletLoader.register()` calls in `mixer.js`, `strip.js`). Import order matters.
- **MCP server**: logs to stderr to preserve JSON-RPC on stdout. `console.log` is overridden to stderr.
- **`publicDir: false`** in Vite config — static assets are in `assets/`, not `public/`.
- **No ESLint config** despite eslint being a dependency. Code style is enforced manually.
- **CSP header** in index.html: `script-src 'self' blob:` (needed for AudioWorklet blob URLs)
- **Pattern data paths**: MCP server writes to `public/assets/data/patterns/`
- **Worklet DSP performance**: All three worklets (strip, synth-voice, master-bus) use optimized per-sample loops. Key patterns: sine LUT (4096 entries) for LFO, `Math.exp(x * LN2_OVER_1200)` for detune, xorshift32 for noise, incremental ADSR state machine. Avoid introducing `Math.sin`, `Math.pow`, or per-sample object allocation in the audio thread.
- **Shared noise buffer**: `SynthVoice` uses xorshift32 PRNG for noise — no shared Float32Array allocation per instance.
- **`NOTE_VELO_BALANCE` (1/8)**: Synth voice velocity is scaled by this constant to compensate volume difference between synth and sample voices. Factor in when computing expected velocity values in tests.
- **Compressor DSP chain**: `preGain → compressor → HPF → LPF → master gain → output`. Pre-gain is k-rate; filters and master gain are a-rate.
- **Track Variation** (`src/patterns/variation.js`): Budget-based randomization applied per loop iteration in `computeFlatNotesFromPattern`. Budget = `variation * 16 / 100`. Operations: anticipation (3pts), double (3pts), ghost (3pts), silence (3pts), velocity (1pt), pitch (1pt).

## Style

### MUST DO

- Use ES2023+ features exclusively
- Use `X | null` or `X | undefined` patterns for nullable types
- Use optional chaining (`?.`) and nullish coalescing (`??`)
- Use `async/await` for all asynchronous operations
- Use ESM (`import/export`) — never CommonJS
- Implement proper error handling with `try/catch`
- Add JSDoc comments for complex functions
- Follow functional programming principles (pure functions, immutability)

### MUST NOT DO

- Use `var` (always `const` or `let`)
- Use callback-based patterns (prefer Promises)
- Mix CommonJS and ESM in the same module
- Ignore memory leaks or performance issues
- Skip error handling in async functions
- Use synchronous I/O in Node.js
- Mutate function parameters
- Create blocking operations in the browser

### Conventions

- **Explicit fallbacks with `??`**: never use `||` for default values when `??` is more appropriate. Never rely on truthy/falsy coercion. Example:
  ```js
  // Good — explicit fallback
  const val = obj.prop ?? defaultValue
  obj.method?.(arg)
  const x = arr?.[i] ?? fallback

  // Bad — implicit, breaks for valid falsy values (0, "", false)
  const val = obj.prop || defaultValue
  ```
  This applies to property access, method calls, parameter defaults, and any form of optional chaining.

## Adding Tests

Place test files in `tests/`. Import from `vitest` (`describe`, `it`, `expect`, `vi`, `beforeEach`). Use relative imports to `src/`. For audio worklet tests, mock `WorkletLoader`:
```js
vi.spyOn(WorkletLoader, 'isSupported').mockReturnValue(true)
vi.spyOn(WorkletLoader, 'ensureLoaded').mockResolvedValue(true)
vi.spyOn(WorkletLoader, 'createNode').mockImplementation(() => makeNode())
```
