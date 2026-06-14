import { fixPattern } from '../../patterns/fixer.js'
import { normalizeTrack, TRACK_DEFAULTS, recalcLoopDerived } from '../../model/track_schema.js'
import Utils from '../../core/utils.js'

/**
 * Create a new track from a source track's properties.
 * Pure function — no side effects on global state.
 */
export function createTrackFromSource(sourceTrack, nbBars) {
    const track = normalizeTrack({
        name: sourceTrack.name,
        bars: nbBars,
        barQuantize: sourceTrack.barQuantize ?? 4,
        loopAtStep: nbBars * (sourceTrack.barQuantize ?? 4),
        pan: Utils.getPanFromTrackName(sourceTrack.name),
    })
    return track
}

/**
 * Copy all properties from sourceTrack to track.
 * Handles derived properties (loopPointBar/Step), optional FX props,
 * and bars/nbBars alias.
 */
export function copyTrackProps(track, sourceTrack) {
    const derivedKeys = new Set(['loopPointBar', 'loopPointStep', 'notes'])

    for (const prop of Object.keys(TRACK_DEFAULTS)) {
        if (derivedKeys.has(prop)) continue
        if (prop in sourceTrack) {
            track[prop] = sourceTrack[prop]
        }
    }

    const optionalProps = ['mono', 'filterLfoFreq', 'reverbType', 'reverbAmount',
        'delayType', 'delayTime', 'delayAmount', 'fxSelected',
        'saturationType', 'saturationAmount', 'synthSoundKey',
        'reverbOn', 'delayOn', 'saturationOn']

    for (const prop of optionalProps) {
        if (!(prop in sourceTrack)) delete track[prop]
    }

    if ('bars' in sourceTrack) track.bars = sourceTrack.bars
    else if ('nbBars' in sourceTrack) track.bars = sourceTrack.nbBars

    if (!('loopAtStep' in sourceTrack)) {
        track.loopAtStep = track.bars * track.barQuantize
    }

    recalcLoopDerived(track)
    return track
}

/**
 * Copy note properties from sourceNote to note.
 */
export function copyNoteProps(note, sourceNote, track) {
    const props = [
        'bar', 'velocity', 'pan', 'pitch', 'arp',
        'triggerFreq', 'triggerPhase', 'triggerProbability',
        'arpTriggerProbability', 'retriggerNum', 'retriggerStep',
        'euclidianFill', 'steppc'
    ]

    for (const prop of props) {
        if (prop in sourceNote) {
            note[prop] = sourceNote[prop]
        }
    }

    if (sourceNote.barStep !== undefined) note.barStep = sourceNote.barStep
    else if (sourceNote.step !== undefined) note.barStep = sourceNote.step

    if (sourceNote.steppc === undefined) {
        note.steppc = Math.round((note.barStep * 100) / track.barQuantize)
    }

    return note
}

/**
 * Import a pattern from a JSON object.
 * Pure function that returns the imported pattern — does not mutate appState.
 *
 * @param {object} sourcePattern – the JSON pattern to import
 * @param {Function} addPattern  – fn(name) => pattern  (creates + registers)
 * @param {Function} addTrack    – fn(pattern, name) => track
 * @param {Function} addNote     – fn(track, bar, barStep, pitch) => note
 * @returns {object} the imported pattern
 */
export function importPatternFromJson(sourcePattern, addPattern, addTrack, addNote) {
    const patternName = sourcePattern?.name ?? undefined
    const importedPattern = addPattern(patternName)

    importedPattern.name = patternName ?? importedPattern.name ?? ''
    importedPattern.bpm = Number(sourcePattern?.bpm) || importedPattern.bpm || 120
    importedPattern.nbBars = Number(sourcePattern?.nbBars) || importedPattern.nbBars || 4

    if (sourcePattern?.application) importedPattern.application = sourcePattern.application
    if (sourcePattern?.url) importedPattern.url = sourcePattern.url
    if (sourcePattern?.tags) importedPattern.tags = { ...sourcePattern.tags }

    if (!('description' in sourcePattern)) {
        delete importedPattern.description
    } else if (sourcePattern.description !== '') {
        importedPattern.description = sourcePattern.description
    } else {
        delete importedPattern.description
    }

    importedPattern.tracks = []

    for (const sourceTrack of Object.values(sourcePattern?.tracks ?? [])) {
        const track = addTrack(importedPattern, sourceTrack.name)
        copyTrackProps(track, sourceTrack)

        for (const sourceNote of Object.values(sourceTrack.notes ?? [])) {
            const note = addNote(
                track,
                Number(sourceNote.bar ?? 0),
                Number(sourceNote.barStep ?? sourceNote.step ?? 0),
                Number(sourceNote.pitch ?? 0)
            )
            copyNoteProps(note, sourceNote, track)
        }
    }

    fixPattern(importedPattern)
    return importedPattern
}
