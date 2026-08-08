import { isMobileViewport } from '../core/constants.js'

function buildDefaultVisibility() {
    const isMobile = isMobileViewport()
    return {
        trackEditorVisibility: {
            basic: true,
            filters: !isMobile, effects: !isMobile, sound: !isMobile, loop: false, lfo: !isMobile,
        },
        noteEditorVisibility: {
            triggers: !isMobile, retrig: !isMobile, arp: !isMobile,
        },
    }
}

export class AppState {
    static DEFAULTS = {
        patterns: [],
        selectedPatternNum: 0,
        selectedTrackNum: 0,
        selectedDrumkitNum: 0,
        selectedDrumkit: "real",
        selectedLfo: "pitchLfo",
        displayBeats: 1,
        currentPage: 0,
        autoMode: false,
        textInput: false,
        secondsPerBeat: 8,
        flatNotes: null,
        workletStatus: 'unknown',
        showVus: true,
        songInfos: { name: '', description: '', date: '' },
    }

    constructor() { Object.assign(this, AppState.DEFAULTS, buildDefaultVisibility()) }

    reset() { Object.assign(this, AppState.DEFAULTS, buildDefaultVisibility()) }
}

export const appState = new AppState()
