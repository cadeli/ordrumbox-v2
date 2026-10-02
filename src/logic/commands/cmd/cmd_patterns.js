// @ts-check
import { appState } from '../../../state/app_state.js'
import Defaults from '../../../patterns/defaults.js'
import { importPatternFromJson } from '../pattern_import.js'
import { logger } from '../../../core/logger.js'
import { MAX_BEATS } from '../../../core/constants.js'
import { recalcLoopDerived } from '../../../model/track_schema.js'
import Utils from '../../../core/utils.js'
import { ensurePatternId } from '../../../model/song_schema.js'

/**
 * Pattern commands — sub-module of the Commander (see CommanderHost in ../cmd.js).
 */
export default class PatternCommands {
    #host

    /** @param {import('../cmd.js').CommanderHost} host */
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

    /** The arrangement a song command applies to, or null when there is none. */
    #song(songIdx) {
        const index = songIdx ?? appState.selectedSongIdx ?? 0
        const song = appState.songs?.[index]
        return song ? { song, index } : null
    }

    /**
     * Place a pattern on the bar timeline of a song. One undo step.
     * @param {{pattern: string, startBar: number, bars: number}} clip
     * @param {number} [songIdx] defaults to the selected song
     */
    addSongClip(clip, songIdx) {
        const found = this.#song(songIdx)
        if (!found || !clip?.pattern) return false
        const { song, index } = found
        const added = {
            pattern: String(clip.pattern),
            startBar: Math.max(0, Math.floor(Number(clip.startBar) || 0)),
            bars: Number(clip.bars) > 0 ? Number(clip.bars) : 1,
        }
        song.clips.push(added)
        this.#host.persist()
        this.#host.record({
            desc: `Add "${added.pattern}" at bar ${added.startBar + 1}`,
            params: { pattern: added.pattern, startBar: added.startBar, song: index },
            execute: () => {
                song.clips.push({ ...added })
                this.#host.persist()
            },
            undo: () => {
                const i = song.clips.lastIndexOf(added)
                if (i >= 0) song.clips.splice(i, 1)
                this.#host.persist()
            },
        })
        return true
    }

    /**
     * Remove clips by index. Indices are taken as one batch so a row delete is a
     * single undo step instead of one per clip.
     * @param {number[]} indices
     * @param {number} [songIdx] defaults to the selected song
     */
    removeSongClips(indices, songIdx) {
        const found = this.#song(songIdx)
        if (!found) return false
        const { song, index } = found
        // Highest first, so the earlier removals cannot shift the later ones.
        const targets = [...new Set(indices)]
            .filter((i) => Number.isInteger(i) && i >= 0 && i < song.clips.length)
            .sort((a, b) => b - a)
        if (targets.length === 0) return false
        // Keep each clip's original slot: re-appending them on undo would
        // reorder the arrangement (removing a and c from [a,b,c] then undoing
        // by pushing them back yields [b,a,c]).
        const removed = targets.map((i) => ({ clip: song.clips[i], index: i }))
        for (const i of targets) song.clips.splice(i, 1)
        this.#host.persist()
        this.#host.record({
            desc: removed.length === 1 ? `Remove clip "${removed[0].clip.pattern}"` : `Remove ${removed.length} clips`,
            params: { patterns: removed.map((r) => r.clip.pattern), song: index },
            execute: () => {
                const positions = removed
                    .map((r) => song.clips.indexOf(r.clip))
                    .filter((i) => i >= 0)
                    .sort((a, b) => b - a)
                for (const i of positions) song.clips.splice(i, 1)
                this.#host.persist()
            },
            undo: () => {
                // ascending, each back into its original slot
                for (const { clip, index: at } of [...removed].sort((a, b) => a.index - b.index)) {
                    song.clips.splice(Math.min(at, song.clips.length), 0, { ...clip })
                }
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
                : Utils.PATTERN_DEFAULTS.beatCount
        if (appliedBeatCount !== requested) {
            logger.warn('Command', 'beatCount out of bounds', beatCount, `→ ${appliedBeatCount}`)
        }

        const readTrackStates = () =>
            Utils.getTracksArray(pattern).map((track) => ({
                track,
                beatCount: track.beatCount,
                loopAtStep: track.loopAtStep,
                loopPointBeat: track.loopPointBeat,
                loopPointStep: track.loopPointStep,
            }))

        const oldBeatCount = pattern.beatCount
        const oldTrackStates = readTrackStates()

        const applyState = (beats, trackStates) => {
            pattern.beatCount = beats
            for (const { track, beatCount, loopAtStep, loopPointBeat, loopPointStep } of trackStates) {
                track.beatCount = beatCount
                track.loopAtStep = loopAtStep
                track.loopPointBeat = loopPointBeat
                track.loopPointStep = loopPointStep
            }
            this.#host.persist()
        }

        const newTrackStates = Utils.getTracksArray(pattern).map((track) => {
            const maxSteps = appliedBeatCount * (track.stepsPerBeat ?? 4)
            if (track.loopAtStep > maxSteps) {
                track.loopAtStep = maxSteps
                recalcLoopDerived(track)
            }
            track.beatCount = appliedBeatCount
            return {
                track,
                beatCount: track.beatCount,
                loopAtStep: track.loopAtStep,
                loopPointBeat: track.loopPointBeat,
                loopPointStep: track.loopPointStep,
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
