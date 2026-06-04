import SampleVoice from './sample_voice.js'
import SynthVoice from './synth_voice.js'
import WorkletSynthVoice from './worklet_synth_voice.js'
import { appState } from '../../state/app_state.js'
import { toFiniteNumber } from '../math.js'

/**
 * Returns true if the given generatedSound config can run entirely on the
 * synth-voice worklet (no LFO routing, no glide, no filter envelope).
 */
function isWorkletCompatible(generatedSound) {
    if (!generatedSound) return false
    const lfoTarget = generatedSound.lfo?.target ?? 'NOT'
    if (lfoTarget !== 'NOT') return false
    const slide = toFiniteNumber(generatedSound.slide, 0)
    if (slide > 0) return false
    const filterEnvAmt = toFiniteNumber(generatedSound.filter?.filterEnvelopeAmount, 0)
    if (filterEnvAmt > 0) return false
    return true
}

export default class VoiceFactory {
    constructor(audioCtx, mixer, sounds, generatedSounds) {
        this.audioCtx = audioCtx
        this.mixer = mixer
        this.sounds = sounds
        this.generatedSounds = generatedSounds
    }

    createVoice(flatNote) {
        const track = flatNote.track
        const strip = this.mixer?.getOrCreateStrip(track?.name)
        if (!strip) return null

        if (track.useSoftSynth === true) {
            const soundKey = track?.synthSoundKey || "BASS1"
            const generatedSound = this.generatedSounds?.[soundKey]
            if (!generatedSound) return null

            // Drop-in: use worklet voice when worklets are active and the
            // generated sound doesn't rely on features the worklet lacks.
            if (appState.workletStatus === 'active' && isWorkletCompatible(generatedSound)) {
                return new WorkletSynthVoice(this.audioCtx, strip, generatedSound, soundKey)
            }
            return new SynthVoice(this.audioCtx, strip, generatedSound, this.mixer?.lfo, soundKey)
        } else {
            let soundBuffer = this.sounds[flatNote.soundId]?.buffer
            if (!soundBuffer) {
                soundBuffer = this.sounds[track.soundId]?.buffer
            }
            if (!soundBuffer) {
                console.warn(`VoiceFactory: No soundBuffer for track ${track.name}`)
                return null
            }
            return new SampleVoice(this.audioCtx, strip, soundBuffer)
        }
    }
}
