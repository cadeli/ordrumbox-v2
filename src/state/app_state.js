// @ts-check
import { isMobileViewport } from '../core/constants.js'

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
        displayBeats: 1,
        currentPage: 0,
        currentView: 'edit',
        autoMode: false,
        textInput: false,
        secondsPerBeat: 8,
        flatNotes: null,
        workletStatus: 'unknown',
        showVus: true,
        songInfos: { name: '', description: '', date: '' },
        /** Arrangements: each is a list of clips placing patterns on a bar timeline. */
        songs: [],
        selectedSongIdx: 0,
    }

    // Declared for TypeScript consumers (Object.assign is not modelled by tsc).
    /** @type {any[]} */
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
    displayBeats
    /** @type {number} */
    currentPage
    /** @type {string} */
    currentView
    /** @type {boolean} */
    autoMode
    /** @type {boolean} */
    textInput
    /** @type {number} */
    secondsPerBeat
    /** @type {any} */
    flatNotes
    /** @type {string} */
    workletStatus
    /** @type {boolean} */
    showVus
    /** @type {any} */
    songInfos
    /** @type {any[]} */
    songs
    /** @type {number} */
    selectedSongIdx
    /** @type {any} */
    trackEditorVisibility
    /** @type {any} */
    noteEditorVisibility

    constructor() {
        Object.assign(this, structuredClone(AppState.DEFAULTS), buildDefaultVisibility())
    }

    reset() {
        Object.assign(this, structuredClone(AppState.DEFAULTS), buildDefaultVisibility())
    }
}

export const appState = new AppState()
