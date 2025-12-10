import Utils from '../utils.js'
import MfCmd from '../ctrl/mfcmd.js'
import MfComponents from './mfcomponents.js'
import MfCreateIhm from './mfcreateihm.js'
import MfSampleIhm from './mfsampleihm.js'

export default class MfUpdates {
    static TAG = "MFUPDATES"

    constructor() {
        this.mfCmd = new MfCmd()
        this.mfSampleIhm = new MfSampleIhm()
        this.mfComponents = new MfComponents()
        this.preSelectedDrumkit = null
    }

    updateSelectedPattern = () => {
        document.getElementById('selectedPatternDisp').innerText = MfGlobals.patterns[MfGlobals.selectedPatternNum].name
        this.updatePatternView(MfGlobals.patterns[MfGlobals.selectedPatternNum], MfGlobals.displayBars)
    }


    updatePatternView = (pattern, displayBars) => {
        document.getElementById('patternLength').innerText = displayBars + "/" + (pattern.nbBars / 4)
        const _this = this

        document.getElementById('trackDispl_8').className = "trackDisplNone" //TODO
        document.getElementById('trackDispl_9').className = "trackDisplNone"
        Object.values(pattern.tracks).forEach((track, indexTrack) => {
            if (indexTrack === 8) {
                document.getElementById('trackDispl_' + indexTrack).className = "trackDispl"
            }
            if (indexTrack === 9) {
                document.getElementById('trackDispl_' + indexTrack).className = "trackDispl"
            }

            document.getElementById('trackName_' + indexTrack).innerText = track.name

            document.getElementById('trackBtn_' + indexTrack).onclick = function () {
                document.getElementById('showTrackCtrl').style.display = "flex"
                _this.selectTrack(indexTrack - 1)
                _this.updateTrackBtns(pattern)
            }

            document.getElementById('trackNbBars_' + indexTrack).innerText = track.nbStepPerBar
            document.getElementById('trackNbBars_' + indexTrack).onclick = function () {
                _this.mfCmd.incrNbStepPerBar(track)
                _this.updatePatternView(pattern, MfGlobals.displayBars)
                MfGlobals.mfPatterns.getFlatNotesFromPattern(pattern)
            }

            document.getElementById('trackLoopPoint_' + indexTrack).innerText = track.loopPoint
            document.getElementById('trackLoopPoint_' + indexTrack).onclick = function () {
                _this.mfCmd.incrLoopPoint(track)
                _this.updatePatternView(pattern, MfGlobals.displayBars)
                MfGlobals.mfPatterns.getFlatNotesFromPattern(pattern)
            }

            let tmDiv = document.getElementById('trackMuteBtnOff_' + indexTrack)
            if (track.mute === true) {
                tmDiv.className = 'trackMuteBtnOn'
            } else {
                tmDiv.className = 'trackMuteBtnOff'
            }
            tmDiv.innerHTML = ''
            tmDiv.onclick = function () {
                _this.trackToggleMute(track)
            }

            let nlDiv = document.getElementById('noteList_' + indexTrack)
            Utils.clearInnerDom(nlDiv)
            for (let bar = 0; bar < pattern.nbBars; bar++) {
                this.updateBar(track, bar, indexTrack, nlDiv, displayBars)
            }
            indexTrack++
        })
        this.updateTrackBtns(pattern)
    }

    updateBar = (track, bar, indexTrack, nlDiv, displayBars) => {
        if ((bar / 4) < displayBars && (bar / 4) >= (displayBars - 1)) { //TODO
            let barDiv = document.createElement('div')
            barDiv.className = "orbar"
            barDiv.setAttribute("barNum", bar)
            nlDiv.appendChild(barDiv)
            for (let step = 0; step < (track.nbStepPerBar); step++) {
                this.updateStepBar(track, bar, step, indexTrack, barDiv)
            }
        }
    }

    updateStepBar = (track, bar, step, indexTrack, barDiv) => {
        const nsDiv = document.createElement('div')
        nsDiv.setAttribute("stepNum", step)
        const stepBar = bar * track.nbStepPerBar + step
        const notes = this.mfCmd.isNoteAt(track, bar, step)

        nsDiv.className = 'noteDispl'

        if ((indexTrack === MfGlobals.selectedTrackNum) && (bar === MfGlobals.selectedNoteBar) && (step === MfGlobals.selectedNoteStep)) {
            nsDiv.classList.add('noteDisplSel')
        }
        let _this = this
        nsDiv.onclick = function (event) {
            console.log("click on note bar=" + bar + " step=" + step)

            event.stopPropagation()
            if (((indexTrack) === MfGlobals.selectedTrackNum) && (bar === MfGlobals.selectedNoteBar) && (step === MfGlobals.selectedNoteStep)) {
                _this.clickOnEmptyNote(indexTrack, bar, step)
            } else {
                _this.selectTrack(indexTrack)
                _this.selectNote(indexTrack, bar, step)
            }
        }
        barDiv.appendChild(nsDiv)
        this.updateNotes(track, bar, step, indexTrack, nsDiv)

    }

    updateNotes = (track, bar, step, indexTrack, nsDiv) => {
        let notes = this.mfCmd.isNoteAt(track, bar, step)
        let stepBar = bar * track.nbStepPerBar + step
        if (stepBar === track.loopPoint) {
            let ndDiv = document.createElement('div')
            ndDiv.setAttribute("i", "loop_" + "_b" + bar + "_s" + step)
            ndDiv.className = 'noteDisplLoop'
            nsDiv.appendChild(ndDiv)
        }
        notes.forEach((note, indexNote) => {
            let ndDiv = document.createElement('div')
            ndDiv.setAttribute("i", indexNote + "_b" + bar + "_s" + step)
            ndDiv.className = 'noteDisplNote'
            if (note.triggFreq) {
                if (note.triggFreq > 1 && window.screen.availWidth > 1000) {
                    ndDiv.innerText = note.triggFreq
                }
            }
            let that = this
            ndDiv.onclick = function () {
                //console.log("click on note bar=" + bar + " step=" + step)
                event.stopPropagation()
                if ((indexTrack === MfGlobals.selectedTrackNum) && (bar === MfGlobals.selectedNoteBar) && (step === MfGlobals.selectedNoteStep)) {
                    that.clickOnNote(indexTrack, bar, step)
                } else {
                    that.selectTrack(indexTrack)
                    that.selectNote(indexTrack, bar, step)
                }
            }
            nsDiv.appendChild(ndDiv)
        })
    }


    updateTrackBtns = (pattern) => {
        Object.values(pattern.tracks).forEach((track, indexTrack) => {
            let tbDiv = document.getElementById("trackBtn_" + indexTrack)
            if (indexTrack === MfGlobals.selectedTrackNum) {
                tbDiv.style.background = "#333"
            } else {
                tbDiv.style.background = "#555"
            }
        })
    }

    selectNote = (indexTrack, bar, step) => {
        console.log("mfUpdate::selectNote t=" + indexTrack + " b=" + bar + " s=" + step)
        let selPat = MfGlobals.patterns[MfGlobals.selectedPatternNum]
        let selTrack = selPat.tracks[indexTrack]
        //console.log("mfUpdate::selectNote pat:" + selPat.name + " trk:" + selTrack.name + " step="+step +"Bar=" + bar)
        MfGlobals.selectedNoteStep = step
        MfGlobals.selectedNoteBar = bar
        this.updatePatternView(selPat, MfGlobals.displayBars)
        let selNote = this.mfCmd.isNoteAt(selTrack, bar, step)[0]
        this.updateNoteCtrl(selNote, bar, step)
        MfGlobals.selectedTrackNum = indexTrack
        this.updateTrackCtrl(indexTrack)
        this.updateTrackBtns(selPat)
    }

    clickOnNote = (indexTrack, bar, step) => {
        //console.log("mfUpdate::clickOnNote t=" + indexTrack + " b=" + bar + " s=" + step)
        let selPat = MfGlobals.patterns[MfGlobals.selectedPatternNum]
        let selTrack = selPat.tracks[indexTrack]
        let selNote = this.mfCmd.isNoteAt(selTrack, bar, step)[0]
        if (selNote) {
            this.mfCmd.deleteNote(selTrack, selNote)
        }
        this.updatePatternView(selPat, MfGlobals.displayBars)
        MfGlobals.mfPatterns.getFlatNotesFromPattern(selPat)
    }

    clickOnEmptyNote = (indexTrack, bar, step) => {
        //console.log("mfUpdate::clickOnEmptyNote t=" + indexTrack + " b=" + bar + " s=" + step)
        let selPat = MfGlobals.patterns[MfGlobals.selectedPatternNum]
        let selTrack = selPat.tracks[indexTrack]
        const note = this.mfCmd.addNote(selTrack, bar, step)
        this.updatePatternView(selPat, MfGlobals.displayBars)
        this.selectNote(indexTrack, bar, step)
        this.updateNoteCtrl(note, bar, step)
        MfGlobals.mfPatterns.getFlatNotesFromPattern(selPat)
    }

    updateNoteCtrl = (selNote, bar, step) => {
        if (!document.getElementById('noteCtrlPitch')) {
            if (!MfCreateIhm) {
                MfGlobals.mfCreateIhm = new MfCreateIhm()
            }
            MfGlobals.mfCreateIhm.createNoteCtrl(document.getElementById('showNoteCtrl'))
        }
        if (selNote) {
            document.getElementById('noteCtrlLblId').innerText = "Note Controls - " + (1 + selNote.bar) + ":" + (1 + selNote.step)
            document.getElementById('noteCtrlPitch').innerText = selNote.pitch
            document.getElementById('noteCtrlVelo').innerText = selNote.velo
            document.getElementById('noteCtrlPano').innerText = selNote.pano
            document.getElementById('noteCtrlPitchInput').value = selNote.pitch
            document.getElementById('noteCtrlVeloInput').value = selNote.velo
            document.getElementById('noteCtrlPanoInput').value = selNote.pano

            document.getElementById('noteCtrlTriggFreq').innerText = selNote.triggFreq
            document.getElementById('noteCtrlTriggPhase').innerText = selNote.triggPhase
            document.getElementById('noteCtrlTriggFreqInput').value = selNote.triggFreq
            document.getElementById('noteCtrlTriggPhaseInput').value = selNote.triggPhase

            document.getElementById('noteCtrlRetriggNum').innerText = selNote.retriggNum
            document.getElementById('noteCtrlRetriggStep').innerText = selNote.retriggStep
            document.getElementById('noteCtrlRetriggStepMulpt').innerText = selNote.retriggStepMulpt
            document.getElementById('noteCtrlEuclidianFill').innerText = selNote.euclidianFill
            document.getElementById('noteCtrlRetriggNumInput').value = selNote.retriggNum
            document.getElementById('noteCtrlRetriggStepInput').value = selNote.retriggStep
            document.getElementById('noteCtrlRetriggStepMulptInput').value = selNote.retriggStepMulpt
            document.getElementById('noteCtrlEuclidianFillInput').value = selNote.euclidianFill

            document.getElementById('noteCtrlChkId').checked = true
        } else {
            document.getElementById('noteCtrlChkId').checked = false
            document.getElementById('noteCtrlLblId').innerText = "Note Controls - " + (1 + bar) + ":" + (1 + step)
        }
    }


    selectTrack = (num) => {
        //let selPat = MfGlobals.patterns[MfGlobals.selectedPatternNum]
        //document.getElementById('selectedTrackDisp').innerText = selPat.tracks[num].name
        MfGlobals.selectedTrackNum = num
        this.updateTrackCtrl(MfGlobals.selectedTrackNum)

        this.selectNote(num, 0, 0)
        //document.getElementById('showLfoCtrl').style.display = 'none'
    }

    updateTrackCtrl = (trackNum) => {
        if (trackNum != 0 && !trackNum) trackNum = 0
        if (!document.getElementById('trackCtrlPitchInput')) {
            if (!MfGlobals.mfCreateIhm) {
                MfGlobals.mfCreateIhm = new MfCreateIhm()
            }
            MfGlobals.mfCreateIhm.createTrackCtrl(document.getElementById('showTrackCtrl'))
        }
        this.updateLfoPanel(MfGlobals.selectedLfo) //TODO
        // document.getElementById('showTrackCtrl').style.display = "flex"
        const selPat = MfGlobals.patterns[MfGlobals.selectedPatternNum]
        const selTrack = selPat.tracks[trackNum % selPat.tracks.length]

        document.getElementById('trackNameBtn').innerText = "Track : " + selTrack.name
        document.getElementById('trackCtrlPitchInput').value = selTrack.pitch
        document.getElementById('trackCtrlVeloInput').value = selTrack.velo
        document.getElementById('trackCtrlPanoInput').value = selTrack.pano
        document.getElementById('trackCtrlPitch').innerText = selTrack.pitch
        document.getElementById('trackCtrlVelo').innerText = selTrack.velo
        document.getElementById('trackCtrlPano').innerText = selTrack.pano

        if (!selTrack.mute === true) {
            document.getElementById('trackNameChkBtn').checked = true
        } else {
            document.getElementById('trackNameChkBtn').checked = false
        }

        if (!selTrack.panoLfo) {
            document.getElementById('trackCtrlPano').className = 'ctrlValueLfoOff'
        } else {
            document.getElementById('trackCtrlPano').className = 'ctrlValueLfoOn'
        }
        if (!selTrack.pitchLfo) {
            document.getElementById('trackCtrlPitch').className = 'ctrlValueLfoOff'
        } else {
            document.getElementById('trackCtrlPitch').className = 'ctrlValueLfoOn'
        }
        if (!selTrack.veloLfo) {
            document.getElementById('trackCtrlVelo').className = 'ctrlValueLfoOff'
        } else {
            document.getElementById('trackCtrlVelo').className = 'ctrlValueLfoOn'
        }

        document.getElementById('trackCtrlFilterType').innerText = Utils.getValueFromFilterName(selTrack.filterType)
        document.getElementById('trackCtrlFilterFreq').innerText = selTrack.filterFreq
        document.getElementById('trackCtrlFilterQ').innerText = selTrack.filterQ
        document.getElementById('trackCtrlFilterFreqInput').value = selTrack.filterFreq
        document.getElementById('trackCtrlFilterQInput').value = selTrack.filterQ
        if (!selTrack.filterFreqLfo) {
            document.getElementById('trackCtrlFilterFreq').className = 'ctrlValueLfoOff'
        } else {
            document.getElementById('trackCtrlFilterFreq').className = 'ctrlValueLfoOn'
        }
        if (!selTrack.filterQLfo) {
            document.getElementById('trackCtrlFilterQ').className = 'ctrlValueLfoOff'
        } else {
            document.getElementById('trackCtrlFilterQ').className = 'ctrlValueLfoOn'
        }
        if (!selTrack.sampleLength) { selTrack.sampleLength = 0.1 }
        document.getElementById('trackCtrlSampleLength').innerText = selTrack.sampleLength
        document.getElementById('trackCtrlSampleLengthInput').value = selTrack.sampleLength

        if (selTrack.autoSound === true) {
            document.getElementById('trackCtrlAutoSound').style = "background: #ADD8E6;"
        } else {
            document.getElementById('trackCtrlAutoSound').style = "background: #808080;"
        }
        if (selTrack.generated === true) {
            document.getElementById('trackCtrlGenSound').style = "background: #ADD8E6;"
        } else {
            document.getElementById('trackCtrlGenSound').style = "background: #808080;"
        }
        if (selTrack.soundNum < 0) {
            selTrack.soundNum = (MfGlobals.sounds.length - 1)
        }
        selTrack.soundNum %= MfGlobals.sounds.length
        if (selTrack.soundNum >= 0) { //TODO
            const soundName = MfGlobals.sounds[selTrack.soundNum].kit_name + ":" + MfGlobals.sounds[selTrack.soundNum].key
            document.getElementById('trackCtrlPickSound').innerText = soundName
        }
    }

    updateMixerPanel = () => {
        if (MfGlobals.mfMixer) {
            if (MfGlobals.mfMixer.compressor) {
                if (!document.getElementById('mixerCtrlGain')) {
                    if (!MfGlobals.mfCreateIhm) {
                        MfGlobals.mfCreateIhm = new MfCreateIhm()
                    }
                    MfGlobals.mfCreateIhm.createMixerCtrlParam(document.getElementById('mixerCtrl'))
                }
                let gain = (MfGlobals.mfMixer.gain.gain.value - 0.5) / (4)
                gain = Math.floor(gain * 100) / 100
                document.getElementById('mixerCtrlGain').innerText = gain
                document.getElementById('mixerCtrlGainInput').value = gain
                let th = MfGlobals.mfMixer.compressor.threshold.value / (-50)
                th = Math.floor(th * 100) / 100
                document.getElementById('mixerCtrlThereshold').innerText = th
                document.getElementById('mixerCtrlTheresholdInput').value = th
                let ratio = (MfGlobals.mfMixer.compressor.ratio.value - 1) / (19)
                ratio = Math.floor(ratio * 100) / 100
                document.getElementById('mixerCtrlRatio').innerText = ratio
                document.getElementById('mixerCtrlRatioInput').value = ratio
            }
        }
    }


    updateLfoPanel = (name) => {
        if (!document.getElementById("lfoname")) {
            if (!MfGlobals.mfCreateIhm) {
                MfGlobals.mfCreateIhm = new MfCreateIhm()
            }
            MfGlobals.mfCreateIhm.createLfoCtrl(document.getElementById('showLfoCtrl'))
        }
        document.getElementById("lfoname").innerText = name
        const selPat = MfGlobals.patterns[MfGlobals.selectedPatternNum]
        const selTrack = selPat.tracks[MfGlobals.selectedTrackNum]
        const selLfo = selTrack[MfGlobals.selectedLfo]
        if (!selLfo) {
            document.getElementById('lfoOnOff').checked = false
            document.getElementById('lfoFreq').innerText = 1
            document.getElementById('lfoFreqMulpt').innerText = 1
            document.getElementById('lfoMin').innerText = 0
            document.getElementById('lfoMax').innerText = 1
            document.getElementById('lfoPhase').innerText = 0

            document.getElementById('lfoFreqInput').value = 1
            document.getElementById('lfoFreqMulptInput').value = 1
            document.getElementById('lfoMinInput').value = 0
            document.getElementById('lfoMaxInput').value = 1
            document.getElementById('lfoPhaseInput').value = 0
        } else {
            document.getElementById('lfoOnOff').checked = true
            document.getElementById('lfoFreq').innerText = selLfo.freq
            document.getElementById('lfoFreqMulpt').innerText = selLfo.freqMulpt
            document.getElementById('lfoMin').innerText = selLfo.min
            document.getElementById('lfoMax').innerText = selLfo.max
            document.getElementById('lfoPhase').innerText = selLfo.phase

            document.getElementById('lfoFreqInput').value = selLfo.freq
            document.getElementById('lfoFreqMulptInput').value = selLfo.freqMulpt
            document.getElementById('lfoMinInput').value = selLfo.min
            document.getElementById('lfoMaxInput').value = selLfo.max
            document.getElementById('lfoPhaseInput').value = selLfo.phase
        }
    }

    trackToggleMute = (track) => {
        if (!track) { return }
        if (track.mute === true) {
            track.mute = false
        } else {
            track.mute = true
        }
        this.updatePatternView(MfGlobals.patterns[MfGlobals.selectedPatternNum], MfGlobals.displayBars)
        this.updateTrackCtrl(MfGlobals.selectedTrackNum)
    }

    getSelectedNote = () => {
        let selPat = MfGlobals.patterns[MfGlobals.selectedPatternNum]
        let selTrack = selPat.tracks[MfGlobals.selectedTrackNum]
        return this.mfCmd.isNoteAt(selTrack, MfGlobals.selectedNoteBar, MfGlobals.selectedNoteStep)[0]
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
            if (!selTrack.synthSoundKey) { selTrack.synthSoundKey = "bass1" }

            const synth = selTrack.synthSoundKey

            let generatedSound = MfGlobals.generatedSounds[synth]

            let generatedSoundsList = []
            for (const [name, generatedSound] of Object.entries(MfGlobals.generatedSounds)) {
                generatedSoundsList.push(name)
            }
            let inputBoxSounds = this.mfComponents.addListInputBox("Preset", "id", generatedSoundsList, synth, this.changeSoundName, true)

            let lgr = this.mfComponents.addNormInputBox("trackCtrlLgr", "length", generatedSound.enveloppe.lgr, function (value) { generatedSound.enveloppe.lgr = value })
            let vol = this.mfComponents.addNormInputBox("softSynthVol", "volume", generatedSound.enveloppe.vol, function (value) { generatedSound.enveloppe.vol = value })
            containerDivName.appendChild(inputBoxSounds)
            containerDivName.appendChild(lgr)
            containerDivName.appendChild(vol)
            //
            let waveFormTypeList = ["sqr", "saw", "tri", "sin"]
            let filterTypeList = ["lp", "hp", "bp", "no", "all"]
            let waveVco1 = this.mfComponents.addListInputBox("VCO1", "id", waveFormTypeList, Utils.getValueFromWaveName(generatedSound.vco1.wave), function (value) { generatedSound.vco1.wave = Utils.getWaveNameFromValue(value) })
            let gainVco1 = this.mfComponents.addNormInputBox("vco1Gain", "Gain", generatedSound.vco1.gain, function (value) { generatedSound.vco1.gain = value })
            let octVco1 = this.mfComponents.addSliderBox("vco1Oct", "Octave", generatedSound.vco1.octave, function (value) { generatedSound.vco1.octave = value }, null, 0, 1, 0.05)
            let detuneVco1 = this.mfComponents.addNormInputBox("vco1Detune", "Detune", generatedSound.vco1.detune, function (value) { generatedSound.vco1.detune = value })
            containerDivVCO1.appendChild(waveVco1)
            containerDivVCO1.appendChild(gainVco1)
            containerDivVCO1.appendChild(octVco1)
            containerDivVCO1.appendChild(detuneVco1)

            let waveVco2 = this.mfComponents.addListInputBox("VCO2", "id", waveFormTypeList, Utils.getValueFromWaveName(generatedSound.vco2.wave), function (value) { generatedSound.vco2.wave = Utils.getWaveNameFromValue(value) })
            let gainVco2 = this.mfComponents.addNormInputBox("vco2Gain", "Gain", generatedSound.vco2.gain, function (value) { generatedSound.vco2.gain = value })
            let octVco2 = this.mfComponents.addSliderBox("vco2Oct", "Octave", generatedSound.vco2.octave, function (value) { generatedSound.vco2.octave = value }, null, 0, 1, 0.05)
            let detuneVco2 = this.mfComponents.addNormInputBox("vco2Detune", "Detune", generatedSound.vco2.detune, function (value) { generatedSound.vco2.detune = value })
            containerDivVCO2.appendChild(waveVco2)
            containerDivVCO2.appendChild(gainVco2)
            containerDivVCO2.appendChild(octVco2)
            containerDivVCO2.appendChild(detuneVco2)

            if (generatedSound.vco3) {
                let waveVco3 = this.mfComponents.addListInputBox("VCO3", "id", waveFormTypeList, Utils.getValueFromWaveName(generatedSound.vco3.wave), function (value) { generatedSound.vco3.wave = Utils.getWaveNameFromValue(value) })
                let gainVco3 = this.mfComponents.addNormInputBox("vco3Gain", "Gain", generatedSound.vco3.gain, function (value) { generatedSound.vco3.gain = value })
                let octVco3 = this.mfComponents.addSliderBox("vco3Oct", "Octave", generatedSound.vco3.octave, function (value) { generatedSound.vco3.octave = value }, null, 0, 1, 0.05)
                let detuneVco3 = this.mfComponents.addNormInputBox("vco3Detune", "Detune", generatedSound.vco3.detune, function (value) { generatedSound.vco3.detune = value })
                containerDivVCO3.appendChild(waveVco3)
                containerDivVCO3.appendChild(gainVco3)
                containerDivVCO3.appendChild(octVco3)
                containerDivVCO3.appendChild(detuneVco3)
            }

            let lfoTargetList = ["vco1", "vco2","vco3", "flt", "not"]
            let lfoWave = this.mfComponents.addListInputBox("LFO", "id", waveFormTypeList, Utils.getValueFromWaveName(generatedSound.lfo.wave), function (value) { generatedSound.lfo.wave = Utils.getWaveNameFromValue(value) })
            let lfoTarget = this.mfComponents.addListInputBox("Target", "id", lfoTargetList, generatedSound.lfo.target, function (value) { generatedSound.lfo.target = value })
            let lfoDepth = this.mfComponents.addNormInputBox("lfoDepth", "Depth", generatedSound.lfo.depth, function (value) { generatedSound.lfo.depth = value })
            let lfoFreq = this.mfComponents.addNormInputBox("glfoFreq", "Freq", generatedSound.lfo.freq, function (value) { generatedSound.lfo.freq = value })
            containerDivLfo.appendChild(lfoWave)
            containerDivLfo.appendChild(lfoTarget)
            containerDivLfo.appendChild(lfoDepth)
            containerDivLfo.appendChild(lfoFreq)

            let filterType = this.mfComponents.addListInputBox("Filter", "id", filterTypeList, Utils.getValueFromFilterName(generatedSound.filter.type), function (value) { generatedSound.filter.type = Utils.getFilterNameFromValue(value) })
            let filterFreq = this.mfComponents.addNormInputBox("filterFreq", "Freq", generatedSound.filter.freq, function (value) { generatedSound.filter.freq = value })
            let filterQ = this.mfComponents.addNormInputBox("filterQ", "Q", generatedSound.filter.Q, function (value) { generatedSound.filter.Q = value })
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

    displayModalDialogNbBar = () => {
        let pattern = MfGlobals.patterns[MfGlobals.selectedPatternNum]
        document.getElementById("warn-modal").style.display = "block"
        document.getElementById("modal-title-text").innerText = "Nb Bars for :" + pattern.name
        let propertiesList = document.getElementById('modal-message')
        Utils.clearInnerDom(propertiesList)
        for (let i = 0; i < 4; i++) {
            let opt = document.createElement('div');
            opt.className = "middle-button"
            let pattern = MfGlobals.patterns[MfGlobals.selectedPatternNum]
            if (pattern.nbBars === (i + 1) * 4) {
                opt.classList.add("selected-button")
            }
            opt.innerHTML = (i + 1)
            let that = this
            opt.onclick = function () {
                let pattern = MfGlobals.patterns[MfGlobals.selectedPatternNum]
                MfGlobals.mfUpdates.mfCmd.setNbBar(pattern, (i + 1))
                MfGlobals.mfPatterns.getFlatNotesFromPattern(pattern)
                MfGlobals.mfUpdates.mfCmd.incrDisplayBar(pattern)
                MfGlobals.mfUpdates.updatePatternView(pattern, MfGlobals.displayBars)
                document.getElementById("warn-modal").style.display = "none"
            }
            propertiesList.appendChild(opt)
        }
    }

    displayModalDialogKit = () => {
        if (MfGlobals.mfLoader.extendedSoundsLoaded === false) {
            document.getElementById("resourcesProgress").style.display = 'block'
            MfGlobals.mfLoader.loadExtendedDrumkits(this.displayModalDialogKit)
        }
        let self = this
        document.getElementById("warn-modal").style.display = "block"
        document.getElementById("modal-title-text").innerText = "Drumkits"
        let drumkitPanel = document.getElementById('modal-message')
        Utils.clearInnerDom(drumkitPanel)
        let drumkitList = document.createElement('div')
        drumkitList.className = "sound-type-list"
        drumkitPanel.appendChild(drumkitList)
        let drumKitInfos = document.createElement('div')
        drumKitInfos.className = "kit-infos"
        let drumKitInfosTxt = document.createElement('div')
        drumKitInfosTxt.id = "drumKitInfosTxtId"
        drumKitInfos.appendChild(drumKitInfosTxt)
        drumkitPanel.appendChild(drumKitInfos)


        let okBtn = document.createElement('div')
        okBtn.innerHTML = "OK"
        okBtn.className = "small-button"
        okBtn.onclick = function () {
            if (!self.preSelectedDrumkit) { return }
            MfGlobals.selectedDrumkit = self.preSelectedDrumkit
            self.onDrumkitChange()
            document.getElementById("warn-modal").style.display = "none";
            //console.log("init drumkit selected " + MfGlobals.selectedDrumkit)
        }
        drumKitInfos.appendChild(okBtn)

        for (const [kitName, samplesDesc] of Object.entries(MfGlobals.drumkits)) {
            let opt = document.createElement('div');
            opt.className = 'middle-button'
            opt.innerHTML = kitName
            const nbSamples = samplesDesc.instruments.length
            if (kitName === MfGlobals.selectedDrumkit) {
                opt.classList.add("selected-button")
                self.displayKitInfos(kitName)
            }

            let that = this
            opt.onclick = function () {
                self.preSelectedDrumkit = kitName
                self.displayKitInfos(kitName)
            }
            drumkitList.appendChild(opt)
        }
        document.getElementById("selectedDrumkitDisp").innerHTML = MfGlobals.selectedDrumkit
    }

    displayKitInfos = (kitName) => {
        let drumKitInfosTxt = document.getElementById('drumKitInfosTxtId')
        if (MfGlobals.drumkits[kitName]) {
            drumKitInfosTxt.innerHTML = "<h1 align='center'>" + kitName + " (" + MfGlobals.drumkits[kitName].instruments.length + ")" + "</h1>" +
                "<p align='center'>" + MfGlobals.drumkits[kitName].infos + "</p>" +
                "<p align='center'>" + MfGlobals.drumkits[kitName].desc + "</p>"
        }
    }


    displayModalDialogPattern = () => {
        document.getElementById("warn-modal").style.display = "block"
        document.getElementById("modal-title-text").innerText = "Patterns"
        let patternList = document.getElementById('modal-message')
        patternList.className = "buttons-list"
        Utils.clearInnerDom(patternList)
        Object.values(MfGlobals.patterns).forEach((pattern, indexPattern) => {
            let opt = document.createElement('div');
            opt.className = "middle-button"
            opt.innerHTML = pattern.name
            if (pattern === MfGlobals.patterns[MfGlobals.selectedPatternNum]) {
                opt.classList.add("selected-button")
            }
            let _this = this
            opt.onclick = function () {
                MfGlobals.mfUpdates.mfCmd.setSelectedPatternNum(indexPattern)
                _this.onPatternChange()
            }
            patternList.appendChild(opt)
        })
    }

    createRecordPanel = () => {
        console.log("mfupdate::createRecordPanel")
        document.getElementById("warn-modal").style.display = "block"
        document.getElementById("modal-title-text").innerText = "Files"
        let downloadDiv = document.getElementById('modal-message')
        Utils.clearInnerDom(downloadDiv)
        //downloadDiv.style.display = "flex"
        downloadDiv.replaceChildren()
        let box1 = document.createElement('div')
        box1.className = "sliders-block"

        if (MfGlobals.blob) {
            var audioDiv = document.createElement('audio')
            audioDiv.id = 'audio-player'
            audioDiv.controls = 'controls'
            audioDiv.src = window.URL.createObjectURL(MfGlobals.blob)
            audioDiv.type = 'audio/wav'
            let framediv = document.createElement("div")
            framediv.className = 'audioFrame'
            framediv.appendChild(audioDiv)
            box1.appendChild(framediv)

            let anchorDownloadWav = document.createElement('a')
            anchorDownloadWav.className = "middle-button"
            let url = window.URL.createObjectURL(MfGlobals.blob)
            anchorDownloadWav.href = url
            let dlName = 'ordrumbox-online-' +
                MfGlobals.patterns[MfGlobals.selectedPatternNum].name +
                "-" + (new Date()).getTime() +
                "-bpm" + eval((60 * 4) / (MfGlobals.TICK * MfGlobals.secondsPerBeat)) +
                '.wav'
            anchorDownloadWav.title = dlName
            anchorDownloadWav.download = dlName
            const linkText = document.createTextNode("download session");
            anchorDownloadWav.appendChild(linkText)
            box1.appendChild(anchorDownloadWav)

            downloadDiv.appendChild(box1)
        }
        //
        let box2 = document.createElement('div')
        box2.id = "box2"
        box2.className = "sliders-block-d"
        this.createExportBtn(box2)
        //
        let inputImportJson = document.createElement('input')
        inputImportJson.type = "file"
        inputImportJson.id = "importJson"
        let labelImportJson = document.createElement('label')
        labelImportJson.for = "importJson"
        labelImportJson.className = "free-button"
        labelImportJson.innerHTML = "Import your pattern"
        box2.appendChild(labelImportJson)
        labelImportJson.onclick = function (ev) {
            inputImportJson.click(ev)
        }
        box2.appendChild(inputImportJson)
        inputImportJson.addEventListener('change', this.onImportPatternSelected)
        downloadDiv.appendChild(box2)

        let box3 = document.createElement('div')
        box3.className = "sliders-block"
        downloadDiv.appendChild(box3)

        let labelRenamePattern = document.createElement('label')
        labelRenamePattern.className = "labelLong"
        labelRenamePattern.innerHTML = "Rename your pattern"
        box3.appendChild(labelRenamePattern)

        let inputName = document.createElement('input')
        inputName.className = "inputText"
        inputName.value = MfGlobals.patterns[MfGlobals.selectedPatternNum].name
        inputName.addEventListener('change', this.onChangePatternName)
        //inputName.addEventListener("input", (event) => {event.stopPropagation(); event.preventDefault()})
        inputName.addEventListener("keydown", (event) => { MfGlobals.textInput = true })
        box3.appendChild(inputName)
    }


    onChangePatternName = (event) => {
        MfGlobals.textInput = false
        let name = Utils.mysanitize(event.target.value)
        if (name.length <= 1) { name = "noname" }
        MfGlobals.patterns[MfGlobals.selectedPatternNum].name = name
        MfGlobals.mfUpdates.mfCmd.setSelectedPatternNum(MfGlobals.selectedPatternNum)
        MfGlobals.mfUpdates.updateSelectedPattern()
        this.createExportBtn(document.getElementById("box2"))
    }

    createExportBtn = (box2) => {
        if (document.getElementById("exportBtn")) {
            document.getElementById("exportBtn").remove()
        }
        var txt = JSON.stringify(MfGlobals.patterns[MfGlobals.selectedPatternNum])
        var blobExportJson = new Blob([txt], { type: "text/plain;charset=utf-8" })
        let anchorExportJson = document.createElement('a')
        anchorExportJson.id = "exportBtn"
        anchorExportJson.className = "free-button"
        anchorExportJson.href = window.URL.createObjectURL(blobExportJson)
        anchorExportJson.title = 'ordrumbox-online-' + MfGlobals.patterns[MfGlobals.selectedPatternNum].name + "-" + (new Date()).getTime() + '.json'
        anchorExportJson.download = anchorExportJson.title
        let anchorExportJsonLinkText = document.createTextNode("Export pattern: " + MfGlobals.patterns[MfGlobals.selectedPatternNum].name)
        anchorExportJson.appendChild(anchorExportJsonLinkText)
        box2.appendChild(anchorExportJson)

    }



    onImportPatternSelected = (ev) => {
        var fr = new FileReader();
        fr.readAsText(ev.target.files[0])
        console.log("onImportPatternSelected: file pick=" + ev.target.files[0].name)
        fr.onload = function (e) {
            let jsonTxt = JSON.parse(e.target.result)
            if (jsonTxt.application === "online-ordrumbox") {
                MfGlobals.mfUpdates.mfCmd.cleanPattern(MfGlobals.patterns[MfGlobals.selectedPatternNum])
                MfGlobals.patterns[MfGlobals.selectedPatternNum] = jsonTxt
            } else {
                alert('file is not a ordrumbox json file')
                /*                let alienImport=new AlienImport()
                                let pattern = alienImport.setAlien(jsonTxt)
                                MfGlobals.mfUpdates.mfCmd.cleanPattern(MfGlobals.patterns[MfGlobals.selectedPatternNum])
                                MfGlobals.patterns[MfGlobals.selectedPatternNum] = pattern
                */
            }

            MfGlobals.mfUpdates.mfCmd.setSelectedPatternNum(MfGlobals.selectedPatternNum)
            MfGlobals.mfUpdates.updateSelectedPattern()

        }
    }


    onDrumkitChange = () => {
        this.mfCmd.autoAssignSounds(MfGlobals.patterns[MfGlobals.selectedPatternNum])
        MfGlobals.mfPatterns.getFlatNotesFromPattern(MfGlobals.patterns[MfGlobals.selectedPatternNum])
        document.getElementById("selectedDrumkitDisp").innerHTML = MfGlobals.selectedDrumkit
        this.updateTrackCtrl(MfGlobals.selectedTrackNum)
    }

    onPatternChange = () => {
        //should ajust strips to fit with pattern
        this.mfCmd.autoAssignSounds(MfGlobals.patterns[MfGlobals.selectedPatternNum])
        MfGlobals.mfPatterns.getFlatNotesFromPattern(MfGlobals.patterns[MfGlobals.selectedPatternNum])
        this.updateSelectedPattern()
        document.getElementById("warn-modal").style.display = "none";
    }

}