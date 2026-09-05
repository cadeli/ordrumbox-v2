# Pattern JSON Format

Complete specification of the orDrumbox v2 pattern format.

Source of truth files:
- `src/core/utils.js` — `PATTERN_DEFAULTS`
- `src/model/track_schema.js` — `TRACK_DEFAULTS`, `TRACK_VALUE_RANGES`, `TRACK_RECALCULATED`
- `src/core/note_schema.js` — `NOTE_DEFAULTS`, `NOTE_KEY_ORDER`, `NOTE_RECALCULATED`
- `src/patterns/exporter.js` — serialization / compaction
- `src/patterns/fixer.js` — deserialization / normalization

---

## Top-level pattern object

| Property | Type | Default | Description |
|---|---|---|---|
| `application` | `string` | `"online-ordrumbox"` | Application identifier. Stamped on export, not user-settable. |
| `url` | `string` | `"https://www.ordrumbox.com"` | Application URL. Stamped on export, not user-settable. |
| `nbBeats` | `integer` | `4` | Beats per pattern (not per track). Range: 1–16. |
| `bpm` | `number` | `120` | Tempo in beats per minute. |
| `description` | `string` | `""` | Free-text description. |
| `tags` | `string[]` | `[]` | Arbitrary tags for categorization. |
| `tracks` | `Track[]` | `[]` | Array of track objects. |

### Implicit rules

- Any missing property is filled from `PATTERN_DEFAULTS` on import.
- `application` and `url` are stamped by the exporter; they are **not** stripped on import — they pass through as-is if present.
- `tracks` is always normalized to an array by `Utils.getTracksArray()`. An object with numeric keys (`{ "0": {...}, "1": {...} }`) is accepted.

---

## Track object

| Property | Type | Default | Range | Description |
|---|---|---|---|---|
| `name` | `string` | `""` | — | Display name (e.g. `"KICK"`, `"SNARE"`). |
| `soundId` | `string` | `"NOT_DEFINED"` | — | URL or key of the assigned sample. `"NOT_DEFINED"` = no sound. |
| `useAutoAssignSound` | `boolean` | `true` | — | Auto-assign sound by track name on load. Forced to `false` if `useSoftSynth` is `true`. |
| `nbBeats` | `integer` | `4` | 1–16 | Beats in this track. Independent of the pattern-level `nbBeats`. |
| `stepsPerBeat` | `integer` | `4` | 1–8 | Subdivision per beat. Total steps = `nbBeats × stepsPerBeat`. |
| `loopAtStep` | `integer \| null` | `null` | 0–1024 | Loop point in steps. `null` = no loop (full track). |
| `swingResolution` | `integer` | `1` | 1–8 | Swing grid resolution. |
| `swingAmount` | `number` | `0` | 0–1 | Swing intensity. |
| `velocity` | `number` | `1` | 0–1 | Track velocity multiplier. |
| `velocityLfo` | `Lfo \| null` | `null` | — | LFO modulating velocity. `null` = disabled. |
| `pitch` | `integer` | `0` | -24–24 | Track pitch offset in semitones. |
| `pitchLfo` | `Lfo \| null` | `null` | — | LFO modulating pitch. `null` = disabled. |
| `pan` | `number` | `0` | -1–1 | Stereo pan. `-1`=left, `0`=center, `1`=right. |
| `panLfo` | `Lfo \| null` | `null` | — | LFO modulating pan. `null` = disabled. |
| `solo` | `boolean` | `false` | — | Solo mode. |
| `mute` | `boolean` | `false` | — | Mute mode. |
| `auto` | `boolean` | `false` | — | Auto mode. |
| `useSoftSynth` | `boolean` | `false` | — | Use built-in synth instead of sample playback. |
| `mono` | `boolean` | `false` | — | Mono mode (monophonic). |
| `variation` | `integer` | `0` | 0–100 | Track variation amount (budget-based randomization). |
| `variation2` | `integer` | `0` | 0–100 | Track variation 2 amount. |
| `filterType` | `string` | `"allpass"` | `"lowpass"`, `"highpass"`, `"bandpass"`, `"allpass"` | Filter type. `"allpass"` = no filtering. |
| `filterFreq` | `number` | `20` | 20–20000 | Filter cutoff frequency in Hz. |
| `filterQ` | `number` | `0.707` | 0.1–24 | Filter resonance (Q factor). |
| `filterFreqLfo` | `Lfo \| null` | `null` | — | LFO modulating filter frequency. `null` = disabled. |
| `filterQLfo` | `Lfo \| null` | `null` | — | LFO modulating filter Q. `null` = disabled. |
| `reverbType` | `string` | `"none"` | — | Reverb algorithm. `"none"` = disabled. |
| `reverbAmount` | `number` | `0` | 0–1 | Reverb wet/dry mix. |
| `delayType` | `string` | `"tape"` | — | Delay algorithm. |
| `delayTime` | `number` | `1` | 0–4 | Delay time multiplier (relative to beat). |
| `delayDepth` | `number` | `0` | 0–1 | Delay wet/dry mix. |
| `fxSelected` | `string` | `"reverb"` | `"reverb"`, `"delay"` | Currently selected FX slot in the UI. |
| `saturationType` | `string` | `"soft"` | — | Saturation algorithm. |
| `saturationAmount` | `number` | `0` | 0–1 | Saturation drive. |
| `sat` | `boolean` | `true` | — | Saturation enabled. |
| `reverbOn` | `boolean` | `true` | — | Reverb enabled. |
| `delayOn` | `boolean` | `true` | — | Delay enabled. |
| `synthSoundKey` | `string \| null` | `null` | — | Synth preset key (for soft synth). |
| `notes` | `Note[]` | `[]` | — | Note array. Objects or compact arrays. |

### Additional generator/probability properties

These are present on tracks when the auto-generation system is used:

| Property | Type | Default | Range | Description |
|---|---|---|---|---|
| `probability` | `number` | `1` | — | Track-level probability. |
| `prob_pitch` | `integer` | `50` | 0–100 | Pitch variation probability. |
| `prob_velocity` | `integer` | `50` | 0–100 | Velocity variation probability. |
| `prob_silence` | `integer` | `50` | 0–100 | Silence insertion probability. |
| `prob_fill` | `integer` | `50` | 0–100 | Fill probability. |
| `prob_ghost` | `integer` | `50` | 0–100 | Ghost note probability. |
| `prob_retrig` | `integer` | `50` | 0–100 | Retrigger probability. |
| `prob_euclid` | `integer` | `50` | 0–100 | Euclidean fill probability. |
| `prob_note` | `integer` | `50` | 0–100 | Note variation probability. |
| `prob_arp` | `integer` | `50` | 0–100 | Arpeggio probability. |
| `pitch_range` | `integer` | `12` | 1–24 | Pitch range for random generation. |
| `pitch_scale_lock` | `boolean` | `false` | — | Lock pitch to scale. |
| `auto_variant` | `string` | `""` | — | Auto-variant mode key. |
| `auto_density` | `number` | `-1` | -1–1 | Auto-density. `-1` = use track default. |

### Properties never serialized

These are recalculated on the fly from other properties:

| Property | Derivation |
|---|---|
| `loopPointBeat` | `Math.floor(loopAtStep / stepsPerBeat)` |
| `loopPointStep` | `loopAtStep % stepsPerBeat` |
| `pan` (on import) | Recalculated from track index by `fixTrackPanning()` |

### Implicit rules

- **Compact format**: tracks are serialized with only non-default values. Missing properties are restored from `TRACK_DEFAULTS` on import.
- If `useSoftSynth` is `true`, `useAutoAssignSound` is forced to `false`.
- `pan` is overwritten by `fixTrackPanning(track, indexTrack)` on import based on the track's position in the pattern. The serialized `pan` value is **ignored** — it is a derived property.
- Values are rounded to 2 decimals on export for: `velocity`, `pan`, `reverbAmount`, `delayDepth`, `delayTime`, `saturationAmount`, `swingAmount`, `filterFreq`, `filterQ`.

---

## LFO object

Used by `velocityLfo`, `pitchLfo`, `panLfo`, `filterFreqLfo`, `filterQLfo`.

| Property | Type | Default | Description |
|---|---|---|---|
| `freq` | `number` | `0` | LFO frequency in Hz (when sync is off). |
| `wave` | `string` | `"sine"` | Waveform: `"sine"`, `"triangle"`, `"sawtooth"`, `"square"`, `"random"`. |
| `depth` | `number` | `0` | Modulation depth (0–1). 0 = no modulation. |
| `sync` | `string` | `"off"` | Tempo sync mode: `"off"`, or a beat division string. |

When `null`, the LFO is disabled.

---

## Note object

| Property | Type | Default | Description |
|---|---|---|---|
| `velocity` | `number` | `0.8` | Playback volume (0–1). |
| `beat` | `integer` | `0` | Measure index within the track (0-based). |
| `beatStep` | `integer` | `0` | Step index within the measure (0-based). |
| `pitch` | `integer` | `0` | Pitch offset in semitones. |
| `pan` | `number` | `0` | Stereo pan (-1=left, 0=center, 1=right). |
| `every` | `integer` | `1` | Play every N steps (1=every step, 2=every other, etc). |
| `prob` | `number` | `1` | Trigger probability (0–1). 1 = certain. |
| `rate` | `number` | `1` | Playback rate multiplier. 1 = normal. |
| `retriggerNum` | `integer` | `1` | Retriggers per step (1 = no retrigger). |
| `arp` | `number[] \| null` | `null` | Arpeggio intervals in semitones (e.g. `[0, 4, 7]`). `null` = disabled. |
| `arpTriggerProbability` | `number` | `1` | Probability of arpeggio trigger (0–1). |
| `euclidianFill` | `integer` | `0` | Euclidean fill amount (0–16). 0 = disabled. |
| `pos` | `number` | `0` | Micro-timing position within the step. |

### Properties never serialized

| Property | Description |
|---|---|
| `steppc` | Step percent — recalculated as `Math.round(beatStep * 100 / stepsPerBeat)`. |
| `stepPercent` | Alias for `steppc`. |

### Implicit rules

- `fixNoteStepBar()` runs on every note at import time: if `beatStep >= stepsPerBeat`, it wraps the step into the next beat.
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
  "notes": [
    [0.4],
    [0.9, 1],
    [0.35, 1, 2],
    [0.35, 2, 2, -3]
  ]
}
```

| Array position | Meaning | Value in example |
|---|---|---|
| `[0]` | `velocity` | 0.4 |
| `[1]` | `velocity` | 0.9 |
| `[2]` | `velocity`, `beat` | 0.35, beat 1 |
| `[3]` | `velocity`, `beat`, `beatStep`, `pitch` | 0.35, beat 2, step 2, pitch -3 |

### Compact vs legacy detection

A track is in compact format if:
- `track.noteKeys` is an array, AND
- `track.notes` is non-empty, AND
- `track.notes[0]` is an array (not an object)

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
  "nbBeats": 4,
  "bpm": 128,
  "description": "A test pattern",
  "tags": ["test", "demo"],
  "tracks": [
    {
      "name": "KICK",
      "soundId": "samples/kick.wav",
      "useAutoAssignSound": false,
      "nbBeats": 4,
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
        "freq": 2,
        "wave": "sine",
        "depth": 0.3,
        "sync": "off"
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
          "rate": 0.5,
          "arp": [0, 7, 12]
        }
      ]
    },
    {
      "name": "SNARE",
      "soundId": "samples/snare.wav",
      "useAutoAssignSound": false,
      "nbBeats": 4,
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
          "retriggerNum": 3
        }
      ]
    },
    {
      "name": "SYNTH",
      "useSoftSynth": true,
      "synthSoundKey": "saw_pad",
      "nbBeats": 4,
      "stepsPerBeat": 8,
      "pitchLfo": {
        "freq": 4,
        "wave": "triangle",
        "depth": 0.5,
        "sync": "1/4"
      },
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

| Check | Limit |
|---|---|
| Top-level must be a non-null object | — |
| `tracks` must be an object (array or keyed object) if present | — |
| Track count | ≤ 64 |
| Note count per track | ≤ 10,000 |
| Each track entry must be a non-null object | — |

---

## Value clamping ranges

Applied by `updateTrack()` and MCP tools. Out-of-range values are clamped:

| Property | Min | Max |
|---|---|---|
| `velocity` | 0 | 1 |
| `pan` | -1 | 1 |
| `pitch` | -24 | 24 |
| `nbBeats` | 1 | 16 |
| `stepsPerBeat` | 1 | 8 |
| `loopAtStep` | 0 | 1024 |
| `swingResolution` | 1 | 8 |
| `swingAmount` | 0 | 1 |
| `filterFreq` | 20 | 20000 |
| `filterQ` | 0.1 | 24 |
| `reverbAmount` | 0 | 1 |
| `delayTime` | 0 | 4 |
| `delayDepth` | 0 | 1 |
| `saturationAmount` | 0 | 1 |
| `variation` | 0 | 100 |
| `variation2` | 0 | 100 |
| `prob_*` | 0 | 100 |
| `pitch_range` | 1 | 24 |
| `auto_density` | -1 | 1 |

---

## Import flow

1. `validatePatternJson(data)` — structural validation (non-null object, tracks shape, count limits).
2. `JSON.parse` — the raw string is parsed (caller's responsibility; must be wrapped in try/catch).
3. `importPatternFromJson(data)` — calls `fixPattern()` on the parsed object.
4. `fixPattern()` — stamps `application`/`url` if missing, then calls `fixTrackDefaults()` on every track.
5. `fixTrackDefaults()`:
   - Expands compact note arrays to objects.
   - Applies `TRACK_DEFAULTS` for missing properties.
   - Recalculates `pan` from track index.
   - Forces `useAutoAssignSound = false` if `useSoftSynth` is `true`.
   - Recalculates `loopPointBeat`/`loopPointStep` from `loopAtStep`.
   - Normalizes every note via `normalizeNote()`.
   - Wraps `beatStep` overflow into the next beat.

## Export flow

1. `PatternExporter.export(pattern)` — stamps `application` and `url`.
2. `cleanPattern()` — strips default top-level properties.
3. `cleanTrack()` — strips default track properties, strips recalculated properties (`loopPointBeat`, `loopPointStep`), strips `noteKeys`.
4. `encodeNotes()` — if notes exist, detects used keys via `detectUsedKeys()`, encodes each note as a compact array, attaches `noteKeys` to the track.
5. Values are rounded to 2 decimals for the properties listed above.
