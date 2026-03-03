export default class MfComponents {
    static TAG = "MFCOMPONENTS"

    constructor() {}

    addTwostatesBtn = (id, label) => { //TODO param tb/normal
        let twoStatesBtn = document.createElement('div')
        twoStatesBtn.classList.add('twostates')
        twoStatesBtn.classList.add('mf-button')
        twoStatesBtn.innerText = label
        twoStatesBtn.id = id
        return twoStatesBtn
    }

   addTwostatesBtnTb = (id, label) => { //TODO param tb/normal
        let twoStatesBtn = document.createElement('div')
        twoStatesBtn.classList.add('twostates')
        twoStatesBtn.classList.add('mf-tb-button')
        twoStatesBtn.innerText = label
        twoStatesBtn.id = id
        return twoStatesBtn
    }

   

    //ATT uppercase for list and value because of css
    addListInputBox = (label, id, list, value, callback, isBig) => {
        const _this = this
        const inputBox = document.createElement('label')
        inputBox.classList.add('mf-button')
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

//TODO useless
    toggleVisu = (aDiv) => {
        let divbpmi = document.getElementById(aDiv)
        if (divbpmi.style.display != 'block') {
            divbpmi.style.display = 'block'
        } else {
            divbpmi.style.display = 'none'
        }
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
            console.error("MfComponents::getLfoNameFromLabel no lfo for " + label)
            return "unknownLfo"
        }
    }


}