import SampleVoice from './sample_voice.js'
import SynthVoice from './synth_voice.js'

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
