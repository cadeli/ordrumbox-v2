import { appState } from '../../state/app_state.js'
import { serviceRegistry } from '../../state/service_registry.js'
import { soundRegistry } from '../../state/sound_registry.js'
import { TICK, MIDI_MAX_BEATS, MIDI_MAX_PATTERNS } from '../../core/constants.js'
import { parseMidi, findAllNotes, extractProgramChanges, midiVelocityToNormalized } from '../midi/midi_parser.js'
import { C3_MIDI_NOTE } from '../midi/midi_exporter.js'
import { instrumentsManager, GM_DRUM_NAMES, GM_PROGRAM_NAMES } from './instruments_manager.js'
import { logger } from '../../core/logger.js'
import { showToast } from '../../ui/toast.js'

export default class MidiImportService {
    /**
     * Import a MIDI file and create patterns from it.
     * @param {File} file - MIDI file from input element
     * @returns {Promise<{trackCount: number, patternCount: number}>}
     */
    async importFile(file) {
        logger.debug('MidiImport', `parsing "${file.name}" (${file.size} bytes)`)
        const arrayBuffer = await file.arrayBuffer()
        const midiData = parseMidi(new Uint8Array(arrayBuffer))

        logger.debug('MidiImport', `format: ${midiData.header.format}, tracks: ${midiData.tracks.length}, division: ${midiData.header.division}, tempo: ${midiData.header.tempo ?? 'none'}`)

        const notes = findAllNotes(midiData)
        if (notes.length === 0) {
            logger.warn('MidiImport', 'no Note On events found — file may be type-0 with only track 0, or empty')
            showToast('No MIDI notes found in file', 'warning')
            return { trackCount: 0, patternCount: 0 }
        }
        logger.debug('MidiImport', `found ${notes.length} note-on events`)

        const channelPrograms = extractProgramChanges(midiData)
        logger.debug('MidiImport', `program changes: ${[...channelPrograms.entries()].map(([ch, pr]) => `ch${ch}=pr${pr}`).join(', ') || 'none'}`)

        const im = instrumentsManager

        const channelNotes = new Map()
        const channelTrackNames = new Map()
        for (const note of notes) {
            if (!channelNotes.has(note.channel)) channelNotes.set(note.channel, [])
            channelNotes.get(note.channel).push(note)
            if (!channelTrackNames.has(note.channel)) {
                channelTrackNames.set(note.channel, midiData.trackNames[note.trackIdx] ?? '')
            }
        }
        logger.debug('MidiImport', `channels with notes: ${[...channelNotes.keys()].join(', ')} (${[...channelNotes.values()].map(n => n.length).join('+')} notes)`)

        const { trackDefs } = this._resolveTrackDefs(channelNotes, channelTrackNames, channelPrograms, im)

        this._logImportSummary(trackDefs)

        if (trackDefs.length === 0) {
            logger.warn('MidiImport', 'no matching instruments — dumping channel/note summary:')
            for (const [channel, chNotes] of channelNotes) {
                const noteNums = [...new Set(chNotes.map(n => n.note))].sort((a, b) => a - b)
                logger.warn('MidiImport', `  ch${channel}: notes [${noteNums.join(', ')}], program=${channelPrograms.get(channel) ?? 'none'}, count=${chNotes.length}`)
            }
            showToast('No matching instruments found in MIDI file', 'warning')
            return { trackCount: 0, patternCount: 0 }
        }

        const baseName = file.name.replace(/\.midi?$/i, '')
        const bpm = midiData.header.tempo ? Math.round(60000000 / midiData.header.tempo) : 120
        const PPQN = midiData.header.division ?? 96
        const patternCount = this._createPatternsFromTrackDefs(trackDefs, baseName, bpm, PPQN)

        const newIdx = appState.patterns.length - 1
        await serviceRegistry.cmd.setSelectedPatternNum(newIdx)

        serviceRegistry.audioEngine?.invalidateCache()
        const msg = patternCount > 1
            ? `MIDI imported: ${trackDefs.length} track(s) into ${patternCount} patterns`
            : `MIDI imported: ${trackDefs.length} track(s)`
        showToast(msg, 'success')

        return { trackCount: trackDefs.length, patternCount }
    }

    _resolveTrackDefs(channelNotes, channelTrackNames, channelPrograms, im) {
        const resolveRootMidi = (trackName) => {
            const upper = trackName?.trim().toUpperCase() ?? ''
            for (const sound of Object.values(soundRegistry.sounds ?? {})) {
                if (sound.rootMidi != null && upper.includes(sound.key?.toUpperCase() ?? '')) {
                    return sound.rootMidi
                }
            }
            return C3_MIDI_NOTE
        }

        const makeDef = (trackName, groupNotes, opts) => ({
            trackName, groupNotes, midiTrackName: opts.midiTrackName, program: opts.program, channel: opts.channel, ...opts
        })

        const trackDefs = []
        const skippedChannels = []

        for (const [channel, chNotes] of channelNotes) {
            const program = channelPrograms.get(channel) ?? 0
            const midiTrackName = channelTrackNames.get(channel) ?? ''
            const isDrumChannel = channel === 9

            logger.warn('MidiImport', `── Channel ${channel}, program=${program}, name="${midiTrackName}", notes=${chNotes.length} ──`)

            if (!isDrumChannel) {
                const melodicInst = im.findInstrumentFromMidiProgram(channel, program)
                if (melodicInst.id !== 'NOT_FOUND' && !melodicInst.drum) {
                    const trackName = melodicInst.id
                    if (!trackDefs.some(d => d.trackName === trackName)) {
                        trackDefs.push(makeDef(trackName, chNotes, { baseNote: resolveRootMidi(trackName), midiTrackName, program, channel, isDrum: false }))
                        logger.warn('MidiImport', `  → ${trackName} (tier1: findInstrumentFromMidiProgram ch=${channel} prog=${program})`)
                    }
                    continue
                }
            }

            const drumResult = this._resolveDrumTrack(chNotes, channel, program, midiTrackName, im)
            if (drumResult) {
                for (const def of drumResult) trackDefs.push(def)
                continue
            }

            if (midiTrackName) {
                const nameInst = im.findByName(midiTrackName)
                if (nameInst) {
                    const trackName = nameInst.id
                    if (!trackDefs.some(d => d.trackName === trackName)) {
                        trackDefs.push(makeDef(trackName, chNotes, { baseNote: resolveRootMidi(trackName), midiTrackName, program, channel, isDrum: false }))
                        logger.warn('MidiImport', `  → ${trackName} (tier3: findByName "${midiTrackName}")`)
                    }
                    continue
                }
            }

            const programInst = im.findInstrumentFromMidiProgramAnyChannel(program)
            if (programInst.id !== 'NOT_FOUND') {
                const trackName = programInst.id
                if (!trackDefs.some(d => d.trackName === trackName)) {
                    trackDefs.push(makeDef(trackName, chNotes, { baseNote: resolveRootMidi(trackName), midiTrackName, program, channel, isDrum: false }))
                    logger.warn('MidiImport', `  → ${trackName} (tier4: findInstrumentFromMidiProgramAnyChannel prog=${program})`)
                }
            } else {
                skippedChannels.push(channel)
                logger.warn('MidiImport', `  → SKIPPED (aucun instrument trouvé pour ch=${channel} prog=${program})`)
            }
        }

        for (const channel of skippedChannels) {
            const allInstIds = [...im.byId.keys()].sort()
            const usedIds = new Set(trackDefs.map(d => d.trackName))
            let fallbackIdx = 0
            while (fallbackIdx < allInstIds.length && usedIds.has(allInstIds[fallbackIdx])) fallbackIdx++
            if (fallbackIdx >= allInstIds.length) continue

            const instId = allInstIds[fallbackIdx]
            const chNotes = channelNotes.get(channel)
            const program = channelPrograms.get(channel) ?? 0
            trackDefs.push(makeDef(instId, chNotes, { baseNote: resolveRootMidi(instId), midiTrackName: channelTrackNames.get(channel) ?? '', program, channel, isDrum: false }))
            usedIds.add(instId)
        }

        return { trackDefs, skippedChannels }
    }

    _resolveDrumTrack(chNotes, channel, program, midiTrackName, im) {
        const noteGroups = new Map()
        for (const note of chNotes) {
            if (!noteGroups.has(note.note)) noteGroups.set(note.note, [])
            noteGroups.get(note.note).push(note)
        }

        const results = []
        let drumFound = false
        for (const [noteNum, grpNotes] of noteGroups) {
            let drumInst = im.findInstrumentFromMidi(channel, noteNum)
            let matchMethod = drumInst.id !== 'NOT_FOUND' ? 'findInstrumentFromMidi' : null
            if (drumInst.id === 'NOT_FOUND') {
                const gmName = GM_DRUM_NAMES[noteNum]
                if (gmName) {
                    drumInst = im.findInstrumentFromFileName(gmName)
                    if (drumInst.id !== 'NOT_FOUND') matchMethod = `GM_DRUM_NAMES[${noteNum}]="${gmName}" → findInstrumentFromFileName`
                }
                if (drumInst.id === 'NOT_FOUND') {
                    logger.warn('MidiImport', `  note ${noteNum}: aucun instrument trouvé`)
                    continue
                }
            }

            const trackName = drumInst.id
            if (!results.some(d => d.trackName === trackName)) {
                results.push({ trackName, groupNotes: grpNotes, baseNote: noteNum, midiTrackName, program, channel, isDrum: true, key: noteNum })
                drumFound = true
                logger.warn('MidiImport', `  → ${trackName} (tier2: ${matchMethod}, note=${noteNum})`)
            }
        }

        return drumFound ? results : null
    }

    _logImportSummary(trackDefs) {
        const drumkitList = soundRegistry.drumkitList
        const selDrumkitName = drumkitList?.[appState.selectedDrumkitNum]?.name ?? ''

        const resolveSampleUrl = (trackName) => {
            for (const sound of Object.values(soundRegistry.sounds)) {
                if (sound.kit_name === selDrumkitName && trackName.toUpperCase().includes(sound.key.toUpperCase())) {
                    return sound.url
                }
            }
            for (const sound of Object.values(soundRegistry.sounds)) {
                if (trackName.toUpperCase().includes(sound.key.toUpperCase())) {
                    return sound.url
                }
            }
            return null
        }

        logger.warn('MidiImport', `═══ IMPORT SUMMARY: ${trackDefs.length} track(s) ═══`)
        for (const def of trackDefs) {
            const sampleUrl = resolveSampleUrl(def.trackName) ?? '?'
            if (def.isDrum) {
                const gmName = GM_DRUM_NAMES[def.key] ?? ''
                logger.warn('MidiImport', `  original: "ch: ${def.channel}, key: ${def.key}${gmName ? ', ' + gmName : ''}" → ${def.trackName} (${def.groupNotes.length} notes) [${sampleUrl}]`)
            } else {
                const gmProgName = GM_PROGRAM_NAMES[def.program] ?? ''
                logger.warn('MidiImport', `  original: "ch: ${def.channel}, program: ${def.program}${gmProgName ? ', ' + gmProgName : ''}" → ${def.trackName} (${def.groupNotes.length} notes) [${sampleUrl}]`)
            }
        }
        logger.warn('MidiImport', `═══════════════════════════════════════════`)
    }

    _createPatternsFromTrackDefs(trackDefs, baseName, bpm, PPQN) {
        const cmd = serviceRegistry.cmd
        const TICK_RATIO = PPQN / TICK

        let maxTick = 0
        for (const def of trackDefs) {
            for (const note of def.groupNotes) {
                if (note.absTick > maxTick) maxTick = note.absTick
            }
        }
        const totalEngineTicks = Math.round(maxTick / TICK_RATIO)
        const totalBeats = Math.max(1, Math.ceil(totalEngineTicks / TICK))

        const numPatterns = Math.min(MIDI_MAX_PATTERNS, Math.ceil(totalBeats / MIDI_MAX_BEATS))
        const beatsPerPattern = MIDI_MAX_BEATS

        logger.debug('MidiImport', `maxTick=${maxTick}, PPQN=${PPQN}, TICK_RATIO=${TICK_RATIO.toFixed(3)}, totalBeats=${totalBeats}, patterns=${numPatterns}, beatsPerPattern=${beatsPerPattern}`)

        for (let p = 0; p < numPatterns; p++) {
            const patStartBeat = p * beatsPerPattern
            const patEndBeat = patStartBeat + beatsPerPattern

            const suffix = numPatterns > 1 ? ` ${p + 1}/${numPatterns}` : ''
            const pattern = cmd.addPattern(`${baseName}${suffix}`)
            pattern.nbBeats = beatsPerPattern
            pattern.bpm = bpm

            const patStartTick = patStartBeat * TICK
            const patEndTick = patEndBeat * TICK

            for (const def of trackDefs) {
                const track = cmd.addTrack(pattern, def.trackName)
                const ticksPerStep = TICK / (track.stepsPerBeat ?? 4)

                let noteCount = 0
                for (const note of def.groupNotes) {
                    const engineTicks = Math.round(note.absTick / TICK_RATIO)
                    if (engineTicks < patStartTick || engineTicks >= patEndTick) continue

                    const beat = Math.floor(engineTicks / TICK) - patStartBeat
                    const beatStep = Math.round((engineTicks % TICK) / ticksPerStep)
                    const pitch = note.note - def.baseNote

                    cmd.addNote(track, beat, beatStep, pitch)
                    const addedNote = track.notes.at(-1)
                    if (addedNote) {
                        addedNote.velocity = midiVelocityToNormalized(note.velocity)
                    }
                    noteCount++
                }
                logger.debug('MidiImport', `pattern "${pattern.name}" track "${def.trackName}": ${noteCount} notes placed`)
            }
        }

        return numPatterns
    }
}
