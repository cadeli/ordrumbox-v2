import SampleVoice from './sample_voice.js'
import WorkletSynthVoice from './worklet_synth_voice.js'
import { logger } from "../../core/logger.js"

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

            return new WorkletSynthVoice(this.audioCtx, strip, generatedSound, soundKey, this.nodePool)
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
