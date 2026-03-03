import Utils from '../utils.js'

export default class MfSliderBox {
    static TAG = "MFSLIDERBOX"

    constructor(label) {
        this.label = label
    }

    addNormInputBox2 = (id, label, value, callback, parentDiv) => {
        return this.addSliderBox2(id, label, value, callback, null, 0, 1, 0.05)
    }

    addSliderBox2 = (id, label, value, callback, lfo, min, max, step, parentDiv) => {
        const _this = this
        const inputBox = Utils.createMfElement("div", id + "Box", 'tooltip', parentDiv)

        inputBox.onclick = function (event) {
            if (lfo) {
                const selPat = MfGlobals.patterns[MfGlobals.selectedPatternNum]
                const selTrack = selPat.tracks[MfGlobals.selectedTrackNum]
                MfGlobals.selectedLfo = _this.getLfoNameFromLabel(label)
                MfGlobals.mfUpdates.updateLfoPanel(" LFO " + label)
            }
            event.stopPropagation()
            event.preventDefault()
            Utils.toggleDisplayDiv(document.getElementById(id + 'Tooltip'))
        }

        const lblDiv = Utils.createMfElement("div", id + '-inputLabel', "inputLabel", inputBox)
        lblDiv.innerText = label

        const valDiv = Utils.createMfElement("div", id, "inputValue ctrlValueLfoOff", inputBox)
        valDiv.innerText = value
        if (lfo) {
            valDiv.onclick = function (event) {
                const selPat = MfGlobals.patterns[MfGlobals.selectedPatternNum]
                const selTrack = selPat.tracks[MfGlobals.selectedTrackNum]
                MfGlobals.selectedLfo = _this.getLfoNameFromLabel(label)
                MfGlobals.mfUpdates.updateLfoPanel(" LFO " + label)
            }
        }

        const tooltipDiv = Utils.createMfElement("div", id + "Tooltip", "tooltiptext", inputBox)
        tooltipDiv.onclick = function (event) {
            event.stopPropagation()
            event.preventDefault()
        }

        const inputDiv = Utils.createMfElement("input", id + "Input", null, tooltipDiv)
        inputDiv.type = "range"
        inputDiv.min = min
        inputDiv.max = max
        inputDiv.step = step
        inputDiv.value = value
        inputDiv.oninput = function (event) {
            valDiv.innerText = event.target.value
            callback(event.target.value)
        }
        return inputBox
    }


    addNormInputBox = (id, label, value, callback) => {
        return this.addSliderBox(id, label, value, callback, null, 0, 1, 0.05)
    }

    addSliderBox = (id, label, value, callback, lfo, min, max, step) => {
        const _this = this
        const inputBox = document.createElement('div')
        inputBox.classList.add('tooltip')
        inputBox.id = id + "Box"


        inputBox.onclick = function (event) {
            if (lfo) {
                const selPat = MfGlobals.patterns[MfGlobals.selectedPatternNum]
                const selTrack = selPat.tracks[MfGlobals.selectedTrackNum]
                // document.getElementById("showLfoCtrl").style.display = "flex"
                MfGlobals.selectedLfo = _this.getLfoNameFromLabel(label)
                MfGlobals.mfUpdates.updateLfoPanel(" LFO " + label)
            }
            event.stopPropagation()
            event.preventDefault()
            Utils.toggleDisplayDiv(document.getElementById(id + 'Tooltip'))
        }

        const lblDiv = document.createElement('div')
        lblDiv.classList.add("inputLabel")
        lblDiv.id = (id + '-inputLabel')
        lblDiv.innerText = label
        inputBox.appendChild(lblDiv)

        const valDiv = document.createElement('div')
        valDiv.classList.add("inputValue")
        valDiv.classList.add("ctrlValueLfoOff")
        valDiv.id = id
        valDiv.innerText = value
        if (lfo) {
            valDiv.onclick = function (event) {
                const selPat = MfGlobals.patterns[MfGlobals.selectedPatternNum]
                const selTrack = selPat.tracks[MfGlobals.selectedTrackNum]
                // document.getElementById("showLfoCtrl").style.display = "flex"
                MfGlobals.selectedLfo = _this.getLfoNameFromLabel(label)
                MfGlobals.mfUpdates.updateLfoPanel(" LFO " + label)
            }
        }
        inputBox.appendChild(valDiv)

        const tooltipDiv = document.createElement('div')
        tooltipDiv.className = "tooltiptext"
        tooltipDiv.id = id + "Tooltip"
        tooltipDiv.onclick = function (event) {
            event.stopPropagation()
            event.preventDefault()
        }
        inputBox.appendChild(tooltipDiv)

        const inputDiv = document.createElement('input')
        inputDiv.className = ""
        inputDiv.id = id + "Input"
        inputDiv.type = "range"
        inputDiv.min = min
        inputDiv.max = max
        inputDiv.step = step
        inputDiv.value = value
        inputDiv.oninput = function (event) {
            valDiv.innerText = event.target.value
            callback(event.target.value)
        }
        tooltipDiv.appendChild(inputDiv)
        return inputBox
    }


    getLfoNameFromLabel = (label) => {
        label =label.toUpperCase()
        if (label.includes("PITCH")) {
            return "pitchLfo"
        } else if (label.includes("VELO")) {
            return "veloLfo"
        } else if (label.includes("PANO")) {
            return "panoLfo"
        } else if (label.includes("FLTR Q")) {
            return "filterQLfo"
        } else if (label.includes("FREQ")) {
            return "filterFreqLfo"
        } else {
            console.error("MfSliderbox::getLfoNameFromLabel no lfo for " + label)
            return "unknownLfo"
        }
    }
}