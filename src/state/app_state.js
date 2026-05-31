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
        const isMobile = typeof window !== 'undefined' && (window.innerWidth <= 480 || window.innerHeight <= 480)
        this.trackEditorVisibility = {
            basic: !isMobile,
            levels: !isMobile,
            filters: !isMobile,
            effects: !isMobile,
            sound: !isMobile,
            loop: !isMobile
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
        const isMobile = typeof window !== 'undefined' && (window.innerWidth <= 480 || window.innerHeight <= 480)
        this.trackEditorVisibility = {
            basic: !isMobile,
            levels: !isMobile,
            filters: !isMobile,
            effects: !isMobile,
            sound: !isMobile,
            loop: !isMobile
        }
    }
}

export const appState = new AppState()
