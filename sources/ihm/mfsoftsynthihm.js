import Utils from '../utils.js'
import MfComponents from './mfcomponents.js'
import MfSliderBox from './mfsliderbox.js'

export default class MfSoftSynthIhm {
    static TAG = "MFSOFTSYNTHIHM"

    constructor() {
    }


    displayModalDialogGenSound = () => {
        document.getElementById("warn-modal").style.display = "block"
        document.getElementById("modal-title-text").innerText = "Soft Synth"
        let propertiesList = document.getElementById('modal-message')
        Utils.clearInnerDom(propertiesList)

        let lineDiv = document.createElement('div')
        lineDiv.className = "line-controls"
        lineDiv.style.display = "flex"
        propertiesList.appendChild(lineDiv)

        let containerDivName = document.createElement('div')
        containerDivName.className = "sliders-block"
        lineDiv.appendChild(containerDivName)

        let containerDivVCO1 = document.createElement('div')
        containerDivVCO1.className = "sliders-block"
        lineDiv.appendChild(containerDivVCO1)

        let containerDivVCO2 = document.createElement('div')
        containerDivVCO2.className = "sliders-block"
        lineDiv.appendChild(containerDivVCO2)

        let containerDivVCO3 = document.createElement('div')
        containerDivVCO3.className = "sliders-block"
        lineDiv.appendChild(containerDivVCO3)

        let containerDivLfo = document.createElement('div')
        containerDivLfo.className = "sliders-block"
        lineDiv.appendChild(containerDivLfo)

        let containerDivFilter = document.createElement('div')
        containerDivFilter.className = "sliders-block"
        lineDiv.appendChild(containerDivFilter)


        if (MfGlobals.generatedSounds) {
            const selPat = MfGlobals.patterns[MfGlobals.selectedPatternNum]
            const selTrack = selPat.tracks[MfGlobals.selectedTrackNum]
            if (!selTrack.synthSoundKey) { selTrack.synthSoundKey = "BASS1" }//TODO first item
            const synth = selTrack.synthSoundKey

            let generatedSound = MfGlobals.generatedSounds[synth]
            let generatedSoundsList = []
            for (const [name, generatedSound] of Object.entries(MfGlobals.generatedSounds)) {
                generatedSoundsList.push(name)
            }
            let inputBoxSounds = MfGlobals.mfComponents.addListInputBox("Preset", "presetName", generatedSoundsList, synth, this.changeSoundName, true)

            //let lgr = MfGlobals.mfSliderBox.addNormInputBox("trackCtrlLgr", "length", generatedSound.enveloppe.lgr, function (value) { generatedSound.enveloppe.lgr = value })
            let attack = MfGlobals.mfSliderBox.addNormInputBox("volAttack", "attack", generatedSound.enveloppe.attack, function (value) { generatedSound.enveloppe.attack = eval(value) })
            let decay = MfGlobals.mfSliderBox.addNormInputBox("volDecay", "decay", generatedSound.enveloppe.decay, function (value) { generatedSound.enveloppe.decay = eval(value) })
            let sustain = MfGlobals.mfSliderBox.addNormInputBox("volSustain", "sustain", generatedSound.enveloppe.sustain, function (value) { generatedSound.enveloppe.sustain = eval(value) })
            let release = MfGlobals.mfSliderBox.addNormInputBox("volRelease", "release", generatedSound.enveloppe.release, function (value) { generatedSound.enveloppe.release = eval(value) })
            //let vol = MfGlobals.mfSliderBox.addNormInputBox("softSynthVol", "volume", generatedSound.enveloppe.vol, function (value) { generatedSound.enveloppe.vol = value })
            containerDivName.appendChild(inputBoxSounds)
            containerDivName.appendChild(attack)
            containerDivName.appendChild(decay)
            containerDivName.appendChild(sustain)
            containerDivName.appendChild(release)
            //containerDivName.appendChild(vol)
            //
            let waveFormTypeList = ["SQR", "SAW", "TRI", "SIN"]
            let filterTypeList = ["LP", "HP", "BP", "NO", "ALL"]
            let waveVco1 = MfGlobals.mfComponents.addListInputBox("VCO1", "id", waveFormTypeList, Utils.getValueFromWaveName(generatedSound.vco1.wave), function (value) { generatedSound.vco1.wave = Utils.getWaveNameFromValue(value) })
            let gainVco1 = MfGlobals.mfSliderBox.addNormInputBox("vco1Gain", "Gain", generatedSound.vco1.gain, function (value) { generatedSound.vco1.gain = value })
            let octVco1 = MfGlobals.mfSliderBox.addSliderBox2("vco1Oct", "Octave", generatedSound.vco1.octave, function (value) { generatedSound.vco1.octave = value }, null, 0, 1, 0.05,containerDivVCO1)
            let detuneVco1 = MfGlobals.mfSliderBox.addNormInputBox("vco1Detune", "Detune", generatedSound.vco1.detune, function (value) { generatedSound.vco1.detune = value })
            containerDivVCO1.appendChild(waveVco1)
            containerDivVCO1.appendChild(gainVco1)
            //containerDivVCO1.appendChild(octVco1)
            containerDivVCO1.appendChild(detuneVco1)

            let waveVco2 = MfGlobals.mfComponents.addListInputBox("VCO2", "id", waveFormTypeList, Utils.getValueFromWaveName(generatedSound.vco2.wave), function (value) { generatedSound.vco2.wave = Utils.getWaveNameFromValue(value) })
            let gainVco2 = MfGlobals.mfSliderBox.addNormInputBox("vco2Gain", "Gain", generatedSound.vco2.gain, function (value) { generatedSound.vco2.gain = value })
            let octVco2 = MfGlobals.mfSliderBox.addSliderBox("vco2Oct", "Octave", generatedSound.vco2.octave, function (value) { generatedSound.vco2.octave = value }, null, 0, 1, 0.05)
            let detuneVco2 = MfGlobals.mfSliderBox.addNormInputBox("vco2Detune", "Detune", generatedSound.vco2.detune, function (value) { generatedSound.vco2.detune = value })
            containerDivVCO2.appendChild(waveVco2)
            containerDivVCO2.appendChild(gainVco2)
            containerDivVCO2.appendChild(octVco2)
            containerDivVCO2.appendChild(detuneVco2)

            if (generatedSound.vco3) {
                let waveVco3 = MfGlobals.mfComponents.addListInputBox("VCO3", "id", waveFormTypeList, Utils.getValueFromWaveName(generatedSound.vco3.wave), function (value) { generatedSound.vco3.wave = Utils.getWaveNameFromValue(value) })
                let gainVco3 = MfGlobals.mfSliderBox.addNormInputBox("vco3Gain", "Gain", generatedSound.vco3.gain, function (value) { generatedSound.vco3.gain = value })
                let octVco3 = MfGlobals.mfSliderBox.addSliderBox("vco3Oct", "Octave", generatedSound.vco3.octave, function (value) { generatedSound.vco3.octave = value }, null, 0, 1, 0.05)
                let detuneVco3 = MfGlobals.mfSliderBox.addNormInputBox("vco3Detune", "Detune", generatedSound.vco3.detune, function (value) { generatedSound.vco3.detune = value })
                containerDivVCO3.appendChild(waveVco3)
                containerDivVCO3.appendChild(gainVco3)
                containerDivVCO3.appendChild(octVco3)
                containerDivVCO3.appendChild(detuneVco3)
            }

            let lfoTargetList = ["VCO1", "VCO2", "VCO3", "FLT", "NOT"]
            let lfoWave = MfGlobals.mfComponents.addListInputBox("LFO", "id", waveFormTypeList, Utils.getValueFromWaveName(generatedSound.lfo.wave), function (value) { generatedSound.lfo.wave = Utils.getWaveNameFromValue(value) })
            let lfoTarget = MfGlobals.mfComponents.addListInputBox("Target", "id", lfoTargetList, generatedSound.lfo.target, function (value) { generatedSound.lfo.target = value })
            let lfoDepth = MfGlobals.mfSliderBox.addNormInputBox("lfoDepth", "Depth", generatedSound.lfo.depth, function (value) { generatedSound.lfo.depth = value })
            let lfoFreq = MfGlobals.mfSliderBox.addNormInputBox("glfoFreq", "Freq", generatedSound.lfo.freq, function (value) { generatedSound.lfo.freq = value })
            containerDivLfo.appendChild(lfoWave)
            containerDivLfo.appendChild(lfoTarget)
            containerDivLfo.appendChild(lfoDepth)
            containerDivLfo.appendChild(lfoFreq)

            let filterType = MfGlobals.mfComponents.addListInputBox("Filter", "id", filterTypeList, Utils.getValueFromFilterName(generatedSound.filter.type), function (value) { generatedSound.filter.type = Utils.getFilterNameFromValue(value) })
            let filterFreq = MfGlobals.mfSliderBox.addNormInputBox("filterFreq", "Freq", generatedSound.filter.freq, function (value) { generatedSound.filter.freq = value })
            let filterQ = MfGlobals.mfSliderBox.addNormInputBox("filterQ", "Q", generatedSound.filter.Q, function (value) { generatedSound.filter.Q = value })
            containerDivFilter.appendChild(filterType)
            containerDivFilter.appendChild(filterFreq)
            containerDivFilter.appendChild(filterQ)
        }
    }

    changeSoundName = (value) => {
        let selPat = MfGlobals.patterns[MfGlobals.selectedPatternNum]
        let selTrack = selPat.tracks[MfGlobals.selectedTrackNum]
        selTrack.synthSoundKey = value
        //MfGlobals.bassSound = value
        this.displayModalDialogGenSound()
    }

}