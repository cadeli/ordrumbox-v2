
export default class MfComponents {
    static TAG = "MFCOMPONENTS"

    constructor() {}

    addLbl = (id, label) => { //TODO param tb/normal
        let labelDiv = document.createElement('div')
        labelDiv.classList.add('mf-button')
        labelDiv.innerText = label
        labelDiv.id = id
        return labelDiv
    }

    addTwostatesBtn = (id, label) => { //TODO param tb/normal
        let twoStatesBtn = document.createElement('btn')
        twoStatesBtn.classList.add('twostatesOff')
        twoStatesBtn.classList.add('mf-tb-button')
        twoStatesBtn.innerText = label
        twoStatesBtn.id = id
        return twoStatesBtn
    }

    //ATT uppercase for list and value because of css
    addListInputBox = (label, id, list, value, callback, isBig) => {
        const _this = this
        const safeList = Array.isArray(list) ? list : []
        const inputBox = document.createElement('label')
        inputBox.classList.add('mf-button')
        inputBox.classList.add('tooltip')
        inputBox.id = id + "Box"

        const incrOneStep = function(event) {
            if (safeList.length === 0) return
            let index = safeList.indexOf(inputValue.innerText)
            index++
            index %= safeList.length
            inputValue.innerText = safeList[index]
            callback(safeList[index])
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
        inputValue.innerText = value ?? safeList[0] ?? ""
        inputValue.onclick = incrOneStep

        inputBox.appendChild(inputValue)
        return inputBox
    }

    // toggleVisu = (aDiv) => {
    //     let divbpmi = document.getElementById(aDiv)
    //     if (divbpmi.style.display != 'block') {
    //         divbpmi.style.display = 'block'
    //     } else {
    //         divbpmi.style.display = 'none'
    //     }
    // }

    getLfoNameFromLabel = (label) => {
        label =label.toUpperCase()
        if (label.includes("PITCH")) {
            return "pitchLfo"
        } else if (label.includes("VELO")) {
            return "velocityLfo"
        } else if (label.includes("PANO")) {
            return "panLfo"
        } else if (label.includes("FLTR Q")) {
            return "filterQLfo"
        } else if (label.includes("FREQ")) {
            return "filterFreqLfo"
        } else {
            console.error("MfComponents::getLfoNameFromLabel no lfo for " + label)
            return "unknownLfo"
        }
    }


}
