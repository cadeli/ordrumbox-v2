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
npm run typecheck      # tsc --noEmit (jsconfig.json, // @ts-check files)
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
        logic/sequencer.js             ← sequencer (tick scheduling via Web Worker)
        patterns/pattern_engine.js       ← pattern computation (flatNotes, variation)
        patterns/flat_notes.js    ← applyFlatNotes() (flat-note recompute + events)
                ↓
        ui/                      ← vanilla JS panel components
        ui/synth_editor/         ← soft synth UI
        ui/track_editor/         ← track editor UI
        ui/pattern_panel/        ← pattern grid (coordinator + 11 section modules;
                                   note editing lives in pattern_grid_drag.js)
        ui/piano_roll/           ← piano roll (coordinator + section modules:
                                   viewport/render/menu/playback/drag, plus
                                   the pure hit_test.js helper)
        ui/toolbar/              ← transport + view switch
```

### Service worker (`sw.js`)

Standalone worker (not part of the module graph), registered by `src/service_worker.js`.

- **Cache strategy**: network-first (3 s timeout → cache → 503) for navigations, `*.json`, `*.html` and extension-less paths; cache-first for hashed JS/CSS/images, `.wav` samples and any other dotted path. Non-GET / cross-origin requests are left to the browser.
- **Dev vs release**: `RELEASE_BUILD = false` in the repo source means the dev server is serving it, so _every_ request is network-first (HMR never serves stale code). `npm run build` runs `scripts/sw_build.mjs`, which stamps `CACHE_NAME` with an 8-hex id of `dist/index.html` **and** flips `RELEASE_BUILD` to `true` (missing token or flag ⇒ build error); `activate` then purges every other cache.
- **Write-path quirks** (all in `putInCache`): the response is cloned before the first `await` (otherwise `respondWith` has already consumed the body), `Vary` is stripped so an entry always matches by URL (`Origin` is sent only on some requests), and a `.css` URL fetched as `destination: 'script'` (Vite dev serves it as a JS module wrapper) is keyed under `?sw=script` so it does not overwrite the stylesheet copy.
- **Tests**: `tests/service_worker.test.js` (evaluates `sw.js?raw` with mocked `caches`/`fetch`), `tests/sw_build_id.test.js`, `e2e/offline.spec.js`.

### Key constants

- `TICK = 32` — ticks per **beat** (`src/core/constants.js`). One beat = 4 grid steps (a track's `stepsPerBeat`), so a measure is `4 × TICK` ticks and a step is `TICK / stepsPerBeat`.
- `DB_VERSION = 8` / `MIGRATIONS` — IndexedDB schema (`src/core/idb.js`). There are `MIGRATIONS[6]`, `MIGRATIONS[7]` and `MIGRATIONS[8]`, with `MIGRATIONS[5]` as the reference implementation. When persisted data changes shape: bump `DB_VERSION` **and** add `MIGRATIONS[N]` (`N` = the new `DB_VERSION`, signature `(db, tx)`); `runUpgrades` creates any missing store first, then runs entries whose key lies in `(oldVersion, newVersion]`. A migration **must stay request-chained** (`cursor.continue()`), never `async`/`await`: the versionchange transaction auto-commits once the microtask queue drains, so awaiting would close the store mid-walk. `MIGRATIONS[5]` (the `nbBeats` → `beatCount` rename) is the reference implementation. The connection is shared for the whole session (`openDb()`) and reopened once when a transaction fails with `InvalidStateError`.
- `LFO_TARGET_TO_INT` — maps LFO target strings to integers for worklet processor (`src/audio/voices/worklet_synth_voice.js:15`)
- `WAVE_TYPES` / `WAVE_TO_INT = { sine: 0, triangle: 1, sawtooth: 2, square: 3, random: 4 }` (`src/audio/fx_values.js`, the single source for both sides of the wire: the UI picks a wave by `indexOf` in the list, the voice sends the integer) — `random` (shape=4) is a deterministic sample & hold (new value per oscillator cycle for VCOs, per LFO cycle for LFOs; same formula as `getLfoWaveformValue()` in `src/audio/math.js`); the `osc*Wave`/`lfo*Wave` AudioParams declare `maxValue: 4` — the host currently sends waves via port messages (no AudioParam clamping), but an AudioParam-driven path with `maxValue: 3` would clamp 4→3 and degrade to square. `FILTER_TYPES` (3 entries) is deliberately a SUBSET of `FILTER_TO_INT` (4: `notch` is worklet-only)
- `SYNTH_GROUP_DEFAULTS` — many params gated by other defaults: `vco3.gain=0`, `fm.amount=0`, `lfo.target='NOT'`, `noise.mix=0` (`src/ui/synth_editor/synth_editor_constants.js:39-54`). The synth UI powers a gated group on implicitly at interaction (`#implicitEnable`, `tests/synth_editor_implicit.test.js`) — presets on disk are never modified.

## Testing

### Unit tests (vitest)

- **Config**: `vite.config.js` under `test` key (no separate vitest.config.js)
- **Setup**: `tests/setup.js` — stubs canvas, ResizeObserver, injects CSS for jsdom
- Unit tests live in `tests/`
- **Run**: `npm test` or `npx vitest run`
- **Type check**: `npm run typecheck` — `tsc -p jsconfig.json --noEmit` with `allowJs` + `checkJs: true`, so **every `src/**/*.js` file is type-checked**; there is no opt-in pragma any more. `strict` is off, and the code is annotated with JSDoc rather than TS syntax, so annotations live in `@param`/`@returns`/`@property` plus inline casts `/** @type {X} */ (expr)`. `jsconfig.json` also includes `src/**/*.d.ts` (ambient declarations for `*.css` and `import.meta.env`, in `src/types.d.ts`) and excludes `tests/` and `e2e/`, which stay untyped. Fixing an error should be annotation-only; a change to a line of logic needs a reason in the commit.
    - **Never use an en-dash/em-dash as a JSDoc tag separator** — `@param {string} label – desc` breaks the parser (TS1127 "Invalid character"). Use an ASCII hyphen: `@param {string} label - desc`. Dashes elsewhere in prose are fine.
    - Type-only imports are written `@param {import('./x.js').default} x` and are erased at runtime, so the path must still be correct (TS2307 otherwise).
    - Declaring a field on a class for something a collaborator assigns later (`this.onEnded = …`) is a bare `/** @type {T} */ name` line — a `#private` member cannot carry a `@private` tag.
    - Model params typed `{object}` produce most remaining friction; when a function only reads a handful of keys, type that handful (`{{stepsPerBeat?: number}} track`) rather than casting at each use.

Test helpers in `tests/helpers/`:

- `cmd_test_helpers.js` — command test utilities
- `make_pattern.js` — pattern fixture builder
- `midi_test_helpers.js`, `midi_builder.js`, `midi_reader.js` — MIDI test utilities
- `wav_builder.js` — WAV file builder for tests
- `worklet_mocks.js` — AudioWorklet mocks

### E2E tests (playwright)

- **Config**: `playwright.config.js`
- Spec files live in `e2e/`
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

## Undo policy

Guarded by `tests/undo_policy.test.js`.

- **Track parameters are undoable**: track-editor knobs/sliders go through `cmd.updateTrack(track, updates, { desc, coalesce })` — values are clamped to `TRACK_VALUE_RANGES`, unknown/derived keys are skipped, and one `HistoryManager` entry is recorded per effective change (with `meta.params`/`meta.prev` for the undo report toast). `coalesce: true` merges rapid same-key updates (400 ms window) into a single undo step so a whole drag undoes as one gesture.
- **Note parameters are undoable**: every note edit goes through `components/note_edit.js applyNoteEdit()` → `cmd.updateNote(track, note, updates, { desc, coalesce })` — no-op values are dropped before the command layer (so they neither preview nor reach the history), and `coalesce: true` merges a whole gesture into one step. Both grids and both gestures go through it, with the service registry injected (the pattern grid has its own).
- **Note editing gestures** (pattern grid + piano roll, same behaviour): a **drag** on a note (`pattern_panel/pattern_grid_drag.js` on a filled cell — the slice under the pointer, so one voice per slice — and `piano_roll/piano_roll_drag.js`) and **Shift+Arrow** on the selected note (`Shift+↑/↓` velocity, `Shift+←/→` pitch — `components/note_nudge.js`). Both share `components/note_drag.js` (gesture math: vertical = velocity at 0.005/px, horizontal = one semitone per 12 px, axis locked on the first 3 px so a diagonal edits one parameter only) and `components/note_edit.js` (`AXIS_*`, `emitNotePicked()`). In the pattern grid Shift+Arrow only applies to a note the **pointer** picked (`editor.selectedByPointer`) — it also extends the range selection for a range delete, and the cursor sync clears the flag. A gesture never deletes the note: the trailing click is swallowed (`consumeClick()`).
- **Editing feedback**: `components/note_gauge.js` (a knob-style arc — same 270° sweep as `.or-knob-arc` — over the note name and value, plus a `.pp-gauge-anchor` ring on the edited cell/note; each panel supplies `resolveAnchor` since it repaints its notes) and `components/note_preview.js` (throttled `seq.simpleBeep` at 90 ms), otherwise an edit is silent and made blind. The gauge is the only pitch readout the pattern grid has, and it takes the note's own tooltip down while it is up (`title` attribute, and the grid's hover bubble via `pointer.hideTooltip()`), restoring it when it fades.
- **Master/mixer is NOT undoable**: the output panel and the pattern panel master shortcut write straight to `serviceRegistry.audioEngine.mixer.setMasterBus()` — never through `cmd`/`HistoryManager`. Reverting = move the slider back.
- **Synth preset edits are NOT undoable**: live edits commit to `soundRegistry.generatedSounds` + IndexedDB via `commitSound` (frame-coalesced for knob drags, `flushPreview()` flushes a pending frame). Only the preset's own **Revert** button restores the original.

## Code conventions

- **Language**: vanilla JS, ES Modules (`import`/`export`), no transpiler
- **English only**: all code, comments, variable/function/class names must be exclusively in English. No other languages in source code.
- **Class pattern**: ES classes with private fields (`#field`)
- **State**: data (patterns, selection, song) centralized in `app_state.js`; services/DI instances (cmd, seq, audioEngine…) in `service_registry.js` — they are separate, appState is not accessed via serviceRegistry
- **UI panels**: extend `BasePanel` or follow its pattern (no framework)
- **DOM listeners**: bind with `panel.listen(target, type, handler, options?)` — `BasePanel.destroy()` aborts one `AbortController` per instance, so panels keep no handler references for `removeEventListener` (a fresh controller is created per `init()` cycle). Keep raw `add`/`removeEventListener` only for **visibility-scoped** bindings (bound in `show()`, released in `hide()` — see `piano_roll_panel.js` keydown/wheel). Standalone panels that don't extend `BasePanel` (`pattern_settings_panel.js`, `toolbar/view_switch.js`) own their own `#abortController` + `listen()` + `destroy()`
- **Naming**: `snake_case` for files, `camelCase` for variables/functions, `PascalCase` for classes
- **One file, one class**: a module shares its main class’s name — the file is `snake(ClassName)` (`sequencer.js` ↔ `Sequencer`, `commander.js` ↔ `Commander`, `event_bus.js` ↔ `EventBus`, `flat_note.js` ↔ `FlatNote`). When the directory already carries the word, the class drops it rather than the file doubling it: `audio/engine.js` ↔ `Engine`, `audio/analyzer.js` ↔ `Analyzer`, `audio/stall_detector.js` ↔ `StallDetector`, `audio/voices/synth_voice_pool.js` ↔ `SynthVoicePool`, `patterns/exporter.js` ↔ `Exporter`. Basenames are unique repo-wide: `core/constants.js` keeps the plain name, a panel copy is prefixed (`ui/piano_roll/piano_roll_constants.js`, `ui/track_editor/track_editor_constants.js`), `patterns/engine.js` is `pattern_engine.js`, and the two drag modules are `pattern_panel/pattern_grid_drag.js` and `piano_roll/piano_roll_drag.js`.
- **Counting**: one convention, the `Count` suffix — `beatCount`, `tickCount`, `tickCountForPattern`, `loopCount`, `retriggerCount`, `measureCount`. Never `nbX`/`numX`/`xNum` for a quantity. An **index** is `Idx` (`selectedPatternIdx`, `patIdx`), a **MIDI note** is `noteKey` (see `src/logic/midi/`), a parsed/fallback scalar is plain English (`bpmValue`). Exceptions kept on purpose: `selectedPatternNum`/`selectedDrumkitNum`/`selectedTrackNum` are legacy **file** spellings still read from old snapshots and `.odbox` (never written), `nbBeats` survives only inside the v5 migration and its tests, and `startBar`/`bars`/`loopBars`/`soundId` survive only inside v8 and its read-side aliases.
- **Vocabulary** (music): a 4/4 measure is **measure** (`startMeasure`, `measureToTick`, `BEATS_PER_MEASURE`, `data-measure`), never `bar` — `bar` stays only for UI chrome (`toolbar`, `tabBar`, `knobBar`, `progressBar`, `spacebar`). A playable audio file is a **sample** (`sampleId`, `sampleUrl`), a preset built by the soft synth is a **synth** (`generatedSounds`, `synthSoundKey`), an assignable slot in a track is a **sound**/instrument (`useSoftSynth`, `useAutoAssignSound`), a drum library is a **kit** (`soundRegistry.kits`). A track points at one sample through `track.sampleId`.
- **Generators**: imported dynamically via `service_loader.js`
- **Worklet code**: processor source files in `src/audio/worklets/processors/` are template strings (not ES modules)
- **Fonts**: `--font` = system monospace stack (no licence, no files); `--font-pixel` = bundled Press Start 2P (SIL OFL 1.1, `src/ui/fonts/` + `OFL-PressStart2P.txt` notice, `@font-face` in `src/ui/fonts.css` linked from `index.html` so the splash gets it) — use it only at multiples of 8px (8/16/24/32px) so glyphs stay on the 8px grid, data/paragraph text stays on `--font`; the font has a single weight, so pixel rules set `font-weight: 400` + `font-synthesis: none` (never fake-bold it)
- **Waiting screen CSS**: stays **inline in a `<style>` block in `index.html`**, not in `src/ui/styles.css`. It must paint before any module script (and its bundled CSS) is evaluated — the splash is the first thing the user sees and cannot flash unstyled. `styles.css` is imported by `src/main.js`, so anything moved there would arrive too late.
- **Persisted key**: `beatCount` (was `nbBeats` before v5). `MIGRATIONS[5]` rewrites it in the `songs` and `patterns` stores; `beatCount` lives on both the pattern and each track (a track's value is independent). Old song/pattern JSON files are **not** auto-converted — they load with the default of 4 beats.
- **Persisted key**: `retriggerCount` (was `retriggerNum` before v7). `MIGRATIONS[7]` rewrites it in the `songs` and `patterns` stores, on object notes **and** on the compact `noteKeys` header (positional, so only the header entry moves). Old files are also mapped on read — `migrateLegacyPatternKeys()` in `src/core/note_schema.js`, called by `song_service.applyToAppState` (.odbox), `importPatternFromJson` and `fixPattern` — since user exports predate the rename.
- **Persisted key**: `stepPercent` (was `steppc`) — the note position percent within its beat, `Math.round(beatStep * 100 / stepsPerBeat)`. Recalculated on import and stripped on export (never in a file), but app-state notes carry it, so it sits in IndexedDB: `MIGRATIONS[8]` renames it there, `LEGACY_NOTE_KEY_ALIASES` maps it on read.
- **Persisted key**: `sampleId` (was `soundId` before v8). `MIGRATIONS[8]` rewrites it on every track of the `songs` and `patterns` stores, and `migrateLegacyPatternKeys()` maps it on read for `.odbox`, pattern JSON and MCP (`normalizePattern`). It points at the sample in `soundRegistry.sounds` (synth presets keep their own `synthSoundKey`), and it is the only key that links a track to its sound.
- **Persisted key**: `startMeasure` / `measureCount` (clip) and `loopMeasureCount` (song), before v8 spelled `startBar` / `bars` / `loopBars`. `MIGRATIONS[8]` rewrites the arrangement store; on read, `normalizeSong()` maps the file spellings through `migrateLegacySongKeys()` in `src/core/legacy_keys.js`.
- **Persisted key**: `colorScheme` (1–3) — lives in `assets/data/settings.json`, **not** IndexedDB: the file is re-read and wins for this key on every boot (`#applyFileColorScheme()`), the one exception to the IDB-first rule, because the MCP `setColorScheme` tool writes it there (there is no live browser channel). `COLOR_SCHEME_COUNT` / `normalizeColorScheme()` are in `src/core/constants.js` (anything but 1/2/3 falls back to 1); `applyColorScheme()` in `src/ui/theme.js` tags `<html data-scheme>` and drops the token cache — called only from `main.js` (`primeColorScheme()`), since bootstrap/loader layers must not import `ui/`. Schemes 2 and 3 are `:root[data-scheme]` overrides in `src/ui/styles.css` that re-tint the shell only (toys + semantic signals stay shared).
- **Paging**: one page is always `BEATS_PER_PAGE` **beats** (`src/core/constants.js`). Never derive a page count from step counts — `stepsPerBeat` subdivides a beat, it does not change how many beats fit on a page. Use `pageCountFor()` / `maxPageFor()` from `src/ui/page_nav.js`.
- **Error reporting**: never swallow a failure silently. Use `reportUserError(context, message)` from `src/core/notify.js` (user-visible toast, deduped per context) — console logging alone is stripped from production builds (`drop_console: true`).

## JavaScript Guidelines (Vanilla JS)

### 1. Default Rule: Clean & Modern Vanilla JS

By default, code must prioritize readability, maintainability, and ES2020+ standards.

- **Modern Syntax:** Use destructuring, template literals, `const`/`let` (never `var`), optional chaining (`?.`), and nullish coalescing (`??`).
- **Functional & Immutable Style:** Prefer declarative array methods (`.map()`, `.filter()`, `.reduce()`, `.find()`) over imperative loops. Avoid mutating existing objects or arrays—use spread syntax (`...`) instead.
- **Asynchronous Code:** Consistently use `async`/`await` with explicit error handling (`try...catch`) over `.then()` chains.
- **DOM & Events:**
    - Prefer `querySelector` and `querySelectorAll`.
    - Use **event delegation** on parent elements instead of binding listeners to individual items.
    - Use `classList` (`add`, `remove`, `toggle`) to manage styles rather than directly mutating `element.style`.

---

### 2. Exception: Performance-Critical Hot Paths

**Trigger Condition:** Apply these rules _only_ in bottleneck areas (e.g., high-frequency loops, 60fps animations/rendering, processing large datasets,processing sound, bulk DOM operations).

In these specific paths **only**:

- **Iteration:** Replace `.map()`, `.forEach()`, or `.reduce()` with classic `for` loops (`for (let i = 0; i < len; i++)`) or `while` loops to eliminate closure overhead and function call stack costs.
- **In-Place Mutation:** Direct array/object mutations and object reuse are allowed to reduce memory allocation and Garbage Collector pressure.
- **DOM Access Optimization:**
    - Use `getElementById` or `getElementsByClassName` when selector lookup speed is critical.
    - Cache all DOM references outside hot loops.
    - Batch DOM reads and writes to prevent layout thrashing (forced synchronous reflows), or use `DocumentFragment` and `requestAnimationFrame`.
- **Mandatory Commenting:** Any deviation from clean code standards for performance reasons MUST include a brief inline comment explaining the bottleneck justification

## File structure reference

```
src/
  audio/           — Web Audio API engine, voices, worklets, export,
                    fx_values.js (waveform/filter/delay parameter values)
  cache/           — IndexedDB caching
  core/            — constants, IDB wrapper, logger, timer worker, and the pure
                    domain modules: numbers.js (clamp/toFiniteNumber), notes.js
                    (step math + note signatures), tracks.js (track array/loop
                    helpers), drum_taxonomy.js (name -> type -> pan)
  loader/          — asset/resource loading
  logic/           — sequencer, LFO, history, commands, generators, MIDI, services
  model/           — data models (flat_note, instrument, track/pattern schema)
  patterns/        — pattern engine, flat notes, defaults, variation
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
