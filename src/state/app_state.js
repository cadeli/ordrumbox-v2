function buildDefaultVisibility() {
    const isMobile = typeof window !== 'undefined' && (window.innerWidth <= 768 || window.innerHeight <= 480)
    return {
        trackEditorVisibility: {
            basic: true, levels: true,
            filters: !isMobile, effects: !isMobile, sound: !isMobile, loop: true,
        },
        noteEditorVisibility: {
            levels: !isMobile, triggers: !isMobile, retrig: !isMobile, arp: !isMobile,
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
        displayBars: 1,
        currentPage: 0,
        autoMode: false,
        textInput: false,
        secondsPerBeat: 8,
        flatNotes: null,
        workletStatus: 'unknown',
        showVus: false,
    }

    constructor() { Object.assign(this, AppState.DEFAULTS, buildDefaultVisibility()) }

    reset() { Object.assign(this, AppState.DEFAULTS, buildDefaultVisibility()) }
}

export const appState = new AppState()
