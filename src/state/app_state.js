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
        this.trackEditorVisibility = {
            basic: true,
            levels: true,
            filters: true,
            effects: true,
            sound: true,
            loop: true
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
        this.trackEditorVisibility = {
            basic: true,
            levels: true,
            filters: true,
            effects: true,
            sound: true,
            loop: true
        }
    }
}

export const appState = new AppState()
