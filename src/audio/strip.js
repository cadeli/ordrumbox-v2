import { clamp, toFiniteNumber } from '../core/numbers.js'
import Utils from '../core/utils.js'
import Defaults from '../patterns/defaults.js'
import { RAMP_TIME } from '../core/constants.js'
import { reportUserError } from '../core/notify.js'
import WorkletLoader from './worklets/loader.js'
import STRIP_SOURCE from './worklets/processors/strip_source.js'

WorkletLoader.register('strip', STRIP_SOURCE)

const REVERB_PRESETS = Object.freeze({
    none: { duration: 0, decay: 0, preDelay: 0, tone: 1, room: 0.0, damp: 0.5, width: 0.0, pre: 0 },
    room: { duration: 0.8, decay: 2.2, preDelay: 0.008, tone: 0.85, room: 0.5, damp: 0.5, width: 0.8, pre: 0.008 },
    hall: { duration: 2.4, decay: 3.8, preDelay: 0.02, tone: 0.75, room: 0.85, damp: 0.3, width: 1.0, pre: 0.02 },
    plate: { duration: 1.6, decay: 2.8, preDelay: 0.012, tone: 0.9, room: 0.7, damp: 0.4, width: 0.9, pre: 0.012 },
    spring: { duration: 1.2, decay: 2.4, preDelay: 0.01, tone: 0.65, room: 0.45, damp: 0.6, width: 0.5, pre: 0.01 },
    gated: {
        duration: 0.7,
        decay: 1.4,
        preDelay: 0.004,
        tone: 0.8,
        gated: true,
        room: 0.4,
        damp: 0.7,
        width: 0.4,
        pre: 0,
    },
})
const SATURATION_TYPES_IDX = { soft: 0, hard: 1, tape: 2 }
const FILTER_MODES = { lowpass: 0, highpass: 1, bandpass: 2, notch: 3 }
// DSP modes (strip_source.js): 0 = Slap, 1 = Tape, 2 = PingPong. 'none' is NOT a
// mode — it is a type that silences the send (see updateDelay), so it must never
// appear in this table: mapping it to 0 would sound a slap where the name says
// "no delay".
const DELAY_MODES = { slap: 0, tape: 1, pingpong: 2 }

/** Silences the send. Handled before the mode table, never a DSP mode. */
const NO_DELAY_TYPE = 'none'

/** Unknown enum values already reported, so a bad pattern cannot spam toasts. */
const enumWarned = new Set()

/**
 * Resolve an enum-like value, reporting an unknown one instead of silently
 * substituting a default (an unknown reverbType used to resolve to "none",
 * i.e. the reverb was quietly switched off).
 * @param {object} map
 * @param {string} value
 * @param {string} label
 * @param {string} fallback
 * @returns {string}
 */
function mapStripEnum(map, value, label, fallback) {
    if (value == null) return fallback
    if (Object.prototype.hasOwnProperty.call(map, value)) return value
    const key = `${label}:${value}`
    if (!enumWarned.has(key)) {
        enumWarned.add(key)
        reportUserError('Strip.enum', `Unknown ${label} "${value}" — using "${fallback}"`, {
            cause: new Error(`strip ${label}=${value}`),
        })
    }
    return fallback
}

export default class Strip {
    static TAG = 'Strip'

    constructor(name, audioCtx, mixer) {
        this.name = name
        this.audioCtx = audioCtx
        this.mixer = mixer
        this.bpm = Defaults.getPatternProp({}, 'bpm')

        this.stripNode = null
        this.voicesInput = audioCtx.createGain()

        this.levelAnalyser = audioCtx.createAnalyser()
        this.levelAnalyser.fftSize = 256
        this.levelData = new Uint8Array(this.levelAnalyser.frequencyBinCount)

        this.currentFilterType = 'allpass'
    }

    static async create(name, audioCtx, mixer) {
        const strip = new Strip(name, audioCtx, mixer)
        await WorkletLoader.ensureLoaded(audioCtx)
        strip.#initNode()
        return strip
    }

    #initNode() {
        const ctx = this.audioCtx
        this.stripNode = WorkletLoader.createNode(ctx, 'strip', {
            numberOfInputs: 1,
            numberOfOutputs: 1,
            outputChannelCount: [2],
        })

        this.voicesInput.connect(this.stripNode)

        if (this.mixer?.transportClock) {
            this.mixer.transportClock.connect(this.stripNode.parameters.get('transportTime'))
        }

        this.stripNode.parameters.get('bpm')?.setValueAtTime(this.bpm, ctx.currentTime)

        this.stripNode.connect(this.levelAnalyser, 0)

        this.output = {
            gain: this.stripNode.parameters.get('volume'),
            connect: (dest) => this.levelAnalyser.connect(dest),
            disconnect: () => this.levelAnalyser.disconnect(),
        }
        this.pan = {
            pan: this.stripNode.parameters.get('pan'),
            connect: (dest) => this.levelAnalyser.connect(dest),
            disconnect: () => this.levelAnalyser.disconnect(),
        }
    }

    connectVoice(node) {
        node.connect(this.voicesInput)
    }

    getLevel = () => {
        if (!this.levelAnalyser) return 0
        this.levelAnalyser.getByteTimeDomainData(this.levelData)
        let sum = 0
        for (let i = 0; i < this.levelData.length; i++) {
            const v = (this.levelData[i] - 128) / 128
            sum += v * v
        }
        return Math.sqrt(sum / this.levelData.length)
    }

    setBpm = (bpm) => {
        this.bpm = bpm
        if (this.stripNode) {
            this.stripNode.parameters.get('bpm')?.setTargetAtTime(bpm, this.audioCtx.currentTime, RAMP_TIME)
        }
    }

    updateFilter = (type, freq, q) => {
        if (!this.stripNode) return
        const time = this.audioCtx.currentTime
        const params = this.stripNode.parameters
        this.currentFilterType = type ?? 'allpass'

        if (this.currentFilterType === 'allpass') {
            params.get('cutoff')?.setTargetAtTime(20000, time, RAMP_TIME)
            return
        }

        const resolvedType = mapStripEnum(FILTER_MODES, this.currentFilterType, 'filterType', 'lowpass')
        if (resolvedType !== this.currentFilterType) this.currentFilterType = resolvedType
        params.get('filterMode')?.setTargetAtTime(FILTER_MODES[resolvedType] ?? 0, time, RAMP_TIME)

        if (freq !== undefined) {
            const fFreq = toFiniteNumber(freq, 20, 'freq')
            params.get('cutoff')?.setTargetAtTime(fFreq, time, RAMP_TIME)
        }

        if (q !== undefined) {
            const fQ = toFiniteNumber(q, 0.707, 'q')
            params.get('q')?.setTargetAtTime(fQ, time, RAMP_TIME)
        }
    }

    updateSaturation = (type = 'soft', amount = 0) => {
        if (!this.stripNode) return
        const time = this.audioCtx.currentTime
        const params = this.stripNode.parameters

        const normalizedAmount = clamp(toFiniteNumber(amount, 0, 'amount'), 0, 1)

        const typeIdx = SATURATION_TYPES_IDX[type] ?? 0
        const drive = 1 + normalizedAmount * 6
        const out = 1 - normalizedAmount * 0.15
        const mix = normalizedAmount > 0 ? 1 : 0

        params.get('satType')?.setTargetAtTime(typeIdx, time, RAMP_TIME)
        params.get('satDrive')?.setTargetAtTime(drive, time, RAMP_TIME)
        params.get('satOut')?.setTargetAtTime(out, time, RAMP_TIME)
        params.get('satMix')?.setTargetAtTime(mix, time, RAMP_TIME)
    }

    updateReverb = (type = 'none', amount = 0) => {
        if (!this.stripNode) return
        const time = this.audioCtx.currentTime
        const params = this.stripNode.parameters

        const normalizedType = mapStripEnum(REVERB_PRESETS, type, 'reverbType', 'none')
        const normalizedAmount = clamp(toFiniteNumber(amount, 0, 'amount'), 0, 1)

        const p = REVERB_PRESETS[normalizedType] ?? REVERB_PRESETS.none
        const wet = normalizedType === 'none' ? 0 : normalizedAmount

        params.get('revRoom')?.setTargetAtTime(p.room, time, RAMP_TIME)
        params.get('revDamp')?.setTargetAtTime(p.damp, time, RAMP_TIME)
        params.get('revWidth')?.setTargetAtTime(p.width, time, RAMP_TIME)
        params.get('revMix')?.setTargetAtTime(wet, time, RAMP_TIME)
    }

    /** @param {number} timeBeats delay length in BEATS (the model calls it a multiplier of one beat) */
    updateDelay = (type = 'tape', timeBeats = 1, amount = 0) => {
        if (!this.stripNode) return
        const time = this.audioCtx.currentTime
        const params = this.stripNode.parameters

        const normalizedAmount = clamp(toFiniteNumber(amount, 0, 'amount'), 0, 1)

        // BEFORE the mode lookup: 'none' is not in DELAY_MODES, and running it
        // through mapStripEnum would report it as an unknown enum and fall back
        // to 'tape' — i.e. a delay where the track says there is none.
        if (type === NO_DELAY_TYPE || normalizedAmount <= 0) {
            params.get('dlyMix')?.setTargetAtTime(0, time, RAMP_TIME)
            return
        }

        const normalizedType = mapStripEnum(DELAY_MODES, type, 'delayType', 'tape')

        const delaySeconds = Utils.getDelayTimeInSeconds(timeBeats, this.bpm)
        const mode = DELAY_MODES[normalizedType] ?? 1
        const isPP = mode >= 1.5

        params.get('dlyTimeL')?.setTargetAtTime(isPP ? delaySeconds * 0.667 : delaySeconds, time, RAMP_TIME)
        params.get('dlyTimeR')?.setTargetAtTime(delaySeconds, time, RAMP_TIME)
        params.get('dlyMode')?.setTargetAtTime(mode, time, RAMP_TIME)
        params.get('dlyMix')?.setTargetAtTime(normalizedAmount, time, RAMP_TIME)
    }

    delete = () => {
        if (this.stripNode) {
            this.stripNode.disconnect()
            this.stripNode = null
        }
        this.voicesInput.disconnect()
        if (this.levelAnalyser) {
            this.levelAnalyser.disconnect()
            this.levelAnalyser = null
        }
    }
}
