// @ts-check
import { appState } from '../../../state/app_state.js'
import Defaults from '../../../patterns/defaults.js'
import { importPatternFromJson } from '../pattern_import.js'
import { logger } from '../../../core/logger.js'
import { MAX_BEATS } from '../../../core/constants.js'
import { recalcLoopDerived } from '../../../model/track_schema.js'
import Utils from '../../../core/utils.js'

/**
 * Pattern commands — sub-module of the Commander (see CommanderHost in ../cmd.js).
 */
export default class PatternCommands {
    #host

    /** @param {import('../cmd.js').CommanderHost} host */
    constructor(host) {
        this.#host = host
    }

    addPattern(name) {
        const pattern = this.createPattern(name)
        const patternIndex = appState.patterns.length
        appState.patterns.push(pattern)
        this.#host.persist()
        this.#host.record({
            desc: `Add pattern "${pattern.name}"`,
            params: { pattern: pattern.name, index: patternIndex },
            execute: () => {
                if (!appState.patterns.includes(pattern)) {
                    appState.patterns.splice(Math.min(patternIndex, appState.patterns.length), 0, pattern)
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
        const bpmNum = Number(bpm)
        const oldBpm = pattern.bpm
        if (!Number.isFinite(bpmNum) || bpmNum === 0) {
            logger.warn('Command', 'bpm NaN/0', bpm)
            pattern.bpm = Defaults.getPatternProp({}, 'bpm')
        } else {
            pattern.bpm = bpmNum
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
     * Set the pattern length in beats and resync every track: track nbBeats
     * follow the pattern, loop points clamp to the new length.
     * @param {any} pattern
     * @param {number} nbBeats - target length in beats (1..MAX_BEATS)
     * @returns {any} the pattern
     */
    setPatternNbBeats(pattern, nbBeats) {
        const requested = Math.round(Number(nbBeats))
        const appliedNbBeats =
            Number.isFinite(requested) && requested >= 1 && requested <= MAX_BEATS
                ? requested
                : Utils.PATTERN_DEFAULTS.nbBeats
        if (appliedNbBeats !== requested) {
            logger.warn('Command', 'nbBeats out of bounds', nbBeats, `→ ${appliedNbBeats}`)
        }

        const readTrackStates = () =>
            Utils.getTracksArray(pattern).map((track) => ({
                track,
                nbBeats: track.nbBeats,
                loopAtStep: track.loopAtStep,
                loopPointBeat: track.loopPointBeat,
                loopPointStep: track.loopPointStep,
            }))

        const oldNbBeats = pattern.nbBeats
        const oldTrackStates = readTrackStates()

        const applyState = (beats, trackStates) => {
            pattern.nbBeats = beats
            for (const { track, nbBeats, loopAtStep, loopPointBeat, loopPointStep } of trackStates) {
                track.nbBeats = nbBeats
                track.loopAtStep = loopAtStep
                track.loopPointBeat = loopPointBeat
                track.loopPointStep = loopPointStep
            }
            this.#host.persist()
        }

        const newTrackStates = Utils.getTracksArray(pattern).map((track) => {
            const maxSteps = appliedNbBeats * (track.stepsPerBeat ?? 4)
            if (track.loopAtStep > maxSteps) {
                track.loopAtStep = maxSteps
                recalcLoopDerived(track)
            }
            track.nbBeats = appliedNbBeats
            return {
                track,
                nbBeats: track.nbBeats,
                loopAtStep: track.loopAtStep,
                loopPointBeat: track.loopPointBeat,
                loopPointStep: track.loopPointStep,
            }
        })
        pattern.nbBeats = appliedNbBeats

        if (pattern.nbBeats !== oldNbBeats) {
            this.#host.record({
                desc: `Set pattern length → ${appliedNbBeats} beats`,
                params: { pattern: pattern.name, nbBeats: appliedNbBeats },
                prev: { nbBeats: oldNbBeats },
                execute: () => applyState(appliedNbBeats, newTrackStates),
                undo: () => applyState(oldNbBeats, oldTrackStates),
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
        return { name, description: '', tracks: [], bpm: 120, nbBeats: 4 }
    }
}
