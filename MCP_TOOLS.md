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
  "pattern": { "name": "My Pattern", "nbBars": 4, "tracks": [] },
  "filePath": "public/assets/data/patterns/my-pattern.json"
}
```

---

### loadPattern

Loads a pattern into the current session (but doesn't select it).

**Input:**
```json
{
  "patternName": "My Beat"
}
```

**Output:**
```json
{
  "message": "Pattern loaded",
  "pattern": { "name": "My Beat", "nbBars": 8, "tracks": [...] },
  "filePath": "..."
}
```

---

### savePatternToJson

Saves the current pattern to a JSON file.

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

Adds notes to a pattern. Creates missing tracks automatically.

 `trackName` must be a valid instrument name (max 12 chars).
Use `listAllInstrumentsNames` to get the list of valid instrument IDs.

**Note properties:**
- `bar` (integer, default: 0) - Bar index (0-indexed)
- `stepInBar` (integer, required) - Step within the bar (0-indexed)
- `pitch` (number, default: 0) - Pitch offset in semitones
- `velocity` (number, 0-1, default: 0.8) - Note velocity
- `pan` (number, -1 to 1, default: 0) - Stereo pan
- `arp` (string, optional) - Arpeggio pattern ("up", "down", "upDown", "random", or "0,1,2,3")
- `triggerFreq` (integer, 1-16, default: 1) - Trigger frequency
- `triggerPhase` (integer, 0-15, default: 0) - Trigger phase offset
- `retriggerNum` (integer, 1-16, default: 1) - Number of retriggers
- `retriggStep` (integer, 1-16, default: 1) - Retrigger step spacing
- `euclidianFill` (integer, 0-100, default: 0) - Euclidean fill percentage

**Input:**
```json
{
  "patternName": "My Pattern",
  "stepsPerBar": 4,
  "notes": [
    {
      "trackName": "KICK",
      "bar": 0,
      "stepInBar": 0,
      "velocity": 0.8
    },
    {
      "trackName": "SNARE",
      "bar": 0,
      "stepInBar": 2,
      "velocity": 1.0
    }
  ]
}
```

**Output:**
```json
{
  "message": "Notes processed",
  "cTracks": 2,
  "cNotes": 2,
  "uNotes": 0,
  "filePath": "..."
}
```

---

### updateTrack

Updates or creates a track with global properties.

**Track Properties available:**
- `velocity` - Global velocity (0-1)
- `pan` - Panoramic (-1 to 1)
- `pitch` - Pitch in semitones
- `mute` - Mute (true/false)
- `solo` - Solo (true/false)
- `auto` - Auto mode
- `useSoftSynth` - useSoftSynth track
- `mono` - Mono mode
- `filterType` - Filter type: "lowpass", "highpass", "bandpass", "allpass"
- `filterFreq` - Filter frequency (20-20000)
- `filterQ` - Filter resonance (0.707-21)
- `reverbType` - Reverb type: "none", "room", "hall", "plate", "spring", "gated"
- `reverbAmount` - Reverb amount (0-1)
- `saturationType` - Saturation type: "soft", "hard", "tape"
- `saturationAmount` - Saturation amount (0-1)
- `loopAtStep` - Loop point (absolute step index)
- `stepsPerBar` - Steps per bar (4, 8, or 16)
- `bars` - Number of bars

**⚠️ Track Name Constraints:**
- Must be a valid instrument name from `listAllTrackNames`
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
    "triggerFreq": 4,
    "triggerPhase": 2,
    "retriggerNum": 3,
    "velocity": 0.8
  }
}
```

Note: `noteUpdates` applies the properties to **all notes** in the track.

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

Sets the BPM of a pattern.

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
  "message": "Pattern BPM updated",
  "bpm": 140,
  "filePath": "..."
}
```

---

### setPatternTags

Sets tags for a pattern.

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
  "message": "Pattern tags updated",
  "tags": ["rock", "upbeat"],
  "filePath": "..."
}
```

---

### setPatternNbBars

Sets the number of bars for a pattern.

**Input:**
```json
{
  "patternName": "My Beat",
  "nbBars": 8
}
```

**Output:**
```json
{
  "message": "Pattern bars updated",
  "nbBars": 8,
  "filePath": "..."
}
```

---

### setPatternDescription

Sets the description for a pattern.

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
  "message": "Pattern description updated",
  "description": "A rock beat with heavy snare",
  "filePath": "..."
}
```

---

## 4. Information

### listAllInstrumentsNames

Returns the full list of all instruments from InstrumentsManager with detailed info (id, name, drum flag, pan).

**⚠️ Use this to get valid track names for MCP requests (max 12 chars).**

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

Lists all sample files in a drumkit.

**Input:**
```json
{
  "drumkitName": "punchy"
}
```

**Output:**
```json
{
  "kitName": "punchy",
  "samples": ["kick.wav", "snare.wav", ...],
  "count": 42
}
```

---

### analyzeSamples

Analyzes audio samples and returns their characteristics.

**Input:**
```json
{
  "samples": ["kick.wav", "snare.wav"]
}
```

**Output:**
```json
{
  "samples": [
    { "name": "kick.wav", "duration": 0.5, "peakFrequency": 60 },
    { "name": "snare.wav", "duration": 0.3, "peakFrequency": 200 }
  ]
}
```

---

## 6. Concepts

### Important: Step and Bar Numbering

All step and bar indices are **0-indexed** (starting from 0).

**Tempo and Steps:**
- At tempo 120 BPM, the default configuration is **4 measures × 4 steps = 16 steps total** (1 step = 1/16 note)
- Default `stepsPerBar` is **4** (4 steps per bar, i.e., quarter notes)
- Common values: 4 stepsPerBar (quarter notes), 8 stepsPerBar (eighth notes), 16 stepsPerBar (sixteenth notes)

**Step Position Mapping:**
The same musical position can have different `stepInBar` values depending on `stepsPerBar`:

| Steps Per Bar | Step 0 | Step 1 | Step 2 | Step 3 | Step 4 | Step 5 | Step 6 | Step 7 |
|---------------|--------|--------|--------|--------|--------|--------|--------|--------|
| 4             | 1/4    | 2/4    | 3/4    | 4/4    | -      | -      | -      | -      |
| 8             | 1/8    | 2/8    | 3/8    | 4/8    | 5/8    | 6/8    | 7/8    | 8/8    |
| 16            | 1/16   | 2/16   | 3/16   | 4/16   | 5/16   | 6/16   | 7/16   | 8/16   |

**Example:**
- A note at `stepInBar: 4` with `stepsPerBar: 8` is at the **5th eighth note** (halfway through the bar)
- The same musical position with `stepsPerBar: 4` would be `stepInBar: 2` (the **3rd quarter note**)
- Formula: `stepInBar_normalized = stepInBar × (stepsPerBar / 4)` (for 4 steps as reference)

**loopAtStep (Loop Point):**
- `loopAtStep` is an **absolute step index** across the entire pattern, not per bar
- Formula: `bar = floor(loopAtStep / stepsPerBar)` and `stepInBar = loopAtStep % stepsPerBar`
- Example: `loopAtStep: 8` with `stepsPerBar: 4` = bar `2`, stepInBar `0` (3rd bar, 1st step)
- Example: `loopAtStep: 32` with `stepsPerBar: 8` = bar `4`, stepInBar `0` (5th bar, 1st step)

**Recommended: Use Loop Points Instead of Repeated Notes**
- Instead of copying the same note pattern across multiple bars, use `loopAtStep` to create a loop
- This is more efficient, easier to edit, and ensures consistent timing
- Example: Instead of placing a kick on step 0 of bar 0, bar 1, bar 2, bar 3 → place it on step 0 of bar 0 and set `loopAtStep` to 4 (for 4 stepsPerBar)
- The track will automatically repeat every 4 steps (1 bar)

**Recommended: Enrich Patterns with Triggers, Retriggers & Arpeggios**
- **Trigger (triggerFreq):** Defines how many times a note plays within a step (1-16). Creates rhythmic subdivisions.
  - `triggerFreq: 4` → 4 triggers per step (16th notes from an 8th note step)
  - `triggerPhase: 0-15` → Offset for the trigger pattern

- **Retrigger (retriggerNum, retriggStep):** Repeats the sound at regular intervals within a step
  - `retriggerNum: 3` → Play 3 times per step
  - `retriggStep: 1` → Spacing between retriggers (retriggStep:4 means 1 step between each retrigger)

- **Arpeggio (arp):** Sequences through multiple pitches within a single step
  - Values: "up", "down", "upDown", "random", or note indices like "0,1,2,3"
  - Example: `arp: "0,1,2"` cycles through 3 pitches

- These properties can be set via `addNotesToPattern` or per-note via `updateTrack` with `noteUpdates`

**Recommended: Use LFOs for Evolving Sounds**
- Add Low Frequency Oscillators to track parameters for movement and evolution
- Available LFO targets: velocity, pitch, pan, filterFreq, filterQ
- LFO parameters: frequency (speed), depth (amount), phase (start point)
- Use sparingly - subtle LFO modulation adds interest without overwhelming the groove
- Example: A slow pitch LFO on a synth stab adds subtle pitch wobble for warmth

---

### Note Properties: Trigger / Retrigger / Arpège

Each note has additional properties controlling how it's played:

| Property | Type | Range | Default | Description |
|----------|------|-------|---------|-------------|
| `triggerFreq` | integer | 1-16 | 1 | Trigger frequency - how often the note plays on pattern repeat loop|
| `triggerPhase` | integer | 0-15 | 0 | Trigger phase - offset for triggering |
| `retriggerNum` | integer | 1-16 | 1 | Number of repetitions after initial trigger |
| `retriggStep` | integer | 1-16 | 1 | Step spacing between repetitions 4 => 1 step|
| `arp` | string/null | - | null | Arpeggio pattern (up, down, updown, random, etc.) |
| `euclidianFill` | integer | 0-100 | 0 | Euclidean rhythm fill percentage |

#### Trigger Mechanism
Controls how many times a note triggers per step.

**Examples:**
- `triggerFreq: 1, triggerPhase: 0` → Plays every step (1/1)
- `triggerFreq: 4, triggerPhase: 0` → Plays 1 out of every 4 steps (1/4)
- `triggerFreq: 4, triggerPhase: 2` → Plays on steps 2, 6, 10...

#### Retrigger Mechanism
Repeats the note multiple times after the initial trigger.

**Examples:**
- `retriggerNum: 1` → 1 note (no repetition)
- `retriggerNum: 4, retriggStep: 4` → 4 notes, 1 step apart

**Note:** If  `arp` is defined as 'const', `retriggStep` defaults for basic retriggering.

#### Arpège (Arpeggio)
Plays a sequence of pitches on a single step.

**Parameters:**
- `arp`: Arpeggio type ("up", "down", "upDown", "random", or custom "0,1,2,3,4")

**Example:**
- 4-note sequence: `arp: "0,1,2,3"` cycles through pitches 0→1→2→3→0...

---

## 7. Best Practices

1. **Use instrument IDs** (max 12 chars) from `listAllInstrumentsNames` - not arbitrary names
2. **Use loop points** (`loopAtStep`) instead of repeating notes across bars
3. **Use triggers/retriggers/arp** to create rhythmic variation without extra notes
4. **Use LFOs** sparingly to add subtle movement to sounds
5. **Default stepsPerBar is 4** - 4-on-the-floor kick uses steps 0 in each bar
6. **All indices are 0-indexed** - bar 0, stepInBar 0, etc.