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

- 89 test files in `tests/*.test.js` (1694 tests)
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
  ```
- Mock pattern: create `makeParam()`, `makeNode()`, `makeStrip()`, `makeMixer()` helpers locally in each test file (no shared mock utility)
- Canvas mock: `tests/setup.js` stubs `document.createElement('canvas')` returning a mock 2D context (used by spectrum analyzer and waveform overlay). Wired into `vite.config.js` as `setupFiles`.
- Test helpers in `tests/helpers/`:
  - `midi_builder.js` — Synthetic MIDI binary builder (`buildMidi()`, `buildDrumMidi()`, `buildEmptyMidi()`) for testing import pipelines
  - `midi_reader.js` — MIDI binary reader for testing export pipelines
  - `wav_builder.js` — Synthetic WAV builder for audio analysis tests
  - `onset_detector.js` — Onset detection helper
  - `worklet_mocks.js` — AudioWorklet node mocks

## Architecture

```
src/
  main.js              — App entry, creates all panels, wires events, keyboard shortcuts
  core/                — Constants, utils, sequencer (seq.js), timer worker
  audio/               — Engine, mixer, strip, sound, voices, worklets, export
  patterns/            — Pattern manager, engine, exporter, defaults, fixer, variation
  logic/               — Commands (cmd.js), generators, MIDI, services, transport
  state/               — app_state.js, service_registry.js, sound_registry.js, playback_events.js, events.js
  ui/                  — Panels: toolbar, pattern, note/track editors, tools, output, about, synth
  loader/              — resources_loader.js (loads patterns, drumkits, sounds)
  model/               — flatnote.js, instrument.js
```

**Key singletons** (state layer):
- `appState` — current patterns, selected track/pattern, UI flags
- `serviceRegistry` — audioCtx, cmd, seq, patterns, resourcesLoader, audioEngine, midiManager
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
- **`serviceRegistry` property names**: Services are referenced without `mf` prefix (e.g. `serviceRegistry.cmd`, `serviceRegistry.seq`, `serviceRegistry.patterns`). The `mf` prefix was removed.
- **Granular events**: The event bus emits both `patternChange` (legacy, backward-compat) and granular events (`noteChange`, `patternStructureChange`, `patternMetaChange`). Consumers should prefer the granular event for their specific concern. `track_editor.js` keeps `patternChange` because it does structural track reference re-validation, not data changes.
- **Import services**: `MidiImportService` and `WavImportService` in `src/logic/services/` handle file import logic extracted from `tools_panel.js`. They depend on `serviceRegistry.cmd` for pattern/track/note creation.

## Style

### Three zones — this matters more than any single rule below

The codebase intentionally runs different style regimes per zone. Applying the wrong zone's rules to a file is a bug, not a nitpick — check which zone a file is in before "fixing" its style.

- **Audio/DSP zone** — `src/audio/` (especially `AudioWorkletProcessor.process()` in `src/audio/worklets/processors/*.js`, and `src/audio/node_pool.js`). Real-time constraint: a GC pause or an allocation inside the audio callback causes audible dropouts. Mutation, object pooling (`NodePool.acquire()`/`release()`), and imperative per-sample loops are the correct, intentional design — **not** violations of "immutability" or "don't mutate parameters." Do not "fix" these into functional/immutable style.

- **Mutation-by-design zone** — `src/logic/commands/cmd.js`, `src/logic/generators/*` (`base_generator.js`, `auto_generate.js`, `hat_generate.js`, `snare_generate.js`, `perc_generate.js`, `melody_generate.js`, etc.), and `src/patterns/fixer.js`. These operate directly on the live `track`/`pattern`/`note` objects held by reference inside `appState.patterns` (or on raw imported JSON), and mutate them in place — e.g. `cmd.js`'s `deleteNote`/`addNote`/`addTrack` mutate the `track`/`pattern` parameters they're given, then record the inverse mutation for undo. This is load-bearing, not incidental:
  - `history_manager.js`'s undo/redo depends on `track`/`pattern` staying the *same reference* across a command — copy-on-write would break it.
  - `fixer.js` and the generators avoid repeated deep copies of potentially large pattern/track trees on every import or regenerate.
  - **Don't** apply "MUST NOT mutate function parameters" here, and don't refactor these into copy-and-return style without first checking the undo-system implication.
  - This does **not** cover `logic/services/*` (`auto_assign.js`, `midi_import_service.js`): those typically build/return fresh objects (e.g. via `cmd.addPattern(...)`) rather than mutating an incoming parameter, so the functional rules below apply to them normally.

- **Functional zone** — `ui/`, `state/`, `model/`, most of `patterns/`, `logic/services/`. No real-time constraint and no undo-reference constraint; functional style (pure functions, immutable updates, non-mutating array methods) is the default and should be followed per the MUST DO list below.

**Reactivity note (`core/signals.js`)**: `set(next)` bails out on reference equality (`if (v === value) return`). Mutating an object in place and then calling `set(sameRef)` would **not** trigger dependent effects. As of this writing `createSignal`/`effect` aren't imported anywhere outside their own test (`tests/signals.test.js`) — `appState` is a plain mutated object notified via `playbackEvents`, not signals — so this isn't live today. If/when `signals.js` gets wired into `state/` or `ui/`, anything feeding a signal must pass a new reference on update, and it must not be handed objects coming out of the mutation-by-design zone without copying first.

### MUST DO *(functional zone)*

- Use ES2023+ features exclusively
- Use `X | null` or `X | undefined` patterns for nullable types
- Use optional chaining (`?.`) and nullish coalescing (`??`)
- Use `async/await` for all asynchronous operations
- Use ESM (`import/export`) — never CommonJS
- Implement proper error handling with `try/catch`
- Add JSDoc comments for complex functions
- Follow functional programming principles (pure functions, immutability)

### MUST NOT DO *(functional zone)*

- Use `var` (always `const` or `let`)
- Use callback-based patterns (prefer Promises)
- Mix CommonJS and ESM in the same module
- Ignore memory leaks or performance issues
- Skip error handling in async functions
- Use synchronous I/O in Node.js
- Mutate function parameters
- Create blocking operations in the browser

### Audio zone — its own rules, not the list above

- Prefer object pooling (`NodePool`) over allocation for anything created per-note or per-voice
- No allocation inside `process()` — no `.map()`/`.filter()`/spread/new arrays or objects per audio quantum
- Mutation of pre-allocated buffers/state is expected and correct
- Still: `const`/`let` only, ESM only, `?.`/`??` where they don't add per-sample overhead — the ES2023/no-`var`/no-CJS rules apply everywhere, only the immutability/no-mutation rules are zone-scoped

### Mutation-by-design zone — its own rules, not the functional list above

- Mutating `track`/`pattern`/`note` parameters in place is expected in `cmd.js`, the generators, and `fixer.js`
- Every mutating command in `cmd.js` must still record its inverse via `this._record(...)` for undo — mutation without an undo record is a bug here, even though mutation itself isn't
- `const`/`let`, ESM, `?.`/`??`, async/await, and error handling rules still apply — only the immutability/no-parameter-mutation rules are zone-scoped

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

## CSS Design Tokens

`src/ui/styles.css` uses a rationalized `:root` token system. Always use tokens instead of hardcoded values.

### Backgrounds
| Token | Hex | Usage |
|-------|-----|-------|
| `--bg-deep` | `#0a0a14` | Deepest layer (canvas base) |
| `--bg-canvas` | `#0d0d1a` | Canvas background |
| `--bg` | `#1a1a2e` | Primary panel background |
| `--bg-surface` | `#12121e` | Lists, cards |
| `--bg-input` | `#16213e` | Input fields, selects |
| `--bg-elevated` | `#2a2a3e` | Elevated surfaces (knobs, popups) |
| `--bg-hover` | `#3a3a4e` | Hover states, beat markers |
| `--bg-accent` | `#0f3460` | Accent background (active btn) |
| `--bg-selected` | `#833295` | Selected state |
| `--bg-success` | `#0a2e0a` | Success tint (velocity bars) |

### Text
| Token | Hex | Usage |
|-------|-----|-------|
| `--text` | `#fff` | Primary text |
| `--text-dim` | `#eee` | Slightly dimmed (buttons, selects) |
| `--text-secondary` | `#ccc` | Secondary labels |
| `--text-tertiary` | `#888` | Hints, placeholders |
| `--text-disabled` | `#555` | Disabled state |

### Borders
| Token | Hex | Usage |
|-------|-----|-------|
| `--border-subtle` | `#333` | Subtle dividers |
| `--border` | `#555` | Default borders |
| `--border-strong` | `#888` | Emphasized borders |

### Accent (Rose)
| Token | Hex | Usage |
|-------|-----|-------|
| `--accent` | `#e94560` | Primary accent |
| `--accent-400` | `#ff4d6d` | Light accent |
| `--accent-600` | `#d63050` | Dark accent |
| `--accent-700` | `#ff2a6d` | Bright accent (active grid btns) |

### Semantic Colors
| Token | Hex | Usage |
|-------|-----|-------|
| `--color-success` | `#4ade80` | Success, active states |
| `--color-success-dark` | `#1a7f37` | Dark success (start btn) |
| `--color-warning` | `#f59e0b` | Warning, amber |
| `--color-danger` | `#c62828` | Danger, errors |
| `--color-danger-light` | `#ef9a9a` | Light danger |
| `--color-info` | `#4fc3f7` | Info, cyan/blue |

### Typography
| Token | Value | Usage |
|-------|-------|-------|
| `--fs-xs` | `9px` | Labels, tiny text |
| `--fs-sm` | `10px` | Secondary text |
| `--fs-base` | `11px` | Body text |
| `--fs-md` | `12px` | Medium text |
| `--fs-lg` | `14px` | Large text, headings |

### Z-Index Layers
| Token | Value | Usage |
|-------|-------|-------|
| `--z-base` | `0` | Default layer |
| `--z-content` | `2` | Content elements |
| `--z-overlay` | `10` | Overlays, dropdowns |
| `--z-panel` | `100` | Panels, modals |
| `--z-toolbar` | `200` | Toolbars |
| `--z-toast` | `9999` | Toasts, notifications |

### Rules
- Never use hardcoded colors, font-sizes, or z-index values
- Use `var(--token-name)` for all values
- Add new tokens to `:root` if needed (follow naming convention)
- Prefer semantic tokens over raw scale tokens

## Adding Tests

Place test files in `tests/`. Import from `vitest` (`describe`, `it`, `expect`, `vi`, `beforeEach`). Use relative imports to `src/`. For audio worklet tests, mock `WorkletLoader`:
```js
vi.spyOn(WorkletLoader, 'isSupported').mockReturnValue(true)
vi.spyOn(WorkletLoader, 'ensureLoaded').mockResolvedValue(true)
vi.spyOn(WorkletLoader, 'createNode').mockImplementation(() => makeNode())
```
