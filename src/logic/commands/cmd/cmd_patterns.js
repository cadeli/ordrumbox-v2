import { appState } from '../../../state/app_state.js'
import Defaults from '../../../patterns/defaults.js'
import { importPatternFromJson } from '../pattern_import.js'
import { logger } from '../../../core/logger.js'

/**
 * Pattern CRUD commands — returns an object of methods bound to the Commander instance.
 */
export function createPatternMethods(cmd) {
    return {
        addPattern(name) {
            const pattern = this.createPattern(name)
            const patternIndex = appState.patterns.length
            appState.patterns.push(pattern)
            cmd.persist()
            cmd.record({
                desc: `Add pattern "${pattern.name}"`,
                execute: () => {
                    if (!appState.patterns.includes(pattern)) {
                        appState.patterns.splice(Math.min(patternIndex, appState.patterns.length), 0, pattern)
                        cmd.persist()
                    }
                },
                undo: () => {
                    const i = appState.patterns.indexOf(pattern)
                    if (i >= 0) appState.patterns.splice(i, 1)
                    cmd.persist()
                },
            })
            return pattern
        },

        removePattern(idx) {
            if (appState.patterns.length <= 1) return false
            const removedPattern = appState.patterns[idx]
            appState.patterns.splice(idx, 1)
            if (appState.selectedPatternNum >= appState.patterns.length) {
                appState.selectedPatternNum = appState.patterns.length - 1
            }
            cmd.persist()
            cmd.record({
                desc: `Remove pattern "${removedPattern.name}"`,
                execute: () => {
                    const i = appState.patterns.indexOf(removedPattern)
                    appState.patterns.splice(i >= 0 ? i : idx, 1)
                    if (appState.selectedPatternNum >= appState.patterns.length) {
                        appState.selectedPatternNum = Math.max(0, appState.patterns.length - 1)
                    }
                    cmd.persist()
                },
                undo: () => {
                    appState.patterns.splice(Math.min(idx, appState.patterns.length), 0, removedPattern)
                    cmd.persist()
                },
            })
            return true
        },

        renamePattern(idx, newName) {
            const pat = appState.patterns[idx]
            if (!pat) return
            const oldName = pat.name
            pat.name = String(newName ?? '').trim() || pat.name
            const appliedName = pat.name
            cmd.persist()
            cmd.record({
                desc: `Rename pattern → "${appliedName}"`,
                execute: () => {
                    pat.name = appliedName
                    cmd.persist()
                },
                undo: () => {
                    pat.name = oldName
                    cmd.persist()
                },
            })
        },

        getPatternByName(name) {
            const normalizedName = String(name ?? '')
                .trim()
                .toUpperCase()
            return appState.patterns.find((pattern) => pattern?.name?.toUpperCase() === normalizedName) ?? null
        },

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
            cmd.persist()
            cmd.record({
                desc: `Set BPM → ${appliedBpm}`,
                execute: () => {
                    pattern.bpm = appliedBpm
                    cmd.persist()
                },
                undo: () => {
                    pattern.bpm = oldBpm
                    cmd.persist()
                },
            })
            return pattern
        },

        setPatternDescription(pattern, description) {
            const oldDescription = pattern.description
            pattern.description = String(description ?? '')
            const appliedDescription = pattern.description
            cmd.persist()
            cmd.record({
                desc: `Set description on "${pattern.name}"`,
                execute: () => {
                    pattern.description = appliedDescription
                    cmd.persist()
                },
                undo: () => {
                    pattern.description = oldDescription
                    cmd.persist()
                },
            })
            return pattern
        },

        importPatternFromJson(sourcePattern) {
            const result = importPatternFromJson(
                sourcePattern,
                (name) => this.addPattern(name),
                (pattern, name) => this.addTrack(pattern, name),
                (track, beat, beatStep, pitch) => this.addNote(track, beat, beatStep, pitch),
            )
            cmd.persist()
            return result
        },

        createPattern(name) {
            name ??= `NewPat_${appState.patterns.length}`
            return { name, description: '', tracks: [], bpm: 120, nbBeats: 4 }
        },
    }
}
