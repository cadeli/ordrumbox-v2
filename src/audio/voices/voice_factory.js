import SampleVoice from './sample_voice.js'
import WorkletSynthVoice from './worklet_synth_voice.js'
import { logger } from '../../core/logger.js'
import { reportUserError } from '../../core/notify.js'

/** Factory creating voices (sample or synth) for a flat note. */
export default class VoiceFactory {
    /**
     * @param {BaseAudioContext} audioCtx
     * @param {any} mixer
     * @param {Record<string, any>} sounds
     * @param {Record<string, any>} generatedSounds
     * @param {any} [nodePool]
     * @param {any} [synthNodePool]
     */
    constructor(audioCtx, mixer, sounds, generatedSounds, nodePool = null, synthNodePool = null) {
        this.audioCtx = audioCtx
        this.mixer = mixer
        this.sounds = sounds
        this.generatedSounds = generatedSounds
        this.nodePool = nodePool
        this.synthNodePool = synthNodePool
    }

    /** @param {any} flatNote @returns {Promise<any>} */
    async createVoice(flatNote) {
        const track = flatNote.track
        const strip = await this.mixer?.getOrCreateStrip(track?.name)
        if (!strip) return null

        if (track.useSoftSynth === true) {
            // No silent 'BASS1' substitution: a track with useSoftSynth and no
            // synthSoundKey used to play a bass patch for every note.
            const soundKey = track?.synthSoundKey ?? null
            if (!soundKey) {
                reportUserError('VoiceFactory.synthSoundKey', `"${track.name}" has no synth preset assigned`, {
                    cause: new Error(`track "${track.name}" has no synthSoundKey`),
                })
                return null
            }
            const generatedSound = this.generatedSounds?.[soundKey]
            if (!generatedSound) {
                reportUserError('VoiceFactory.synthPresetMissing', `Unknown synth preset "${soundKey}"`, {
                    cause: new Error(`generatedSounds has no "${soundKey}"`),
                })
                return null
            }

            return new WorkletSynthVoice(
                this.audioCtx,
                strip,
                generatedSound,
                soundKey,
                this.nodePool,
                this.synthNodePool,
            )
        }

        let sound = this.sounds[flatNote.sampleId]
        if (!sound?.buffer) sound = this.sounds[track.sampleId]
        const soundBuffer = sound?.buffer
        if (!soundBuffer) {
            logger.warn(`VoiceFactory: No soundBuffer for track ${track.name}`)
            return null
        }
        return new SampleVoice(this.audioCtx, strip, soundBuffer, this.nodePool, sound)
    }
}
