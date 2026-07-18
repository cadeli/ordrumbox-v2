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
  "pattern": { "name": "My Pattern", "nbBeats": 4, "tracks": [] },
  "filePath": "public/assets/data/patterns/my-pattern.json"
}
```

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
```json
{
  "name": "My Beat",
  "description": "",
  "tags": [],
  "bpm": 120,
  "nbBeats": 8,
  "tracks": [
    {
      "name": "KICK",
      "soundId": null,
      "useAutoAssignSound": true,
      "nbBeats": 8,
      "stepsPerBeat": 4,
      "loopAtStep": 32,
      "velocity": 0.8,
      "pitch": 0,
      "pan": 0,
      "mute": false,
      "solo": false,
      "auto": true,
      "useSoftSynth": false,
      "filterType": "lowpass",
      "filterFreq": 1000,
      "filterQ": 0.707,
      "reverbType": "none",
      "reverbAmount": 0,
      "saturationType": "soft",
      "saturationAmount": 0,
      "notes": [
        {
          "name": "",
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
          "retriggerNum": 1,
          "rate": 1,
          "euclidianFill": 0
        }
      ]
    }
  ]
}
```

---

### savePatternToJson

Saves the current pattern to an individual JSON file under `public/assets/data/patterns/`.

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
  "filePath": "public/assets/data/patterns/my-pattern.json"
}
```

---

## 2. Notes & Tracks

### addNotesToPattern

Adds multiple notes to a pattern 

**Note properties:**

| Property | Type | Range | Default | Description |
|----------|------|-------|---------|-------------|
| `trackName` | string | max 12 chars | required | Instrument name (e.g., KICK, SNARE) |
| `step` | integer | >=0 | required | Absolute step number (0-based) |
| `velocity` | number | 0-1 | 0.8 | Note velocity |
| `pan` | number | -1 to 1 | 0 | Stereo pan |
| `pitch` | number | | 0 | Pitch offset in semitones |
| `every` | integer | 1-16 | 1 | Trigger frequency |
| `pos` | integer | 0-15 | 0 | Trigger phase offset |
| `prob` | number | 0-1 | 1 | Note trigger probability |
| `arpTriggerProbability` | number | 0-1 | 1 | Arpeggio note probability |
| `retriggerNum` | integer | 1-16 | 1 | Number of retriggers |
| `rate` | integer | 1-16 | 1 | Retrigger step spacing |
| `arp` | string/null | | null | Arpeggio pattern ("up", "down", "upDown", "random", or "0,1,2,3") |
| `euclidianFill` | integer | 0-100 | 0 | Euclidean fill percentage |

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

Updates or creates a track with global properties. Optionally applies note-level overrides to all notes in the track via `noteUpdates`.

**Track Properties available (`updates`):**

| Property | Type | Range | Description |
|----------|------|-------|-------------|
| `velocity` | number | 0-1 | Global track velocity |
| `pan` | number | -1 to 1 | Stereo pan |
| `pitch` | number | | Pitch offset in semitones |
| `mute` | boolean | | Mute the track |
| `solo` | boolean | | Solo the track |
| `auto` | boolean | | Auto mode |
| `useSoftSynth` | boolean | | Use software synthesis instead of samples |
| `mono` | boolean | | Mono mode (cut previous note on same track) |
| `filterType` | string | lowpass, highpass, bandpass, notch, peaking, lowshelf, highshelf, allpass | Filter type |
| `filterFreq` | number | 20-20000 | Filter cutoff frequency in Hz |
| `filterQ` | number | 0.707-21 | Filter resonance / Q factor |
| `reverbType` | string | none, room, hall, plate, spring, gated | Reverb preset |
| `reverbAmount` | number | 0-1 | Reverb wet/dry mix |
| `saturationType` | string | soft, hard, tape | Saturation / distortion type |
| `saturationAmount` | number | 0-1 | Saturation amount |
| `delayType` | string | tape, analog, digital | Delay type |
| `delayTime` | number | | Delay time in beats |
| `delayDepth` | number | 0-1 | Delay feedback amount |
| `loopAtStep` | integer | >=0 | Loop point (absolute step index) |
| `stepsPerBeat` | integer | 4, 8, 16 | Steps per beat |
| `nbBeats` | integer | >=1 | Number of beats for this track |
| `variation` | number | 0-100 | Track variation intensity (%) |

**Note Properties available (`noteUpdates`):**

| Property | Type | Range | Default | Description |
|----------|------|-------|---------|-------------|
| `every` | integer | 1-16 | 1 | Trigger frequency |
| `pos` | integer | 0-15 | 0 | Trigger phase offset |
| `prob` | number | 0-1 | 1 | Note trigger probability |
| `arpTriggerProbability` | number | 0-1 | 1 | Arpeggio note probability |
| `retriggerNum` | integer | 1-16 | 1 | Number of retriggers |
| `rate` | integer | 1-16 | 1 | Retrigger step spacing |
| `arp` | string/null | | null | Arpeggio pattern ("up", "down", "upDown", "random", or "0,1,2,3") |
| `euclidianFill` | integer | 0-100 | 0 | Euclidean fill percentage |
| `velocity` | number | 0-1 | | Note velocity override |
| `pan` | number | -1 to 1 | | Note pan override |
| `pitch` | number | | | Note pitch override |

**Track Name Constraints:**
- Must be a valid instrument name from `listAllInstrumentsNames`
- Maximum 12 characters
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
    "retriggerNum": 3,
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

### setPatternNbBeats

Sets the number of beats for a pattern.

**Input:**
```json
{
  "patternName": "My Beat",
  "nbBeats": 8
}
```

**Output:**
```json
{
  "message": "Number of beats updated",
  "patternName": "My Beat",
  "nbBeats": 8,
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

Use this to get valid track names for MCP requests (max 12 chars).

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

Returns the list of all patterns from patterns.json.

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
  "samples": ["kick.wav", "snare.wav"]
}
```

**Output:**
```json
{
  "results": [
    {
      "samplePath": "kick.wav",
      "analysis": {
        "envelope": [...],
        "pitch": null,
        "volume": 0.5,
        "length": 0.5,
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

Samples are resolved relative to `public/assets/kits/`.

---

## 6. Concepts

### Step and Beat Numbering

A track is divided into **beats**, and each beat is divided into **steps**.

```
nbBeats: 4, stepsPerBeat: 4

Beat:    0         1         2         3
Step:    0 1 2 3   0 1 2 3   0 1 2 3   0 1 2 3
Abs:     0 1 2 3   4 5 6 7   8 9 10 11 12 13 14 15
         ^         ^         ^         ^
         kick      snare     kick      snare
```

- **`beat`** — beat index within the track (0-based). E.g. beat `0` = 1st beat, beat `3` = 4th beat.
- **`beatStep`** — step index within the beat (0-based). E.g. beatStep `2` = 3rd step of the current beat.
- **`nbBeats`** — total number of beats in the track.
- **`stepsPerBeat`** — number of steps per beat (e.g. 4 = 16th notes, 8 = 32nd notes).
- **Total steps** = `nbBeats × stepsPerBeat`

### Step Duration Calculation

The engine uses an internal resolution of **TICK = 32 ticks per beat**.

**Musical definitions:**
- 1 beat (quarter note) = `60 / bpm` seconds
- 1 step at `stepsPerBeat: 4` = 1/16th note = `(60 / bpm) / 4` seconds

**Engine tick duration:**
- `tickDuration = 60 × 4 / (bpm × TICK)` = `240 / (bpm × 32)`
- One step = `tickDuration × (TICK / stepsPerBeat)` = `tickDuration × 8` (for stepsPerBeat=4)

**Converting beat/beatStep to absolute tick:**
- `tick = beat × TICK + round((beatStep × TICK) / stepsPerBeat)`
- Example: beat `2`, beatStep `1`, stepsPerBeat `4` → tick = `2 × 32 + round(1 × 32 / 4)` = `64 + 8` = `72`

### loopAtStep (Loop Point)
- `loopAtStep` is an **absolute step index** across the entire track, not per beat
- Formula: `beat = floor(loopAtStep / stepsPerBeat)` and `beatStep = loopAtStep % stepsPerBeat`
- Example: `loopAtStep: 8` with `stepsPerBeat: 4` → beat `2`, beatStep `0`
- Example: `loopAtStep: 32` with `stepsPerBeat: 8` → beat `4`, beatStep `0`
- By default `loopAtStep` is null (= track plays once without looping)

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
- **Retrigger (retriggerNum, rate):** Repeats the sound at regular intervals within a step
  - `retriggerNum: 3` -> Play 3 times per step
  - `rate: 1` -> Spacing between retriggers
- **Arpeggio (arp):** Sequences through multiple pitches within a single step
  - Values: "up", "down", "upDown", "random", or note indices like "0,1,2,3"
  - Example: `arp: "0,1,2"` cycles through 3 pitches
- These properties can be set via `addNotesToPattern`, `addExtendedNotesToPattern`, or `updateTrack` with `noteUpdates`

### Use LFOs for Evolving Sounds
- Add Low Frequency Oscillators to track parameters for movement and evolution
- Available LFO targets: velocity, pitch, pan, filterFreq, filterQ
- LFO parameters: frequency (speed), depth (amount), phase (start point)
- Use sparingly - subtle LFO modulation adds interest without overwhelming the groove

---

### Note Properties: Trigger / Retrigger / Arpeggio

Each note has additional properties controlling how it's played:

| Property | Type | Range | Default | Description |
|----------|------|-------|---------|-------------|
| `every` | integer | 1-16 | 1 | Trigger frequency - how often the note plays on pattern repeat |
| `pos` | integer | 0-15 | 0 | Trigger phase offset |
| `prob` | number | 0-1 | 1 | Probability that the note is played after the trigger test |
| `arpTriggerProbability` | number | 0-1 | 1 | Probability that each arpeggio note is played |
| `retriggerNum` | integer | 1-16 | 1 | Number of repetitions after initial trigger |
| `rate` | integer | 1-16 | 1 | Step spacing between repetitions |
| `arp` | string/null | - | null | Arpeggio pattern (up, down, upDown, random, or custom indices) |
| `euclidianFill` | integer | 0-100 | 0 | Euclidean rhythm fill percentage |

#### Trigger Mechanism
Controls whether a note triggers on each step.

**Examples:**
- `every: 1, pos: 0` -> Plays every step (1/1)
- `every: 4, pos: 0` -> Plays 1 out of every 4 steps (1/4)
- `every: 4, pos: 2` -> Plays on steps 2, 6, 10...
- `prob: 0.5` -> Plays about half of the triggered notes

#### Retrigger Mechanism
Repeats the note multiple times after the initial trigger.

**Examples:**
- `retriggerNum: 1` -> 1 note (no repetition)
- `retriggerNum: 4, rate: 4` -> 4 notes, 1 step apart

If `arp` is defined, `rate` defaults for basic retriggering.

#### Arpeggio
Plays a sequence of pitches on a single step.

**Parameters:**
- `arp`: Arpeggio type ("up", "down", "upDown", "random", or custom "0,1,2,3,4")
- `arpTriggerProbability`: Randomly skips individual arpeggio notes

**Example:**
- 4-note sequence: `arp: "0,1,2,3"` cycles through pitches 0->1->2->3->0...

---

## 7. Best Practices

1. **Use instrument IDs** (max 12 chars) from `listAllInstrumentsNames` - not arbitrary names
2. **Use loop points** (`loopAtStep`) instead of repeating notes across beats
3. **Use triggers/retriggers/arp** to create rhythmic variation without extra notes
4. **Use LFOs** sparingly to add subtle movement to sounds
5. **Default stepsPerBeat is 4** - 4-on-the-floor kick uses step 0 in each beat
6. **All indices are 0-indexed** - beat 0, beatStep 0, etc.
7. **Use variation** (0-100) for automatic beat randomization per loop iteration
