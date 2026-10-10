# orDrumbox MCP Server - Tools Reference

MCP tools available for LLMs interacting with orDrumbox V2.

---

## 1. Pattern Management

### createNewPattern

Creates a new empty pattern.

**Input:**

```json
{
    "patternName": "My Pattern"
}
```

**Output:**

```json
{
    "message": "Pattern created",
    "pattern": { "name": "My Pattern", "beatCount": 4, "tracks": [] },
    "filePath": "/abs/path/to/ordrumbox-v2/assets/data/patterns/my_pattern.json"
}
```

`filePath` is always an **absolute** path. The file name is sanitized: lowercased and every run of non-alphanumerics becomes `_` (`My Pattern` → `my_pattern.json`). The pattern is also appended to the `patterns` array of `assets/data/song.json`.

---

### loadPattern

Reads a pattern from the patterns index and returns its full data. Does NOT modify the application state.

**Input:**

```json
{
    "patternName": "My Beat"
}
```

**Output:**

**Output** (abridged: the response carries every `TRACK_DEFAULTS` / `NOTE_DEFAULTS` field, only a subset is shown below):

Stored track values are kept as-is; fields missing from the stored file fall back to their model default (`TRACK_DEFAULTS`), and compact-format notes are decoded.

```json
{
    "name": "My Beat",
    "description": "",
    "tags": [],
    "bpm": 120,
    "beatCount": 8,
    "tracks": [
        {
            "name": "KICK",
            "sampleId": "NOT_DEFINED",
            "useAutoAssignSound": true,
            "beatCount": 8,
            "stepsPerBeat": 4,
            "loopAtStep": 32,
            "swingResolution": 1,
            "swingAmount": 0,
            "velocity": 1,
            "pan": 0,
            "pitch": 0,
            "mute": false,
            "solo": false,
            "auto": false,
            "useSoftSynth": false,
            "filterType": "lowpass",
            "filterFreq": 1000,
            "filterQ": 0.707,
            "reverbType": "none",
            "reverbAmount": 0,
            "reverbOn": true,
            "delayType": "tape",
            "delayTime": 1,
            "delayDepth": 0,
            "delayOn": true,
            "saturationType": "soft",
            "saturationAmount": 0,
            "sat": true,
            "fxSelected": "reverb",
            "variation": 0,
            "variation2": 0,
            "synthSoundKey": null,
            "notes": [
                {
                    "beat": 0,
                    "beatStep": 0,
                    "velocity": 0.8,
                    "pan": 0,
                    "pitch": 0,
                    "arp": null,
                    "every": 1,
                    "pos": 0,
                    "prob": 1,
                    "arpTriggerProbability": 1,
                    "retriggerCount": 1,
                    "rate": 1,
                    "euclideanFill": 0,
                    "euclideanRotation": 0
                }
            ]
        }
    ]
}
```

### savePatternToJson

Saves the current pattern to an individual JSON file under `assets/data/patterns/`.

**Input:**

```json
{
    "patternName": "My Pattern"
}
```

**Output:**

```json
{
    "message": "Saved",
    "filePath": "/abs/path/to/ordrumbox-v2/assets/data/patterns/my_pattern.json"
}
```

`filePath` is absolute; the file name is sanitized (lowercased, non-alphanumeric runs → `_`).

---

### selectPattern

Selects the current pattern of the MCP session (in-memory). Later pattern tools that target "the current pattern" act on this selection.

**Input:** `patternName` (case-insensitive) and/or `index` — with neither, returns the current selection.

**Output:**

```json
{
    "index": 1,
    "name": "Beta",
    "bpm": 140,
    "beatCount": 8,
    "tracks": 1
}
```

Unknown names or out-of-range indexes are rejected (`Pattern not found: …` / `Invalid pattern index: …`).

---

## 2. Notes & Tracks

### addNotesToPattern

Adds multiple notes to a pattern

**Note properties:**

| Property                | Type        | Range        | Default  | Description                                                       |
| ----------------------- | ----------- | ------------ | -------- | ----------------------------------------------------------------- |
| `trackName`             | string      |              | required | Instrument name (e.g., KICK, SNARE)                               |
| `step`                  | integer     | >=0          | required | Absolute step number (0-based)                                    |
| `velocity`              | number      | 0-1          | 0.8      | Note velocity                                                     |
| `pan`                   | number      | -1 to 1      | 0        | Stereo pan                                                        |
| `pitch`                 | number      |              | 0        | Pitch offset in semitones                                         |
| `every`                 | integer     | 1-16         | 1        | Trigger frequency                                                 |
| `pos`                   | integer     | 0-15         | 0        | Trigger phase offset                                              |
| `prob`                  | number      | 0-1          | 1        | Note trigger probability                                          |
| `arpTriggerProbability` | number      | 0-1          | 1        | Arpeggio note probability                                         |
| `retriggerCount`        | integer     | 1-16         | 1        | Number of retriggers                                              |
| `rate`                  | integer     | 1-16         | 1        | Retrigger step spacing                                            |
| `arp`                   | string/number[]/object/null |              | null     | Arpeggio pattern: numeric string "0,1,2,3" or array of semitone intervals, a mode keyword (`"up"`, `"down"`, `"updown"`, `"random"` — loads a default major-scale interval set), or object `{intervals: number[], mode?: "up"|"down"|"updown"|"random"}` |
| `euclideanFill`         | integer     | 0-16         | 0        | Euclidean pulses (0-16, 0=disabled)                               |
| `euclideanRotation`     | integer     | 0-15         | 0        | Euclidean phase rotation in steps                                 |

**Input:**

```json
{
    "patternName": "My Pattern",
    "notes": [
        { "trackName": "KICK", "step": 0, "velocity": 0.8 },
        { "trackName": "SNARE", "step": 4, "velocity": 1.0 }
    ]
}
```

**Output:**

```json
{
    "message": "Notes added",
    "cNotes": 2,
    "uNotes": 0,
    "filePath": "..."
}
```

---

### updateTrack

Updates or creates a track with global properties (numeric values are range-clamped like in the app). Optionally applies note-level overrides to all notes in the track via `noteUpdates`.

**Track Properties available (`updates`):**

Numeric ranges come from the app model (`TRACK_VALUE_RANGES` in `src/model/track_schema.js`) — out-of-range values are clamped.

| Property                                                                                                                        | Type        | Range                                                                     | Description                                                                                                           |
| ------------------------------------------------------------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `velocity`                                                                                                                      | number      | 0-1                                                                       | Global track velocity                                                                                                 |
| `pan`                                                                                                                           | number      | -1 to 1                                                                   | Stereo pan                                                                                                            |
| `pitch`                                                                                                                         | number      | -24 to 24                                                                 | Pitch offset in semitones                                                                                             |
| `mute`                                                                                                                          | boolean     |                                                                           | Mute the track                                                                                                        |
| `solo`                                                                                                                          | boolean     |                                                                           | Solo the track                                                                                                        |
| `auto`                                                                                                                          | boolean     |                                                                           | Auto (generator) mode                                                                                                 |
| `useSoftSynth`                                                                                                                  | boolean     |                                                                           | Use software synthesis instead of samples                                                                             |
| `mono`                                                                                                                          | boolean     |                                                                           | Mono mode (cut previous note on same track)                                                                           |
| `useAutoAssignSound`                                                                                                            | boolean     |                                                                           | Auto-assign the sound matching the track name                                                                         |
| `sampleId`                                                                                                                      | string      |                                                                           | Assigned sample URL/id                                                                                                |
| `synthSoundKey`                                                                                                                 | string/null |                                                                           | Synth preset key (e.g. "BASS1"); `null` unlinks                                                                       |
| `filterType`                                                                                                                    | string      | lowpass, highpass, bandpass, notch, allpass                    | Filter type (the track strip also implements notch; peaking/lowshelf/highshelf are synth-only and fall back to lowpass on a track) |
| `filterFreq`                                                                                                                    | number      | 20-20000                                                                  | Filter cutoff frequency in Hz                                                                                         |
| `filterQ`                                                                                                                       | number      | 0.707-18.707                                                              | Filter resonance / Q factor                                                                                           |
| `reverbType`                                                                                                                    | string      | none, room, hall, plate, spring, gated                                    | Reverb preset                                                                                                         |
| `reverbAmount`                                                                                                                  | number      | 0-1                                                                       | Reverb wet/dry mix                                                                                                    |
| `reverbOn`                                                                                                                      | boolean     |                                                                           | Reverb enabled                                                                                                        |
| `delayType`                                                                                                                     | string      | none, slap, tape, pingpong                                                | Delay type                                                                                                            |
| `delayTime`                                                                                                                     | number      | 0-4                                                                       | Delay time (beat multiplier, 1 = one beat)                                                                            |
| `delayDepth`                                                                                                                    | number      | 0-1                                                                       | Delay wet/dry mix                                                                                                     |
| `delayOn`                                                                                                                       | boolean     |                                                                           | Delay enabled                                                                                                         |
| `saturationType`                                                                                                                | string      | soft, hard, tape                                                          | Saturation / distortion type                                                                                          |
| `saturationAmount`                                                                                                              | number      | 0-1                                                                       | Saturation drive                                                                                                      |
| `sat`                                                                                                                           | boolean     |                                                                           | Saturation enabled                                                                                                    |
| `fxSelected`                                                                                                                    | string      |                                                                           | FX slot selected in the track editor (default reverb)                                                                 |
| `loopAtStep`                                                                                                                    | integer     | 0-1024                                                                    | Loop point (absolute step index)                                                                                      |
| `stepsPerBeat`                                                                                                                  | integer     | 1-8                                                                       | Steps per beat (subdivision)                                                                                          |
| `beatCount`                                                                                                                     | integer     | 1-16                                                                      | Number of beats for this track                                                                                        |
| `swingResolution`                                                                                                               | integer     | 1-8                                                                       | Swing grid resolution                                                                                                 |
| `swingAmount`                                                                                                                   | number      | 0-1                                                                       | Swing intensity                                                                                                       |
| `variation`                                                                                                                     | number      | 0-100                                                                     | Track variation (randomization budget)                                                                                |
| `variation2`                                                                                                                    | number      | 0-100                                                                     | Second variation pass (budget)                                                                                        |
| `probability`                                                                                                                   | number      | 0-1                                                                       | Generation probability                                                                                                |
| `prob_pitch`, `prob_velocity`, `prob_silence`, `prob_fill`, `prob_ghost`, `prob_retrig`, `prob_euclid`, `prob_note`, `prob_arp` | number      | 0-100                                                                     | Generation weights for the auto-generate engine (%)                                                                   |
| `pitch_range`                                                                                                                   | integer     | 1-24                                                                      | Generation pitch range (semitones)                                                                                    |
| `pitch_scale_lock`                                                                                                              | boolean     |                                                                           | Lock generated pitches to the scale                                                                                   |
| `auto_variant`                                                                                                                  | string      | "", basic, fill, roll, sparse, dense                                      | Auto-generate variant                                                                                                 |
| `auto_density`                                                                                                                  | number      | -1 to 1                                                                   | Auto-generate density (-1 = auto)                                                                                     |
| `velocityLfo`, `pitchLfo`, `panLfo`, `filterFreqLfo`, `filterQLfo`                                                              | object/null |                                                                           | LFO per target: `{ type, freq, min, max, phase }` (`type`: sine, triangle, sawtooth, square, random; `null` disables) |

**Note Properties available (`noteUpdates`):**

| Property                | Type        | Range   | Default | Description                                                       |
| ----------------------- | ----------- | ------- | ------- | ----------------------------------------------------------------- |
| `every`                 | integer     | 1-16    | 1       | Trigger frequency                                                 |
| `pos`                   | integer     | 0-15    | 0       | Trigger phase offset                                              |
| `prob`                  | number      | 0-1     | 1       | Note trigger probability                                          |
| `arpTriggerProbability` | number      | 0-1     | 1       | Arpeggio note probability                                         |
| `retriggerCount`        | integer     | 1-16    | 1       | Number of retriggers                                              |
| `rate`                  | integer     | 1-16    | 1       | Retrigger step spacing (rate=1 → 1/8 step; rate=8 → 1 step)     |
| `arp`                   | string/number[]/object/null |         | null    | Arpeggio pattern: numeric string "0,1,2,3" or array of semitone intervals, a mode keyword (`"up"`, `"down"`, `"updown"`, `"random"` — loads a default major-scale interval set), or object `{intervals: number[], mode?: "up"|"down"|"updown"|"random"}` |
| `euclideanFill`         | integer     | 0-16    | 0       | Euclidean pulses (0-16, 0=disabled)                               |
| `euclideanRotation`     | integer     | 0-15    | 0       | Euclidean phase rotation in steps — only applied when at least one *other* note property is present in the same `noteUpdates` call (server gate) |
| `velocity`              | number      | 0-1     |         | Note velocity override                                            |
| `pan`                   | number      | -1 to 1 |         | Note pan override                                                 |
| `pitch`                 | number      |         |         | Note pitch override                                               |

**Track Name Constraints:**

- Must be a valid instrument name from `listAllInstrumentsNames`
- Example: "KICK", "SNARE", "CHH", "OHH", "TOM", "CRASH", etc.

**Input:**

```json
{
    "patternName": "My Beat",
    "trackName": "KICK",
    "updates": {
        "velocity": 0.9,
        "pan": -0.3,
        "pitch": 5,
        "mute": false,
        "solo": false,
        "filterType": "lowpass",
        "filterFreq": 400,
        "filterQ": 10,
        "reverbAmount": 0.3,
        "saturationAmount": 0.2
    }
}
```

**Update Note Properties (optional):**
You can also update all notes in a track using `noteUpdates`:

```json
{
    "patternName": "My Beat",
    "trackName": "SNARE",
    "updates": { "velocity": 0.9 },
    "noteUpdates": {
        "every": 4,
        "pos": 2,
        "prob": 0.75,
        "arpTriggerProbability": 0.5,
        "retriggerCount": 3,
        "velocity": 0.8
    }
}
```

`noteUpdates` applies the properties to **all notes** in the track.

**Output:**

```json
{
    "message": "Track updated successfully",
    "action": "updated",
    "trackName": "KICK",
    "notesUpdated": 8,
    "filePath": "..."
}
```

---

## 3. Pattern Properties

### setPatternBpm

Sets the BPM (tempo) of a pattern.

**Input:**

```json
{
    "patternName": "My Beat",
    "bpm": 140
}
```

**Output:**

```json
{
    "message": "BPM updated",
    "patternName": "My Beat",
    "bpm": 140,
    "filePath": "..."
}
```

---

### setPatternTags

Sets tags (categories/genre) for a pattern.

**Input:**

```json
{
    "patternName": "My Beat",
    "tags": ["rock", "upbeat"]
}
```

**Output:**

```json
{
    "message": "Tags updated",
    "patternName": "My Beat",
    "tags": ["rock", "upbeat"],
    "filePath": "..."
}
```

---

### setPatternBeatCount

Sets the number of beats for a pattern (1-16, `MAX_BEATS`). Every track follows: track `beatCount` are resynced and loop points beyond the new length are clamped.

**Input:**

```json
{
    "patternName": "My Beat",
    "beatCount": 8
}
```

**Output:**

```json
{
    "message": "Number of beats updated",
    "patternName": "My Beat",
    "beatCount": 8,
    "filePath": "..."
}
```

---

### setPatternDescription

Sets the description text for a pattern.

**Input:**

```json
{
    "patternName": "My Beat",
    "description": "A rock beat with heavy snare"
}
```

**Output:**

```json
{
    "message": "Description updated",
    "patternName": "My Beat",
    "description": "A rock beat with heavy snare",
    "filePath": "..."
}
```

---

## 4. Information

### listAllInstrumentsNames

Returns the full list of all instruments from InstrumentsManager with detailed info (id, name, drum flag, pan).

Use this to get valid track names for MCP requests.

**Input:** `{}`

**Output:**

```json
{
  "instrumentNames": ["KICK", "SNARE", "CHH", "OHH", "TOM", "CRASH", ...],
  "count": 66,
  "instruments": [
    { "id": "KICK", "name": "Bass Drum 1", "drum": true, "pan": "0" },
    { "id": "SNARE", "name": "Acoustic Snare", "drum": true, "pan": "3" },
    ...
  ]
}
```

---

### listPatterns

Returns the list of all patterns from `assets/data/song.json` (the `patterns` array).

**Input:** `{}`

**Output:**

```json
{
    "patterns": ["Pattern 1", "Pattern 2", "My Beat"],
    "count": 3
}
```

---

## 5. Samples

### listKitSamples

Lists all WAV sample files from all drumkits.

**Input:** `{}`

**Output:**

```json
{
  "count": 42,
  "samples": ["8bits/kick.wav", "punchy/snare.wav", ...]
}
```

---

### analyzeSamples

Analyzes audio samples and returns their full characteristics.

**Input:**

```json
{
    "samples": ["real/kick.wav", "real/snare.wav"]
}
```

**Output:**

```json
{
  "results": [
    {
      "samplePath": "real/kick.wav",
      "analysis": {
        "envelope": [...],
        "durationSec": 0.5,
        "peakDb": -3.0,
        "rmsDb": -12.0,
        "fundamentalHz": null,
        "spectralCentroidHz": 1200.5,
        "energySubPct": 15.3,
        "energyHighPct": 22.1,
        "harmonicRatio": 0.3,
        "pitchConfidence": 0
      }
    }
  ]
}
```

Samples are resolved relative to `assets/kits/`.

---

## 6. Arrangements (Songs)

An **arrangement** (a "song") is an ordered list of **clips** placing patterns on a measure timeline. Arrangements live in the `songs` array of `song.json`, next to the `patterns` library.

**Measures, not steps:** a measure holds four 4/4 beats, 0-indexed (`startMeasure: 0` is the first measure). One clip lasts `measureCount` measures — by default as long as the pattern itself (`beatCount / 4`), so an 8-beat pattern lasts 2 measures and a 12-beat one lasts 3.

**Overlapping is allowed:** several clips may cover the same measure and all of them sound together — that is what an arrangement is for. The same pattern may be placed any number of times.

Pattern names are case-insensitive and are resolved to the pattern id a clip stores, so renaming a pattern does not detach its clips.

### listArrangements

Lists every arrangement with its clips.

**Input:** `{}`

**Output:**

```json
{
    "arrangements": [
        {
            "index": 0,
            "id": "my-arrangement",
            "name": "My arrangement",
            "description": "",
            "bpm": 120,
            "loopMeasureCount": null,
            "measureCount": 4,
            "clips": [{ "pattern": "verse", "patternName": "Verse", "startMeasure": 0, "measureCount": 2 }]
        }
    ],
    "count": 1,
    "selectedIdx": 0
}
```

---

### createArrangement

Creates an arrangement and optionally fills it with clips — the shortest path from an empty library to a full song structure.

**Input:**

```json
{
    "name": "My arrangement",
    "description": "Intro verse, chorus, outro",
    "bpm": 128,
    "loopMeasureCount": 0,
    "clips": [
        { "patternName": "Verse", "startMeasure": 0 },
        { "patternName": "Chorus", "startMeasure": 2, "measureCount": 2 }
    ]
}
```

| Property           | Type    | Range    | Description                                               |
| ------------------ | ------- | -------- | --------------------------------------------------------- |
| `name`             | string  | required | Arrangement name                                          |
| `description`      | string  |          | Free text                                                 |
| `bpm`              | number  | 20-300   | Tempo of the whole arrangement                            |
| `loopMeasureCount` | integer | >= 0     | Loop length in measures (0 = the whole arrangement loops) |
| `clips`            | array   |          | Clips to place right after creation                       |

Each clip takes `patternName` (required), `startMeasure` (default 0) and `measureCount` (default: the pattern length).

**Output:**

```json
{
    "message": "Arrangement created",
    "arrangement": { "...": "as in listArrangements" },
    "placedClips": 2,
    "skippedClips": [{ "patternName": "Ghost", "startMeasure": 4 }]
}
```

A clip naming an unknown pattern is reported in `skippedClips` instead of aborting the whole creation — the other clips are still placed.

---

### addPatternToArrangement

Places one pattern in an arrangement.

**Input:**

```json
{
    "patternName": "Chorus",
    "startMeasure": 2,
    "measureCount": 2,
    "arrangement": "My arrangement"
}
```

| Property       | Type              | Range    | Description                                                   |
| -------------- | ----------------- | -------- | ------------------------------------------------------------- |
| `patternName`  | string            | required | Pattern name or id                                            |
| `startMeasure` | integer           | >= 0     | 0-based measure (default 0)                                   |
| `measureCount` | number            | >= 0     | Clip length (default: the pattern length)                     |
| `arrangement`  | string or integer |          | Arrangement name or index (default: the selected arrangement) |

**Output:** `{ "message", "arrangement", "clip": { "pattern", "startMeasure", "measureCount" } }`

Fails with an error when the pattern or the arrangement is unknown — nothing is written in that case.

---

### removePatternFromArrangement

Removes clips from an arrangement. Give `startMeasure`, `patternName`, or both.

**Input:**

```json
{
    "startMeasure": 0,
    "patternName": "Verse",
    "arrangement": "My arrangement"
}
```

| Property       | Type           | Description                                                   |
| -------------- | -------------- | ------------------------------------------------------------- |
| `startMeasure` | integer        | Remove every clip starting at this measure                    |
| `patternName`  | string         | Remove every clip using this pattern (name or id)             |
| `arrangement`  | string/integer | Arrangement name or index (default: the selected arrangement) |

**Output:** `{ "message", "arrangement", "removed": [{ "pattern", "startMeasure", "measureCount" }] }`

---

### Building a whole song

1. `listPatterns` to see the library, `createNewPattern` / `addNotesToPattern` / `updateTrack` to shape the patterns
2. `createArrangement` with its `clips` list for the structure, or `createArrangement` followed by `addPatternToArrangement` calls
3. `listArrangements` to check the result, `removePatternFromArrangement` to fix a placement

Each arrangement write rewrites the `songs` array of `song.json` and leaves the pattern library untouched.

---

## 7. App Settings

### setColorScheme

Sets the UI color scheme of the app. The value is written to `settings.json` — the one settings key MCP owns. The shipped file carries no `colorScheme`, so the app treats its presence as an MCP write.

**Input:**

```json
{ "scheme": 2 }
```

| Value | Scheme                                |
| ----- | ------------------------------------- |
| `1`   | Phosphor (default, green on indigo)   |
| `2`   | Amber terminal (gold on warm brown)   |
| `3`   | Electric blue (blue on deep navy)     |

Any other value (out of range, not an integer) falls back to `1`. Existing `settings.json` keys are preserved; a missing file is created, an unparsable one is refused rather than overwritten.

**Output:** `{ "message", "scheme", "previous", "filePath" }`

The scheme is applied at the **next app boot** — the MCP server has no live channel to the browser. It wins for that boot (the stored copy is overridden); afterwards the app's own choice — the `c` key cycles the scheme in-app — is stored and kept across reloads until MCP writes the file again.

---

## 8. Concepts

### Step and Beat Numbering

A track is divided into **beats**, and each beat is divided into **steps**.

```
beatCount: 4, stepsPerBeat: 4

Beat:    0         1         2         3
Step:    0 1 2 3   0 1 2 3   0 1 2 3   0 1 2 3
Abs:     0 1 2 3   4 5 6 7   8 9 10 11 12 13 14 15
         ^         ^         ^         ^
         kick      snare     kick      snare
```

- **`beat`** — beat index within the track (0-based). E.g. beat `0` = 1st beat, beat `3` = 4th beat.
- **`beatStep`** — step index within the beat (0-based). E.g. beatStep `2` = 3rd step of the current beat.
- **`beatCount`** — total number of beats in the track.
- **`stepsPerBeat`** — number of steps per beat (e.g. 4 = 16th notes, 8 = 32nd notes).
- **Total steps** = `beatCount × stepsPerBeat`

### Step Duration Calculation

The engine uses an internal resolution of **TICK = 32 ticks per beat**.

**Musical definitions:**

- 1 beat (quarter note) = `60 / bpm` seconds
- 1 step at `stepsPerBeat: 4` = 1/16th note = `(60 / bpm) / 4` seconds

**Engine tick duration:**

- `tickDuration = 60 / (bpm × TICK)` = `60 / (bpm × 32)`
- One step = `tickDuration × (TICK / stepsPerBeat)` = `tickDuration × 8` (for stepsPerBeat=4)

**Converting beat/beatStep to absolute tick:**

- `tick = beat × TICK + round((beatStep × TICK) / stepsPerBeat)`
- Example: beat `2`, beatStep `1`, stepsPerBeat `4` → tick = `2 × 32 + round(1 × 32 / 4)` = `64 + 8` = `72`

### loopAtStep (Loop Point)

- `loopAtStep` is an **absolute step index** across the entire track, not per beat
- Formula: `beat = floor(loopAtStep / stepsPerBeat)` and `beatStep = loopAtStep % stepsPerBeat`
- Example: `loopAtStep: 8` with `stepsPerBeat: 4` → beat `2`, beatStep `0`
- Example: `loopAtStep: 32` with `stepsPerBeat: 8` → beat `4`, beatStep `0`
- By default `loopAtStep` is `null` (= auto): the track repeats over its whole length, i.e. `beatCount × stepsPerBeat` steps. Set it to shorten that — do NOT duplicate the notes instead.

### Use Loop Points Instead of Repeated Notes

- Instead of copying the same note pattern across multiple beats, use `loopAtStep` to create a loop
- This is more efficient, easier to edit, and ensures consistent timing
- Example: Instead of placing a kick on step 0 of beat 0, beat 1, beat 2, beat 3 → place it on step 0 of beat 0 and set `loopAtStep` to 4 (for `stepsPerBeat: 4`)
- The track will automatically repeat every beat

### Enrich Patterns with Triggers, Retriggers & Arpeggios

- **Trigger (every):** Controls how often a note triggers across loop iterations (1-16). Uses the formula: `(loop + pos) % every === 0`.
    - `every: 4` -> note plays every 4th loop iteration (skips 3 loops between plays)
    - `every: 1` -> note plays every loop (default, continuous)
    - `pos: 0-15` -> phase offset for the trigger pattern
- **Retrigger (retriggerCount, rate):** Repeats the sound at regular intervals starting from the note
    - `retriggerCount: 3` -> 3 hits (initial trigger + 2 repeats)
    - `rate` -> spacing between hits: 1-7 = rate/8 of a step (rate 1 = 1/8 step), 8-16 = rate-7 steps (rate 8 = 1 step)
- **Arpeggio (arp):** Sequences through multiple pitches starting from the note
    - Values: numeric string "0,1,2,3" (comma-separated semitone intervals), an array of intervals, a mode keyword (`"up"`, `"down"`, `"updown"`, `"random"` — default major-scale set), or object `{intervals: number[], mode?: "up"|"down"|"updown"|"random"}`
    - Example: `arp: "0,1,2"` cycles through 3 pitches (intervals 0, +1, +2 semitones)
- These properties can be set via `addNotesToPattern` or `updateTrack` with `noteUpdates`

### Use LFOs for Evolving Sounds

- Add Low Frequency Oscillators to track parameters for movement and evolution
- Available LFO targets: velocity, pitch, pan, filterFreq, filterQ
- LFO parameters: `{ type, freq, min, max, phase }` (`type`: sine, triangle, sawtooth, square, random; `freq` default 1; `min`/`max` from target range; `phase` default 0; `null` disables)
- Use sparingly - subtle LFO modulation adds interest without overwhelming the groove

---

### Note Properties: Trigger / Retrigger / Arpeggio

Each note has additional properties controlling how it's played:

| Property                | Type        | Range | Default | Description                                                    |
| ----------------------- | ----------- | ----- | ------- | -------------------------------------------------------------- |
| `every`                 | integer     | 1-16  | 1       | Trigger frequency - how often the note plays on pattern repeat |
| `pos`                   | integer     | 0-15  | 0       | Trigger phase offset                                           |
| `prob`                  | number      | 0-1   | 1       | Probability that the note is played after the trigger test     |
| `arpTriggerProbability` | number      | 0-1   | 1       | Probability that each arpeggio note is played                  |
| `retriggerCount`        | integer     | 1-16  | 1       | Number of repetitions after initial trigger                    |
| `rate`                  | integer     | 1-16  | 1       | Step spacing between repetitions                               |
| `arp`                   | string/number[]/object/null | -     | null    | Arpeggio: numeric string "0,1,2,3" or interval array, mode keyword ("up"|"down"|"updown"|"random"), or `{intervals: number[], mode?: "up"|"down"|"updown"|"random"}` |
| `euclideanFill`         | integer     | 0-16  | 0       | Euclidean pulses over the span to the next note (0-16, 0=disabled)   |

#### Trigger Mechanism

Controls whether a note triggers on each pattern pass (loop), via `(loop + pos) % every === 0`.

**Examples:**

- `every: 1, pos: 0` -> Plays every pass
- `every: 4, pos: 0` -> Plays every 4th pass (3 passes skipped)
- `every: 4, pos: 2` -> Plays on passes 2, 6, 10...
- `prob: 0.5` -> Plays about half of the triggered notes

#### Retrigger Mechanism

Repeats the note multiple times after the initial trigger.

**Examples:**

- `retriggerCount: 1` -> 1 note (no repetition)
- `retriggerCount: 4, rate: 8` -> 4 notes, 1 step apart

With `arp`, `retriggerCount` becomes the **number of arp notes** generated (1-16) instead of a repeat count, and `rate` sets their spacing (same spacing rule as plain retriggers).

#### Arpeggio

Plays a sequence of pitches on a single step.

**Parameters:**

- `arp`: Arpeggio pattern — numeric string "0,1,2,3" or interval array, mode keyword ("up"|"down"|"updown"|"random"), or object `{intervals: number[], mode?: "up"|"down"|"updown"|"random"}`
- `arpTriggerProbability`: Randomly skips individual arpeggio notes (it also gates plain retrigger repeats)

**Example:**

- 4-note sequence: `arp: "0,1,2,3"` cycles through pitches 0->1->2->3->0...

---

## 9. Best Practices

1. **Use instrument IDs** from `listAllInstrumentsNames` - not arbitrary names
2. **Use loop points** (`loopAtStep`) instead of repeating notes across beats
3. **Use triggers/retriggers/arp** to create rhythmic variation without extra notes
4. **Use LFOs** sparingly to add subtle movement to sounds
5. **Default stepsPerBeat is 4** - 4-on-the-floor kick uses step 0 in each beat
6. **All indices are 0-indexed** - beat 0, beatStep 0, etc.
7. **Use variation** (0-100) for automatic beat randomization per loop iteration
8. **Arrange, don't copy** — place a pattern in an arrangement with `addPatternToArrangement` instead of duplicating its notes in a new pattern
