import { appState } from '../../state/app_state.js'
import Defaults from '../../patterns/defaults.js'
import { importPatternFromJson } from './pattern_import.js'
import { logger } from '../../core/logger.js'
import { MAX_BEATS } from '../../core/constants.js'
import { getTracksArray } from '../../core/tracks.js'
import { PATTERN_DEFAULTS } from '../../model/pattern_schema.js'
import { ensurePatternId } from '../../model/song_schema.js'

/**
 * Pattern commands — sub-module of the Commander (see CommanderHost in ./commander.js).
 */
export default class PatternCommands {
    #host

    /** @param {import('./commander.js').CommanderHost} host */
    constructor(host) {
        this.#host = host
    }

    /** Ids already used by the library, so a new pattern cannot collide. */
    #takenIds() {
        return new Set(appState.patterns.map((p) => p?.id).filter(Boolean))
    }

    /**
     * Give `pattern` a fresh, non-colliding id, replacing whatever it carries.
     * Needed after a clone: copying a pattern field-by-field also copies its id,
     * and two patterns sharing one would make every arrangement reference
     * ambiguous.
     * @param {{ id?: string, name?: string }} pattern
     * @returns {string} the new id
     */
    refreshPatternId(pattern) {
        pattern.id = ''
        return ensurePatternId(pattern, this.#takenIds())
    }

    addPattern(name) {
        const pattern = this.createPattern(name)
        const patternIdx = appState.patterns.length
        appState.patterns.push(pattern)
        this.#host.persist()
        this.#host.record({
            desc: `Add pattern "${pattern.name}"`,
            params: { pattern: pattern.name, index: patternIdx },
            execute: () => {
                if (!appState.patterns.includes(pattern)) {
                    appState.patterns.splice(Math.min(patternIdx, appState.patterns.length), 0, pattern)
                    this.#host.persist()
                }
            },
            undo: () => {
                const i = appState.patterns.indexOf(pattern)
                if (i >= 0) appState.patterns.splice(i, 1)
                this.#host.persist()
            },
        })
        return pattern
    }

    removePattern(idx) {
        if (appState.patterns.length <= 1) return false
        const removedPattern = appState.patterns[idx]
        appState.patterns.splice(idx, 1)
        if (appState.selectedPatternIdx >= appState.patterns.length) {
            appState.selectedPatternIdx = appState.patterns.length - 1
        }
        this.#host.persist()
        this.#host.record({
            desc: `Remove pattern "${removedPattern.name}"`,
            params: { pattern: removedPattern.name, index: idx },
            execute: () => {
                const i = appState.patterns.indexOf(removedPattern)
                appState.patterns.splice(i >= 0 ? i : idx, 1)
                if (appState.selectedPatternIdx >= appState.patterns.length) {
                    appState.selectedPatternIdx = Math.max(0, appState.patterns.length - 1)
                }
                this.#host.persist()
            },
            undo: () => {
                appState.patterns.splice(Math.min(idx, appState.patterns.length), 0, removedPattern)
                this.#host.persist()
            },
        })
        return true
    }

    renamePattern(idx, newName) {
        const pat = appState.patterns[idx]
        if (!pat) return
        const oldName = pat.name
        pat.name = String(newName ?? '').trim() || pat.name
        const appliedName = pat.name
        this.#host.persist()
        this.#host.record({
            desc: `Rename pattern → "${appliedName}"`,
            params: { pattern: appliedName, from: oldName },
            execute: () => {
                pat.name = appliedName
                this.#host.persist()
            },
            undo: () => {
                pat.name = oldName
                this.#host.persist()
            },
        })
    }

    getPatternByName(name) {
        const normalizedName = String(name ?? '')
            .trim()
            .toUpperCase()
        return appState.patterns.find((pattern) => pattern?.name?.toUpperCase() === normalizedName) ?? null
    }

    setPatternBpm(pattern, bpm) {
        const bpmValue = Number(bpm)
        const oldBpm = pattern.bpm
        if (!Number.isFinite(bpmValue) || bpmValue === 0) {
            logger.warn('Command', 'bpm NaN/0', bpm)
            pattern.bpm = Defaults.getPatternProp({}, 'bpm')
        } else {
            pattern.bpm = bpmValue
        }
        const appliedBpm = pattern.bpm
        this.#host.persist()
        this.#host.record({
            desc: `Set BPM → ${appliedBpm}`,
            params: { bpm: appliedBpm },
            prev: { bpm: oldBpm },
            execute: () => {
                pattern.bpm = appliedBpm
                this.#host.persist()
            },
            undo: () => {
                pattern.bpm = oldBpm
                this.#host.persist()
            },
        })
        return pattern
    }

    /**
     * Set the pattern length in beats and resync every track: track beatCount
     * follow the pattern, loop points clamp to the new length.
     * @param {any} pattern
     * @param {number} beatCount - target length in beats (1..MAX_BEATS)
     * @returns {any} the pattern
     */
    setPatternBeatCount(pattern, beatCount) {
        const requested = Math.round(Number(beatCount))
        const appliedBeatCount =
            Number.isFinite(requested) && requested >= 1 && requested <= MAX_BEATS
                ? requested
                : PATTERN_DEFAULTS.beatCount
        if (appliedBeatCount !== requested) {
            logger.warn('Command', 'beatCount out of bounds', beatCount, `→ ${appliedBeatCount}`)
        }

        const readTrackStates = () =>
            getTracksArray(pattern).map((track) => ({
                track,
                beatCount: track.beatCount,
                loopAtStep: track.loopAtStep,
            }))

        const oldBeatCount = pattern.beatCount
        const oldTrackStates = readTrackStates()

        const applyState = (beats, trackStates) => {
            pattern.beatCount = beats
            for (const { track, beatCount, loopAtStep } of trackStates) {
                track.beatCount = beatCount
                track.loopAtStep = loopAtStep
            }
            this.#host.persist()
        }

        const newTrackStates = getTracksArray(pattern).map((track) => {
            const maxSteps = appliedBeatCount * (track.stepsPerBeat ?? 4)
            if (track.loopAtStep > maxSteps) {
                track.loopAtStep = maxSteps
            }
            track.beatCount = appliedBeatCount
            return {
                track,
                beatCount: track.beatCount,
                loopAtStep: track.loopAtStep,
            }
        })
        pattern.beatCount = appliedBeatCount

        if (pattern.beatCount !== oldBeatCount) {
            this.#host.record({
                desc: `Set pattern length → ${appliedBeatCount} beats`,
                params: { pattern: pattern.name, beatCount: appliedBeatCount },
                prev: { beatCount: oldBeatCount },
                execute: () => applyState(appliedBeatCount, newTrackStates),
                undo: () => applyState(oldBeatCount, oldTrackStates),
            })
        }
        this.#host.persist()
        return pattern
    }

    setPatternDescription(pattern, description) {
        const oldDescription = pattern.description
        pattern.description = String(description ?? '')
        const appliedDescription = pattern.description
        this.#host.persist()
        this.#host.record({
            desc: `Set description on "${pattern.name}"`,
            params: { pattern: pattern.name, description: appliedDescription },
            prev: { description: oldDescription },
            execute: () => {
                pattern.description = appliedDescription
                this.#host.persist()
            },
            undo: () => {
                pattern.description = oldDescription
                this.#host.persist()
            },
        })
        return pattern
    }

    importPatternFromJson(sourcePattern) {
        const result = importPatternFromJson(
            sourcePattern,
            (name) => this.addPattern(name),
            (pattern, name) => this.#host.addTrack(pattern, name),
            (track, beat, beatStep, pitch) => this.#host.addNote(track, beat, beatStep, pitch),
        )
        this.#host.persist()
        return result
    }

    createPattern(name) {
        name ??= `NewPat_${appState.patterns.length}`
        const pattern = { name, description: '', tracks: [], bpm: 120, beatCount: 4 }
        ensurePatternId(pattern, this.#takenIds())
        return pattern
    }
}
