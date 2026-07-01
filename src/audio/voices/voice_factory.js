import SampleVoice from './sample_voice.js'
import SynthVoice from './synth_voice.js'
import WorkletSynthVoice from './worklet_synth_voice.js'
import { appState } from '../../state/app_state.js'
import { toFiniteNumber } from '../math.js'
import { logger } from "../../core/logger.js"

/**
 * Returns true if the given generatedSound config can run entirely on the
 * synth-voice worklet (no LFO routing, no glide, no filter envelope).
 */
function isWorkletCompatible(generatedSound) {
    if (!generatedSound) return false
    if ((generatedSound.lfo?.target ?? 'NOT') !== 'NOT') return false
    if ((generatedSound.lfo2?.target ?? 'NOT') !== 'NOT') return false
    return true
}

export default class VoiceFactory {
    constructor(audioCtx, mixer, sounds, generatedSounds, nodePool = null) {
        this.audioCtx = audioCtx
        this.mixer = mixer
        this.sounds = sounds
        this.generatedSounds = generatedSounds
        this.nodePool = nodePool
    }

    async createVoice(flatNote) {
        const track = flatNote.track
        const strip = await this.mixer?.getOrCreateStrip(track?.name)
        if (!strip) return null

        if (track.useSoftSynth === true) {
            const soundKey      = track?.synthSoundKey ?? (logger.warn('VoiceFactory', 'synthSoundKey fallback'), "BASS1")
            const generatedSound = this.generatedSounds?.[soundKey]
            if (!generatedSound) return null

            // Worklet voice for compatible sounds when worklets are active;
            // native SynthVoice for advanced features (LFO routing, glide,
            // filter envelope) not yet in the worklet, and as fallback when
            // worklet init is unknown / unavailable.
            if (appState.workletStatus === 'active' && isWorkletCompatible(generatedSound)) {
                return new WorkletSynthVoice(this.audioCtx, strip, generatedSound, soundKey, this.nodePool)
            }
            return new SynthVoice(this.audioCtx, strip, generatedSound, soundKey, this.nodePool)
        }

        let soundBuffer = this.sounds[flatNote.soundId]?.buffer
        if (!soundBuffer) soundBuffer = this.sounds[track.soundId]?.buffer
        if (!soundBuffer) {
            logger.warn(`VoiceFactory: No soundBuffer for track ${track.name}`)
            return null
        }
        return new SampleVoice(this.audioCtx, strip, soundBuffer, this.nodePool)
    }
}
