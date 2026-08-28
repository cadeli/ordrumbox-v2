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
            let pattern = this.createPattern(name)
            const patternIndex = appState.patterns.length
            appState.patterns.push(pattern)
            cmd._persist()
            cmd._record(() => {
                appState.patterns.splice(patternIndex, 1)
                cmd._persist()
            }, { desc: 'Add pattern' })
            return pattern
        },

        removePattern(idx) {
            if (appState.patterns.length <= 1) return false
            const removedPattern = appState.patterns[idx]
            appState.patterns.splice(idx, 1)
            if (appState.selectedPatternNum >= appState.patterns.length) {
                appState.selectedPatternNum = appState.patterns.length - 1
            }
            cmd._persist()
            cmd._record(() => {
                appState.patterns.splice(idx, 0, removedPattern)
                cmd._persist()
            }, { desc: 'Remove pattern' })
            return true
        },

        renamePattern(idx, newName) {
            const pat = appState.patterns[idx]
            if (!pat) return
            const oldName = pat.name
            pat.name = String(newName ?? '').trim() || pat.name
            cmd._persist()
            cmd._record(() => {
                pat.name = oldName
                cmd._persist()
            }, { desc: 'Rename pattern' })
        },

        getPatternByName(name) {
            const normalizedName = String(name ?? '').trim().toUpperCase()
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
            cmd._persist()
            cmd._record(() => {
                pattern.bpm = oldBpm
                cmd._persist()
            }, { desc: 'Set BPM' })
            return pattern
        },

        setPatternDescription(pattern, description) {
            const oldDescription = pattern.description
            pattern.description = String(description ?? '')
            cmd._persist()
            cmd._record(() => {
                pattern.description = oldDescription
                cmd._persist()
            }, { desc: 'Set description' })
            return pattern
        },

        importPatternFromJson(sourcePattern) {
            const result = importPatternFromJson(
                sourcePattern,
                (name) => this.addPattern(name),
                (pattern, name) => this.addTrack(pattern, name),
                (track, beat, beatStep, pitch) => this.addNote(track, beat, beatStep, pitch)
            )
            cmd._persist()
            return result
        },

        createPattern(name) {
            name ??= `NewPat_${appState.patterns.length}`
            return { name, description: "", tracks: [], bpm: 120, nbBeats: 4 }
        }
    }
}
