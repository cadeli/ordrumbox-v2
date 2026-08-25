import { buildInstrumentTrackFromEvents } from '../../src/logic/midi/midi_exporter.js'

const TICKS_PER_BAR = 96

/**
 * Build one MTrk chunk from track note data.
 * @param {object} track
 * @param {number} midiNote
 * @param {number} channel
 * @param {number} [patternLoops=1]
 */
export function buildInstrumentTrack(track, midiNote, channel, patternLoops = 1) {
    const stepsPerBeat   = track.stepsPerBeat ?? 4
    const ticksPerStep  = TICKS_PER_BAR / stepsPerBeat
    const loopPointBeat  = track.loopPointBeat  ?? (track.nbBeats ?? 4)
    const loopPointStep = track.loopPointStep ?? 0
    const loopTicks     = Math.floor((loopPointBeat + loopPointStep / stepsPerBeat) * TICKS_PER_BAR)

    const onsets = []
    for (let loop = 0; loop < patternLoops; loop++) {
        const loopOffset = loop * loopTicks
        for (const note of track.notes ?? []) {
            const absTick  = note.beat * TICKS_PER_BAR + Math.round(note.beatStep * ticksPerStep) + loopOffset
            const velocity = Math.round(Math.min(1, Math.max(0, note.velocity ?? 0.8)) * 127)
            const noteNum  = Math.min(127, Math.max(0, midiNote + (note.pitch ?? 0)))
            onsets.push({ absMidiTick: absTick, noteNum, velocity })
        }
    }
    return buildInstrumentTrackFromEvents(track.name, midiNote, channel, onsets)
}
