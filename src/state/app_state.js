import { isMobileViewport } from '../core/constants.js'

/**
 * Domain shapes shared across engine, UI and persistence. Import()-typed so a
 * contract drift (e.g. a persisted key rename) surfaces at typecheck.
 *
 * @typedef {import('../model/pattern_schema.js').Pattern} Pattern
 * @typedef {import('../model/song_schema.js').Song} Song
 * @typedef {import('../model/song_schema.js').SongClip} SongClip
 * @typedef {import('../model/flat_note.js').default} FlatNote
 * @typedef {{ name: string, description: string, date: string }} SongInfos
 * @typedef {{ basic: boolean, filters: boolean, effects: boolean, sound: boolean, loop: boolean, lfo: boolean }} TrackEditorVisibility
 * @typedef {{ triggers: boolean, retrig: boolean, arp: boolean }} NoteEditorVisibility
 */

function buildDefaultVisibility() {
    const isMobile = isMobileViewport()
    return {
        trackEditorVisibility: {
            basic: true,
            filters: !isMobile,
            effects: !isMobile,
            sound: !isMobile,
            loop: false,
            lfo: !isMobile,
        },
        noteEditorVisibility: {
            triggers: !isMobile,
            retrig: !isMobile,
            arp: !isMobile,
        },
    }
}

class AppState {
    static DEFAULTS = {
        patterns: [],
        selectedPatternIdx: 0,
        selectedTrackIdx: 0,
        selectedDrumkitIdx: 0,
        selectedDrumkit: 'real',
        selectedLfo: 'pitchLfo',
        currentPage: 0,
        currentView: 'edit',
        autoMode: false,
        textInput: false,
        /** Seconds per sequencer tick, set from the tempo in Transport.setBpm().
            TICK ticks per beat, so a tick is 1/32 of a beat. */
        secondsPerTick: 0.5,
        flatNotes: null,
        workletStatus: 'unknown',
        showVus: true,
        songInfos: { name: '', description: '', date: '' },
        /** Arrangements: each is a list of clips placing patterns on a measure timeline. */
        songs: [],
        selectedSongIdx: 0,
    }

    // Declared for TypeScript consumers (Object.assign is not modelled by tsc).
    /** @type {Pattern[]} */
    patterns
    /** @type {number} */
    selectedPatternIdx
    /** @type {number} */
    selectedTrackIdx
    /** @type {number} */
    selectedDrumkitIdx
    /** @type {string} */
    selectedDrumkit
    /** @type {string} */
    selectedLfo
    /** @type {number} */
    currentPage
    /** @type {string} */
    currentView
    /** @type {boolean} */
    autoMode
    /** @type {boolean} */
    textInput
    /** @type {number} */
    secondsPerTick
    /** @type {Map<number, FlatNote[]>|null} */
    flatNotes
    /** @type {string} */
    workletStatus
    /** @type {boolean} */
    showVus
    /** @type {SongInfos} */
    songInfos
    /** @type {Song[]} */
    songs
    /** @type {number} */
    selectedSongIdx
    /** @type {TrackEditorVisibility} */
    trackEditorVisibility
    /** @type {NoteEditorVisibility} */
    noteEditorVisibility

    constructor() {
        Object.assign(this, structuredClone(AppState.DEFAULTS), buildDefaultVisibility())
    }

    /**
     * The pattern the user is on — DERIVED, never stored: it was 33 copies of
     * `patterns[selectedPatternIdx]` spread across the UI.
     *
     * Do NOT use this from the audio layer. Player/Engine receive
     * `getSelectedPatternIdx()` by injection so an offline export can render a
     * pattern other than the selected one (see wav_exporter.js).
     *
     * @returns {Pattern|undefined} undefined when the index points outside `patterns`
     */
    get selectedPattern() {
        return this.patterns[this.selectedPatternIdx]
    }

    reset() {
        Object.assign(this, structuredClone(AppState.DEFAULTS), buildDefaultVisibility())
    }
}

export const appState = new AppState()
