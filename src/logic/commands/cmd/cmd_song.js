import { appState } from '../../../state/app_state.js'
import { reportUserError } from '../../../core/notify.js'
import {
    barsForPattern,
    ensurePatternId,
    normalizeSong,
    songContentBars,
    uniqueId,
} from '../../../model/song_schema.js'
import Utils from '../../../core/utils.js'

/**
 * @typedef {object} SongClipOptions
 * @property {number} [bars]    clip duration in bars (defaults to the pattern's own length)
 * @property {number} [songIdx] arrangement to apply to (defaults to the selected one)
 */

/**
 * @typedef {object} ArrangementSpec
 * @property {string}  [name]
 * @property {string}  [description]
 * @property {number}  [bpm]        clamped to SONG_MIN_BPM..SONG_MAX_BPM
 * @property {number}  [loopBars]   starting loop length; every later clip edit
 *                                  moves it onto the last occupied measure
 */

/**
 * Song (arrangement) commands — sub-module of the Commander (see CommanderHost in ../cmd.js).
 *
 * A song is an ordered list of clips placing patterns on the bar timeline
 * (see src/model/song_schema.js for the persisted format).
 *
 * Two layers:
 *  - `addSongClip` / `removeSongClips` are the primitives, they take a raw clip
 *    and clip indices;
 *  - `addPatternAtBar` / `repeatPatternAtBar` / `removePatternAtBar` /
 *    `removePatternClips` are the API callers should use: they resolve a
 *    pattern by name or id, derive the clip duration from it, and report what
 *    they could not do instead of failing silently.
 *
 * Clips reference a pattern by its **stable id**, never by index or name, so
 * every high-level command resolves the caller's reference first.
 *
 * Every clip edit also moves the arrangement's loop onto the last measure it
 * occupies (#followContent), so the grid and the playback loop never show or play
 * measures nothing is placed on — and never miss a clip that was just added past
 * the old loop.
 *
 * Arrangements themselves are created by `addArrangement` (empty by design: its
 * clips are placed afterwards, so none can reference a pattern that is gone)
 * and are selected through `setSelectedSongIdx`.
 */
export default class SongCommands {
    #host

    /** @param {import('../cmd.js').CommanderHost} host */
    constructor(host) {
        this.#host = host
    }

    /** The arrangement a song command applies to, or null when there is none. */
    #song(songIdx) {
        const index = songIdx ?? appState.selectedSongIdx ?? 0
        const song = appState.songs?.[index]
        return song ? { song, index } : null
    }

    /** The arrangement to modify, or a user-visible report when there is none. */
    #requireSong(songIdx) {
        const found = this.#song(songIdx)
        if (!found) {
            reportUserError('SongCommands.noSong', 'No arrangement to edit — create a song first', {
                once: false,
                cause: new Error(`SongCommands: no song at index ${songIdx ?? appState.selectedSongIdx ?? 0}`),
            })
        }
        return found
    }

    /**
     * Resolve a library pattern from an id or a name (case-insensitive, trimmed).
     * @param {any} ref
     * @returns {any|null}
     */
    #patternByRef(ref) {
        const needle = String(ref ?? '').trim()
        if (!needle) return null
        const byId = appState.patterns.find((pattern) => pattern?.id === needle)
        if (byId) return byId
        const upper = needle.toUpperCase()
        return (
            appState.patterns.find(
                (pattern) =>
                    String(pattern?.name ?? '')
                        .trim()
                        .toUpperCase() === upper,
            ) ?? null
        )
    }

    /** Ids already used by the library, so a repaired id cannot collide. */
    #takenIds() {
        return new Set(appState.patterns.map((pattern) => pattern?.id).filter(Boolean))
    }

    /**
     * Point the loop at the last measure the arrangement occupies.
     *
     * `loopBars` is both the grid width and what the player loops over, so a loop
     * left at its old value draws measures nothing occupies any more, and a clip
     * added past it would never sound at all. Every clip edit therefore moves the
     * loop onto the content: a `loopBars` written by a song file is honoured when
     * it loads, but it stops being a promise once the arrangement is edited.
     *
     * @param {import('../../../model/song_schema.js').Song} song
     * @returns {number} the loop length now in force, 0 when nothing is placed
     */
    #followContent(song) {
        const bars = songContentBars(song)
        this.#setLoop(song, bars)
        return bars
    }

    /**
     * Set the loop length, or drop the field when there is none: an arrangement
     * with no clip has no loop, and a stored 0 would be meaningless.
     * @param {import('../../../model/song_schema.js').Song} song
     * @param {number|null|undefined} bars
     */
    #setLoop(song, bars) {
        if (bars == null || !(bars > 0)) delete song.loopBars
        else song.loopBars = bars
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
        const loopBefore = song.loopBars
        song.clips.push(added)
        const loopAfter = this.#followContent(song)
        this.#host.persist()
        this.#host.record({
            desc: `Add "${added.pattern}" at bar ${added.startBar + 1}`,
            params: { pattern: added.pattern, startBar: added.startBar, song: index },
            execute: () => {
                song.clips.push({ ...added })
                this.#setLoop(song, loopAfter)
                this.#host.persist()
            },
            undo: () => {
                const i = song.clips.lastIndexOf(added)
                if (i >= 0) song.clips.splice(i, 1)
                this.#setLoop(song, loopBefore)
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
        const loopBefore = song.loopBars
        for (const i of targets) song.clips.splice(i, 1)
        const loopAfter = this.#followContent(song)
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
                this.#setLoop(song, loopAfter)
                this.#host.persist()
            },
            undo: () => {
                // ascending, each back into its original slot
                for (const { clip, index: at } of [...removed].sort((a, b) => a.index - b.index)) {
                    song.clips.splice(Math.min(at, song.clips.length), 0, { ...clip })
                }
                this.#setLoop(song, loopBefore)
                this.#host.persist()
            },
        })
        return true
    }

    // ── high-level placement API ────────────────────────────────────────────────

    /**
     * Place a pattern in the arrangement, at `startBar` (0-based measure).
     *
     * `patternRef` is a pattern id or name — the name is what the library and
     * the UI show, the id is what a clip stores. The clip lasts as long as the
     * pattern itself unless `bars` says otherwise.
     *
     * @param {any} patternRef pattern id or name
     * @param {number} [startBar] 0-based measure (default 0)
     * @param {SongClipOptions} [options]
     * @returns {import('../../../model/song_schema.js').SongClip|null} the clip added
     */
    addPatternAtBar(patternRef, startBar = 0, { bars, songIdx } = {}) {
        const found = this.#requireSong(songIdx)
        if (!found) return null
        const pattern = this.#patternByRef(patternRef)
        if (!pattern) {
            reportUserError(
                'SongCommands.addPatternAtBar.unknownPattern',
                `No pattern named "${String(patternRef ?? '').trim()}" in the library`,
                { cause: new Error(`addPatternAtBar: unknown pattern "${patternRef}"`) },
            )
            return null
        }
        // A clip stores an id, and an id-less pattern would be dropped by
        // normalizeSong() on the next load: repair it rather than write a
        // dangling clip.
        const patternId = ensurePatternId(pattern, this.#takenIds())
        const requested = Number(bars)
        const duration = Number.isFinite(requested) && requested > 0 ? requested : barsForPattern(pattern)
        const added = this.addSongClip({ pattern: patternId, startBar, bars: duration }, songIdx)
        return added ? found.song.clips[found.song.clips.length - 1] : null
    }

    /**
     * Repeat the clip starting at `startBar` right after itself, with the same
     * duration — the DAW "clone to the right" gesture.
     *
     * @param {number} startBar measure of the clip to repeat
     * @param {SongClipOptions} [options]
     * @returns {import('../../../model/song_schema.js').SongClip|null} the new clip
     */
    repeatPatternAtBar(startBar, { songIdx } = {}) {
        const found = this.#song(songIdx)
        if (!found) {
            this.#requireSong(songIdx)
            return null
        }
        const clip = found.song.clips.find((entry) => entry?.startBar === startBar)
        if (!clip) {
            reportUserError('SongCommands.repeatPatternAtBar.noClip', `No clip at bar ${Number(startBar) + 1}`, {
                cause: new Error(`repeatPatternAtBar: no clip at bar ${startBar}`),
            })
            return null
        }
        return this.addPatternAtBar(clip.pattern, clip.startBar + clip.bars, { bars: clip.bars, songIdx })
    }

    // ── high-level removal API ──────────────────────────────────────────────────

    /**
     * Remove every clip starting at `startBar` (one undo step).
     *
     * @param {number} startBar 0-based measure
     * @param {object} [options]
     * @param {number} [options.songIdx]
     * @returns {import('../../../model/song_schema.js').SongClip[]} the clips removed (empty when there was nothing to remove)
     */
    removePatternAtBar(startBar, { songIdx } = {}) {
        const found = this.#requireSong(songIdx)
        if (!found) return []
        const { song } = found
        const indices = song.clips.map((clip, i) => (clip?.startBar === startBar ? i : -1)).filter((i) => i >= 0)
        if (indices.length === 0) {
            reportUserError('SongCommands.removePatternAtBar.noClip', `No clip at bar ${Number(startBar) + 1}`, {
                cause: new Error(`removePatternAtBar: no clip at bar ${startBar}`),
            })
            return []
        }
        const removed = indices.map((i) => song.clips[i])
        this.removeSongClips(indices, songIdx)
        return removed
    }

    /**
     * Remove every clip using a pattern, wherever it sits (one undo step, so a
     * whole row disappears as a single gesture).
     *
     * Takes a name or an id; an id the library no longer knows is accepted on
     * purpose, so an orphaned row left by a deleted pattern can be cleaned up.
     *
     * @param {any} patternRef pattern id or name
     * @param {object} [options]
     * @param {number} [options.songIdx]
     * @returns {import('../../../model/song_schema.js').SongClip[]} the clips removed (empty when there was nothing to remove)
     */
    removePatternClips(patternRef, { songIdx } = {}) {
        const found = this.#requireSong(songIdx)
        if (!found) return []
        const patternId = this.#patternByRef(patternRef)?.id ?? String(patternRef ?? '').trim()
        if (!patternId) {
            reportUserError('SongCommands.removePatternClips.noPattern', 'No pattern given to remove', {
                cause: new Error('removePatternClips: empty reference'),
            })
            return []
        }
        const { song } = found
        const indices = song.clips.map((clip, i) => (clip?.pattern === patternId ? i : -1)).filter((i) => i >= 0)
        if (indices.length === 0) return []
        const removed = indices.map((i) => song.clips[i])
        this.removeSongClips(indices, songIdx)
        return removed
    }

    // ── arrangement CRUD ────────────────────────────────────────────────────────

    /**
     * Create an empty arrangement and select it.
     *
     * Empty on purpose: clips reference patterns by id and are dropped by
     * normalizeSong() when that id is unknown, so a caller places them with
     * addPatternAtBar() right after. One undo step.
     *
     * @param {ArrangementSpec} [spec]
     * @returns {import('../../../model/song_schema.js').Song|null} the new arrangement
     */
    addArrangement(spec = {}) {
        const name = String(spec.name ?? '').trim() || 'Untitled'
        const taken = new Set((appState.songs ?? []).map((song) => song?.id).filter(Boolean))
        // No clips can be valid yet, so the known-id set is empty on purpose.
        const { ok, song, error } = normalizeSong({ ...spec, name }, new Set())
        if (!ok || !song) {
            reportUserError('SongCommands.addArrangement.invalid', 'Could not create that arrangement', {
                cause: new Error(`addArrangement: ${error ?? 'invalid spec'}`),
            })
            return null
        }
        // Two arrangements may carry the same name, their ids must not:
        // normalizeSongs() de-dupes on load, which would rename ours on every
        // save/reload round-trip.
        song.id = uniqueId(song.id, taken)
        if (!appState.songs) appState.songs = []
        appState.songs.push(song)
        const songIdx = appState.songs.length - 1
        const previousIdx = appState.selectedSongIdx ?? 0
        appState.selectedSongIdx = songIdx
        this.#host.persist()
        this.#host.record({
            desc: `Add arrangement "${song.name}"`,
            params: { song: song.name, index: songIdx },
            execute: () => {
                if (!appState.songs.includes(song)) {
                    appState.songs.splice(Math.min(songIdx, appState.songs.length), 0, song)
                    appState.selectedSongIdx = Math.min(songIdx, appState.songs.length - 1)
                }
                this.#host.persist()
            },
            undo: () => {
                const i = appState.songs.indexOf(song)
                if (i >= 0) appState.songs.splice(i, 1)
                appState.selectedSongIdx = Utils.clamp(previousIdx, 0, Math.max(0, appState.songs.length - 1))
                this.#host.persist()
            },
        })
        return song
    }

    /**
     * Delete an arrangement (defaults to the selected one). One undo step.
     *
     * @param {number} [songIdx]
     * @returns {boolean} true when an arrangement was removed
     */
    removeArrangement(songIdx) {
        const index = Number.isInteger(songIdx) ? songIdx : (appState.selectedSongIdx ?? 0)
        const song = appState.songs?.[index]
        if (!song) return false
        const previousIdx = appState.selectedSongIdx ?? 0
        appState.songs.splice(index, 1)
        this.#selectClamped(previousIdx)
        this.#host.persist()
        const selectAgain = (selectedIdx) => {
            this.#selectClamped(selectedIdx)
            this.#host.persist()
        }
        this.#host.record({
            desc: `Remove arrangement "${song.name}"`,
            params: { song: song.name, index },
            execute: () => {
                const i = appState.songs.indexOf(song)
                if (i >= 0) appState.songs.splice(i, 1)
                selectAgain(previousIdx)
            },
            undo: () => {
                const i = appState.songs.indexOf(song)
                if (i >= 0) appState.songs.splice(i, 1)
                appState.songs.splice(Math.min(index, appState.songs.length), 0, song)
                selectAgain(index)
            },
        })
        return true
    }

    /** Point the selection at an existing arrangement, clamped to the list. */
    #selectClamped(songIdx) {
        appState.selectedSongIdx = Utils.clamp(
            Math.trunc(Number(songIdx)) || 0,
            0,
            Math.max(0, (appState.songs?.length ?? 1) - 1),
        )
    }

    /**
     * Select the arrangement the song view works on.
     *
     * Selection is not undoable — like the pattern and track selection, the
     * cursor position is not part of what an undo step restores.
     *
     * @param {number} songIdx
     * @returns {number} the index actually selected
     */
    setSelectedSongIdx(songIdx) {
        this.#selectClamped(songIdx)
        return appState.selectedSongIdx
    }
}
