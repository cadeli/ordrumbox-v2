export class AppState {
    constructor() {
        this.patterns = []
        this.selectedPatternNum = 0
        this.selectedTrackNum = 0
        this.selectedDrumkitNum = 0
        this.selectedDrumkit = "real"
        this.selectedLfo = "pitchLfo"
        this.displayBars = 1
        this.autoMode = false
        this.textInput = false
        this.secondsPerBeat = 8
        this.flatNotes = null
    }

    reset() {
        this.patterns = []
        this.selectedPatternNum = 0
        this.selectedTrackNum = 0
        this.selectedDrumkitNum = 0
        this.selectedDrumkit = "real"
        this.selectedLfo = "pitchLfo"
        this.displayBars = 1
        this.autoMode = false
        this.textInput = false
        this.secondsPerBeat = 8
        this.flatNotes = null
    }
}

export const appState = new AppState()
