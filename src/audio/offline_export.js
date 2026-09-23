// src/audio/offline_export.js — Offline pattern render to WAV blob.

import Mixer from './mixer.js'
import Sound from './sound.js'
import NoteParams from '../patterns/note_params.js'
import Utils from '../core/utils.js'
import { logger } from '../core/logger.js'

/**
 * Render `pattern` for `numLoops` loops in an OfflineAudioContext and encode WAV.
 *
 * @param {object} deps
 * @param {AudioContext} deps.audioCtx — live ctx (sampleRate source only)
 * @param {object} deps.sounds
 * @param {object} deps.generatedSounds
 * @param {number} deps.TICK
 * @param {(pattern: object, loop: number) => Map} deps.computeFlatNotes
 * @param {object} pattern
 * @param {number} numLoops
 * @param {typeof OfflineAudioContext} OfflineAudioContextClass
 * @param {(buffer: AudioBuffer) => Uint8Array} bufferToWavFn
 * @returns {Promise<{blob: Uint8Array|null, fileName: string}>}
 */
export async function exportOffline(deps, pattern, numLoops, OfflineAudioContextClass, bufferToWavFn) {
    const { audioCtx, sounds, generatedSounds, TICK, computeFlatNotes } = deps
    try {
        const bpm = pattern.bpm
        const nbBeats = pattern.nbBeats
        const totalLoops = Math.max(1, numLoops)
        const secondsPerBeat = 60 / bpm
        const patternDuration = nbBeats * secondsPerBeat
        const sampleRate = audioCtx.sampleRate
        const samplesPerPattern = Math.round(patternDuration * sampleRate)
        const totalSamples = samplesPerPattern * totalLoops

        const offlineCtx = new OfflineAudioContextClass(2, totalSamples, sampleRate)

        // Build a full worklet-based mixer for the offline context. AudioWorklet
        // is supported in OfflineAudioContext, so the same code path works.
        const offlineMixer = await Mixer.create(offlineCtx)
        const offlineSound = new Sound(offlineCtx, offlineMixer, sounds, generatedSounds, true)

        for (const track of Object.values(pattern.tracks)) {
            const strip = await offlineMixer.getOrCreateStrip(track.name)
            if (strip) {
                await offlineSound.updateStripFromTrack(strip, track, 0)
            }
        }

        // Initialize and ramp transport clock for offline render
        if (offlineMixer.transportClock) {
            offlineMixer.transportClock.offset.setValueAtTime(0, 0)
            offlineMixer.transportClock.offset.linearRampToValueAtTime(
                patternDuration * totalLoops,
                patternDuration * totalLoops,
            )
            offlineMixer.transportClock.start(0)
        }

        const truePatternDuration = samplesPerPattern / sampleRate

        const anySolo = Utils.hasAnySolo(pattern.tracks)
        for (let loop = 0; loop < totalLoops; loop++) {
            const loopStartTime = loop * truePatternDuration
            const flatNotes = computeFlatNotes(pattern, loop)

            for (const [tick, notesAtTick] of flatNotes.entries()) {
                for (const flatNote of notesAtTick) {
                    const nbTickForPattern = TICK * nbBeats
                    const noteTime = NoteParams.tickToTime(tick, nbTickForPattern, truePatternDuration)
                    const absoluteTime = loopStartTime + noteTime
                    NoteParams.applyNoteParams(flatNote, secondsPerBeat)

                    if (Utils.shouldTrackPlay(flatNote.track, anySolo)) {
                        await offlineSound.play(flatNote, absoluteTime + flatNote.swingTime)
                    }
                }
            }
        }

        const renderedBuffer = await offlineCtx.startRendering()
        const blob = bufferToWavFn(renderedBuffer)
        return { blob, fileName: `ordrumbox-${pattern.name.replace(/\s+/g, '_')}-${totalLoops}loops.wav` }
    } catch (err) {
        logger.warn('AudioEngine', 'exportOffline failed', err)
        return { blob: null, fileName: '' }
    }
}
