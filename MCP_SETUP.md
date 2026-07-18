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

| Field | Value |
|-------|-------|
| Name | `ordrumbox` |
| Type | `command` |
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

Ask your LLM: *"Create a drum pattern called 'FourOnFloor' with KICK on steps 0,4,8,12 and SNARE on steps 4,12 at 128 BPM."*

The LLM will call:
1. `createNewPattern({ patternName: "FourOnFloor" })`
2. `addNotesToPattern({ patternName: "FourOnFloor", notes: [{ trackName: "KICK", step: 0 }, ...] })`
3. `addNotesToPattern({ patternName: "FourOnFloor", notes: [{ trackName: "SNARE", step: 4 }, ...] })`
4. `setPatternBpm({ patternName: "FourOnFloor", bpm: 128 })`

### 2. Add variation with triggers and retriggers

*"On the FourOnFloor pattern, make the hi-hat play 16th notes with retriggers."*

- `addNotesToPattern({ patternName: "FourOnFloor", notes: [{ trackName: "CHH", step: 0, every: 4 }] })`
- Or via `updateTrack({ patternName: "FourOnFloor", trackName: "CHH", updates: {}, noteUpdates: { every: 4 } })`

### 3. Apply effects to a track

*"Add a lowpass filter to the KICK and some reverb to the SNARE."*

- `updateTrack({ patternName: "FourOnFloor", trackName: "KICK", updates: { filterType: "lowpass", filterFreq: 400 } })`
- `updateTrack({ patternName: "FourOnFloor", trackName: "SNARE", updates: { reverbType: "hall", reverbAmount: 0.3 } })`

### 4. Load and inspect a pattern

- `listPatterns({})` → get available pattern names
- `loadPattern({ patternName: "existing-beat" })` → get full track/note data

### 5. Browse samples

- `listKitSamples({})` → list all WAV files
- `analyzeSamples({ samples: ["kits/kit1/kick.wav"] })` → get duration, pitch, spectral data

---

## Available Tools

| Tool | Purpose |
|------|---------|
| `createNewPattern` | Create empty pattern |
| `addNotesToPattern` | Add notes (step-based) with full trigger/retrigger/arp support |
| `updateTrack` | Update track properties + note overrides |
| `savePatternToJson` | Export pattern to file |
| `loadPattern` | Read pattern data |
| `listPatterns` | List all pattern names |
| `listAllInstrumentsNames` | Get valid track names (66 instruments) |
| `setPatternBpm` | Set tempo (20-300) |
| `setPatternTags` | Set genre/category tags |
| `setPatternNbBeats` | Set number of beats |
| `setPatternDescription` | Add description text |
| `listKitSamples` | List available WAV samples |
| `analyzeSamples` | Analyse audio characteristics |

See `MCP_TOOLS.md` for full parameter details.

---

## Notes

- All step/beat indices are **0-indexed**
- Track names are **uppercase instrument IDs** (max 12 chars) — use `listAllInstrumentsNames` to see them
- The server logs debug info to stderr; JSON-RPC messages go to stdout
- Patterns are saved to `public/assets/data/patterns/<name>.json`
