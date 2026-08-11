import SampleVoice from './sample_voice.js'
import WorkletSynthVoice from './worklet_synth_voice.js'
import { logger, nameOr } from "../../core/logger.js"

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
            const soundKey      = nameOr(track?.synthSoundKey, "BASS1", 'VoiceFactory', 'synthSoundKey fallback')
            const generatedSound = this.generatedSounds?.[soundKey]
            if (!generatedSound) return null

            return new WorkletSynthVoice(this.audioCtx, strip, generatedSound, soundKey, this.nodePool)
        }

        let sound = this.sounds[flatNote.soundId]
        if (!sound?.buffer) sound = this.sounds[track.soundId]
        const soundBuffer = sound?.buffer
        if (!soundBuffer) {
            logger.warn(`VoiceFactory: No soundBuffer for track ${track.name}`)
            return null
        }
        return new SampleVoice(this.audioCtx, strip, soundBuffer, this.nodePool, sound)
    }
}
