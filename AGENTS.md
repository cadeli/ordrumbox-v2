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

- 64 test files in `tests/*.test.js`
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

## Architecture

```
src/
  main.js              — App entry, creates all panels, wires events, keyboard shortcuts
  core/                — Constants, utils, sequencer (seq.js), timer worker
  audio/               — Engine, mixer, strip, sound, voices, worklets, export
  patterns/            — Pattern manager, engine, exporter, defaults, fixer
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

## Adding Tests

Place test files in `tests/`. Import from `vitest` (`describe`, `it`, `expect`, `vi`, `beforeEach`). Use relative imports to `src/`. For audio worklet tests, mock `WorkletLoader`:
```js
vi.spyOn(WorkletLoader, 'isSupported').mockReturnValue(true)
vi.spyOn(WorkletLoader, 'ensureLoaded').mockResolvedValue(true)
vi.spyOn(WorkletLoader, 'createNode').mockImplementation(() => makeNode())
```
