import { appState } from '../state/app_state.js'
import { serviceRegistry } from '../state/service_registry.js'
import { soundRegistry } from '../state/sound_registry.js'
import { playbackEvents } from '../state/playback_events.js'
import { TICK } from '../core/constants.js'
import Utils from '../core/utils.js'
import InstrumentsManager from '../logic/services/instruments_manager.js'
import { logger } from '../core/logger.js'

const TAG = 'WebMCP'

function getMfCmd() { return serviceRegistry.mfCmd ?? null }
function getMfSeq() { return serviceRegistry.mfSeq ?? null }

function getCurrentPattern() {
    return appState.patterns[appState.selectedPatternNum] ?? null
}

function findPatternByName(name) {
    const upper = String(name ?? '').trim().toUpperCase()
    return appState.patterns.find(p => p?.name?.toUpperCase() === upper) ?? null
}

function findTrack(pattern, trackName) {
    const upper = String(trackName ?? '').trim().toUpperCase()
    return Utils.getTracksArray(pattern).find(t => t.name === upper) ?? null
}

function upsertNote(mfCmd, track, noteInput) {
    const bar = Number(noteInput.bar)
    const barStep = Number(noteInput.barStep ?? noteInput.step)
    if (!Number.isInteger(bar) || bar < 0) throw new Error(`Invalid bar: ${noteInput.bar}`)
    if (!Number.isInteger(barStep) || barStep < 0) throw new Error(`Invalid step: ${barStep}`)

    const existing = mfCmd.isNoteAt(track, bar, barStep)[0]
    const note = existing ?? mfCmd.addNote(track, bar, barStep, Number(noteInput.pitch ?? 0))

    if (noteInput.name !== undefined) note.name = noteInput.name
    if (noteInput.velocity !== undefined) note.velocity = Number(noteInput.velocity)
    if (noteInput.pan !== undefined) note.pan = Number(noteInput.pan)
    if (noteInput.pitch !== undefined) note.pitch = Number(noteInput.pitch)
    if (noteInput.arp !== undefined) note.arp = noteInput.arp
    if (noteInput.triggerFreq !== undefined) note.triggerFreq = Number(noteInput.triggerFreq)
    if (noteInput.triggerPhase !== undefined) note.triggerPhase = Number(noteInput.triggerPhase)
    if (noteInput.triggerProbability !== undefined) note.triggerProbability = Math.min(Math.max(Number(noteInput.triggerProbability), 0), 1)
    if (noteInput.arpTriggerProbability !== undefined) note.arpTriggerProbability = Math.min(Math.max(Number(noteInput.arpTriggerProbability), 0), 1)
    if (noteInput.retriggerNum !== undefined) note.retriggerNum = Number(noteInput.retriggerNum)
    if (noteInput.retriggerStep !== undefined) note.retriggerStep = Number(noteInput.retriggerStep)
    if (noteInput.euclidianFill !== undefined) note.euclidianFill = Number(noteInput.euclidianFill)

    return existing ? 'updated' : 'created'
}

function ensureTrack(mfCmd, pattern, trackName, barQuantize = 4) {
    const upper = String(trackName).trim().toUpperCase()
    let track = mfCmd.getTrackFromType(pattern, upper)
    if (!track) {
        track = mfCmd.addTrack(pattern, upper, barQuantize)
    }
    return track
}

function ensurePatternBars(mfCmd, pattern, noteBar) {
    const required = Number(noteBar) + 1
    if (!Number.isNaN(required) && required > pattern.nbBars) {
        mfCmd.setNbBar(pattern, Math.ceil(required / 4))
    }
}

function formatResult(data) {
    return { content: [{ type: 'text', text: JSON.stringify(data) }] }
}

function formatError(message) {
    return { isError: true, content: [{ type: 'text', text: JSON.stringify({ error: message }) }] }
}

const tools = [
    // ── Pattern (read) ──────────────────────────────────────────────
    {
        name: 'patterns_list',
        description: 'Lists all pattern names available in the current session',
        inputSchema: { type: 'object', properties: {} },
        execute: async () => {
            const patterns = appState.patterns.map(p => p.name ?? 'Unnamed')
            return formatResult({ patterns, count: patterns.length })
        }
    },
    {
        name: 'pattern_get',
        description: 'Returns a full pattern with all tracks and notes',
        inputSchema: {
            type: 'object',
            properties: {
                patternName: { type: 'string', description: 'Pattern name (case-insensitive)' }
            },
            required: ['patternName']
        },
        execute: async ({ patternName }) => {
            const pattern = findPatternByName(patternName)
            if (!pattern) return formatError(`Pattern not found: ${patternName}`)
            return formatResult({
                name: pattern.name,
                description: pattern.description ?? '',
                bpm: pattern.bpm,
                nbBars: pattern.nbBars,
                tracks: Utils.getTracksArray(pattern).map(t => ({
                    name: t.name,
                    bars: t.bars,
                    barQuantize: t.barQuantize,
                    velocity: t.velocity,
                    pitch: t.pitch,
                    pan: t.pan,
                    mute: t.mute,
                    solo: t.solo,
                    useSoftSynth: t.useSoftSynth,
                    filterType: t.filterType,
                    filterFreq: t.filterFreq,
                    filterQ: t.filterQ,
                    reverbType: t.reverbType,
                    reverbAmount: t.reverbAmount,
                    notes: (t.notes ?? []).map(n => ({
                        bar: n.bar,
                        barStep: n.barStep,
                        velocity: n.velocity,
                        pan: n.pan,
                        pitch: n.pitch
                    }))
                }))
            })
        }
    },
    {
        name: 'instruments_list',
        description: 'Returns all available instrument IDs and names',
        inputSchema: { type: 'object', properties: {} },
        execute: async () => {
            const instruments = InstrumentsManager.DATA?.instruments ?? []
            return formatResult({
                instruments: instruments.map(i => ({
                    id: i.id,
                    name: i.name?.syn?.[0] ?? i.id,
                    drum: i.drum
                })),
                count: instruments.length
            })
        }
    },

    // ── Pattern (write) ─────────────────────────────────────────────
    {
        name: 'pattern_create',
        description: 'Creates a new empty pattern and selects it',
        inputSchema: {
            type: 'object',
            properties: {
                patternName: { type: 'string', minLength: 1, description: 'Name for the new pattern' }
            },
            required: ['patternName']
        },
        execute: async ({ patternName }) => {
            const mfCmd = getMfCmd()
            if (!mfCmd) return formatError('Commands not ready')
            const pattern = mfCmd.addPattern(String(patternName).trim())
            playbackEvents.dispatchPatternChange()
            return formatResult({ message: 'Pattern created', name: pattern.name })
        }
    },
    {
        name: 'pattern_setBpm',
        description: 'Sets the BPM (tempo) of a pattern',
        inputSchema: {
            type: 'object',
            properties: {
                patternName: { type: 'string' },
                bpm: { type: 'number', minimum: 20, maximum: 300 }
            },
            required: ['patternName', 'bpm']
        },
        execute: async ({ patternName, bpm }) => {
            const pattern = findPatternByName(patternName)
            if (!pattern) return formatError(`Pattern not found: ${patternName}`)
            const mfCmd = getMfCmd()
            if (!mfCmd) return formatError('Commands not ready')
            mfCmd.setPatternBpm(pattern, Number(bpm))
            getMfSeq()?.setBpm(Number(bpm))
            playbackEvents.dispatchBpmChange(Number(bpm))
            return formatResult({ message: 'BPM updated', patternName: pattern.name, bpm: pattern.bpm })
        }
    },
    {
        name: 'pattern_setBars',
        description: 'Sets the number of bars for a pattern',
        inputSchema: {
            type: 'object',
            properties: {
                patternName: { type: 'string' },
                nbBars: { type: 'integer', minimum: 1, maximum: 64 }
            },
            required: ['patternName', 'nbBars']
        },
        execute: async ({ patternName, nbBars }) => {
            const pattern = findPatternByName(patternName)
            if (!pattern) return formatError(`Pattern not found: ${patternName}`)
            const mfCmd = getMfCmd()
            if (!mfCmd) return formatError('Commands not ready')
            mfCmd.setNbBar(pattern, Number(nbBars))
            playbackEvents.dispatchPatternChange()
            return formatResult({ message: 'Bars updated', patternName: pattern.name, nbBars: pattern.nbBars })
        }
    },
    {
        name: 'pattern_addNotes',
        description: 'Adds notes to a pattern using absolute step numbers. Step is converted to bar/barStep internally.',
        inputSchema: {
            type: 'object',
            properties: {
                patternName: { type: 'string' },
                notes: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            trackName: { type: 'string', description: 'Instrument name (e.g. KICK, SNARE)' },
                            step: { type: 'integer', minimum: 0, description: 'Absolute step number (0-based)' },
                            velocity: { type: 'number', minimum: 0, maximum: 1, default: 0.8 },
                            pan: { type: 'number', minimum: -1, maximum: 1, default: 0 },
                            pitch: { type: 'number', default: 0 }
                        },
                        required: ['trackName', 'step']
                    }
                }
            },
            required: ['patternName', 'notes']
        },
        execute: async ({ patternName, notes }) => {
            const pattern = findPatternByName(patternName)
            if (!pattern) return formatError(`Pattern not found: ${patternName}`)
            const mfCmd = getMfCmd()
            if (!mfCmd) return formatError('Commands not ready')

            let parsedNotes
            try {
                parsedNotes = typeof notes === 'string' ? JSON.parse(notes) : notes
            } catch (e) {
                return formatError(`Invalid notes JSON: ${e.message}`)
            }

            const barQuantize = pattern.barQuantize ?? 4
            let cNotes = 0, uNotes = 0

            for (const n of parsedNotes) {
                const trackName = String(n.trackName).trim().toUpperCase()
                const track = ensureTrack(mfCmd, pattern, trackName, barQuantize)
                const bar = Math.floor(Number(n.step) / barQuantize)
                const barStep = Number(n.step) % barQuantize
                ensurePatternBars(mfCmd, pattern, bar)

                const status = upsertNote(mfCmd, track, {
                    bar,
                    barStep,
                    velocity: Number(n.velocity ?? 0.8),
                    pan: Number(n.pan ?? 0),
                    pitch: Number(n.pitch ?? 0)
                })
                status === 'created' ? cNotes++ : uNotes++
            }

            playbackEvents.dispatchPatternChange()
            return formatResult({ message: 'Notes added', cNotes, uNotes })
        }
    },
    {
        name: 'track_update',
        description: 'Updates track properties (filter, reverb, pan, mute, solo, etc.)',
        inputSchema: {
            type: 'object',
            properties: {
                patternName: { type: 'string' },
                trackName: { type: 'string' },
                updates: {
                    type: 'object',
                    properties: {
                        velocity: { type: 'number', minimum: 0, maximum: 1 },
                        pan: { type: 'number', minimum: -1, maximum: 1 },
                        pitch: { type: 'number' },
                        mute: { type: 'boolean' },
                        solo: { type: 'boolean' },
                        useSoftSynth: { type: 'boolean' },
                        filterType: { type: 'string', enum: ['lowpass', 'highpass', 'bandpass', 'notch', 'peaking', 'lowshelf', 'highshelf', 'allpass'] },
                        filterFreq: { type: 'number', minimum: 20, maximum: 20000 },
                        filterQ: { type: 'number', minimum: 0.707, maximum: 21 },
                        reverbType: { type: 'string', enum: ['none', 'room', 'hall', 'plate', 'spring', 'gated'] },
                        reverbAmount: { type: 'number', minimum: 0, maximum: 1 },
                        saturationType: { type: 'string', enum: ['soft', 'hard', 'tape'] },
                        saturationAmount: { type: 'number', minimum: 0, maximum: 1 },
                        delayType: { type: 'string', enum: ['tape', 'analog', 'digital'] },
                        delayTime: { type: 'number' },
                        delayAmount: { type: 'number', minimum: 0, maximum: 1 }
                    }
                }
            },
            required: ['patternName', 'trackName', 'updates']
        },
        execute: async ({ patternName, trackName, updates }) => {
            const pattern = findPatternByName(patternName)
            if (!pattern) return formatError(`Pattern not found: ${patternName}`)
            const mfCmd = getMfCmd()
            if (!mfCmd) return formatError('Commands not ready')

            const track = findTrack(pattern, trackName)
            if (!track) return formatError(`Track not found: ${trackName}`)

            mfCmd.updateTrack(track, updates)
            playbackEvents.dispatchTrackParamChange(track)
            return formatResult({ message: 'Track updated', trackName: track.name })
        }
    },

    // ── Transport ───────────────────────────────────────────────────
    {
        name: 'transport_start',
        description: 'Starts playback',
        inputSchema: { type: 'object', properties: {} },
        execute: async () => {
            const mfSeq = getMfSeq()
            if (!mfSeq) return formatError('Sequencer not ready')
            if (mfSeq.isRunning) return formatResult({ message: 'Already playing' })
            await mfSeq.start()
            return formatResult({ message: 'Playback started' })
        }
    },
    {
        name: 'transport_stop',
        description: 'Stops playback',
        inputSchema: { type: 'object', properties: {} },
        execute: async () => {
            const mfSeq = getMfSeq()
            if (!mfSeq) return formatError('Sequencer not ready')
            if (!mfSeq.isRunning) return formatResult({ message: 'Already stopped' })
            mfSeq.stop()
            return formatResult({ message: 'Playback stopped' })
        }
    },
    {
        name: 'transport_toggle',
        description: 'Toggles playback start/stop',
        inputSchema: { type: 'object', properties: {} },
        execute: async () => {
            const mfSeq = getMfSeq()
            if (!mfSeq) return formatError('Sequencer not ready')
            await mfSeq.toggleStartStop()
            return formatResult({ message: mfSeq.isRunning ? 'Playing' : 'Stopped' })
        }
    },
    {
        name: 'transport_getState',
        description: 'Returns the current sequencer state (tick, bar, isRunning)',
        inputSchema: { type: 'object', properties: {} },
        execute: async () => {
            const mfSeq = getMfSeq()
            if (!mfSeq) return formatError('Sequencer not ready')
            const pattern = getCurrentPattern()
            const nbTicks = TICK * (pattern?.nbBars ?? 4)
            const tick = mfSeq.tick
            const loopTick = nbTicks > 0 ? tick % nbTicks : 0
            const currentBar = pattern ? Math.floor(loopTick / TICK) : 0
            const BARS_PER_PAGE = 4
            return formatResult({
                isRunning: mfSeq.isRunning,
                tick,
                currentBar,
                currentPage: appState.currentPage,
                patternName: pattern?.name ?? null,
                bpm: pattern?.bpm ?? null
            })
        }
    },

    // ── UI / Navigation ─────────────────────────────────────────────
    {
        name: 'ui_selectPattern',
        description: 'Selects a pattern by name in the UI',
        inputSchema: {
            type: 'object',
            properties: {
                patternName: { type: 'string' }
            },
            required: ['patternName']
        },
        execute: async ({ patternName }) => {
            const idx = appState.patterns.findIndex(
                p => p?.name?.toUpperCase() === String(patternName).trim().toUpperCase()
            )
            if (idx < 0) return formatError(`Pattern not found: ${patternName}`)
            const mfCmd = getMfCmd()
            if (!mfCmd) return formatError('Commands not ready')
            await mfCmd.setSelectedPatternNum(idx)
            playbackEvents.dispatchPatternChange()
            return formatResult({ message: 'Pattern selected', patternName: appState.patterns[idx].name })
        }
    },
    {
        name: 'ui_setPage',
        description: 'Sets the displayed page (0-based)',
        inputSchema: {
            type: 'object',
            properties: {
                page: { type: 'integer', minimum: 0, description: 'Page number (0-based)' }
            },
            required: ['page']
        },
        execute: async ({ page }) => {
            appState.currentPage = Number(page)
            playbackEvents.dispatchPatternChange()
            return formatResult({ message: 'Page set', page: appState.currentPage })
        }
    },
    {
        name: 'track_mute',
        description: 'Mutes or unmutes a track',
        inputSchema: {
            type: 'object',
            properties: {
                trackName: { type: 'string' },
                mute: { type: 'boolean', description: 'true to mute, false to unmute' }
            },
            required: ['trackName', 'mute']
        },
        execute: async ({ trackName, mute }) => {
            const pattern = getCurrentPattern()
            if (!pattern) return formatError('No pattern selected')
            const mfCmd = getMfCmd()
            if (!mfCmd) return formatError('Commands not ready')
            const track = findTrack(pattern, trackName)
            if (!track) return formatError(`Track not found: ${trackName}`)
            mfCmd.updateTrack(track, { mute: Boolean(mute) })
            playbackEvents.dispatchTrackParamChange(track)
            return formatResult({ message: mute ? 'Muted' : 'Unmuted', trackName: track.name })
        }
    },
    {
        name: 'track_solo',
        description: 'Solos or unsolos a track',
        inputSchema: {
            type: 'object',
            properties: {
                trackName: { type: 'string' },
                solo: { type: 'boolean', description: 'true to solo, false to unsolo' }
            },
            required: ['trackName', 'solo']
        },
        execute: async ({ trackName, solo }) => {
            const pattern = getCurrentPattern()
            if (!pattern) return formatError('No pattern selected')
            const mfCmd = getMfCmd()
            if (!mfCmd) return formatError('Commands not ready')
            const track = findTrack(pattern, trackName)
            if (!track) return formatError(`Track not found: ${trackName}`)
            mfCmd.updateTrack(track, { solo: Boolean(solo) })
            playbackEvents.dispatchTrackParamChange(track)
            return formatResult({ message: solo ? 'Soloed' : 'Unsoloed', trackName: track.name })
        }
    },
    {
        name: 'sound_preview',
        description: 'Previews a sound by track index (plays it once)',
        inputSchema: {
            type: 'object',
            properties: {
                trackIndex: { type: 'integer', minimum: 0, description: 'Track index in the current pattern' }
            },
            required: ['trackIndex']
        },
        execute: async ({ trackIndex }) => {
            const mfSeq = getMfSeq()
            if (!mfSeq) return formatError('Sequencer not ready')
            await mfSeq.simpleBeep(Number(trackIndex))
            return formatResult({ message: 'Preview triggered', trackIndex })
        }
    }
]

export function initWebMcpTools() {
    const ctx = typeof document !== 'undefined'
        ? (document.modelContext ?? navigator.modelContext)
        : null

    if (typeof ctx?.registerTool !== 'function') {
        logger.warn(TAG, 'WebMCP not available in this browser — tools not registered')
        return
    }

    let registered = 0
    for (const tool of tools) {
        try {
            ctx.registerTool({
                name: tool.name,
                description: tool.description,
                inputSchema: tool.inputSchema,
                execute: tool.execute
            })
            registered++
        } catch (e) {
            logger.warn(TAG, 'Failed to register tool', tool.name, e.message)
        }
    }

    logger.log(TAG, `Registered ${registered}/${tools.length} WebMCP tools`)
}
