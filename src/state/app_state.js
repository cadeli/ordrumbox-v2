export class AppState {
    constructor() {
        this.patterns = []
        this.selectedPatternNum = 0
        this.selectedTrackNum = 0
        this.selectedDrumkitNum = 0
        this.selectedDrumkit = "real"
        this.selectedLfo = "pitchLfo"
        this.displayBars = 1
        this.currentPage = 0
        this.autoMode = false
        this.textInput = false
        this.secondsPerBeat = 8
        this.flatNotes = null
        // Audio worklet mode: 0 = off, 1 = on (auto-upgrade at audioCtx init)
        this.useWorklets = 1
        this.workletStatus = 'unknown'  // 'unknown' | 'active' | 'unavailable'
        const isMobile = typeof window !== 'undefined' && (window.innerWidth <= 768 || window.innerHeight <= 480)
        this.trackEditorVisibility = {
            basic: true,
            levels: true,
            filters: !isMobile,
            effects: !isMobile,
            sound: !isMobile,
            loop: true
        }
        this.noteEditorVisibility = {
            levels: !isMobile,
            triggers: !isMobile,
            retrig: !isMobile,
            arp: !isMobile
        }
    }

    reset() {
        this.patterns = []
        this.selectedPatternNum = 0
        this.selectedTrackNum = 0
        this.selectedDrumkitNum = 0
        this.selectedDrumkit = "real"
        this.selectedLfo = "pitchLfo"
        this.displayBars = 1
        this.currentPage = 0
        this.autoMode = false
        this.textInput = false
        this.secondsPerBeat = 8
        this.flatNotes = null
        this.useWorklets = 1
        this.workletStatus = 'unknown'
        const isMobile = typeof window !== 'undefined' && (window.innerWidth <= 768 || window.innerHeight <= 480)
        this.trackEditorVisibility = {
            basic: true,
            levels: true,
            filters: !isMobile,
            effects: !isMobile,
            sound: !isMobile,
            loop: true
        }
        this.noteEditorVisibility = {
            levels: !isMobile,
            triggers: !isMobile,
            retrig: !isMobile,
            arp: !isMobile
        }
    }
}

export const appState = new AppState()
