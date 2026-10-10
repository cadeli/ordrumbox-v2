# orDrumbox MCP — Setup Guide

## Prerequisites

- Node.js >= 18
- `npm install` done (installs `@modelcontextprotocol/sdk`)

## Quick Start (standalone)

```bash
node ordrumboxMcpserver.mjs
```

The server listens on **stdin/stdout** using the JSON-RPC protocol — it's meant to be launched by an MCP client, not run directly in a terminal.

---

## Tool Configuration

### opencode

Add to your `.opencode/agents.json` or project config:

```json
{
    "mcpServers": {
        "ordrumbox": {
            "command": "node",
            "args": ["ordrumboxMcpserver.mjs"],
            "cwd": "/path/to/ordrumbox-v2"
        }
    }
}
```

### Cursor

In Cursor settings → Features → MCP Servers → Add new:

| Field   | Value                                                        |
| ------- | ------------------------------------------------------------ |
| Name    | `ordrumbox`                                                  |
| Type    | `command`                                                    |
| Command | `node /absolute/path/to/ordrumbox-v2/ordrumboxMcpserver.mjs` |

### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
    "mcpServers": {
        "ordrumbox": {
            "command": "node",
            "args": ["/absolute/path/to/ordrumbox-v2/ordrumboxMcpserver.mjs"]
        }
    }
}
```

---

## Workflow Examples

### 1. Create a beat from scratch

Ask your LLM: _"Create a drum pattern called 'FourOnFloor' with KICK on steps 0,4,8,12 and SNARE on steps 4,12 at 128 BPM."_

The LLM will call:

1. `createNewPattern({ patternName: "FourOnFloor" })`
2. `addNotesToPattern({ patternName: "FourOnFloor", notes: [{ trackName: "KICK", step: 0 }, ...] })`
3. `addNotesToPattern({ patternName: "FourOnFloor", notes: [{ trackName: "SNARE", step: 4 }, ...] })`
4. `setPatternBpm({ patternName: "FourOnFloor", bpm: 128 })`

### 2. Add variation with triggers and retriggers

_"On the FourOnFloor pattern, make the hi-hat play 16th notes and add a retrigger (ratchet) on the last beat."_

- 16th notes = one note per grid step (the default is 4 steps per beat):
  `addNotesToPattern({ patternName: "FourOnFloor", notes: [{ trackName: "CHH", step: 0 }, ..., { trackName: "CHH", step: 15 }] })`
- A retrigger ratchets a single note into consecutive hits — `retriggerCount` hits spaced `getStepSpacing(rate)` steps apart (`rate: 8` = 1 step):
  `updateTrack({ patternName: "FourOnFloor", trackName: "CHH", updates: {}, noteUpdates: { retriggerCount: 4, rate: 8 } })`
- `every` is not a step selector: it fires a note once every N **pattern passes** (`every: 4` = every 4th loop).

### 3. Apply effects to a track

_"Add a lowpass filter to the KICK and some reverb to the SNARE."_

- `updateTrack({ patternName: "FourOnFloor", trackName: "KICK", updates: { filterType: "lowpass", filterFreq: 400 } })`
- `updateTrack({ patternName: "FourOnFloor", trackName: "SNARE", updates: { reverbType: "hall", reverbAmount: 0.3 } })`

### 4. Load and inspect a pattern

- `listPatterns({})` → get available pattern names
- `loadPattern({ patternName: "existing-beat" })` → get full track/note data

### 5. Browse samples

- `listKitSamples({})` → list all WAV files (paths relative to `assets/kits/`, e.g. `real/kick.wav`)
- `analyzeSamples({ samples: ["real/kick.wav"] })` → get duration, pitch, spectral data

---

### 6. Arrange the song

- `listArrangements({})` → see the arrangements and their clips
- `createArrangement({ name: "My song", bpm: 128, clips: [{ "patternName": "Verse", "startMeasure": 0 }] })`
- `addPatternToArrangement({ patternName: "Chorus", startMeasure: 2 })`
- `removePatternFromArrangement({ startMeasure: 0 })`

---

## Available Tools

| Tool                           | Purpose                                                        |
| ------------------------------ | -------------------------------------------------------------- |
| `createNewPattern`             | Create empty pattern                                           |
| `addNotesToPattern`            | Add notes (step-based) with full trigger/retrigger/arp support |
| `updateTrack`                  | Update track properties + note overrides                       |
| `savePatternToJson`            | Export pattern to file                                         |
| `loadPattern`                  | Read pattern data                                              |
| `listPatterns`                 | List all pattern names                                         |
| `listAllInstrumentsNames`      | Get valid track names (66 instruments)                         |
| `setPatternBpm`                | Set tempo (schema 20–300; the app toolbar slider uses 20–250)  |
| `setPatternTags`               | Set genre/category tags                                        |
| `setPatternBeatCount`          | Set number of beats                                            |
| `setPatternDescription`        | Add description text                                           |
| `listKitSamples`               | List available WAV samples                                     |
| `analyzeSamples`               | Analyse audio characteristics                                  |
| `listArrangements`             | List arrangements (songs) with their clips                     |
| `createArrangement`            | Create an arrangement, optionally filled with clips            |
| `addPatternToArrangement`      | Place a pattern at a measure in an arrangement                 |
| `removePatternFromArrangement` | Remove clips by measure and/or by pattern                      |
| `selectPattern`                | Select the current pattern for the MCP session (in-memory)     |
| `setColorScheme`               | Set the UI color scheme in settings (1–3)                      |

See `MCP_TOOLS.md` for full parameter details.

---

## Notes

- All step/beat indices are **0-indexed**
- Track names are **uppercase instrument IDs** (max 12 chars) — use `listAllInstrumentsNames` to see them
- The server logs debug info to stderr; JSON-RPC messages go to stdout
- Patterns are saved to `assets/data/patterns/<name>.json`, where `<name>` is sanitized (lowercased, every run of non-alphanumerics → `_`, e.g. `My Pattern` → `my_pattern.json`) and appended to the `patterns` array of `assets/data/song.json`
