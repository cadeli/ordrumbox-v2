import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { PatternExporter } from "./src/ctrl/patternExporter.js";
import Utils from './src/utils.js'

// Configuration du logger vers stderr pour préserver le flux JSON-RPC sur stdout
const mcpLogger = new console.Console({
  stdout: process.stderr,
  stderr: process.stderr
});

console.log = (...args) => mcpLogger.log(...args);
console.warn = (...args) => mcpLogger.warn(...args);
console.error = (...args) => mcpLogger.error(...args);

import MfCmd from './src/ctrl/mfcmd.js';
import { MfGlobals } from './src/mfglobals.js';
import MfAudioAnalyze from './src/snd/mfaudioanalyze.js';
import InstrumentsManager from './src/ctrl/instrumentsManager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PATTERNS_OUTPUT_DIR = resolve(__dirname, 'public/assets/data/patterns');
const KITS_DIR = resolve(__dirname, 'public/assets/kits');

// --- Fonctions utilitaires ---



function getPatternFilePath(patternName) {
  const fileName = `${Utils.sanitizePatternFileName(patternName)}.json`;
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
  return MfGlobals.patterns.find(
    (pattern) => pattern?.name?.toUpperCase() === String(patternName).trim().toUpperCase()
  );
}

function ensureTrack(mfCmd, pattern, trackName, stepsPerBar = 4) {
  const normalizedTrackName = String(trackName).trim().toUpperCase();
  let track = mfCmd.getTrackFromType(pattern, normalizedTrackName);
  if (!track) {
    track = mfCmd.addTrack(pattern, normalizedTrackName, stepsPerBar);
  }
  return track;
}

function ensurePatternHasEnoughBars(mfCmd, pattern, noteBar) {
  const requiredBars = Number(noteBar) + 1;
  if (Number.isNaN(requiredBars) || requiredBars < 1) {
    throw new Error(`Invalid bar value: ${noteBar}`);
  }
  if (requiredBars > pattern.nbBars) {
    mfCmd.setNbBar(pattern, Math.ceil(requiredBars / 4));
  }
}

function upsertNoteOnTrack(mfCmd, track, noteInput) {
  const bar = Number(noteInput.bar);
  const stepInBar = Number(noteInput.stepInBar ?? noteInput.step);

  if (!Number.isInteger(bar) || bar < 0) throw new Error(`Invalid bar value: ${noteInput.bar}`);
  if (!Number.isInteger(stepInBar) || stepInBar < 0) throw new Error(`Invalid step value: ${stepInBar}`);

  const existingNote = mfCmd.isNoteAt(track, bar, stepInBar)[0];
  const note = existingNote ?? mfCmd.addNote(track, bar, stepInBar, Number(noteInput.pitch ?? 0));

  note.name = noteInput.name ?? note.name;
  note.velocity = Number(noteInput.velocity ?? note.velocity ?? 0.8);
  note.pan = Number(noteInput.pan ?? note.pan ?? 0);
  note.pitch = Number(noteInput.pitch ?? note.pitch ?? 0);
  note.arp = noteInput.arp ?? note.arp ?? null;
  note.triggerFreq = Number(noteInput.triggerFreq ?? note.triggerFreq ?? 1);
  note.triggerPhase = Number(noteInput.triggerPhase ?? note.triggerPhase ?? 0);
  note.retriggerNum = Number(noteInput.retriggerNum ?? note.retriggerNum ?? 1);
  note.retriggStep = Number(noteInput.retriggStep ?? note.retriggStep ?? 1);
  note.euclidianFill = Number(noteInput.euclidianFill ?? note.euclidianFill ?? 0);

  return existingNote ? 'updated' : 'created';
}

function buildLfoSchema(targetDescription, rangeConfig = {}) {
  const {
    minMinimum = 0, minMaximum = 1,
    maxMinimum = 0, maxMaximum = 1,
    minDescription = "Minimum LFO value (0 to 1).",
    maxDescription = "Maximum LFO value (0 to 1)."
  } = rangeConfig;
  return {
    type: ["object", "null"],
    description: `LFO applied ${targetDescription}.`,
    properties: {
      name: { type: "string" },
      wave: { type: "string", enum: ["SIN", "TRI", "SAW", "SQR"] },
      freq: { type: "number", minimum: 1, maximum: 16 },
      min: { type: "number", minimum: minMinimum, maximum: minMaximum, description: minDescription },
      max: { type: "number", minimum: maxMinimum, maximum: maxMaximum, description: maxDescription },
      phase: { type: "number", minimum: 0, maximum: 1 }
    }
  };
}

// --- Initialisation Serveur ---

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
    {
      name: "addNotesToPattern",
      description: "Adds notes to a pattern. Creates missing tracks.",
      inputSchema: {
        type: "object",
        properties: {
          patternName: { type: "string" },
          stepsPerBar: { 
            type: "integer", 
            minimum: 1, 
            maximum: 16, 
            description: "Steps per bar for new tracks. Default: 4" 
          },
          notes: {
            type: "array",
            items: {
              type: "object",
              properties: {
                trackName: { type: "string" },
                bar: { type: "integer", minimum: 0 },
                stepInBar: { type: "integer", minimum: 0 },
                pitch: { type: "number" },
                velocity: { type: "number", minimum: 0, maximum: 1 },
                pan: { type: "number", minimum: -1, maximum: 1 },
                arp: { type: "string" },
                triggerFreq: { type: "integer", minimum: 1, maximum: 16 },
                triggerPhase: { type: "integer", minimum: 0, maximum: 15 },
                retriggerNum: { type: "integer", minimum: 1, maximum: 16 },
                retriggStep: { type: "integer", minimum: 1, maximum: 16 },
                euclidianFill: { type: "integer", minimum: 0, maximum: 100 }
              },
              required: ["trackName", "bar", "stepInBar"]
            }
          }
        },
        required: ["patternName", "notes"]
      },
    },
    {
      name: "updateTrack",
      description: "Updates or creates a track with global properties",
      inputSchema: {
        type: "object",
        properties: {
          patternName: { type: "string" },
          trackName: { type: "string" },
          updates: { 
            type: "object",
            description: "Track-level properties (velocity, pan, pitch, mute, solo, filter, reverb, etc.)"
          },
          noteUpdates: {
            type: "object",
            description: "Note-level properties to apply to all notes in the track",
            properties: {
              triggerFreq: { type: "number", minimum: 1, maximum: 16 },
              triggerPhase: { type: "number", minimum: 0, maximum: 15 },
              retriggerNum: { type: "number", minimum: 1, maximum: 16 },
              retriggStep: { type: "number", minimum: 1, maximum: 16 },
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
      name: "setPatternNbBars",
      description: "Sets the number of bars for a pattern",
      inputSchema: {
        type: "object",
        properties: {
          patternName: { type: "string" },
          nbBars: { type: "integer", minimum: 1, maximum: 64 }
        },
        required: ["patternName", "nbBars"]
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

      return {
        content: [{ type: "text", text: JSON.stringify({ message: "Pattern created", pattern, filePath }) }]
      };
    }

    if (toolName === "addNotesToPattern") {
      const { patternName, notes } = args;
      const pattern = findPatternByName(patternName);
      if (!pattern) throw new Error(`Pattern '${patternName}' not found.`);

      const mfCmd = new MfCmd();
      let cTracks = 0, cNotes = 0, uNotes = 0;
      const existingTrackNames = new Set(pattern.tracks.map(t => t.name));

      for (const n of notes) {
        ensurePatternHasEnoughBars(mfCmd, pattern, n.bar);
        const normName = String(n.trackName).trim().toUpperCase();
        if (!existingTrackNames.has(normName)) { existingTrackNames.add(normName); cTracks++; }
        const track = ensureTrack(mfCmd, pattern, normName);
        const status = upsertNoteOnTrack(mfCmd, track, n);
        status === 'created' ? cNotes++ : uNotes++;
      }

      const filePath = await savePatternToDisk(pattern);
      return {
        content: [{ type: "text", text: JSON.stringify({ message: "Notes processed", cTracks, cNotes, uNotes, filePath }) }]
      };
    }

    if (toolName === "updateTrack") {
      const { patternName, trackName, updates, noteUpdates } = args;
      const pattern = findPatternByName(patternName);
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
        const noteProps = ['triggerFreq', 'triggerPhase', 'retriggerNum', 'retriggStep', 'arp', 'euclidianFill', 'velocity', 'pan', 'pitch'];
        const hasNoteProps = noteProps.some(prop => noteUpdates[prop] !== undefined);
        
        if (hasNoteProps && track.notes) {
          for (const note of track.notes) {
            if (noteUpdates.triggerFreq !== undefined) note.triggerFreq = Number(noteUpdates.triggerFreq);
            if (noteUpdates.triggerPhase !== undefined) note.triggerPhase = Number(noteUpdates.triggerPhase);
            if (noteUpdates.retriggerNum !== undefined) note.retriggerNum = Number(noteUpdates.retriggerNum);
            if (noteUpdates.retriggStep !== undefined) note.retriggStep = Number(noteUpdates.retriggStep);
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
      const pattern = findPatternByName(patternName);
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
            const patternsPath = resolve(__dirname, 'public/assets/data/patterns.json');
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
            const patternsPath = resolve(__dirname, 'public/assets/data/patterns.json');
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
                nbBars: pattern.nbBars,
                tracks: pattern.tracks?.map(t => ({
                    name: t.name,
                    soundId: t.soundId,
                    useAutoAssignSound: t.useAutoAssignSound,
                    bars: t.bars,
                    stepsPerBar: t.stepsPerBar,
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
                        bar: n.bar,
                        stepInBar: n.stepInBar,
                        velocity: n.velocity,
                        pan: n.pan,
                        pitch: n.pitch,
                        arp: n.arp,
                        triggerFreq: n.triggerFreq,
                        triggerPhase: n.triggerPhase,
                        retriggerNum: n.retriggerNum,
                        retriggStep: n.retriggStep,
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

    if (toolName === "setPatternBpm") {
      const { patternName, bpm } = args;
      const pattern = findPatternByName(patternName);
      if (!pattern) throw new Error(`Pattern '${patternName}' not found.`);

      const mfCmd = new MfCmd();
      mfCmd.setPatternBpm(pattern, Number(bpm));
      const filePath = await savePatternToDisk(pattern);

      return { content: [{ type: "text", text: JSON.stringify({ 
        message: "BPM updated", 
        patternName: pattern.name, 
        bpm: pattern.bpm,
        filePath 
      })}] };
    }

    if (toolName === "setPatternTags") {
      const { patternName, tags } = args;
      const pattern = findPatternByName(patternName);
      if (!pattern) throw new Error(`Pattern '${patternName}' not found.`);

      pattern.tags = Array.isArray(tags) ? tags : [];
      const filePath = await savePatternToDisk(pattern);

      return { content: [{ type: "text", text: JSON.stringify({ 
        message: "Tags updated", 
        patternName: pattern.name, 
        tags: pattern.tags,
        filePath 
      })}] };
    }

    if (toolName === "setPatternNbBars") {
      const { patternName, nbBars } = args;
      const pattern = findPatternByName(patternName);
      if (!pattern) throw new Error(`Pattern '${patternName}' not found.`);

      const mfCmd = new MfCmd();
      mfCmd.setPatternBars(pattern, Number(nbBars));
      const filePath = await savePatternToDisk(pattern);

      return { content: [{ type: "text", text: JSON.stringify({ 
        message: "Number of bars updated", 
        patternName: pattern.name, 
        nbBars: pattern.nbBars,
        filePath 
      })}] };
    }

    if (toolName === "setPatternDescription") {
      const { patternName, description } = args;
      const pattern = findPatternByName(patternName);
      if (!pattern) throw new Error(`Pattern '${patternName}' not found.`);

      pattern.description = String(description ?? '');
      const filePath = await savePatternToDisk(pattern);

      return { content: [{ type: "text", text: JSON.stringify({ 
        message: "Description updated", 
        patternName: pattern.name, 
        description: pattern.description,
        filePath 
      })}] };
    }

    throw new Error(`Unknown tool: ${toolName}`);

  } catch (error) {
    // Gestion d'erreur critique avec Stack Trace pour le debug
    console.error(`ERROR in ${request.params.name}:`, error.stack);

    return {
      isError: true,
      content: [{
        type: "text",
        text: JSON.stringify({
          status: "error",
          tool: request.params.name,
          message: error.message,
          stack: error.stack
        }, null, 2)
      }]
    };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);