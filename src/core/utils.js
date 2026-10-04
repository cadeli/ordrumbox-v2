import { TRACK_DEFAULTS } from '../model/track_schema.js'
import { NOTE_DEFAULTS, NOTE_POSITION_KEYS } from './note_schema.js'
import { logger } from './logger.js'

export default class Utils {
    /** Logger tag for every warning this module emits. */
    static TAG = 'UTILS'

    static filterTypeList = ['lowpass', 'highpass', 'bandpass']

    static waveList = ['sine', 'triangle', 'sawtooth', 'square', 'random']

    static delayTimeValues = [0.0625, 0.125, 0.25, 0.5, 1, 2, 4]

    static delayTimeLabels = ['1/16', '1/8', '1/4', '1/2', '1', '2', '4']

    static getDelayTimeInSeconds = (delayTimeValue, bpm) => {
        const num = Number(delayTimeValue)
        // 0 is a valid delayTime (TRACK_VALUE_RANGES.delayTime.min = 0) — only non-finite falls back.
        if (!Number.isFinite(num)) {
            logger.warn(Utils.TAG, 'invalid delayTimeValue, using 1 beat', delayTimeValue)
            return (60 / bpm) * 1
        }
        return (60 / bpm) * num
    }

    static TRACK_DEFAULTS = TRACK_DEFAULTS

    static PATTERN_DEFAULTS = {
        // Stable id, assigned once at creation and never regenerated: song
        // arrangements reference patterns by id (see model/song_schema.js).
        // A rename must not change it.
        id: '',
        beatCount: 4,
        bpm: 120,
        description: '',
        tags: [],
        tracks: [],
    }

    static NOTE_DEFAULTS = NOTE_DEFAULTS

    static NOTE_POSITION_KEYS = NOTE_POSITION_KEYS
}
