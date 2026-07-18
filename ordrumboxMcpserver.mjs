import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { PatternExporter } from "./src/patterns/exporter.js";

// Log to stderr to preserve JSON-RPC stream on stdout
const mcpLogger = new console.Console({
  stdout: process.stderr,
  stderr: process.stderr
});

console.log = (...args) => mcpLogger.log(...args);
console.warn = (...args) => mcpLogger.warn(...args);
console.error = (...args) => mcpLogger.error(...args);

import MfCmd from './src/logic/commands/cmd.js';
import { appState } from './src/state/app_state.js';
import MfAudioAnalyze from './src/audio/analyze.js';
import InstrumentsManager from './src/logic/services/instruments_manager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PATTERNS_OUTPUT_DIR = resolve(__dirname, 'assets/data/patterns');
const KITS_DIR = resolve(__dirname, 'assets/kits');

// Format patterns with notes on single line
function formatPatternsWithNotesOnLine(patterns) {
  return JSON.stringify(patterns, null, 2) + '\n';
}

// --- Utility functions ---

function sanitizePatternFileName(name) {
  return String(name).trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

function getPatternFilePath(patternName) {
  const fileName = `${sanitizePatternFileName(patternName)}.json`;
  return resolve(PATTERNS_OUTPUT_DIR, fileName);
}

function resolveKitSamplePath(samplePath) {
  const normalizedSamplePath = String(samplePath).trim().replaceAll('\\', '/').replace(/^\/+/, '');
  const absolutePath = resolve(KITS_DIR, normalizedSamplePath);

  if (!absolutePath.startsWith(KITS_DIR)) {
    throw new Error(`Invalid sample path: ${samplePath}`);
  }
  return {
    absolutePath,
    relativePath: relative(KITS_DIR, absolutePath).replaceAll('\\', '/')
  };
}

async function listSampleFiles(dirPath, baseDir = dirPath) {
  const entries = await readdir(dirPath, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const absolutePath = resolve(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listSampleFiles(absolutePath, baseDir));
      continue;
    }

    if (!entry.isFile() || !/\.wav$/i.test(entry.name)) {
      continue;
    }

    const relativePath = absolutePath
      .slice(baseDir.length + 1)
      .replaceAll('\\', '/');

    files.push(relativePath);
  }

  return files.sort((a, b) => a.localeCompare(b));
}

async function savePatternToDisk(pattern) {
  const exportedPattern = PatternExporter.export(pattern);
  const filePath = getPatternFilePath(pattern.name);
  await mkdir(PATTERNS_OUTPUT_DIR, { recursive: true });
  await writeFile(filePath, `${JSON.stringify(exportedPattern, null, 2)}\n`, "utf8");
  return filePath;
}

function findPatternByName(patternName) {
  return appState.patterns.find(
    (pattern) => pattern?.name?.toUpperCase() === String(patternName).trim().toUpperCase()
  );
}

function ensureTrack(mfCmd, pattern, trackName, stepsPerBeat = 4, loopAtStep = null) {
  const normalizedTrackName = String(trackName).trim().toUpperCase();
  let track = mfCmd.getTrackFromType(pattern, normalizedTrackName);
  if (!track) {
    track = mfCmd.addTrack(pattern, normalizedTrackName, stepsPerBeat);
    if (loopAtStep !== null) {
      track.loopAtStep = loopAtStep;
    }
    // Default loopAtStep = nbBeats * stepsPerBeat
  }
  return track;
}

function ensurePatternHasEnoughBeats(mfCmd, pattern, noteBeat) {
  const requiredBeats = Number(noteBeat) + 1;
  if (Number.isNaN(requiredBeats) || requiredBeats < 1) {
    throw new Error(`Invalid beat value: ${noteBeat}`);
  }
  if (requiredBeats > pattern.nbBeats) {
    mfCmd.setNbBeats(pattern, Math.ceil(requiredBeats / 4));
  }
}

function upsertNoteOnTrack(mfCmd, track, noteInput) {
  const beat = Number(noteInput.beat);
  const beatStep = Number(noteInput.beatStep ?? noteInput.step);

  if (!Number.isInteger(beat) || beat < 0) throw new Error(`Invalid beat value: ${noteInput.beat}`);
  if (!Number.isInteger(beatStep) || beatStep < 0) throw new Error(`Invalid step value: ${beatStep}`);

  const existingNote = mfCmd.isNoteAt(track, beat, beatStep)[0];
  const note = existingNote ?? mfCmd.addNote(track, beat, beatStep, Number(noteInput.pitch ?? 0));

  note.name = noteInput.name ?? note.name;
  note.velocity = Number(noteInput.velocity ?? note.velocity ?? 0.8);
  note.pan = Number(noteInput.pan ?? note.pan ?? 0);
  note.pitch = Number(noteInput.pitch ?? note.pitch ?? 0);
  note.arp = noteInput.arp ?? note.arp ?? null;
  note.every = Number(noteInput.every ?? note.every ?? 1);
  note.pos = Number(noteInput.pos ?? note.pos ?? 0);
  note.prob = Math.min(Math.max(Number(noteInput.prob ?? note.prob ?? 1), 0), 1);
  note.arpTriggerProbability = Math.min(Math.max(Number(noteInput.arpTriggerProbability ?? note.arpTriggerProbability ?? 1), 0), 1);
  note.retriggerNum = Number(noteInput.retriggerNum ?? note.retriggerNum ?? 1);
  note.rate = Number(noteInput.rate ?? note.rate ?? 1);
  note.euclidianFill = Number(noteInput.euclidianFill ?? note.euclidianFill ?? 0);

  return existingNote ? 'updated' : 'created';
}

// --- Server initialisation ---

const server = new Server({
  name: "ordrumbox-mcp-server",
  version: "1.0.0",
}, {
  capabilities: { tools: {} },
});

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "createNewPattern",
      description: "Creates a new empty pattern",
      inputSchema: {
        type: "object",
        properties: {
          patternName: { type: "string", minLength: 1 }
        },
        required: ["patternName"]
      },
    },
    //{
    //   name: "addExtendedNotesToPattern",
    //   description: "Adds notes to a pattern using beat/beatStep coordinates. Creates missing tracks automatically. (Experimental)",
    //   inputSchema: {
    //     type: "object",
    //     properties: {
    //       patternName: { type: "string" },
    //       stepsPerBeat: {
    //         type: "integer",
    //         minimum: 1,
    //         maximum: 16,
    //         description: "Steps per beat for new tracks. Default: 4"
    //       },
    //       notes: {
    //         type: "array",
    //         items: {
    //           type: "object",
    //           properties: {
    //             trackName: { type: "string" },
    //             beat: { type: "integer", minimum: 0 },
    //             beatStep: { type: "integer", minimum: 0 },
    //             pitch: { type: "number" },
    //             velocity: { type: "number", minimum: 0, maximum: 1 },
    //             pan: { type: "number", minimum: -1, maximum: 1 },
    //             arp: { type: "string" },
    //             every: { type: "integer", minimum: 1, maximum: 16 },
    //             pos: { type: "integer", minimum: 0, maximum: 15 },
    //             prob: { type: "number", minimum: 0, maximum: 1 },
    //             arpTriggerProbability: { type: "number", minimum: 0, maximum: 1 },
    //             retriggerNum: { type: "integer", minimum: 1, maximum: 16 },
    //             rate: { type: "integer", minimum: 1, maximum: 16 },
    //             euclidianFill: { type: "integer", minimum: 0, maximum: 100 }
    //           },
    //           required: ["trackName", "beat", "beatStep"]
    //         }
    //       }
    //     },
    //     required: ["patternName", "notes"]
    //   },
    // },
    {
      name: "addNotesToPattern",
      description: "Adds multiple notes to a pattern using absolute step numbers. Converts step to beat/beatStep internally.",
      inputSchema: {
        type: "object",
        properties: {
          patternName: { type: "string", description: "Name of the pattern" },
          notes: {
            type: "array",
            description: "Array of notes to add",
            items: {
              type: "object",
              properties: {
                trackName: { type: "string", description: "Instrument name (e.g., KICK, SNARE)" },
                step: { type: "integer", minimum: 0, description: "Absolute step number (0-based)" },
                velocity: { type: "number", minimum: 0, maximum: 1, default: 0.8 },
                pan: { type: "number", minimum: -1, maximum: 1, default: 0 },
                pitch: { type: "number", default: 0 },
                every: { type: "integer", minimum: 1, maximum: 16, description: "Play every N-th loop" },
                pos: { type: "integer", minimum: 0, maximum: 15, description: "Phase offset for trigger frequency" },
                prob: { type: "number", minimum: 0, maximum: 1, default: 1 },
                arpTriggerProbability: { type: "number", minimum: 0, maximum: 1, default: 1 },
                retriggerNum: { type: "integer", minimum: 1, maximum: 16, description: "Number of retriggers (1-16)" },
                rate: { type: "integer", minimum: 1, maximum: 16, description: "Retrigger step spacing (1-16)" },
                arp: { type: "string", description: "Arpeggio pattern (up, down, upDown, random, or custom indices)" },
                euclidianFill: { type: "integer", minimum: 0, maximum: 100, description: "Euclidean fill percentage (0-100)" }
              },
              required: ["trackName", "step"]
            }
          }
        },
        required: ["patternName", "notes"]
      },
    },
    {
      name: "updateTrack",
      description: "Updates or creates a track with global properties and per-note overrides",
      inputSchema: {
        type: "object",
        properties: {
          patternName: { type: "string" },
          trackName: { type: "string" },
          updates: {
            type: "object",
            description: "Track-level properties to set. See MCP_TOOLS.md for the full list of valid fields.",
            properties: {
              velocity: { type: "number", minimum: 0, maximum: 1, description: "Global track velocity" },
              pan: { type: "number", minimum: -1, maximum: 1, description: "Stereo pan" },
              pitch: { type: "number", description: "Pitch offset in semitones" },
              mute: { type: "boolean", description: "Mute the track" },
              solo: { type: "boolean", description: "Solo the track" },
              auto: { type: "boolean", description: "Auto mode" },
              useSoftSynth: { type: "boolean", description: "Use software synthesis instead of samples" },
              mono: { type: "boolean", description: "Mono mode (cut previous note on same track)" },
              filterType: { type: "string", enum: ["lowpass", "highpass", "bandpass", "notch", "peaking", "lowshelf", "highshelf", "allpass"], description: "Filter type" },
              filterFreq: { type: "number", minimum: 20, maximum: 20000, description: "Filter cutoff frequency in Hz" },
              filterQ: { type: "number", minimum: 0.707, maximum: 21, description: "Filter resonance / Q factor" },
              reverbType: { type: "string", enum: ["none", "room", "hall", "plate", "spring", "gated"], description: "Reverb preset" },
              reverbAmount: { type: "number", minimum: 0, maximum: 1, description: "Reverb wet/dry mix" },
              saturationType: { type: "string", enum: ["soft", "hard", "tape"], description: "Saturation / distortion type" },
              saturationAmount: { type: "number", minimum: 0, maximum: 1, description: "Saturation amount" },
              delayType: { type: "string", enum: ["tape", "analog", "digital"], description: "Delay type" },
              delayTime: { type: "number", description: "Delay time in beats" },
              delayAmount: { type: "number", minimum: 0, maximum: 1, description: "Delay feedback amount" },
              loopAtStep: { type: "integer", minimum: 0, description: "Loop point (absolute step index)" },
              stepsPerBeat: { type: "integer", enum: [4, 8, 16], description: "Steps per beat" },
              nbBeats: { type: "integer", minimum: 1, description: "Number of beats for this track" },
              variation: { type: "number", minimum: 0, maximum: 100, description: "Track variation (randomization budget 0-100)" },
              variation2: { type: "number", minimum: 0, maximum: 100, description: "Second variation pass (budget 0-100)" },
            }
          },
          noteUpdates: {
            type: "object",
            description: "Note-level properties to apply to all notes in the track",
            properties: {
              every: { type: "number", minimum: 1, maximum: 16 },
              pos: { type: "number", minimum: 0, maximum: 15 },
              prob: { type: "number", minimum: 0, maximum: 1 },
              arpTriggerProbability: { type: "number", minimum: 0, maximum: 1 },
              retriggerNum: { type: "number", minimum: 1, maximum: 16 },
              rate: { type: "number", minimum: 1, maximum: 16 },
              arp: { type: "string" },
              euclidianFill: { type: "number", minimum: 0, maximum: 100 },
              velocity: { type: "number", minimum: 0, maximum: 1 },
              pan: { type: "number", minimum: -1, maximum: 1 },
              pitch: { type: "number" }
            }
          }
        },
        required: ["patternName", "trackName", "updates"]
      }
    },
    {
      name: "savePatternToJson",
      description: "Saves a pattern to a JSON file",
      inputSchema: {
        type: "object",
        properties: { patternName: { type: "string" } },
        required: ["patternName"]
      }
    },
   
    {
        name: "listAllInstrumentsNames",
        description: "Returns the list of all instrument IDs from InstrumentsManager (valid track names for MCP)",
        inputSchema: { type: "object", properties: {} }
    },
    {
        name: "listPatterns",
        description: "Returns the list of all patterns from patterns.json",
        inputSchema: { type: "object", properties: {} }
    },
    {
        name: "loadPattern",
        description: "Loads a pattern by name and returns its full data",
        inputSchema: {
            type: "object",
            properties: {
                patternName: { type: "string", minLength: 1 }
            },
            required: ["patternName"]
        }
    },
    {
      name: "listKitSamples",
      description: "Lists all WAV samples in the kits directory",
      inputSchema: { type: "object", properties: {} }
    },
    {
      name: "analyzeSamples",
      description: "Audio analysis on a list of samples",
      inputSchema: {
        type: "object",
        properties: {
          samples: { type: "array", items: { type: "string" } }
        },
        required: ["samples"]
      }
    },
    {
      name: "setPatternBpm",
      description: "Sets the BPM (tempo) of a pattern",
      inputSchema: {
        type: "object",
        properties: {
          patternName: { type: "string" },
          bpm: { type: "number", minimum: 20, maximum: 300 }
        },
        required: ["patternName", "bpm"]
      }
    },
    {
      name: "setPatternTags",
      description: "Sets tags (categories/genre) for a pattern",
      inputSchema: {
        type: "object",
        properties: {
          patternName: { type: "string" },
          tags: { type: "array", items: { type: "string" } }
        },
        required: ["patternName", "tags"]
      }
    },
    {
      name: "setPatternNbBeats",
      description: "Sets the number of beats for a pattern",
      inputSchema: {
        type: "object",
        properties: {
          patternName: { type: "string" },
          nbBeats: { type: "integer", minimum: 1, maximum: 64 }
        },
        required: ["patternName", "nbBeats"]
      }
    },
    {
      name: "setPatternDescription",
      description: "Sets the description text for a pattern",
      inputSchema: {
        type: "object",
        properties: {
          patternName: { type: "string" },
          description: { type: "string" }
        },
        required: ["patternName", "description"]
      }
    }
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    const { name: toolName, arguments: args } = request.params;

    if (toolName === "createNewPattern") {
      const { patternName } = args;
      if (!patternName) throw new Error("patternName is required");

      const mfCmd = new MfCmd();
      const pattern = mfCmd.addPattern(String(patternName).trim());
      const filePath = await savePatternToDisk(pattern);

      const patternsPath = resolve(__dirname, 'assets/data/patterns.json');
      const data = await readFile(patternsPath, 'utf-8');
      let patterns;
      try { patterns = JSON.parse(data); } catch (e) { throw new Error(`Corrupt patterns.json: ${e.message}`); }
      patterns.push(pattern);
      await writeFile(patternsPath, formatPatternsWithNotesOnLine(patterns));

      return {
        content: [{ type: "text", text: JSON.stringify({ message: "Pattern created", pattern, filePath }) }]
      };
    }

    if (toolName === "addExtendedNotesToPattern") {
      const { patternName, notes: notesArg, stepsPerBeat } = args;
      let notes;
      try {
        notes = typeof notesArg === 'string' ? JSON.parse(notesArg) : notesArg;
      } catch (e) {
        throw new Error(`Invalid JSON in 'notes' argument: ${e.message}`);
      }
      const bq = Number(stepsPerBeat) || 4;
      const loopStep = bq;
      let pattern = findPatternByName(patternName);
      if (!pattern) {
        const patternsPath = resolve(__dirname, 'assets/data/patterns.json');
        const data = await readFile(patternsPath, 'utf-8');
        let patterns;
        try { patterns = JSON.parse(data); } catch (e) { throw new Error(`Corrupt patterns.json: ${e.message}`); }
        const sourcePattern = patterns.find(p => p.name === patternName);
        if (sourcePattern) {
          const mfCmd = new MfCmd();
          pattern = mfCmd.importPatternFromJson(sourcePattern);
        }
      }
      if (!pattern) throw new Error(`Pattern '${patternName}' not found.`);

      const mfCmd = new MfCmd();
      let cTracks = 0, cNotes = 0, uNotes = 0;
      const existingTrackNames = new Set(pattern.tracks.map(t => t.name));

      for (const n of notes) {
        ensurePatternHasEnoughBeats(mfCmd, pattern, n.beat);
        const normName = String(n.trackName).trim().toUpperCase();
        if (!existingTrackNames.has(normName)) { existingTrackNames.add(normName); cTracks++; }
        const track = ensureTrack(mfCmd, pattern, normName, bq, loopStep);
        const status = upsertNoteOnTrack(mfCmd, track, n);
        status === 'created' ? cNotes++ : uNotes++;
      }

      const filePath = await savePatternToDisk(pattern);

      const patternsPath = resolve(__dirname, 'assets/data/patterns.json');
      const data = await readFile(patternsPath, 'utf-8');
      let patterns;
      try { patterns = JSON.parse(data); } catch (e) { throw new Error(`Corrupt patterns.json: ${e.message}`); }
      const idx = patterns.findIndex(p => p.name === patternName);
      if (idx >= 0) {
        patterns[idx] = pattern;
      }
      await writeFile(patternsPath, formatPatternsWithNotesOnLine(patterns));

      return {
        content: [{ type: "text", text: JSON.stringify({ message: "Notes processed", cTracks, cNotes, uNotes, filePath }) }]
      };
    }

    if (toolName === "addNotesToPattern") {
      const { patternName, notes: notesArg } = args;
      let notes;
      try {
        notes = typeof notesArg === 'string' ? JSON.parse(notesArg) : notesArg;
      } catch (e) {
        throw new Error(`Invalid JSON in 'notes' argument: ${e.message}`);
      }
      
      const pattern = await loadPatternFromJson(patternName);
      if (!pattern) throw new Error(`Pattern '${patternName}' not found.`);

      const mfCmd = new MfCmd();
      const stepsPerBeat = pattern.stepsPerBeat || 4;
      
      let cNotes = 0, uNotes = 0;
      const existingTrackNames = new Set(pattern.tracks.map(t => t.name));

      for (const n of notes) {
        const trackName = String(n.trackName).trim().toUpperCase();
        if (!existingTrackNames.has(trackName)) {
          existingTrackNames.add(trackName);
        }
        
        const track = ensureTrack(mfCmd, pattern, trackName, stepsPerBeat);
        const beat = Math.floor(Number(n.step) / stepsPerBeat);
        const beatStep = Number(n.step) % stepsPerBeat;

        ensurePatternHasEnoughBeats(mfCmd, pattern, beat);

        const noteInput = {
          trackName,
          beat,
          beatStep,
          velocity: Number(n.velocity ?? 0.8),
          pan: Number(n.pan ?? 0),
          pitch: Number(n.pitch ?? 0),
          every: n.every,
          pos: n.pos,
          prob: n.prob,
          arpTriggerProbability: n.arpTriggerProbability,
          retriggerNum: n.retriggerNum,
          rate: n.rate,
          arp: n.arp,
          euclidianFill: n.euclidianFill
        };

        const status = upsertNoteOnTrack(mfCmd, track, noteInput);
        status === 'created' ? cNotes++ : uNotes++;
      }

      const filePath = await savePatternToDisk(pattern);

      const patternsPath = resolve(__dirname, 'assets/data/patterns.json');
      const data = await readFile(patternsPath, 'utf-8');
      let patterns;
      try { patterns = JSON.parse(data); } catch (e) { throw new Error(`Corrupt patterns.json: ${e.message}`); }
      const idx = patterns.findIndex(p => p.name === patternName);
      if (idx >= 0) {
        patterns[idx] = pattern;
      }
      await writeFile(patternsPath, formatPatternsWithNotesOnLine(patterns));

      return {
        content: [{ type: "text", text: JSON.stringify({ message: "Notes added", cNotes, uNotes, filePath }) }]
      };
    }

    if (toolName === "updateTrack") {
      const { patternName, trackName, updates, noteUpdates } = args;
      const pattern = await loadPatternFromJson(patternName);
      if (!pattern) throw new Error(`Pattern '${patternName}' not found.`);

      const instrumentsManager = new InstrumentsManager();
      const searchName = (updates.auto === false && updates.instId) ? updates.instId : trackName;
      const inst = instrumentsManager.findInstrumentFromFileName(String(searchName).trim().toUpperCase());
      const normalizedTrackName = String(inst.id).trim().toUpperCase();
      
      const mfCmd = new MfCmd();
      let track = mfCmd.getTrackFromType(pattern, normalizedTrackName);
      let action = "updated";

      if (!track) {
        track = mfCmd.addTrack(pattern, normalizedTrackName);
        action = "added";
      }

      if (!track) throw new Error(`Could not create track: ${normalizedTrackName}`);

      mfCmd.setTrackProps(track, updates);
      
      let notesUpdated = 0;
      if (noteUpdates) {
        const noteProps = ['every', 'pos', 'prob', 'arpTriggerProbability', 'retriggerNum', 'rate', 'arp', 'euclidianFill', 'velocity', 'pan', 'pitch'];
        const hasNoteProps = noteProps.some(prop => noteUpdates[prop] !== undefined);
        
        if (hasNoteProps && track.notes) {
          for (const note of track.notes) {
            if (noteUpdates.every !== undefined) note.every = Number(noteUpdates.every);
            if (noteUpdates.pos !== undefined) note.pos = Number(noteUpdates.pos);
            if (noteUpdates.prob !== undefined) note.prob = Math.min(Math.max(Number(noteUpdates.prob), 0), 1);
            if (noteUpdates.arpTriggerProbability !== undefined) note.arpTriggerProbability = Math.min(Math.max(Number(noteUpdates.arpTriggerProbability), 0), 1);
            if (noteUpdates.retriggerNum !== undefined) note.retriggerNum = Number(noteUpdates.retriggerNum);
            if (noteUpdates.rate !== undefined) note.rate = Number(noteUpdates.rate);
            if (noteUpdates.arp !== undefined) note.arp = noteUpdates.arp;
            if (noteUpdates.euclidianFill !== undefined) note.euclidianFill = Number(noteUpdates.euclidianFill);
            if (noteUpdates.velocity !== undefined) note.velocity = Number(noteUpdates.velocity);
            if (noteUpdates.pan !== undefined) note.pan = Number(noteUpdates.pan);
            if (noteUpdates.pitch !== undefined) note.pitch = Number(noteUpdates.pitch);
            notesUpdated++;
          }
        }
      }
      
      const filePath = await savePatternToDisk(pattern);

      return {
        content: [{ type: "text", text: JSON.stringify({ message: `Track ${action} successfully`, action, trackName: track.name, notesUpdated, filePath }) }]
      };
    }

    if (toolName === "savePatternToJson") {
      const { patternName } = args;
      const pattern = await loadPatternFromJson(patternName);
      if (!pattern) throw new Error(`Pattern '${patternName}' not found.`);
      const filePath = await savePatternToDisk(pattern);
      return {
        content: [{ type: "text", text: JSON.stringify({ message: "Saved", filePath }) }]
      };
    }


    if (toolName === "listAllInstrumentsNames") {
        const instruments = InstrumentsManager.DATA?.instruments ?? [];
        const ids = instruments.map(i => i.id).sort();
        const instrumentsList = instruments.map(i => ({
            id: i.id,
            name: i.name?.syn ? i.name.syn[0] : i.id,
            drum: i.drum,
            pan: i.pan
        }));
        return { content: [{ type: "text", text: JSON.stringify({ 
            instrumentNames: ids, 
            count: ids.length,
            instruments: instrumentsList
        })}] };
    }

    if (toolName === "listPatterns") {
        try {
            const patternsPath = resolve(__dirname, 'assets/data/patterns.json');
            const data = await readFile(patternsPath, 'utf-8');
            const patterns = JSON.parse(data);
            const patternNames = patterns.map(p => p.name).sort();
            return { content: [{ type: "text", text: JSON.stringify({ patterns: patternNames, count: patternNames.length }) }] };
        } catch (err) {
            return { content: [{ type: "text", text: JSON.stringify({ error: err.message }) }] };
        }
    }

    if (toolName === "loadPattern") {
        const { patternName } = args;
        try {
            const patternsPath = resolve(__dirname, 'assets/data/patterns.json');
            const data = await readFile(patternsPath, 'utf-8');
            const patterns = JSON.parse(data);
            const pattern = patterns.find(p => p.name === patternName);
            if (!pattern) {
                return { content: [{ type: "text", text: JSON.stringify({ error: `Pattern not found: ${patternName}` }) }] };
            }
            return { content: [{ type: "text", text: JSON.stringify({ 
                name: pattern.name,
                description: pattern.description ?? "",
                tags: pattern.tags,
                bpm: pattern.bpm,
                nbBeats: pattern.nbBeats,
                tracks: pattern.tracks?.map(t => ({
                    name: t.name,
                    soundId: t.soundId,
                    useAutoAssignSound: t.useAutoAssignSound,
                    nbBeats: t.nbBeats,
                    stepsPerBeat: t.stepsPerBeat,
                    loopAtStep: t.loopAtStep,
                    velocity: t.velocity,
                    pitch: t.pitch,
                    pan: t.pan,
                    mute: t.mute,
                    solo: t.solo,
                    auto: t.auto,
                    useSoftSynth: t.useSoftSynth,
                    filterType: t.filterType,
                    filterFreq: t.filterFreq,
                    filterQ: t.filterQ,
                    reverbType: t.reverbType,
                    reverbAmount: t.reverbAmount,
                    saturationType: t.saturationType,
                    saturationAmount: t.saturationAmount,
                    notes: t.notes?.map(n => ({
                        name: n.name,
                        beat: n.beat,
                        beatStep: n.beatStep,
                        velocity: n.velocity,
                        pan: n.pan,
                        pitch: n.pitch,
                        arp: n.arp,
                        every: n.every,
                        pos: n.pos,
                        prob: n.prob,
                        arpTriggerProbability: n.arpTriggerProbability,
                        retriggerNum: n.retriggerNum,
                        rate: n.rate,
                        euclidianFill: n.euclidianFill
                    })) ?? []
                })) ?? []
            })}] };
        } catch (err) {
            return { content: [{ type: "text", text: JSON.stringify({ error: err.message }) }] };
        }
    }

    if (toolName === "listKitSamples") {
      const samples = await listSampleFiles(KITS_DIR);
      return { content: [{ type: "text", text: JSON.stringify({ count: samples.length, samples }) }] };
    }

    if (toolName === "analyzeSamples") {
      const { samples } = args;
      const analyzer = new MfAudioAnalyze();
      const results = [];
      for (const s of samples) {
        try {
          const { absolutePath, relativePath } = resolveKitSamplePath(s);
          const buf = await readFile(absolutePath);
          results.push({ samplePath: relativePath, analysis: analyzer.analyzeWavBuffer(buf) });
        } catch (e) { results.push({ samplePath: s, error: e.message }); }
      }
      return { content: [{ type: "text", text: JSON.stringify({ results }) }] };
    }

    async function loadPatternFromJson(patternName) {
  let pattern = findPatternByName(patternName);
  if (!pattern) {
    const patternsPath = resolve(__dirname, 'assets/data/patterns.json');
    const data = await readFile(patternsPath, 'utf-8');
    let patterns;
    try { patterns = JSON.parse(data); } catch (e) { throw new Error(`Corrupt patterns.json: ${e.message}`); }
    const sourcePattern = patterns.find(p => p.name === patternName);
    if (sourcePattern) {
      const mfCmd = new MfCmd();
      pattern = mfCmd.importPatternFromJson(sourcePattern);
    }
  }
  return pattern;
}

async function updatePatternInIndex(pattern) {
  const patternsPath = resolve(__dirname, 'assets/data/patterns.json');
  const data = await readFile(patternsPath, 'utf-8');
  let patterns;
  try { patterns = JSON.parse(data); } catch (e) { throw new Error(`Corrupt patterns.json: ${e.message}`); }
  const idx = patterns.findIndex(p => p.name === pattern.name);
  if (idx >= 0) {
    patterns[idx] = pattern;
  }
  await writeFile(patternsPath, formatPatternsWithNotesOnLine(patterns));
}

if (toolName === "setPatternBpm") {
  const { patternName, bpm } = args;
  const pattern = await loadPatternFromJson(patternName);
  if (!pattern) throw new Error(`Pattern '${patternName}' not found.`);

  const mfCmd = new MfCmd();
  mfCmd.setPatternBpm(pattern, Number(bpm));
  const filePath = await savePatternToDisk(pattern);
  await updatePatternInIndex(pattern);

  return { content: [{ type: "text", text: JSON.stringify({ 
        message: "BPM updated", 
        patternName: pattern.name, 
        bpm: pattern.bpm,
        filePath 
      })}] };
    }

    if (toolName === "setPatternTags") {
      const { patternName, tags } = args;
      const pattern = await loadPatternFromJson(patternName);
      if (!pattern) throw new Error(`Pattern '${patternName}' not found.`);

      pattern.tags = Array.isArray(tags) ? tags : [];
      const filePath = await savePatternToDisk(pattern);
      await updatePatternInIndex(pattern);

      return { content: [{ type: "text", text: JSON.stringify({ 
        message: "Tags updated", 
        patternName: pattern.name, 
        tags: pattern.tags,
        filePath 
      })}] };
    }

    if (toolName === "setPatternNbBeats") {
      const { patternName, nbBeats } = args;
      const pattern = await loadPatternFromJson(patternName);
      if (!pattern) throw new Error(`Pattern '${patternName}' not found.`);

      const mfCmd = new MfCmd();
      mfCmd.setPatternNbBeats(pattern, Number(nbBeats));
      const filePath = await savePatternToDisk(pattern);
      await updatePatternInIndex(pattern);

      return { content: [{ type: "text", text: JSON.stringify({ 
        message: "Number of beats updated", 
        patternName: pattern.name, 
        nbBeats: pattern.nbBeats,
        filePath 
      })}] };
    }

    if (toolName === "setPatternDescription") {
      const { patternName, description } = args;
      const pattern = await loadPatternFromJson(patternName);
      if (!pattern) throw new Error(`Pattern '${patternName}' not found.`);

      pattern.description = String(description ?? '');
      const filePath = await savePatternToDisk(pattern);
      await updatePatternInIndex(pattern);

      return { content: [{ type: "text", text: JSON.stringify({ 
        message: "Description updated", 
        patternName: pattern.name, 
        description: pattern.description,
        filePath 
      })}] };
    }

    throw new Error(`Unknown tool: ${toolName}`);

  } catch (error) {
    // Critical error handling with stack trace for debugging
    console.error(`ERROR in ${request.params.name}:`, error.stack);

    return {
      isError: true,
      content: [{
        type: "text",
        text: JSON.stringify({
          status: "error",
          tool: request.params.name,
          message: error.message
        }, null, 2)
      }]
    };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
