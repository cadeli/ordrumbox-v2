import BaseVoice from './base_voice.js'
import MfDefaults from '../../patterns/defaults.js'
import { appState } from '../../state/app_state.js'
import { serviceRegistry } from '../../state/service_registry.js'
import { computeLfoValue } from '../math.js'
import {
    PITCH_RAMP_TIME,
    GAIN_ATTACK_RAMP,
    RELEASE_TIME,
    MIN_GAIN_VALUE,
    STOP_BUFFER,
    STOP_EXTRA_BUFFER,
    TICK
} from '../../core/constants.js'

export default class SampleVoice extends BaseVoice {
    constructor(audioCtx, strip, buffer, nodePool = null) {
        super(audioCtx, strip, nodePool)
        this.buffer = buffer
        this.snd = null
        this.gainEnvelope = null
        this.panNode = null
        this.noteVelo = 1
    }

    setup(flatNote, time) {
        const track = flatNote.track

        this.snd = this.registerNode(this.audioCtx.createBufferSource())
        this.gainEnvelope = this.acquireNode('GainNode')
        this.panNode = this.acquireNode('StereoPannerNode')

        this.snd.buffer = this.buffer

        let playbackRate = flatNote.fpitch || 1
        if (track.pitchLfo) {
            const tick = serviceRegistry.transport?.tick ?? 0
            const pattern = appState.patterns?.[appState.selectedPatternNum]
            const nbTicks = TICK * (pattern?.nbBars ?? 4)
            const lfoSemi = computeLfoValue(track.pitchLfo, tick, nbTicks, 'pitch')
            playbackRate = Math.pow(2, lfoSemi / 12)
        }
        this.snd.playbackRate.setTargetAtTime(playbackRate, time, PITCH_RAMP_TIME)
        this.panNode.pan.setValueAtTime(flatNote.pan ?? 0, time)

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
