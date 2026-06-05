import BaseVoice from './base_voice.js'
import MfDefaults from '../../patterns/defaults.js'
import {
    PITCH_RAMP_TIME,
    GAIN_ATTACK_RAMP,
    RELEASE_TIME,
    MIN_GAIN_VALUE,
    STOP_BUFFER,
    STOP_EXTRA_BUFFER
} from '../../core/constants.js'

export default class SampleVoice extends BaseVoice {
    constructor(audioCtx, strip, buffer) {
        super(audioCtx, strip)
        this.buffer = buffer
        this.snd = null
        this.gainEnvelope = null
        this.panNode = null
        this.noteVelo = 1
    }

    setup(flatNote, time) {
        const ctx = this.audioCtx
        const track = flatNote.track

        this.snd = this.registerNode(ctx.createBufferSource())
        this.gainEnvelope = this.registerNode(ctx.createGain())
        this.panNode = this.registerNode(ctx.createStereoPanner())

        this.snd.buffer = this.buffer
        this.snd.playbackRate.setTargetAtTime(flatNote.fpitch || 1, time, PITCH_RAMP_TIME)
        this.panNode.pan.setValueAtTime(flatNote.pan ?? 0, time)

        // LFO connections
        if (track.pitchLfo && this.strip._lfoGains?.pitchLfo) {
            const centMult = this.registerNode(ctx.createGain())
            centMult.gain.value = 100
            this.strip._lfoGains.pitchLfo.connect(centMult)
            centMult.connect(this.snd.detune)
        }
        if (track.panLfo && this.strip._lfoGains?.panLfo) {
            this.strip._lfoGains.panLfo.connect(this.panNode.pan)
        }

        const duration = track.sampleLength || 0.5
        this.noteVelo = flatNote.note?.velocity ?? MfDefaults.getNoteProp(flatNote.note, 'velocity')

        this.gainEnvelope.gain.setValueAtTime(0, time)
        this.gainEnvelope.gain.linearRampToValueAtTime(this.noteVelo, time + GAIN_ATTACK_RAMP)
        this.gainEnvelope.gain.setValueAtTime(this.noteVelo, time + duration)
        this.gainEnvelope.gain.exponentialRampToValueAtTime(MIN_GAIN_VALUE, time + duration + RELEASE_TIME)

        this.snd.connect(this.gainEnvelope)
        this.gainEnvelope.connect(this.panNode)
        this.connectToStripInput(this.panNode)

        this.snd.onended = () => {
            this.cleanup()
            if (this.onEnded) this.onEnded()
        }

        this.duration = duration
    }

    start(time) {
        this.snd.start(time)
        this.snd.stop(time + this.duration + RELEASE_TIME)
    }

    stop(time) {
        if (this.stopped) return
        super.stop(time)

        try {
            this.gainEnvelope.gain.cancelScheduledValues(time)
            const currentGain = Math.max(MIN_GAIN_VALUE, this.gainEnvelope.gain.value || this.noteVelo || 1)
            this.gainEnvelope.gain.setValueAtTime(currentGain, time)
            this.gainEnvelope.gain.exponentialRampToValueAtTime(MIN_GAIN_VALUE, time + STOP_BUFFER)
        } catch (e) {
            console.error("SampleVoice::stop gain error", e)
        }

        try {
            this.snd.stop(time + STOP_EXTRA_BUFFER)
        } catch (e) {
            // Ignore if already stopped
        }
    }
}
