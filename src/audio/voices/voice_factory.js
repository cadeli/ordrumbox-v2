import SampleVoice from './sample_voice.js'
import WorkletSynthVoice from './worklet_synth_voice.js'
import { logger } from '../../core/logger.js'
import { reportUserError } from '../../core/notify.js'

/** Factory creating voices (sample or synth) for a flat note. */
export default class VoiceFactory {
    /**
     * @param {BaseAudioContext} audioCtx
     * @param {import('../sound.js').Mixer} mixer
     * @param {Record<string, import('../sound.js').SoundEntry>} sounds
     * @param {Record<string, any>} generatedSounds
     * @param {import('../node_pool.js').default|null} [nodePool]
     * @param {import('./synth_voice_pool.js').default|null} [synthNodePool]
     * @param {(() => number)|null} [getBpm]
     */
    constructor(audioCtx, mixer, sounds, generatedSounds, nodePool = null, synthNodePool = null, getBpm = null) {
        this.audioCtx = audioCtx
        this.mixer = mixer
        this.sounds = sounds
        this.generatedSounds = generatedSounds
        this.nodePool = nodePool
        this.synthNodePool = synthNodePool
        this.getBpm = getBpm ?? (() => 120)
    }

    /** @param {import('../../model/flat_note.js').default} flatNote @returns {Promise<import('./base_voice.js').default|null>} */
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
                this.getBpm,
            )
        }

        const sound = this.sounds[track.sampleId]
        const soundBuffer = sound?.buffer
        if (!soundBuffer) {
            logger.warn(`VoiceFactory: No soundBuffer for track ${track.name}`)
            return null
        }
        return new SampleVoice(this.audioCtx, strip, soundBuffer, this.nodePool, sound)
    }
}
