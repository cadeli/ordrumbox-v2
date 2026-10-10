# Pattern JSON Format

Complete specification of the orDrumbox v2 pattern format.

Source of truth files:

- `src/model/pattern_schema.js` — `PATTERN_DEFAULTS`
- `src/core/tracks.js` — `getTracksArray()` (tracks normalization)
- `src/model/track_schema.js` — `TRACK_DEFAULTS`, `TRACK_VALUE_RANGES`
- `src/core/note_schema.js` — `NOTE_DEFAULTS`, `NOTE_KEY_ORDER`, `NOTE_RECALCULATED`
- `src/patterns/exporter.js` — serialization / compaction
- `src/patterns/fixer.js` — deserialization / normalization
- `src/logic/commands/pattern_import.js` — `validatePatternJson()`, `importPatternFromJson()`

---

## Top-level pattern object

| Property      | Type       | Default                       | Description                                                   |
| ------------- | ---------- | ----------------------------- | ------------------------------------------------------------- |
| `application` | `string`   | `"online-ordrumbox"`          | Application identifier. Stamped on export, not user-settable. |
| `url`         | `string`   | `"https://www.ordrumbox.com"` | Application URL. Stamped on export, not user-settable.        |
| `name`        | `string`   | `""`                          | Pattern name (what the dropdowns and MCP tools address).      |
| `id`          | `string`   | `""`                          | Stable id assigned once at creation (arrangements reference it). Always written when set. |
| `beatCount`   | `integer`  | `4`                           | Beats per pattern (not per track). Range: 1–16.               |
| `bpm`         | `number`   | `120`                         | Tempo in beats per minute.                                    |
| `description` | `string`   | `""`                          | Free-text description.                                        |
| `tags`        | `string[]` | `[]`                          | Arbitrary tags for categorization.                            |
| `tracks`      | `Track[]`  | `[]`                          | Array of track objects.                                       |

### Implicit rules

- Any missing property is filled from `PATTERN_DEFAULTS` on import.
- `application` and `url` are stamped by the exporter; they are **not** stripped on import — they pass through as-is if present.
- `tracks` is always normalized to an array by `getTracksArray()` (src/core/tracks.js). An object with numeric keys (`{ "0": {...}, "1": {...} }`) is accepted.

---

## Track object

| Property             | Type              | Default         | Range                                                | Description                                                                             |
| -------------------- | ----------------- | --------------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `name`               | `string`          | `""`            | —                                                    | Display name (e.g. `"KICK"`, `"SNARE"`).                                                |
| `sampleId`           | `string`          | `"NOT_DEFINED"` | —                                                    | URL or key of the assigned sample. `"NOT_DEFINED"` = no sound.                          |
| `useAutoAssignSound` | `boolean`         | `true`          | —                                                    | Auto-assign sound by track name on load. Forced to `false` if `useSoftSynth` is `true`. |
| `beatCount`          | `integer`         | `4`             | 1–16                                                 | Beats in this track. Independent of the pattern-level `beatCount`.                      |
| `stepsPerBeat`       | `integer`         | `4`             | 1–8                                                  | Subdivision per beat. Total steps = `beatCount × stepsPerBeat`.                         |
| `loopAtStep`         | `integer \| null` | `null`          | 0–1024                                               | Loop point in steps. `null` = no loop (full track).                                     |
| `swingResolution`    | `integer`         | `1`             | 1–8                                                  | Swing grid resolution.                                                                  |
| `swingAmount`        | `number`          | `0`             | 0–1                                                  | Swing intensity.                                                                        |
| `velocity`           | `number`          | `1`             | 0–1                                                  | Track velocity multiplier.                                                              |
| `velocityLfo`        | `Lfo \| null`     | `null`          | —                                                    | LFO modulating velocity. `null` = disabled.                                             |
| `pitch`              | `integer`         | `0`             | -24–24                                               | Track pitch offset in semitones.                                                        |
| `pitchLfo`           | `Lfo \| null`     | `null`          | —                                                    | LFO modulating pitch. `null` = disabled.                                                |
| `pan`                | `number`          | `0`             | -1–1                                                 | Stereo pan. `-1`=left, `0`=center, `1`=right.                                           |
| `panLfo`             | `Lfo \| null`     | `null`          | —                                                    | LFO modulating pan. `null` = disabled.                                                  |
| `solo`               | `boolean`         | `false`         | —                                                    | Solo mode.                                                                              |
| `mute`               | `boolean`         | `false`         | —                                                    | Mute mode.                                                                              |
| `auto`               | `boolean`         | `false`         | —                                                    | Auto mode.                                                                              |
| `useSoftSynth`       | `boolean`         | `false`         | —                                                    | Use built-in synth instead of sample playback.                                          |
| `mono`               | `boolean`         | `false`         | —                                                    | Mono mode (monophonic).                                                                 |
| `variation`          | `integer`         | `0`             | 0–100                                                | Track variation amount (budget-based randomization).                                    |
| `variation2`         | `integer`         | `0`             | 0–100                                                | Track variation 2 amount.                                                               |
| `filterType`         | `string`          | `"allpass"`     | `"lowpass"`, `"highpass"`, `"bandpass"`, `"notch"`, `"allpass"` | Filter type. `"allpass"` = no filtering. The track editor exposes only lowpass/highpass/bandpass; `notch` is accepted on a track (file/MCP). `peaking`/`lowshelf`/`highshelf` are synth-only and fall back to `lowpass`. |
| `filterFreq`         | `number`          | `20`            | 20–20000                                             | Filter cutoff frequency in Hz.                                                          |
| `filterQ`            | `number`          | `0.707`         | 0.707–18.707                                         | Filter resonance (Q factor). The synth editor uses its own 0.1–24 knob range.           |
| `filterFreqLfo`      | `Lfo \| null`     | `null`          | —                                                    | LFO modulating filter frequency. `null` = disabled.                                     |
| `filterQLfo`         | `Lfo \| null`     | `null`          | —                                                    | LFO modulating filter Q. `null` = disabled.                                             |
| `reverbType`         | `string`          | `"none"`        | —                                                    | Reverb algorithm. `"none"` = disabled.                                                  |
| `reverbAmount`       | `number`          | `0`             | 0–1                                                  | Reverb wet/dry mix.                                                                     |
| `delayType`          | `string`          | `"tape"`        | —                                                    | Delay algorithm.                                                                        |
| `delayTime`          | `number`          | `1`             | 0–4                                                  | Delay time multiplier (relative to beat).                                               |
| `delayDepth`         | `number`          | `0`             | 0–1                                                  | Delay wet/dry mix.                                                                      |
| `fxSelected`         | `string`          | `"reverb"`      | `"reverb"`, `"delay"`                                | Currently selected FX slot in the UI.                                                   |
| `saturationType`     | `string`          | `"soft"`        | —                                                    | Saturation algorithm.                                                                   |
| `saturationAmount`   | `number`          | `0`             | 0–1                                                  | Saturation drive.                                                                       |
| `sat`                | `boolean`         | `true`          | —                                                    | Saturation enabled.                                                                     |
| `reverbOn`           | `boolean`         | `true`          | —                                                    | Reverb enabled.                                                                         |
| `delayOn`            | `boolean`         | `true`          | —                                                    | Delay enabled.                                                                          |
| `synthSoundKey`      | `string \| null`  | `null`          | —                                                    | Synth preset key (for soft synth).                                                      |
| `notes`              | `Note[]`          | `[]`            | —                                                    | Note array. Objects or compact arrays.                                                  |

### Additional generator/probability properties

These are present on tracks when the auto-generation system is used:

| Property           | Type      | Default | Range | Description                             |
| ------------------ | --------- | ------- | ----- | --------------------------------------- |
| `probability`      | `number`  | `1`     | —     | Track-level probability.                |
| `prob_pitch`       | `integer` | `50`    | 0–100 | Pitch variation probability.            |
| `prob_velocity`    | `integer` | `50`    | 0–100 | Velocity variation probability.         |
| `prob_silence`     | `integer` | `50`    | 0–100 | Silence insertion probability.          |
| `prob_fill`        | `integer` | `50`    | 0–100 | Fill probability.                       |
| `prob_ghost`       | `integer` | `50`    | 0–100 | Ghost note probability.                 |
| `prob_retrig`      | `integer` | `50`    | 0–100 | Retrigger probability.                  |
| `prob_euclid`      | `integer` | `50`    | 0–100 | Euclidean fill probability.             |
| `prob_note`        | `integer` | `50`    | 0–100 | Note variation probability.             |
| `prob_arp`         | `integer` | `50`    | 0–100 | Arpeggio probability.                   |
| `pitch_range`      | `integer` | `12`    | 1–24  | Pitch range for random generation.      |
| `pitch_scale_lock` | `boolean` | `false` | —     | Lock pitch to scale.                    |
| `auto_variant`     | `string`  | `""`    | —     | Auto-variant mode key.                  |
| `auto_density`     | `number`  | `-1`    | -1–1  | Auto-density. `-1` = use track default. |

### Implicit rules

- **Compact format**: tracks are serialized with only non-default values. Missing properties are restored from `TRACK_DEFAULTS` on import.
- If `useSoftSynth` is `true`, `useAutoAssignSound` is forced to `false`.
- `pan` is only derived when the file omits it: `fixTrackPanning(track)` fills a **missing** `pan` from the track's drum type (never from the track's position in the array). A `pan` the file carries is kept as-is.
- Values are rounded to 2 decimals on export for: `velocity`, `pan`, `reverbAmount`, `delayDepth`, `delayTime`, `saturationAmount`, `swingAmount`, `filterFreq`, `filterQ`.

---

## LFO object

Used by `velocityLfo`, `pitchLfo`, `panLfo`, `filterFreqLfo`, `filterQLfo` (track LFOs).

| Property | Type     | Default  | Description                                                                 |
| -------- | -------- | -------- | --------------------------------------------------------------------------- |
| `type`   | `string` | `"sine"` | Waveform: `"sine"`, `"triangle"`, `"sawtooth"`, `"square"`, `"random"`.     |
| `freq`   | `number` | `1`      | Cycles per **4 beats** (`freq` is capped at 2; one cycle always spans 4 beats). |
| `min`    | `number` | *from target* | Modulation minimum (target property range).                              |
| `max`    | `number` | *from target* | Modulation maximum (target property range).                              |
| `phase`  | `number` | `0`      | Phase offset in cycles (0–1).                                               |

When `null`, the LFO is disabled.

---

## Note object

| Property                | Type               | Default | Description                                                            |
| ----------------------- | ------------------ | ------- | ---------------------------------------------------------------------- |
| `velocity`              | `number`           | `0.8`   | Playback volume (0–1).                                                 |
| `beat`                  | `integer`          | `0`     | Beat index within the track (0-based).                                 |
| `beatStep`              | `integer`          | `0`     | Step index **within the beat** (0-based, 0 to `stepsPerBeat - 1`).      |
| `pitch`                 | `integer`          | `0`     | Pitch offset in semitones.                                             |
| `pan`                   | `number`           | `0`     | Stereo pan (-1=left, 0=center, 1=right).                               |
| `every`                 | `integer`          | `1`     | Fire once every N **pattern passes**: `(loop + pos) % every === 0`. Not "every N steps". |
| `pos`                   | `integer`          | `0`     | Phase offset inside the `every` cycle (0–15), not sub-step micro-timing. |
| `prob`                  | `number`           | `1`     | Trigger probability (0–1). 1 = certain.                                |
| `rate`                  | `integer`          | `1`     | Retrigger/arp spacing code: 1–7 → `rate/8` of a step, 8–16 → `rate - 7` steps (8 = 1 step). |
| `retriggerCount`        | `integer`          | `1`     | Number of hits: the initial trigger plus its repeats (1 = the note alone). With `arp`, it is the number of arp notes. |
| `arp`                   | `string \| number[] \| object \| null` | `null` | Arpeggio: interval array (`[0, 4, 7]`), numeric string `"0,4,7"`, mode keyword (`"up"`, `"down"`, `"updown"`, `"random"` — default major-scale set), or `{intervals: number[], mode?: "up"\|"down"\|"updown"\|"random"}`. `null` = disabled. |
| `arpTriggerProbability` | `number`           | `1`     | Probability (0–1) that each arp note **and each plain retrigger repeat** is played. |
| `euclideanFill`         | `integer`          | `0`     | Euclidean pulses over the span to the next note (0–16). 0 = disabled.  |
| `euclideanRotation`     | `integer`          | `0`     | Euclidean phase rotation in steps (0–15).                              |
| `_arpScale`             | `string \| null`   | —       | Note-editor arpeggio scale override (editor state, survives the compact format). |
| `_arpType`              | `string \| null`   | —       | Note-editor arpeggio type override (editor state, survives the compact format). |

### Properties never serialized

| Property      | Description                                                                                                                 |
| ------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `stepPercent` | Step percent — recalculated as `Math.round(beatStep * 100 / stepsPerBeat)`. The legacy `steppc` spelling is mapped on read. |

### Implicit rules

- `normalizeNoteGridPosition()` runs on every note at import time: if `beatStep >= stepsPerBeat`, the overflow is added to `beat` (the step wraps into the next beat) and `stepPercent` is recomputed from the wrapped `beatStep`.
- Values are rounded to 2 decimals on export for: `velocity`, `pan`, `prob`, `rate`.

---

## Compact note format

The compact format replaces note objects with arrays to reduce JSON size by ~40%.

### How it works

1. The exporter analyzes all notes in a track and builds `noteKeys` — an ordered list of property names that have non-default values anywhere in the track.
2. Each note is serialized as an array where index `i` corresponds to `noteKeys[i]`.
3. Trailing default values are omitted from each note array.

**Example:**

```json
{
    "noteKeys": ["velocity", "beat", "beatStep", "pitch"],
    "notes": [[0.4], [0.9, 1], [0.35, 1, 2], [0.35, 2, 2, -3]]
}
```

| Note                      | Decoded values (keys = `["velocity", "beat", "beatStep", "pitch"]`) |
| ------------------------- | -------------------------------------------------------------------- |
| `[0.4]`                   | velocity 0.4 — the rest are defaults (trailing defaults are omitted)  |
| `[0.9, 1]`                | velocity 0.9, beat 1                                                  |
| `[0.35, 1, 2]`            | velocity 0.35, beat 1, beatStep 2                                     |
| `[0.35, 2, 2, -3]`        | velocity 0.35, beat 2, beatStep 2, pitch -3                           |

### Compact vs legacy detection

A track is in compact format if:

- `track.noteKeys` is an array, AND
- `track.notes` is non-empty, AND
- `track.notes[0]` is an array (not an object), AND
- `areValidNoteKeys(track.noteKeys)` passes: distinct keys, all known, in `NOTE_KEY_ORDER` order.

If a track uses arrays but its `noteKeys` header fails that check, the import **refuses the track** (reports an error and skips it) instead of decoding positionally by guesswork.

On import, compact notes are expanded to objects and `noteKeys` is deleted.

---

## Minimal valid pattern

```json
{
    "tracks": []
}
```

All properties are optional. Missing values are filled from defaults.

---

## Maximal example

```json
{
    "application": "online-ordrumbox",
    "url": "https://www.ordrumbox.com",
    "beatCount": 4,
    "bpm": 128,
    "description": "A test pattern",
    "tags": ["test", "demo"],
    "tracks": [
        {
            "name": "KICK",
            "sampleId": "samples/kick.wav",
            "useAutoAssignSound": false,
            "beatCount": 4,
            "stepsPerBeat": 4,
            "velocity": 0.9,
            "pitch": -2,
            "pan": -0.3,
            "filterType": "lowpass",
            "filterFreq": 800,
            "filterQ": 1.2,
            "reverbAmount": 0.3,
            "delayDepth": 0.15,
            "delayTime": 0.5,
            "saturationAmount": 0.4,
            "velocityLfo": {
                "type": "sine",
                "freq": 2,
                "min": 0.3,
                "max": 1,
                "phase": 0
            },
            "notes": [
                {
                    "velocity": 1,
                    "beat": 0,
                    "beatStep": 0,
                    "pitch": 0
                },
                {
                    "velocity": 0.7,
                    "beat": 0,
                    "beatStep": 2,
                    "pitch": 0,
                    "prob": 0.5
                },
                {
                    "velocity": 0.85,
                    "beat": 1,
                    "beatStep": 0,
                    "pitch": -3,
                    "rate": 4,
                    "arp": [0, 7, 12]
                }
            ]
        },
        {
            "name": "SNARE",
            "sampleId": "samples/snare.wav",
            "useAutoAssignSound": false,
            "beatCount": 4,
            "stepsPerBeat": 4,
            "notes": [
                {
                    "velocity": 0.9,
                    "beat": 0,
                    "beatStep": 4
                },
                {
                    "velocity": 0.6,
                    "beat": 0,
                    "beatStep": 12,
                    "retriggerCount": 3
                }
            ]
        },
        {
            "name": "SYNTH",
            "useSoftSynth": true,
            "synthSoundKey": "saw_pad",
            "beatCount": 4,
            "stepsPerBeat": 8,
            "pitchLfo": {
                "type": "triangle",
                "freq": 4,
                "min": -5,
                "max": 5,
                "phase": 0
            },
            "noteKeys": ["velocity", "beat", "beatStep", "pitch"],
            "notes": [
                [0.6, 0, 0, 0],
                [0.6, 0, 4, 7],
                [0.6, 1, 0, 12]
            ]
        }
    ]
}
```

---

## Validation limits

Enforced by `validatePatternJson()` on import:

| Check                                                         | Limit    |
| ------------------------------------------------------------- | -------- |
| Top-level must be a non-null object                           | —        |
| `tracks` must be an object (array or keyed object) if present | —        |
| Track count                                                   | ≤ 64     |
| Total note count across all tracks                            | ≤ 10,000 |
| Each track entry must be a non-null object                    | —        |

---

## Value clamping ranges

Applied by `updateTrack()` and MCP tools. Out-of-range values are clamped:

| Property           | Min | Max   |
| ------------------ | --- | ----- |
| `velocity`         | 0   | 1     |
| `pan`              | -1  | 1     |
| `pitch`            | -24 | 24    |
| `beatCount`        | 1   | 16    |
| `stepsPerBeat`     | 1   | 8     |
| `loopAtStep`       | 0   | 1024  |
| `swingResolution`  | 1   | 8     |
| `swingAmount`      | 0   | 1     |
| `filterFreq`       | 20  | 20000 |
| `filterQ`          | 0.707 | 18.707 |
| `reverbAmount`     | 0   | 1     |
| `delayTime`        | 0   | 4     |
| `delayDepth`       | 0   | 1     |
| `saturationAmount` | 0   | 1     |
| `variation`        | 0   | 100   |
| `variation2`       | 0   | 100   |
| `prob_*`           | 0   | 100   |
| `pitch_range`      | 1   | 24    |
| `auto_density`     | -1  | 1     |

---

## Import flow

1. `JSON.parse(text)` — the raw string is parsed (caller's responsibility; must be wrapped in try/catch).
2. `validatePatternJson(data)` (`src/logic/commands/pattern_import.js`) — structural validation: non-null object, `tracks` shape, ≤ 64 tracks, ≤ 10,000 notes in total.
3. `importPatternFromJson(data, addPattern, addTrack, addNote)` — maps legacy keys (`migrateLegacyPatternKeys`), copies the pattern/tracks/notes into a fresh pattern — a track whose compact notes carry an unreadable `noteKeys` header is reported and skipped — then calls `fixPattern()` on the result.
4. `fixPattern()` (`src/patterns/fixer.js`) — stamps `application`/`url` if missing, ensures a stable pattern `id`, then calls `fixTrackDefaults()` on every track.
5. `fixTrackDefaults()`:
    - Expands compact note arrays to objects.
    - Fills a **missing** `pan` from the track's drum type (a `pan` the file carries is kept).
    - Applies `TRACK_DEFAULTS` for missing properties.
    - Forces `useAutoAssignSound = false` if `useSoftSynth` is `true`.
    - Normalizes every note: legacy key rename, `normalizeNoteGridPosition()` (wraps `beatStep` overflow into the next beat, recomputes `stepPercent`), then `normalizeNote()`.

## Export flow

1. `Exporter.export(pattern)` — stamps `application` and `url`.
2. `cleanPattern()` — strips top-level defaults (and the runtime `_revision` key); keeps `id` even when it looks default, so arrangement references never dangle.
3. `cleanTrack()` — strips default track properties and the `noteKeys` header (it is re-derived below).
4. `encodeNotes()` — cleans each note (drops defaults and the recalculated `stepPercent`), detects the used keys via `detectUsedKeys()`, encodes each note as a compact array and attaches `noteKeys` to the track. Notes that are *all* default are kept as empty arrays (`"notes": [[]]`), never dropped.
5. Values are rounded to 2 decimals for the properties listed above.
