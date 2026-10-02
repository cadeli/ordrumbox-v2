import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { PatternExporter } from './src/patterns/exporter.js'

import Commander from './src/logic/commands/cmd.js'
import { appState } from './src/state/app_state.js'
import AudioAnalyzer from './src/audio/analyze.js'
import InstrumentsManager from './src/logic/services/instrument_manager/index.js'
import Utils from './src/core/utils.js'
import { normalizeTrack, TRACK_VALUE_RANGES } from './src/model/track_schema.js'
import { compactArrayToNote, normalizeNote } from './src/core/note_schema.js'
import { songLengthBars } from './src/model/song_schema.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const KITS_DIR = resolve(__dirname, 'assets/kits')

/**
 * Data directory the server reads song.json from and writes patterns to.
 * Resolved on every access so ORDRUMBOX_MCP_DATA_DIR can redirect the whole
 * write path (tests point it at a temp dir instead of the repo data).
 */
function dataDir() {
    return resolve(__dirname, process.env.ORDRUMBOX_MCP_DATA_DIR || 'assets/data')
}

function songIndexPath() {
    return resolve(dataDir(), 'song.json')
}

function patternsOutputDir() {
    return resolve(dataDir(), 'patterns')
}

// Format patterns with notes on single line
function formatPatternsWithNotesOnLine(patterns) {
    return JSON.stringify(patterns, null, 2) + '\n'
}

/**
 * song.json is `{ infos, patterns, songs }` in current releases (older files
 * were a bare pattern array) — same `json.patterns ?? json` rule as loadSong().
 * `songs` is the arrangement list; a file without one simply has no
 * arrangement yet.
 */
function songPatternsOf(doc) {
    return Array.isArray(doc) ? doc : (doc.patterns ?? [])
}

function songArrangementsOf(doc) {
    return Array.isArray(doc) ? [] : Array.isArray(doc.songs) ? doc.songs : []
}

async function readSongIndex() {
    const data = await readFile(songIndexPath(), 'utf-8')
    let doc
    try {
        doc = JSON.parse(data)
    } catch (e) {
        throw new Error(`Corrupt song.json: ${e.message}`, { cause: e })
    }
    return { doc, patterns: songPatternsOf(doc), songs: songArrangementsOf(doc) }
}

async function writeSongIndex(doc, patterns, songs) {
    const next = Array.isArray(doc) ? patterns : { ...doc, patterns, songs }
    await writeFile(songIndexPath(), formatPatternsWithNotesOnLine(next), 'utf8')
}

// --- Utility functions ---

function sanitizePatternFileName(name) {
    return String(name)
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_|_$/g, '')
}

function getPatternFilePath(patternName) {
    const fileName = `${sanitizePatternFileName(patternName)}.json`
    return resolve(patternsOutputDir(), fileName)
}

function resolveKitSamplePath(samplePath) {
    const normalizedSamplePath = String(samplePath).trim().replaceAll('\\', '/').replace(/^\/+/, '')
    const absolutePath = resolve(KITS_DIR, normalizedSamplePath)

    if (!absolutePath.startsWith(KITS_DIR)) {
        throw new Error(`Invalid sample path: ${samplePath}`)
    }
    return {
        absolutePath,
        relativePath: relative(KITS_DIR, absolutePath).replaceAll('\\', '/'),
    }
}

async function listSampleFiles(dirPath, baseDir = dirPath) {
    const entries = await readdir(dirPath, { withFileTypes: true })
    const files = []

    for (const entry of entries) {
        const absolutePath = resolve(dirPath, entry.name)
        if (entry.isDirectory()) {
            files.push(...(await listSampleFiles(absolutePath, baseDir)))
            continue
        }

        if (!entry.isFile() || !/\.wav$/i.test(entry.name)) {
            continue
        }

        const relativePath = absolutePath.slice(baseDir.length + 1).replaceAll('\\', '/')

        files.push(relativePath)
    }

    return files.sort((a, b) => a.localeCompare(b))
}

async function savePatternToDisk(pattern) {
    const exportedPattern = PatternExporter.export(pattern)
    const filePath = getPatternFilePath(pattern.name)
    await mkdir(patternsOutputDir(), { recursive: true })
    await writeFile(filePath, `${JSON.stringify(exportedPattern, null, 2)}\n`, 'utf8')
    return filePath
}

function normalizePattern(source) {
    const pattern = { ...source }
    delete pattern.loopPointBeat
    delete pattern.loopPointStep
    pattern.tracks = Utils.getTracksArray(source).map((t) => {
        const track = normalizeTrack(t)
        delete track.loopPointBeat
        delete track.loopPointStep
        track.notes = (t.notes ?? []).map((n) => {
            const decoded = Array.isArray(n) ? compactArrayToNote(n, t.noteKeys) : n
            return { ...normalizeNote(decoded) }
        })
        return track
    })
    return pattern
}

function findPatternByName(patternName) {
    return appState.patterns.find(
        (pattern) => pattern?.name?.toUpperCase() === String(patternName).trim().toUpperCase(),
    )
}

// --- Pattern / arrangement state shared by the tools ---------------------------

/** True once every pattern of song.json has been imported into appState. */
let libraryLoaded = false
/** Set when importing gave an id-less pattern one, so the file must be patched. */
let libraryIdsRepaired = false

/**
 * Import the whole pattern library of song.json into appState.
 *
 * Arrangements store clips as pattern **ids**, so a tool that takes a pattern
 * *name* has to be able to resolve it. The MCP server is a short-lived process:
 * the library is imported once, then kept in sync by the tools that write.
 */
async function ensureLibraryLoaded() {
    if (libraryLoaded) return
    const { patterns } = await readSongIndex()
    const cmd = new Commander()
    for (const source of patterns) {
        const name = String(source?.name ?? '').trim()
        if (!name || findPatternByName(name)) continue
        const imported = cmd.importPatternFromJson(source)
        if (!source?.id && imported?.id) libraryIdsRepaired = true
    }
    libraryLoaded = true
}

/**
 * Write the in-memory state back to song.json.
 *
 * `patterns` is only rewritten when the library import had to mint missing ids;
 * otherwise the file keeps its own (compact) entries and only `songs` changes.
 */
async function saveSongIndex(songs, patterns) {
    const { doc, patterns: filePatterns } = await readSongIndex()
    await writeSongIndex(doc, patterns ?? filePatterns, songs)
}

/**
 * Index of the arrangement a tool must act on: a name (case-insensitive), an
 * index, or nothing at all for the selected one.
 * @param {any} songRef
 * @returns {number} -1 when no arrangement matches
 */
function arrangementIndexOf(songRef) {
    const songs = appState.songs ?? []
    if (songRef === undefined || songRef === null || songRef === '') {
        return appState.selectedSongIdx ?? 0
    }
    if (Number.isInteger(songRef)) return songRef
    const needle = String(songRef).trim().toUpperCase()
    return songs.findIndex(
        (song) =>
            String(song?.name ?? '')
                .trim()
                .toUpperCase() === needle,
    )
}

/**
 * Load song.json's arrangements into appState and select the targeted one.
 *
 * Cloned rather than validated: song.json is written by the app and already
 * normalized on load, so a tool must round-trip it byte-for-byte except for
 * what it deliberately changes.
 *
 * @param {any} songRef arrangement name or index
 * @returns {number} index of the selected arrangement, -1 when there is none
 */
async function selectArrangement(songRef) {
    await ensureLibraryLoaded()
    const { songs } = await readSongIndex()
    appState.songs = structuredClone(songs)
    const index = arrangementIndexOf(songRef)
    new Commander().setSelectedSongIdx(index < 0 ? 0 : index)
    return index
}

/** Arrangement as the tools report it: clips resolved back to pattern names. */
function arrangementToJson(song, index) {
    const nameById = new Map(appState.patterns.map((pattern) => [pattern?.id, pattern?.name ?? pattern?.id]))
    return {
        index,
        id: song.id,
        name: song.name,
        description: song.description ?? '',
        bpm: song.bpm,
        loopBars: song.loopBars ?? null,
        bars: songLengthBars(song),
        clips: (song.clips ?? []).map((clip) => ({
            pattern: clip.pattern,
            patternName: nameById.get(clip.pattern) ?? null,
            startBar: clip.startBar,
            bars: clip.bars,
        })),
    }
}

function getTrackFromType(pattern, type) {
    return Utils.getTracksArray(pattern).find((track) => track.name === type) ?? null
}

function isNoteAt(track, beat, beatStep) {
    return Object.values(track.notes).filter((n) => n.beatStep === beatStep && n.beat === beat)
}

/**
 * Convert an absolute step number to `{ beat, beatStep }` on the track grid.
 * Exported for tests — this is the conversion addNotesToPattern applies.
 */
export function stepToBeat(step, stepsPerBeat) {
    const absoluteStep = Number(step)
    return { beat: Math.floor(absoluteStep / stepsPerBeat), beatStep: absoluteStep % stepsPerBeat }
}

export function ensureTrack(cmd, pattern, trackName, stepsPerBeat = 4, loopAtStep = null) {
    const normalizedTrackName = String(trackName).trim().toUpperCase()
    let track = getTrackFromType(pattern, normalizedTrackName)
    if (!track) {
        track = cmd.addTrack(pattern, normalizedTrackName, stepsPerBeat)
        if (loopAtStep !== null) {
            track.loopAtStep = loopAtStep
        }
        // Default loopAtStep = beatCount * stepsPerBeat
    }
    return track
}

export function ensurePatternHasEnoughBeats(cmd, pattern, noteBeat) {
    const requiredBeats = Number(noteBeat) + 1
    if (Number.isNaN(requiredBeats) || requiredBeats < 1) {
        throw new Error(`Invalid beat value: ${noteBeat}`)
    }
    if (requiredBeats > pattern.beatCount) {
        cmd.setPatternBeatCount(pattern, Math.ceil(requiredBeats / 4) * 4)
    }
}

export function upsertNoteOnTrack(cmd, track, noteInput) {
    const beat = Number(noteInput.beat)
    const beatStep = Number(noteInput.beatStep ?? noteInput.step)

    if (!Number.isInteger(beat) || beat < 0) throw new Error(`Invalid beat value: ${noteInput.beat}`)
    if (!Number.isInteger(beatStep) || beatStep < 0) throw new Error(`Invalid step value: ${beatStep}`)

    const existingNote = isNoteAt(track, beat, beatStep)[0]
    const note = existingNote ?? cmd.addNote(track, beat, beatStep, Number(noteInput.pitch ?? 0))

    note.name = noteInput.name ?? note.name
    note.velocity = Number(noteInput.velocity ?? note.velocity ?? 0.8)
    note.pan = Number(noteInput.pan ?? note.pan ?? 0)
    note.pitch = Number(noteInput.pitch ?? note.pitch ?? 0)
    note.arp = noteInput.arp ?? note.arp ?? null
    note.every = Math.min(Math.max(Number(noteInput.every ?? note.every ?? 1), 1), 16)
    note.pos = Math.min(Math.max(Number(noteInput.pos ?? note.pos ?? 0), 0), 15)
    note.prob = Math.min(Math.max(Number(noteInput.prob ?? note.prob ?? 1), 0), 1)
    note.arpTriggerProbability = Math.min(
        Math.max(Number(noteInput.arpTriggerProbability ?? note.arpTriggerProbability ?? 1), 0),
        1,
    )
    note.retriggerNum = Math.min(Math.max(Number(noteInput.retriggerNum ?? note.retriggerNum ?? 1), 1), 16)
    note.rate = Math.min(Math.max(Number(noteInput.rate ?? note.rate ?? 1), 1), 16)
    note.euclideanFill = Math.min(Math.max(Number(noteInput.euclideanFill ?? note.euclideanFill ?? 0), 0), 16)
    note.euclideanRotation = Math.min(
        Math.max(Number(noteInput.euclideanRotation ?? note.euclideanRotation ?? 0), 0),
        15,
    )

    return existingNote ? 'updated' : 'created'
}

/**
 * The pattern a tool must edit: already in memory, else imported from song.json.
 * @param {string} patternName
 * @returns {Promise<any|null>}
 */
async function loadPatternFromJson(patternName) {
    let pattern = findPatternByName(patternName)
    if (!pattern) {
        const { patterns } = await readSongIndex()
        const sourcePattern = patterns.find((p) => p.name === patternName)
        if (sourcePattern) {
            const cmd = new Commander()
            pattern = cmd.importPatternFromJson(sourcePattern)
        }
    }
    return pattern
}

/** Replace a pattern's entry in song.json, leaving the rest of the file alone. */
async function updatePatternInIndex(pattern) {
    const { doc, patterns, songs } = await readSongIndex()
    const idx = patterns.findIndex((p) => p.name === pattern.name)
    if (idx >= 0) {
        patterns[idx] = pattern
    }
    await writeSongIndex(doc, patterns, songs)
}

/** Append a pattern to song.json and write it back, arrangements untouched. */
async function addPatternToIndex(pattern) {
    const { doc, patterns, songs } = await readSongIndex()
    patterns.push(pattern)
    await writeSongIndex(doc, patterns, songs)
}

// --- Tool catalog (importable by tests — stdio wiring only when run as main) ---

const num = (key, description) => {
    const range = TRACK_VALUE_RANGES[key]
    return range
        ? { type: 'number', minimum: range.min, maximum: range.max, description }
        : { type: 'number', description }
}
const int = (key, description) => ({ ...num(key, description), type: 'integer' })
const bool = (description) => ({ type: 'boolean', description })
const lfo = (description) => ({
    type: ['object', 'null'],
    description,
    properties: {
        type: { type: 'string', enum: Utils.waveList },
        freq: { type: 'number', description: 'Cycles per pattern' },
        min: { type: 'number', description: 'Modulation floor' },
        max: { type: 'number', description: 'Modulation ceiling' },
        phase: { type: 'number', description: 'Phase offset (0-1)' },
    },
})

export const tools = [
    {
        name: 'createNewPattern',
        description: 'Creates a new empty pattern',
        inputSchema: {
            type: 'object',
            properties: {
                patternName: { type: 'string', minLength: 1 },
            },
            required: ['patternName'],
        },
    },
    {
        name: 'addNotesToPattern',
        description:
            'Adds multiple notes to a pattern using absolute step numbers. Converts step to beat/beatStep internally.',
        inputSchema: {
            type: 'object',
            properties: {
                patternName: { type: 'string', description: 'Name of the pattern' },
                notes: {
                    type: 'array',
                    description: 'Array of notes to add',
                    items: {
                        type: 'object',
                        properties: {
                            trackName: { type: 'string', description: 'Instrument name (e.g., KICK, SNARE)' },
                            step: { type: 'integer', minimum: 0, description: 'Absolute step number (0-based)' },
                            velocity: { type: 'number', minimum: 0, maximum: 1, default: 0.8 },
                            pan: { type: 'number', minimum: -1, maximum: 1, default: 0 },
                            pitch: { type: 'number', default: 0 },
                            every: {
                                type: 'integer',
                                minimum: 1,
                                maximum: 16,
                                description: 'Play every N-th loop',
                            },
                            pos: {
                                type: 'integer',
                                minimum: 0,
                                maximum: 15,
                                description: 'Phase offset for trigger frequency',
                            },
                            prob: { type: 'number', minimum: 0, maximum: 1, default: 1 },
                            arpTriggerProbability: { type: 'number', minimum: 0, maximum: 1, default: 1 },
                            retriggerNum: {
                                type: 'integer',
                                minimum: 1,
                                maximum: 16,
                                description: 'Number of retriggers (1-16)',
                            },
                            rate: {
                                type: 'integer',
                                minimum: 1,
                                maximum: 16,
                                description: 'Retrigger step spacing (1-16)',
                            },
                            arp: {
                                type: 'string',
                                description: 'Arpeggio pattern (up, down, upDown, random, or custom indices)',
                            },
                            euclideanFill: {
                                type: 'integer',
                                minimum: 0,
                                maximum: 16,
                                description: 'Euclidean pulses (0-16, 0=disabled)',
                            },
                            euclideanRotation: {
                                type: 'integer',
                                minimum: 0,
                                maximum: 15,
                                description: 'Euclidean phase rotation in steps (0-15)',
                            },
                        },
                        required: ['trackName', 'step'],
                    },
                },
            },
            required: ['patternName', 'notes'],
        },
    },
    {
        name: 'updateTrack',
        description: 'Updates or creates a track with global properties and per-note overrides',
        inputSchema: {
            type: 'object',
            properties: {
                patternName: { type: 'string' },
                trackName: { type: 'string' },
                updates: {
                    type: 'object',
                    description:
                        'Track-level properties to set. Numeric ranges come from TRACK_VALUE_RANGES (the app clamps out-of-range values). See MCP_TOOLS.md for details.',
                    properties: {
                        velocity: num('velocity', 'Global track velocity'),
                        pan: num('pan', 'Stereo pan'),
                        pitch: num('pitch', 'Pitch offset in semitones'),
                        mute: bool('Mute the track'),
                        solo: bool('Solo the track'),
                        auto: bool('Auto (generator) mode'),
                        useSoftSynth: bool('Use software synthesis instead of samples'),
                        mono: bool('Mono mode (cut previous note on same track)'),
                        useAutoAssignSound: bool('Auto-assign the sound matching the track name'),
                        soundId: { type: 'string', description: 'Assigned sound URL/id' },
                        synthSoundKey: {
                            type: ['string', 'null'],
                            description: 'Synth preset key (e.g. "BASS1"); null unlinks',
                        },
                        filterType: {
                            type: 'string',
                            enum: [
                                'lowpass',
                                'highpass',
                                'bandpass',
                                'notch',
                                'peaking',
                                'lowshelf',
                                'highshelf',
                                'allpass',
                            ],
                            description: 'Filter type',
                        },
                        filterFreq: num('filterFreq', 'Filter cutoff frequency in Hz'),
                        filterQ: num('filterQ', 'Filter resonance / Q factor'),
                        reverbType: {
                            type: 'string',
                            enum: ['none', 'room', 'hall', 'plate', 'spring', 'gated'],
                            description: 'Reverb preset',
                        },
                        reverbAmount: num('reverbAmount', 'Reverb wet/dry mix'),
                        reverbOn: bool('Reverb enabled'),
                        delayType: {
                            type: 'string',
                            enum: ['none', 'slap', 'tape', 'pingpong'],
                            description: 'Delay type',
                        },
                        delayTime: num('delayTime', 'Delay time (beat multiplier, e.g. 1 = one beat)'),
                        delayDepth: num('delayDepth', 'Delay wet/dry mix'),
                        delayOn: bool('Delay enabled'),
                        saturationType: {
                            type: 'string',
                            enum: ['soft', 'hard', 'tape'],
                            description: 'Saturation / distortion type',
                        },
                        saturationAmount: num('saturationAmount', 'Saturation drive'),
                        sat: bool('Saturation enabled'),
                        fxSelected: {
                            type: 'string',
                            description: 'FX slot selected in the track editor (default "reverb")',
                        },
                        loopAtStep: int('loopAtStep', 'Loop point (absolute step index)'),
                        stepsPerBeat: int('stepsPerBeat', 'Steps per beat (subdivision)'),
                        beatCount: int('beatCount', 'Number of beats for this track'),
                        swingResolution: int('swingResolution', 'Swing grid resolution (1-8)'),
                        swingAmount: num('swingAmount', 'Swing intensity'),
                        variation: num('variation', 'Track variation (randomization budget 0-100)'),
                        variation2: num('variation2', 'Second variation pass (budget 0-100)'),
                        probability: {
                            type: 'number',
                            minimum: 0,
                            maximum: 1,
                            description: 'Generation probability',
                        },
                        ...Object.fromEntries(
                            [
                                'prob_pitch',
                                'prob_velocity',
                                'prob_silence',
                                'prob_fill',
                                'prob_ghost',
                                'prob_retrig',
                                'prob_euclid',
                                'prob_note',
                                'prob_arp',
                            ].map((key) => [key, num(key, 'Generation weight (%)')]),
                        ),
                        pitch_range: int('pitch_range', 'Generation pitch range (semitones)'),
                        pitch_scale_lock: bool('Lock generated pitches to the scale'),
                        auto_variant: {
                            type: 'string',
                            enum: ['', 'basic', 'fill', 'roll', 'sparse', 'dense'],
                            description: 'Auto-generate variant',
                        },
                        auto_density: num('auto_density', 'Auto-generate density (-1 = auto)'),
                        velocityLfo: lfo('LFO modulating velocity'),
                        pitchLfo: lfo('LFO modulating pitch'),
                        panLfo: lfo('LFO modulating pan'),
                        filterFreqLfo: lfo('LFO modulating filter cutoff'),
                        filterQLfo: lfo('LFO modulating filter Q'),
                    },
                },
                noteUpdates: {
                    type: 'object',
                    description: 'Note-level properties to apply to all notes in the track',
                    properties: {
                        every: { type: 'number', minimum: 1, maximum: 16 },
                        pos: { type: 'number', minimum: 0, maximum: 15 },
                        prob: { type: 'number', minimum: 0, maximum: 1 },
                        arpTriggerProbability: { type: 'number', minimum: 0, maximum: 1 },
                        retriggerNum: { type: 'number', minimum: 1, maximum: 16 },
                        rate: { type: 'number', minimum: 1, maximum: 16 },
                        arp: { type: 'string' },
                        euclideanFill: { type: 'integer', minimum: 0, maximum: 16 },
                        euclideanRotation: { type: 'integer', minimum: 0, maximum: 15 },
                        velocity: { type: 'number', minimum: 0, maximum: 1 },
                        pan: { type: 'number', minimum: -1, maximum: 1 },
                        pitch: { type: 'number' },
                    },
                },
            },
            required: ['patternName', 'trackName', 'updates'],
        },
    },
    {
        name: 'savePatternToJson',
        description: 'Saves a pattern to a JSON file',
        inputSchema: {
            type: 'object',
            properties: { patternName: { type: 'string' } },
            required: ['patternName'],
        },
    },

    {
        name: 'listAllInstrumentsNames',
        description: 'Returns the list of all instrument IDs from InstrumentsManager (valid track names for MCP)',
        inputSchema: { type: 'object', properties: {} },
    },
    {
        name: 'listPatterns',
        description: 'Returns the list of all patterns from song.json',
        inputSchema: { type: 'object', properties: {} },
    },
    {
        name: 'loadPattern',
        description: 'Loads a pattern by name and returns its full data',
        inputSchema: {
            type: 'object',
            properties: {
                patternName: { type: 'string', minLength: 1 },
            },
            required: ['patternName'],
        },
    },
    {
        name: 'listKitSamples',
        description: 'Lists all WAV samples in the kits directory',
        inputSchema: { type: 'object', properties: {} },
    },
    {
        name: 'analyzeSamples',
        description: 'Audio analysis on a list of samples',
        inputSchema: {
            type: 'object',
            properties: {
                samples: { type: 'array', items: { type: 'string' } },
            },
            required: ['samples'],
        },
    },
    {
        name: 'setPatternBpm',
        description: 'Sets the BPM (tempo) of a pattern',
        inputSchema: {
            type: 'object',
            properties: {
                patternName: { type: 'string' },
                bpm: { type: 'number', minimum: 20, maximum: 300 },
            },
            required: ['patternName', 'bpm'],
        },
    },
    {
        name: 'setPatternTags',
        description: 'Sets tags (categories/genre) for a pattern',
        inputSchema: {
            type: 'object',
            properties: {
                patternName: { type: 'string' },
                tags: { type: 'array', items: { type: 'string' } },
            },
            required: ['patternName', 'tags'],
        },
    },
    {
        name: 'setPatternBeatCount',
        description: 'Sets the number of beats for a pattern',
        inputSchema: {
            type: 'object',
            properties: {
                patternName: { type: 'string' },
                beatCount: { type: 'integer', minimum: 1, maximum: 16 },
            },
            required: ['patternName', 'beatCount'],
        },
    },
    {
        name: 'setPatternDescription',
        description: 'Sets the description text for a pattern',
        inputSchema: {
            type: 'object',
            properties: {
                patternName: { type: 'string' },
                description: { type: 'string' },
            },
            required: ['patternName', 'description'],
        },
    },

    {
        name: 'listArrangements',
        description: 'Returns the arrangements (songs) of song.json with their clips, resolved to pattern names',
        inputSchema: { type: 'object', properties: {} },
    },
    {
        name: 'createArrangement',
        description:
            'Creates an arrangement (song) and optionally fills it with clips. Bars are 0-based measures; a clip lasts as long as its pattern unless "bars" says otherwise.',
        inputSchema: {
            type: 'object',
            properties: {
                name: { type: 'string', minLength: 1, description: 'Arrangement name' },
                description: { type: 'string', description: 'Free text description' },
                bpm: { type: 'number', minimum: 20, maximum: 300, description: 'Tempo of the whole arrangement' },
                loopBars: {
                    type: 'integer',
                    minimum: 0,
                    description: 'Loop length in bars (0 = the whole arrangement loops)',
                },
                clips: {
                    type: 'array',
                    description: 'Clips to place right after creation',
                    items: {
                        type: 'object',
                        properties: {
                            patternName: { type: 'string', description: 'Pattern name (or id) to place' },
                            startBar: { type: 'integer', minimum: 0, description: '0-based measure (default 0)' },
                            bars: { type: 'number', minimum: 0, description: 'Clip length in bars' },
                        },
                        required: ['patternName'],
                    },
                },
            },
            required: ['name'],
        },
    },
    {
        name: 'addPatternToArrangement',
        description:
            'Places a pattern in an arrangement at a given bar. Clips may overlap, and the same pattern can be placed several times.',
        inputSchema: {
            type: 'object',
            properties: {
                patternName: { type: 'string', description: 'Pattern name (or id) to place' },
                startBar: { type: 'integer', minimum: 0, description: '0-based measure (default 0)' },
                bars: { type: 'number', minimum: 0, description: 'Clip length (default: the pattern length)' },
                arrangement: {
                    type: ['string', 'integer'],
                    description: 'Arrangement name or index (default: the selected one)',
                },
            },
            required: ['patternName'],
        },
    },
    {
        name: 'removePatternFromArrangement',
        description:
            'Removes clips from an arrangement: every clip starting at "startBar", every clip of "patternName", or both.',
        inputSchema: {
            type: 'object',
            properties: {
                startBar: { type: 'integer', minimum: 0, description: 'Remove every clip starting at this bar' },
                patternName: { type: 'string', description: 'Remove every clip using this pattern (name or id)' },
                arrangement: {
                    type: ['string', 'integer'],
                    description: 'Arrangement name or index (default: the selected one)',
                },
            },
        },
    },
]

export async function handleToolCall(toolName, args, onError) {
    try {
        if (toolName === 'createNewPattern') {
            const { patternName } = args
            if (!patternName) throw new Error('patternName is required')

            const cmd = new Commander()
            const pattern = cmd.addPattern(String(patternName).trim())
            const filePath = await savePatternToDisk(pattern)

            await addPatternToIndex(pattern)

            return {
                content: [{ type: 'text', text: JSON.stringify({ message: 'Pattern created', pattern, filePath }) }],
            }
        }

        if (toolName === 'addNotesToPattern') {
            const { patternName, notes: notesArg } = args
            let notes
            try {
                notes = typeof notesArg === 'string' ? JSON.parse(notesArg) : notesArg
            } catch (e) {
                throw new Error(`Invalid JSON in 'notes' argument: ${e.message}`, { cause: e })
            }

            const pattern = await loadPatternFromJson(patternName)
            if (!pattern) throw new Error(`Pattern '${patternName}' not found.`)

            const cmd = new Commander()
            const stepsPerBeat = pattern.stepsPerBeat || 4

            let cNotes = 0,
                uNotes = 0
            const existingTrackNames = new Set(pattern.tracks.map((t) => t.name))

            for (const n of notes) {
                const trackName = String(n.trackName).trim().toUpperCase()
                if (!existingTrackNames.has(trackName)) {
                    existingTrackNames.add(trackName)
                }

                const track = ensureTrack(cmd, pattern, trackName, stepsPerBeat)
                const { beat, beatStep } = stepToBeat(n.step, stepsPerBeat)

                ensurePatternHasEnoughBeats(cmd, pattern, beat)

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
                    euclideanFill: n.euclideanFill,
                    euclideanRotation: n.euclideanRotation,
                }

                const status = upsertNoteOnTrack(cmd, track, noteInput)
                status === 'created' ? cNotes++ : uNotes++
            }

            const filePath = await savePatternToDisk(pattern)

            await updatePatternInIndex(pattern)

            return {
                content: [{ type: 'text', text: JSON.stringify({ message: 'Notes added', cNotes, uNotes, filePath }) }],
            }
        }

        if (toolName === 'updateTrack') {
            const { patternName, trackName, updates, noteUpdates } = args
            const pattern = await loadPatternFromJson(patternName)
            if (!pattern) throw new Error(`Pattern '${patternName}' not found.`)

            const instrumentsManager = new InstrumentsManager()
            const searchName = updates.auto === false && updates.instId ? updates.instId : trackName
            const inst = instrumentsManager.findInstrumentFromFileName(String(searchName).trim().toUpperCase())
            const normalizedTrackName = String(inst.id).trim().toUpperCase()

            const cmd = new Commander()
            let track = cmd.getTrackFromType(pattern, normalizedTrackName)
            let action = 'updated'

            if (!track) {
                track = cmd.addTrack(pattern, normalizedTrackName)
                action = 'added'
            }

            if (!track) throw new Error(`Could not create track: ${normalizedTrackName}`)

            cmd.updateTrack(track, updates, { desc: 'MCP updateTrack' })

            let notesUpdated = 0
            if (noteUpdates) {
                const noteProps = [
                    'every',
                    'pos',
                    'prob',
                    'arpTriggerProbability',
                    'retriggerNum',
                    'rate',
                    'arp',
                    'euclideanFill',
                    'velocity',
                    'pan',
                    'pitch',
                ]
                const hasNoteProps = noteProps.some((prop) => noteUpdates[prop] !== undefined)

                if (hasNoteProps && track.notes) {
                    for (const note of track.notes) {
                        if (noteUpdates.every !== undefined)
                            note.every = Math.min(Math.max(Number(noteUpdates.every), 1), 16)
                        if (noteUpdates.pos !== undefined) note.pos = Math.min(Math.max(Number(noteUpdates.pos), 0), 15)
                        if (noteUpdates.prob !== undefined)
                            note.prob = Math.min(Math.max(Number(noteUpdates.prob), 0), 1)
                        if (noteUpdates.arpTriggerProbability !== undefined)
                            note.arpTriggerProbability = Math.min(
                                Math.max(Number(noteUpdates.arpTriggerProbability), 0),
                                1,
                            )
                        if (noteUpdates.retriggerNum !== undefined)
                            note.retriggerNum = Math.min(Math.max(Number(noteUpdates.retriggerNum), 1), 16)
                        if (noteUpdates.rate !== undefined)
                            note.rate = Math.min(Math.max(Number(noteUpdates.rate), 1), 16)
                        if (noteUpdates.arp !== undefined) note.arp = noteUpdates.arp
                        if (noteUpdates.euclideanFill !== undefined)
                            note.euclideanFill = Math.min(Math.max(Number(noteUpdates.euclideanFill), 0), 16)
                        if (noteUpdates.euclideanRotation !== undefined)
                            note.euclideanRotation = Math.min(Math.max(Number(noteUpdates.euclideanRotation), 0), 15)
                        if (noteUpdates.velocity !== undefined) note.velocity = Number(noteUpdates.velocity)
                        if (noteUpdates.pan !== undefined) note.pan = Number(noteUpdates.pan)
                        if (noteUpdates.pitch !== undefined) note.pitch = Number(noteUpdates.pitch)
                        notesUpdated++
                    }
                }
            }

            const filePath = await savePatternToDisk(pattern)

            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify({
                            message: `Track ${action} successfully`,
                            action,
                            trackName: track.name,
                            notesUpdated,
                            filePath,
                        }),
                    },
                ],
            }
        }

        if (toolName === 'savePatternToJson') {
            const { patternName } = args
            const pattern = await loadPatternFromJson(patternName)
            if (!pattern) throw new Error(`Pattern '${patternName}' not found.`)
            const filePath = await savePatternToDisk(pattern)
            return {
                content: [{ type: 'text', text: JSON.stringify({ message: 'Saved', filePath }) }],
            }
        }

        if (toolName === 'listAllInstrumentsNames') {
            const instruments = InstrumentsManager.DATA?.instruments ?? []
            const ids = instruments.map((i) => i.id).sort()
            const instrumentsList = instruments.map((i) => ({
                id: i.id,
                name: i.name?.syn ? i.name.syn[0] : i.id,
                drum: i.drum,
                pan: i.pan,
            }))
            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify({
                            instrumentNames: ids,
                            count: ids.length,
                            instruments: instrumentsList,
                        }),
                    },
                ],
            }
        }

        if (toolName === 'listPatterns') {
            try {
                const { patterns } = await readSongIndex()
                const patternNames = patterns.map((p) => p.name).sort()
                return {
                    content: [
                        { type: 'text', text: JSON.stringify({ patterns: patternNames, count: patternNames.length }) },
                    ],
                }
            } catch (err) {
                return { content: [{ type: 'text', text: JSON.stringify({ error: err.message }) }] }
            }
        }

        if (toolName === 'loadPattern') {
            const { patternName } = args
            try {
                const { patterns } = await readSongIndex()
                const source = patterns.find((p) => p.name === patternName)
                if (!source) {
                    return {
                        content: [
                            { type: 'text', text: JSON.stringify({ error: `Pattern not found: ${patternName}` }) },
                        ],
                    }
                }
                // Normalize through the model so compact / default-omitted data
                // comes back complete — read-only, app state untouched.
                return {
                    content: [{ type: 'text', text: JSON.stringify(normalizePattern(source)) }],
                }
            } catch (err) {
                return { content: [{ type: 'text', text: JSON.stringify({ error: err.message }) }] }
            }
        }

        if (toolName === 'listKitSamples') {
            const samples = await listSampleFiles(KITS_DIR)
            return { content: [{ type: 'text', text: JSON.stringify({ count: samples.length, samples }) }] }
        }

        if (toolName === 'analyzeSamples') {
            const { samples } = args
            const analyzer = new AudioAnalyzer()
            const results = []
            for (const s of samples) {
                try {
                    const { absolutePath, relativePath } = resolveKitSamplePath(s)
                    const buf = await readFile(absolutePath)
                    results.push({ samplePath: relativePath, analysis: analyzer.analyzeWavBuffer(buf) })
                } catch (e) {
                    results.push({ samplePath: s, error: e.message })
                }
            }
            return { content: [{ type: 'text', text: JSON.stringify({ results }) }] }
        }

        if (toolName === 'setPatternBpm') {
            const { patternName, bpm } = args
            const pattern = await loadPatternFromJson(patternName)
            if (!pattern) throw new Error(`Pattern '${patternName}' not found.`)

            const cmd = new Commander()
            cmd.setPatternBpm(pattern, Number(bpm))
            const filePath = await savePatternToDisk(pattern)
            await updatePatternInIndex(pattern)

            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify({
                            message: 'BPM updated',
                            patternName: pattern.name,
                            bpm: pattern.bpm,
                            filePath,
                        }),
                    },
                ],
            }
        }

        if (toolName === 'setPatternTags') {
            const { patternName, tags } = args
            const pattern = await loadPatternFromJson(patternName)
            if (!pattern) throw new Error(`Pattern '${patternName}' not found.`)

            pattern.tags = Array.isArray(tags) ? tags : []
            const filePath = await savePatternToDisk(pattern)
            await updatePatternInIndex(pattern)

            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify({
                            message: 'Tags updated',
                            patternName: pattern.name,
                            tags: pattern.tags,
                            filePath,
                        }),
                    },
                ],
            }
        }

        if (toolName === 'setPatternBeatCount') {
            const { patternName, beatCount } = args
            const pattern = await loadPatternFromJson(patternName)
            if (!pattern) throw new Error(`Pattern '${patternName}' not found.`)

            const cmd = new Commander()
            cmd.setPatternBeatCount(pattern, Number(beatCount))
            const filePath = await savePatternToDisk(pattern)
            await updatePatternInIndex(pattern)

            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify({
                            message: 'Number of beats updated',
                            patternName: pattern.name,
                            beatCount: pattern.beatCount,
                            filePath,
                        }),
                    },
                ],
            }
        }

        if (toolName === 'setPatternDescription') {
            const { patternName, description } = args
            const pattern = await loadPatternFromJson(patternName)
            if (!pattern) throw new Error(`Pattern '${patternName}' not found.`)

            pattern.description = String(description ?? '')
            const filePath = await savePatternToDisk(pattern)
            await updatePatternInIndex(pattern)

            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify({
                            message: 'Description updated',
                            patternName: pattern.name,
                            description: pattern.description,
                            filePath,
                        }),
                    },
                ],
            }
        }

        if (toolName === 'listArrangements') {
            await ensureLibraryLoaded()
            const { songs } = await readSongIndex()
            appState.songs = structuredClone(songs)
            const arrangements = appState.songs.map((song, index) => arrangementToJson(song, index))
            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify({
                            arrangements,
                            count: arrangements.length,
                            selectedIdx: appState.selectedSongIdx ?? 0,
                        }),
                    },
                ],
            }
        }

        if (toolName === 'createArrangement') {
            const { name, description, bpm, loopBars, clips } = args
            if (!name) throw new Error('name is required')

            await ensureLibraryLoaded()
            const { songs } = await readSongIndex()
            appState.songs = structuredClone(songs)

            const cmd = new Commander()
            const song = cmd.addArrangement({ name, description, bpm, loopBars })
            if (!song) throw new Error(`Could not create arrangement "${name}"`)

            const placed = []
            const skipped = []
            for (const clip of Array.isArray(clips) ? clips : []) {
                const added = cmd.addPatternAtBar(clip?.patternName, clip?.startBar ?? 0, { bars: clip?.bars })
                if (added) placed.push(added)
                else skipped.push({ patternName: clip?.patternName, startBar: clip?.startBar ?? 0 })
            }

            await saveSongIndex(appState.songs, libraryIdsRepaired ? appState.patterns : undefined)

            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify({
                            message: 'Arrangement created',
                            arrangement: arrangementToJson(song, appState.songs.length - 1),
                            placedClips: placed.length,
                            skippedClips: skipped,
                        }),
                    },
                ],
            }
        }

        if (toolName === 'addPatternToArrangement') {
            const { patternName, startBar = 0, bars, arrangement } = args
            if (!patternName) throw new Error('patternName is required')

            const index = await selectArrangement(arrangement)
            if (index < 0 || !appState.songs?.[index]) {
                throw new Error(`Arrangement "${arrangement ?? index}" not found`)
            }

            const cmd = new Commander()
            const clip = cmd.addPatternAtBar(patternName, startBar, { bars, songIdx: index })
            if (!clip) throw new Error(`Could not place "${patternName}" — is that pattern name known?`)

            await saveSongIndex(appState.songs, libraryIdsRepaired ? appState.patterns : undefined)

            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify({
                            message: 'Pattern placed in the arrangement',
                            arrangement: arrangementToJson(appState.songs[index], index),
                            clip,
                        }),
                    },
                ],
            }
        }

        if (toolName === 'removePatternFromArrangement') {
            const { startBar, patternName, arrangement } = args
            if (startBar === undefined && !patternName) {
                throw new Error('Provide "startBar", "patternName", or both')
            }

            const index = await selectArrangement(arrangement)
            if (index < 0 || !appState.songs?.[index]) {
                throw new Error(`Arrangement "${arrangement ?? index}" not found`)
            }

            const cmd = new Commander()
            let removed = []
            if (startBar !== undefined) {
                removed = removed.concat(cmd.removePatternAtBar(startBar, { songIdx: index }))
            }
            if (patternName) {
                removed = removed.concat(cmd.removePatternClips(patternName, { songIdx: index }))
            }
            if (removed.length === 0) throw new Error('No matching clip to remove')

            await saveSongIndex(appState.songs)

            return {
                content: [
                    {
                        type: 'text',
                        text: JSON.stringify({
                            message: `${removed.length} clip(s) removed`,
                            arrangement: arrangementToJson(appState.songs[index], index),
                            removed,
                        }),
                    },
                ],
            }
        }

        throw new Error(`Unknown tool: ${toolName}`)
    } catch (error) {
        if (onError) onError(error)

        return {
            isError: true,
            content: [
                {
                    type: 'text',
                    text: JSON.stringify(
                        {
                            status: 'error',
                            tool: toolName,
                            message: error.message,
                        },
                        null,
                        2,
                    ),
                },
            ],
        }
    }
}

// --- Stdio wiring (only when spawned as `node ordrumboxMcpserver.mjs`) ---

const isMain = Boolean(process.argv[1] && resolve(process.argv[1]) === __filename)

if (isMain) {
    // Log to stderr to preserve the JSON-RPC stream on stdout
    const mcpLogger = new console.Console({
        stdout: process.stderr,
        stderr: process.stderr,
    })
    console.log = (...logArgs) => mcpLogger.log(...logArgs)
    console.warn = (...warnArgs) => mcpLogger.warn(...warnArgs)
    console.error = (...errorArgs) => mcpLogger.error(...errorArgs)

    const server = new Server(
        {
            name: 'ordrumbox-mcp-server',
            version: '1.1.0',
        },
        {
            capabilities: { tools: {} },
        },
    )

    server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }))
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
        const toolName = request.params.name
        // Log stack traces to stderr (JSON-RPC owns stdout)
        return handleToolCall(toolName, request.params.arguments ?? {}, (error) =>
            console.error(`ERROR in ${toolName}:`, error.stack),
        )
    })

    const transport = new StdioServerTransport()
    await server.connect(transport)
}
