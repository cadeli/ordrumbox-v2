// src/audio/midi_out.js — Real-time MIDI note output for playback and triggers.

import Utils from '../core/utils.js'
import { logger, nameOr } from '../core/logger.js'
import { instrumentsManager } from '../logic/services/instrument_manager/index.js'
import { serviceRegistry } from '../state/service_registry.js'

/**
 * Memoized trackId → MIDI mapping resolver (first mapping only, as before).
 * @returns {(trackId: string) => object|null}
 */
export function createMidiMappingResolver() {
    const cache = new Map()
    return (trackId) => {
        if (cache.has(trackId)) return cache.get(trackId)
        const mapping = instrumentsManager.DATA.instruments.find((i) => i.id === trackId)?.midi?.[0] ?? null
        cache.set(trackId, mapping)
        return mapping
    }
}

/**
 * Send note-on/off MIDI messages for every note scheduled at `tick`.
 * No-op when MIDI is not ready.
 *
 * @param {object} ctx
 * @param {AudioContext} ctx.audioCtx
 * @param {object[]} ctx.patterns
 * {Function} ctx.getSelectedPatternNum
 * @param {number} ctx.TICK
 * @param {object} ctx.player
 * @param {(loop: number) => Map} ctx.getFlatNotes
 * @param {(trackId: string) => object|null} ctx.resolveMapping
 * @param {number} tick
 * @param {number} atTime — AudioContext time
 */
export function sendMidiNotes(ctx, tick, atTime) {
    const { audioCtx, patterns, getSelectedPatternNum, TICK, player, getFlatNotes, resolveMapping } = ctx

    const midi = serviceRegistry.midiManager
    if (!midi || !midi.isReady || !midi.selectedOutputId) return

    const selPat = patterns[getSelectedPatternNum()]
    if (!selPat) return

    const nbTickForPattern = TICK * selPat.nbBeats
    const loopStep = tick % nbTickForPattern
    const flatNotesMap = player.getCurrentFlatNotesMap() ?? getFlatNotes(player.loop)

    if (!(flatNotesMap instanceof Map)) return
    const notesToPlay = flatNotesMap.get(loopStep)
    if (!notesToPlay) return

    const perfNow = performance.now()
    const audioNow = audioCtx.currentTime
    const midiTime = perfNow + (atTime - audioNow) * 1000

    const anySolo = Utils.hasAnySolo(selPat.tracks)
    notesToPlay.forEach((flatNote) => {
        if (Utils.shouldTrackPlay(flatNote.track, anySolo)) {
            const mapping = resolveMapping(flatNote.track.id)
            if (mapping) {
                const channel = Number.isFinite(parseInt(mapping.ch, 10))
                    ? parseInt(mapping.ch, 10)
                    : (logger.warn('Fallback', 'invalid MIDI mapping.ch, using channel 9', mapping.ch), 9)
                const note = Number.isFinite(parseInt(mapping.key, 10))
                    ? parseInt(mapping.key, 10)
                    : (logger.warn('Fallback', 'invalid MIDI mapping.key, using note 60', mapping.key), 60)
                const vel = Math.floor(flatNote.velocity * 127)
                const startTime = midiTime + flatNote.swingTime * 1000

                midi.sendNoteOn(channel, note, vel, startTime)
                const durationMs = nameOr(flatNote.duration, 100, 'AudioEngine', 'duration fallback')
                midi.sendNoteOff(channel, note, startTime + durationMs)
            }
        }
    })
}

/**
 * Send a short one-shot MIDI trigger for a single resolved track/note (simpleBeep).
 * No-op when MIDI is not ready or track/mapping is missing.
 *
 * @param {object} args
 * @param {object} args.track
 * @param {object|null} [args.note] — flat note override (velocity source)
 * @param {(trackId: string) => object|null} args.resolveMapping
 */
export function sendTriggerMidi({ track, note, resolveMapping }) {
    const midi = serviceRegistry.midiManager
    if (!midi || !midi.isReady || !midi.selectedOutputId) return
    if (!track) return

    const mapping = resolveMapping(track.id)
    if (!mapping) return

    const rawCh = parseInt(mapping.ch, 10)
    const rawNote = parseInt(mapping.key, 10)
    const channel = Number.isFinite(rawCh) ? rawCh : 9
    const noteNum = Number.isFinite(rawNote) ? rawNote : 60
    if (!Number.isFinite(rawCh) || !Number.isFinite(rawNote)) {
        logger.warn('Engine', 'MIDI mapping NaN fallback', { ch: mapping.ch, key: mapping.key })
    }
    const vel = Math.floor((note?.velocity ?? track.velocity ?? 0.8) * 127)
    midi.sendNoteOn(channel, noteNum, vel)
    setTimeout(() => midi.sendNoteOff(channel, noteNum), 100)
}
