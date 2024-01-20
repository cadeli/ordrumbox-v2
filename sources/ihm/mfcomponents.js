export default class MfComponents {
    static TAG = "MFCOMPONENTS"

    constructor() {}

    addTwostatesBtn = (id, label) => {
        let twoStatesBtn = document.createElement('div')
        twoStatesBtn.classList.add('twostates')
        twoStatesBtn.classList.add('small-button')
        twoStatesBtn.innerText = label
        twoStatesBtn.id = id
        return twoStatesBtn
    }

    addListInputBox = (label, id, list, value, callback, isBig) => {

        const _this = this
        const inputBox = document.createElement('label')
        inputBox.classList.add('small-button')
        inputBox.classList.add('tooltip')
        inputBox.id = id + "Box"

        const incrOneStep = function(event) {
            let index = list.indexOf(inputValue.innerText)
            index++
            index %= list.length
            inputValue.innerText = list[index]
            callback(list[index])
        }


        const lblDiv = document.createElement('span')
        lblDiv.className = "ctrlLabel"
        lblDiv.innerText = label
        lblDiv.onclick = incrOneStep
        inputBox.appendChild(lblDiv)


        let inputValue = document.createElement('div')
        if (isBig === true) {
            inputValue.classList.add('inputValueForListLblBig')
        } else {
            inputValue.classList.add('inputValueForListLbl')
        }
        inputValue.classList.add('ctrlValueLfoOff')
        inputValue.id = id
        inputValue.innerText = value
        inputValue.onclick = incrOneStep

        inputBox.appendChild(inputValue)
        return inputBox
    }



    addNormInputBox = (id, label, value, callback) => {
        return this.addSliderBox(id, label, value, callback, null, 0, 1, 0.05)
    }



    addSliderBox = (id, label, value, callback, lfo, min, max, step) => {
        const _this = this
        const inputBox = document.createElement('label')
        inputBox.classList.add('small-button')
        inputBox.classList.add('tooltip')
        inputBox.id = id + "Box"


        const lblDiv = document.createElement('span')
        lblDiv.className = "ctrlLabel"
        lblDiv.innerText = label
        lblDiv.onclick = function(event) {
            if (lfo) {
                const selPat = MfGlobals.patterns[MfGlobals.selectedPatternNum]
                const selTrack = selPat.tracks[MfGlobals.selectedTrackNum]
                document.getElementById("showLfoCtrl").style.display = "flex"
                MfGlobals.selectedLfo = _this.getLfoNameFromLabel(label)
                MfGlobals.mfUpdates.updateLfoPanel(" LFO " + label)
            }
            event.stopPropagation()
            event.preventDefault()
            _this.toggleVisu(id + 'Tooltip')
        }
        inputBox.appendChild(lblDiv)

        const valDiv = document.createElement('span')
        valDiv.classList.add("inputValue")
        valDiv.classList.add("ctrlValueLfoOff")
        valDiv.id = id
        valDiv.innerText = value
        if (lfo) {
            valDiv.onclick = function(event) {
                const selPat = MfGlobals.patterns[MfGlobals.selectedPatternNum]
                const selTrack = selPat.tracks[MfGlobals.selectedTrackNum]
                document.getElementById("showLfoCtrl").style.display = "flex"
                MfGlobals.selectedLfo = _this.getLfoNameFromLabel(label)
                MfGlobals.mfUpdates.updateLfoPanel(" LFO " + label)
            }
        }
        inputBox.appendChild(valDiv)

        const tooltipDiv = document.createElement('div')
        tooltipDiv.className = "tooltiptext"
        tooltipDiv.id = id + "Tooltip"
        tooltipDiv.onclick = function(event) {
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
        inputDiv.oninput = function(event) {
            valDiv.innerText = event.target.value
            callback(event.target.value)
        }
        tooltipDiv.appendChild(inputDiv)
        return inputBox
    }

    toggleVisu = (aDiv) => {
        let divbpmi = document.getElementById(aDiv)
        if (divbpmi.style.display != 'block') {
            divbpmi.style.display = 'block'
        } else {
            divbpmi.style.display = 'none'
        }
    }

    getLfoNameFromLabel = (label) => {
        if (label.includes("Pitch")) {
            return "pitchLfo"
        } else if (label.includes("Velo")) {
            return "veloLfo"
        } else if (label.includes("Pano")) {
            return "panoLfo"
        } else if (label.includes("Filter Q")) {
            return "filterQLfo"
        } else if (label.includes("Freq")) {
            return "filterFreqLfo"
        } else {
            console.error("MfComponents::getLfoNameFromLabel no lfo for " + label)
            return "unknownLfo"
        }
    }


}