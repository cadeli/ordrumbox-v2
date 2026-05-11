import { MfGlobals } from '../mfglobals.js'

import Utils from '../utils.js'
import MfComponents from './mfcomponents.js'
import MfCreateIhm from './mfcreateihm.js'
import { PatternExporter } from '../ctrl/patternExporter.js'
//import AlienImportDbia from '../todo/alienimportdbia.js'

export default class MfUpdates {
    static TAG = "MFUPDATES"

    constructor() {
        this.mfSampleIhm = null
        this.mfSoftSynthIhm = null
        this.preSelectedDrumkit = null
    }

    getSampleIhm = async () => {
        if (!this.mfSampleIhm) {
            const { default: MfSampleIhm } = await import('./mfsampleihm.js')
            this.mfSampleIhm = new MfSampleIhm()
        }
        return this.mfSampleIhm
    }

    getSoftSynthIhm = async () => {
        if (!this.mfSoftSynthIhm) {
            const { default: MfSoftSynthIhm } = await import('./mfsoftsynthihm.js')
            this.mfSoftSynthIhm = new MfSoftSynthIhm()
        }
        return this.mfSoftSynthIhm
    }

    updateSelectedPattern = () => {
        document.getElementById("bpmCtrl").innerText = (MfGlobals.patterns[MfGlobals.selectedPatternNum].bpm)
        this.updatePatternView(MfGlobals.patterns[MfGlobals.selectedPatternNum], MfGlobals.displayBars)
        if (MfGlobals.patternsDropBox) {
            MfGlobals.patternsDropBox.setSelectedItemNum(MfGlobals.selectedPatternNum)
        }
    }

    updatePatternView = (pattern, displayBars) => {
        if (!document.getElementById('trackDispl_9')) { return }
        if (MfGlobals.patterns.length == 0) { return }

        document.getElementById('patternLength').innerText = displayBars + "/" + (pattern.nbBars / 4)
        const _this = this
        const trackDivs = document.querySelectorAll('[id^="trackDispl_"]');
        trackDivs.forEach(trackDiv => {
            trackDiv.className = "trackDisplNone"
        })
        document.getElementById('trackDispl_9').className = "trackDisplNone"
        Object.values(pattern.tracks).forEach((track, indexTrack) => {
            document.getElementById('trackDispl_' + indexTrack).className = "trackDispl"


            document.getElementById('trackName_' + indexTrack).innerText = track.name

            document.getElementById('trackBtn_' + indexTrack).onclick = function () {
                //document.getElementById('showTrackCtrl').style.display = "flex"
                _this.selectTrack(indexTrack - 1)
                _this.updateTrackBtns(pattern)
            }

            document.getElementById('trackNbBars_' + indexTrack).innerText = track.barQuantize
            document.getElementById('trackNbBars_' + indexTrack).onclick = function () {
                MfGlobals.mfCmd.incrNbStepPerBar(track)
                _this.updatePatternView(pattern, MfGlobals.displayBars)
                MfGlobals.mfPatterns.computeFlatNotesFromPattern(pattern)
            }

            document.getElementById('trackLoopPoint_' + indexTrack).innerText = track.loopAtStep
            document.getElementById('trackLoopPoint_' + indexTrack).onclick = function () {
                MfGlobals.mfCmd.incrLoopPoint(track)
                _this.updatePatternView(pattern, MfGlobals.displayBars)
                MfGlobals.mfPatterns.computeFlatNotesFromPattern(pattern)
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

            let taDiv = document.getElementById('trackAutoBtnOff_' + indexTrack)
            if (track.auto === true) {
                taDiv.className = 'trackAutoBtnOn'
            } else {
                taDiv.className = 'trackAutoBtnOff'
            }
            taDiv.innerHTML = ''
            taDiv.onclick = function () {
                _this.trackToggleAuto(track)
            }

            let nlDiv = document.getElementById('noteList_' + indexTrack)
            Utils.recursiveClear(nlDiv)
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
            for (let step = 0; step < (track.barQuantize); step++) {
                this.updateStepBar(track, bar, step, indexTrack, barDiv)
            }
        }
    }

    updateStepBar = (track, bar, step, indexTrack, barDiv) => {
        const nsDiv = document.createElement('div')
        nsDiv.setAttribute("stepNum", step)
        const stepBar = bar * track.barQuantize + step
        const notes = MfGlobals.mfCmd.isNoteAt(track, bar, step)

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
        // console.log("updateNotes: "+track.name + " at " +bar+":"+step)
        let notes = MfGlobals.mfCmd.isNoteAt(track, bar, step)
        let stepBar = bar * track.barQuantize + step
        if (stepBar === track.loopAtStep) {
            let ndDiv = document.createElement('div')
            ndDiv.setAttribute("i", "loop_" + "_b" + bar + "_s" + step)
            ndDiv.className = 'noteDisplLoop'
            nsDiv.appendChild(ndDiv)
        }
        notes.forEach((note, indexNote) => {
            let ndDiv = document.createElement('div')
            ndDiv.setAttribute("i", indexNote + "_b" + bar + "_s" + step)
            ndDiv.className = 'noteDisplNote'
            if (note.triggerFreq) {
                if (note.triggerFreq > 1 && window.screen.availWidth > 1000) {
                    ndDiv.classList.add('noteDisplTrigger')
                    ndDiv.innerText = note.triggerFreq
                }
            }
            if (note.retriggerNum && note.retriggerNum > 1) {
                if (window.screen.availWidth > 1000) {
                    ndDiv.innerText = note.retriggerNum
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
                tbDiv.classList.add("trackBtnSel")
                tbDiv.classList.remove("trackBtn")
            } else {
                tbDiv.classList.add("trackBtn")
                tbDiv.classList.remove("trackBtnSel")
            }
        })
    }

    selectNote = (indexTrack, bar, step) => {
        console.log("mfUpdate::selectNote t=" + indexTrack + " b=" + bar + " s=" + step)
        let selPat = MfGlobals.patterns[MfGlobals.selectedPatternNum]
        let selTrack = selPat.tracks[indexTrack]
        //console.log("mfUpdate::selectNote pat:" + selPat.name + " trk:" + selTrack.name + " step="+step +"Bar=" + bar)
        MfGlobals.selectedTrackNum = indexTrack
        MfGlobals.selectedNoteStep = step
        MfGlobals.selectedNoteBar = bar
        this.updatePatternView(selPat, MfGlobals.displayBars)
        let selNote = MfGlobals.mfCmd.isNoteAt(selTrack, bar, step)[0]
        this.updateNoteCtrl(selNote, bar, step)
        this.updateTrackBtns(selPat)
        this.setControlPanelMode('note')
    }

    clickOnNote = (indexTrack, bar, step) => {
        //console.log("mfUpdate::clickOnNote t=" + indexTrack + " b=" + bar + " s=" + step)
        let selPat = MfGlobals.patterns[MfGlobals.selectedPatternNum]
        let selTrack = selPat.tracks[indexTrack]
        let selNote = MfGlobals.mfCmd.isNoteAt(selTrack, bar, step)[0]
        if (selNote) {
            MfGlobals.mfCmd.deleteNote(selTrack, selNote)
        }
        this.updatePatternView(selPat, MfGlobals.displayBars)
        MfGlobals.mfPatterns.computeFlatNotesFromPattern(selPat)
    }

    clickOnEmptyNote = (indexTrack, bar, step) => {
        //console.log("mfUpdate::clickOnEmptyNote t=" + indexTrack + " b=" + bar + " s=" + step)
        let selPat = MfGlobals.patterns[MfGlobals.selectedPatternNum]
        let selTrack = selPat.tracks[indexTrack]
        const note = MfGlobals.mfCmd.addNote(selTrack, bar, step)
        this.updatePatternView(selPat, MfGlobals.displayBars)
        this.selectNote(indexTrack, bar, step)
        this.updateNoteCtrl(note, bar, step)
        MfGlobals.mfPatterns.computeFlatNotesFromPattern(selPat)
    }

    updateNoteCtrl = (selNote, bar, step) => {
        if (!document.getElementById('noteCtrlPitch')) {
            if (!MfCreateIhm) {
                MfGlobals.mfCreateIhm = new MfCreateIhm()
            }
            MfGlobals.mfCreateIhm.createNoteCtrl(document.getElementById('showNoteCtrl'))
        }
        if (selNote) {
            document.getElementById('noteCtrlLblId').innerText = "Note Controls - " + (1 + selNote.bar) + ":" + (1 + selNote.barStep)
            document.getElementById('noteCtrlChkId').checked = true
        } else {
            document.getElementById('noteCtrlChkId').checked = false
            document.getElementById('noteCtrlLblId').innerText = "Note Controls - " + (1 + bar) + ":" + (1 + step)
        }
    }


    selectTrack = (num) => {
        MfGlobals.selectedTrackNum = num
        const selPat = MfGlobals.patterns[MfGlobals.selectedPatternNum]
        this.updateTrackCtrl(MfGlobals.selectedTrackNum)
        this.updatePatternView(selPat, MfGlobals.displayBars)
        this.updateTrackBtns(selPat)
        this.setControlPanelMode('track')
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
        this.updateFxPanel()
        const selPat = MfGlobals.patterns[MfGlobals.selectedPatternNum]
        const selTrack = selPat.tracks[trackNum % selPat.tracks.length]

        document.getElementById('trackNameBtn').innerText = "Track : " + selTrack.name

        if (!selTrack.mute === true) {
            document.getElementById('trackNameChkBtn').checked = true
        } else {
            document.getElementById('trackNameChkBtn').checked = false
        }

        if (!selTrack.sampleLength) { selTrack.sampleLength = 1 }
        document.getElementById('trackCtrlLength').setValue(selTrack.sampleLength)
        selTrack.mono ??= false


       if (selTrack.soundId != "NOT_DEFINED") { //TODO
            const soundName = MfGlobals.sounds[selTrack.soundId].kit_name + ":" + MfGlobals.sounds[selTrack.soundId].key
            document.getElementById('trackCtrlShowSound').innerText = soundName
        } else {
            if (selTrack.useSoftSynth === true) {
                document.getElementById('trackCtrlShowSound').innerText = "synth:" + selTrack.synthSoundKey
            } else {
                document.getElementById('trackCtrlShowSound').innerText = "NO SOUND"
            }
        }

        if (selTrack.useAutoAssignSound) {
            document.getElementById('trackCtrlAutoSound').classList.add("twostatesOn")
            document.getElementById('trackCtrlAutoSound').classList.remove("twostatesOff")

            document.getElementById('trackCtrlPickSound').classList.add("twostatesOff")
            document.getElementById('trackCtrlPickSound').classList.remove("twostatesOn")

            document.getElementById('trackCtrlGenSound').classList.add("twostatesOff")
            document.getElementById('trackCtrlGenSound').classList.remove("twostatesOn")
        } else {
            document.getElementById('trackCtrlAutoSound').classList.add("twostatesOff")
            document.getElementById('trackCtrlAutoSound').classList.remove("twostatesOn")

            if (selTrack.useSoftSynth) {
                document.getElementById('trackCtrlPickSound').classList.add("twostatesOff")
                document.getElementById('trackCtrlPickSound').classList.remove("twostatesOn")

                document.getElementById('trackCtrlGenSound').classList.add("twostatesOn")
                document.getElementById('trackCtrlGenSound').classList.remove("twostatesOff")
            } else {
                document.getElementById('trackCtrlPickSound').classList.add("twostatesOn")
                document.getElementById('trackCtrlPickSound').classList.remove("twostatesOff")

                document.getElementById('trackCtrlGenSound').classList.add("twostatesOff")
                document.getElementById('trackCtrlGenSound').classList.remove("twostatesOn")
            }
        }

        const monoBtn = document.getElementById('trackCtrlMono')
        if (monoBtn) {
            if (selTrack.mono) {
                monoBtn.classList.add("twostatesOn")
                monoBtn.classList.remove("twostatesOff")
            } else {
                monoBtn.classList.add("twostatesOff")
                monoBtn.classList.remove("twostatesOn")
            }
        }
    }


    updateMixerPanel = () => {
        if (MfGlobals.mfMixer) {
            if (MfGlobals.mfMixer.compressor) {
                if (!document.getElementById('mixerGain')) {
                    if (!MfGlobals.mfCreateIhm) {
                        MfGlobals.mfCreateIhm = new MfCreateIhm()
                    }
                    MfGlobals.mfCreateIhm.createMixerCtrl(document.getElementById('mixerCtrl'))
                }
            }
        }
    }

    updateLfoPanel = (name) => {
        if (!MfGlobals.mfCreateIhm) {
            MfGlobals.mfCreateIhm = new MfCreateIhm()
        }
        
        const lfoCtrlDiv = document.getElementById('showLfoCtrl')
        
        if (!document.getElementById("lfoname") || this._lastLfoName !== name || this._lastTrackNum !== MfGlobals.selectedTrackNum) {
            MfGlobals.mfCreateIhm.createLfoCtrl(lfoCtrlDiv)
            this._lastLfoName = name
            this._lastTrackNum = MfGlobals.selectedTrackNum
        }
        
        document.getElementById("lfoname").innerText = name
        const selPat = MfGlobals.patterns[MfGlobals.selectedPatternNum]
        const selTrack = selPat.tracks[MfGlobals.selectedTrackNum]
        const selLfo = selTrack[MfGlobals.selectedLfo]
        
        if (!selLfo) {
            document.getElementById('lfoOnOff').checked = false
        } else {
            document.getElementById('lfoOnOff').checked = true
        }
    }

    updateFxPanel = () => {
        if (!document.getElementById("fxname")) {
            if (!MfGlobals.mfCreateIhm) {
                MfGlobals.mfCreateIhm = new MfCreateIhm()
            }
            MfGlobals.mfCreateIhm.createFxCtrl(document.getElementById('showFxCtrl'))
        }
        const selPat = MfGlobals.patterns[MfGlobals.selectedPatternNum]
        const selTrack = selPat.tracks[MfGlobals.selectedTrackNum]
        selTrack.reverbType ??= "none"
        selTrack.reverbAmount ??= 0
        selTrack.saturationType ??= "soft"
        selTrack.saturationAmount ??= 0
        document.getElementById("fxname").innerText = "Fx Control"
        const reverbTypeSelect = document.getElementById('trackFxReverbType')
        if (reverbTypeSelect) {
            reverbTypeSelect.value = selTrack.reverbType
        }
        const saturationTypeSelect = document.getElementById('trackFxSaturationType')
        if (saturationTypeSelect) {
            saturationTypeSelect.value = selTrack.saturationType
        }
        const reverbAmountSlider = document.getElementById('trackCtrlRevAmt')
        if (reverbAmountSlider?.setValue) {
            reverbAmountSlider.setValue(selTrack.reverbAmount)
        }
        const saturationSlider = document.getElementById('trackCtrlSat')
        if (saturationSlider?.setValue) {
            saturationSlider.setValue(selTrack.saturationAmount)
        }
        const fxOnOff = document.getElementById('fxOnOff')
        if (fxOnOff) {
            fxOnOff.checked = (selTrack.reverbType !== "none" && selTrack.reverbAmount > 0) || selTrack.saturationAmount > 0
        }
    }

    setControlPanelMode = (mode) => {
        const showTrackCtrl = document.getElementById('showTrackCtrl')
        const showLfoCtrl = document.getElementById('showLfoCtrl')
        const showFxCtrl = document.getElementById('showFxCtrl')
        const showNoteCtrl = document.getElementById('showNoteCtrl')
        if (!showTrackCtrl || !showLfoCtrl || !showFxCtrl || !showNoteCtrl) {
            return
        }

        if (mode === 'note') {
            showTrackCtrl.style.display = 'none'
            showLfoCtrl.style.display = 'none'
            showFxCtrl.style.display = 'none'
            showNoteCtrl.style.display = 'flex'
            return
        }

        showTrackCtrl.style.display = 'flex'
        showLfoCtrl.style.display = 'flex'
        showFxCtrl.style.display = 'flex'
        showNoteCtrl.style.display = 'none'
    }

    trackToggleMute = (track) => {
        console.log("MfUpdates::trackToggleMute. click ")
        if (!track) { return }
        if (track.mute === true) {
            track.mute = false
        } else {
            track.mute = true
        }
        this.updatePatternView(MfGlobals.patterns[MfGlobals.selectedPatternNum], MfGlobals.displayBars)
        this.updateTrackCtrl(MfGlobals.selectedTrackNum)
    }

    trackToggleAuto = (track) => {
        console.log("MfUpdates::trackToggleAuto. click ")
        if (!track) { return }
        if (track.auto === true) {
            track.auto = false
        } else {
            track.auto = true
        }
        this.updatePatternView(MfGlobals.patterns[MfGlobals.selectedPatternNum], MfGlobals.displayBars)
        this.updateTrackCtrl(MfGlobals.selectedTrackNum)
    }

    // togglePatternAutoMode = async () => {
    //     if (MfGlobals.autoMode === true) {
    //         MfGlobals.autoMode = false
    //         document.getElementById('patternAutoMode').classList.add("twostatesOff")
    //         document.getElementById('patternAutoMode').classList.remove("twostatesOn")
    //     } else {
    //         document.getElementById('patternAutoMode').classList.add("twostatesOn")
    //         document.getElementById('patternAutoMode').classList.remove("twostatesOff")
    //          const mfAutoGenerate = await MfGlobals.getAutoGenerate()
    //          await mfAutoGenerate.generatePattern(MfGlobals.patterns[MfGlobals.selectedPatternNum])
    //         MfGlobals.autoMode = true
    //     }
    //     console.log("MfUpdates::togglePatternAutoMode. automode =  ", MfGlobals.autoMode)
    // }

    toggleMixerControls = () => {
        const doc = document.getElementById('showMixerCtrl')
        if (doc.style.display === "flex") {
            doc.style.display = "none"
        } else {
            doc.style.display = "flex"
            MfGlobals.mfUpdates.updateMixerPanel()
        }
    }

    clearPattern = () => {
        MfGlobals.mfCmd.cleanPattern(MfGlobals.patterns[MfGlobals.selectedPatternNum])
        MfGlobals.mfUpdates.updatePatternView(MfGlobals.patterns[MfGlobals.selectedPatternNum], 1)
        let selPat = MfGlobals.patterns[MfGlobals.selectedPatternNum]
        MfGlobals.mfPatterns.computeFlatNotesFromPattern(selPat)
    }

    incrDisplayBarIhm = () => {
        let pattern = MfGlobals.patterns[MfGlobals.selectedPatternNum]
        MfGlobals.mfCmd.incrDisplayBar(pattern)
        MfGlobals.mfUpdates.updatePatternView(pattern, MfGlobals.displayBars)
    }


    getSelectedNote = () => {
        let selPat = MfGlobals.patterns[MfGlobals.selectedPatternNum]
        let selTrack = selPat.tracks[MfGlobals.selectedTrackNum]
        return MfGlobals.mfCmd.isNoteAt(selTrack, MfGlobals.selectedNoteBar, MfGlobals.selectedNoteStep)[0]
    }

    displayModalDialogNbBar = () => {
        let pattern = MfGlobals.patterns[MfGlobals.selectedPatternNum]
        document.getElementById("warn-modal").style.display = "block"
        document.getElementById("modal-title-text").innerText = "Nb Bars for :" + pattern.name
        let propertiesList = document.getElementById('modal-message')
        Utils.recursiveClear(propertiesList)
        for (let i = 0; i < 4; i++) {
            let opt = document.createElement('div');
            opt.className = "mf-button"
            let pattern = MfGlobals.patterns[MfGlobals.selectedPatternNum]
            if (pattern.nbBars === (i + 1) * 4) {
                opt.classList.add("selected-button")
            }
            opt.innerHTML = (i + 1)
            let that = this
            opt.onclick = function () {
                let pattern = MfGlobals.patterns[MfGlobals.selectedPatternNum]
                MfGlobals.mfCmd.setNbBar(pattern, (i + 1))
                MfGlobals.mfPatterns.computeFlatNotesFromPattern(pattern)
                MfGlobals.mfCmd.incrDisplayBar(pattern)
                MfGlobals.mfUpdates.updatePatternView(pattern, MfGlobals.displayBars)
                document.getElementById("warn-modal").style.display = "none"
            }
            propertiesList.appendChild(opt)
        }
    }



    createRecordPanel = () => {
        console.log("mfupdate::createRecordPanel")
        document.getElementById("warn-modal").style.display = "block"
        document.getElementById("modal-title-text").innerText = "Files"
        let downloadDiv = document.getElementById('modal-message')
        Utils.recursiveClear(downloadDiv)
        downloadDiv.replaceChildren()
        let boxMain = document.createElement('div')
        boxMain.className = "box-v"

        let box1 = document.createElement('div')
        box1.className = "sliders-block"

        if (MfGlobals.blob) {
            let audioDiv = document.createElement('audio')
            audioDiv.id = 'audio-player'
            audioDiv.controls = 'controls'
            audioDiv.src = window.URL.createObjectURL(MfGlobals.blob)
            audioDiv.type = 'audio/wav'
            let framediv = document.createElement("div")
            framediv.className = 'audioFrame'
            framediv.appendChild(audioDiv)
            box1.appendChild(framediv)

            let anchorDownloadWav = document.createElement('a')
            anchorDownloadWav.className = "mf-button"
            let url = window.URL.createObjectURL(MfGlobals.blob)
            anchorDownloadWav.href = url
            let dlName = 'ordrumbox-online-' +
                MfGlobals.patterns[MfGlobals.selectedPatternNum].name +
                "-" + (new Date()).getTime() +
                "-bpm" + parseInt((60 * 4) / (MfGlobals.TICK * MfGlobals.secondsPerBeat)) +
                '.wav'
            anchorDownloadWav.title = dlName
            anchorDownloadWav.download = dlName
            const linkText = document.createTextNode("download session");
            anchorDownloadWav.appendChild(linkText)
            box1.appendChild(anchorDownloadWav)


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
        labelImportJson.className = "mf-button"
        labelImportJson.innerHTML = "Import pattern"
        box2.appendChild(labelImportJson)
        labelImportJson.onclick = function (ev) {
            inputImportJson.click(ev)
        }
        box2.appendChild(inputImportJson)
        inputImportJson.addEventListener('change', this.onImportPatternSelected)

        let box3 = document.createElement('div')
        box3.className = "sliders-block"

        boxMain.appendChild(box1)
        boxMain.appendChild(box2)
        boxMain.appendChild(box3)
        downloadDiv.appendChild(boxMain)

        let labelRenamePattern = document.createElement('label')
        labelRenamePattern.className = "labelLong"
        labelRenamePattern.innerHTML = "Rename pattern"
        box3.appendChild(labelRenamePattern)

        let inputName = document.createElement('input')
        inputName.className = "inputText"
        inputName.value = MfGlobals.patterns[MfGlobals.selectedPatternNum].name
        inputName.addEventListener('change', this.onChangePatternName)
        //inputName.addEventListener("input", (event) => {event.stopPropagation(); event.preventDefault()})
        inputName.addEventListener("keydown", (event) => { MfGlobals.textInput = true })
        box3.appendChild(inputName)

        let box4 = document.createElement('div')
        box4.className = "sliders-block"

        let midiTitle = document.createElement('label')
        midiTitle.className = "labelLong"
        midiTitle.innerHTML = "MIDI input"
        box4.appendChild(midiTitle)

        let midiBtn = document.createElement('div')
        midiBtn.id = "midiEnableBtn"
        midiBtn.className = "mf-button"
        midiBtn.innerText = MfGlobals.midiManager?.getButtonLabel?.() || "Enable MIDI"
        midiBtn.onclick = async () => {
            midiBtn.innerText = "Enabling MIDI..."
            const midiManager = await MfGlobals.getMidiManager()
            const enabled = await midiManager.init()
            midiBtn.innerText = midiManager.getButtonLabel()
            if (!enabled) {
                midiBtn.innerText = "Enable MIDI"
            }
        }
        box4.appendChild(midiBtn)

        let midiSyncBtn = document.createElement('div')
        midiSyncBtn.id = "midiSyncBtn"
        midiSyncBtn.className = "mf-button"
        midiSyncBtn.innerText = MfGlobals.midiManager?.externalSyncEnabled ? "External Sync: On" : "External Sync: Off"
        midiSyncBtn.onclick = async () => {
            const midiManager = await MfGlobals.getMidiManager()
            const enabled = midiManager.toggleExternalSync()
            midiSyncBtn.innerText = enabled ? "External Sync: On" : "External Sync: Off"
            midiManager.renderIndicators()
        }
        box4.appendChild(midiSyncBtn)

        const midiIndicators = document.createElement('div')
        midiIndicators.className = 'midi-indicators'
        midiIndicators.innerHTML = `
            <div class="midi-indicator-row">
                <span id="midiSupportLed" class="midi-indicator midi-indicator-off"></span>
                <span id="midiSupportLabel" class="midi-indicator-text">Unavailable</span>
            </div>
            <div class="midi-indicator-row">
                <span id="midiReadyLed" class="midi-indicator midi-indicator-off"></span>
                <span id="midiReadyLabel" class="midi-indicator-text">Locked</span>
            </div>
            <div class="midi-indicator-row">
                <span id="midiConnectedLed" class="midi-indicator midi-indicator-off"></span>
                <span id="midiConnectedLabel" class="midi-indicator-text">No inputs</span>
            </div>
            <div class="midi-indicator-row">
                <span id="midiSyncLed" class="midi-indicator midi-indicator-off"></span>
                <span id="midiSyncLabel" class="midi-indicator-text">Internal</span>
            </div>
            <div class="midi-indicator-row">
                <span id="midiActivityLed" class="midi-indicator midi-indicator-off"></span>
                <span id="midiActivityLabel" class="midi-indicator-text">Idle</span>
            </div>
        `
        box4.appendChild(midiIndicators)

        MfGlobals.midiManager?.renderIndicators?.()

        boxMain.appendChild(box4)
    }


    onChangePatternName = (event) => {
        MfGlobals.textInput = false
        let name = Utils.sanitizePatternFileName(event.target.value)
        if (name.length <= 1) { name = "noname" }
        MfGlobals.patterns[MfGlobals.selectedPatternNum].name = name
        MfGlobals.mfCmd.setSelectedPatternNum(MfGlobals.selectedPatternNum)
        MfGlobals.mfUpdates.updateSelectedPattern()
        MfGlobals.mfUpdates.onPatternChange()
        this.createExportBtn(document.getElementById("box2"))
    }

    createExportBtn = (box2) => {
        if (document.getElementById("exportBtn")) {
            document.getElementById("exportBtn").remove()
        }
        const pattern = MfGlobals.patterns[MfGlobals.selectedPatternNum];
        const exportedPattern = PatternExporter.export(pattern);
        let txt = JSON.stringify(exportedPattern)
        let blobExportJson = new Blob([txt], { type: "text/plain;charset=utf-8" })
        let anchorExportJson = document.createElement('a')
        anchorExportJson.id = "exportBtn"
        anchorExportJson.className = "mf-button"
        anchorExportJson.href = window.URL.createObjectURL(blobExportJson)
        anchorExportJson.title = 'ordrumbox-online-' + pattern.name + "-" + (new Date()).getTime() + '.json'
        anchorExportJson.download = anchorExportJson.title
        let anchorExportJsonLinkText = document.createTextNode("Export pattern: " + pattern.name)
        anchorExportJson.appendChild(anchorExportJsonLinkText)
        box2.appendChild(anchorExportJson)
    }



    onImportPatternSelected = (ev) => {
        let fr = new FileReader();
        fr.readAsText(ev.target.files[0])
        console.log("onImportPatternSelected: file pick=" + ev.target.files[0].name)
        fr.onload = (e) => {
            let jsonTxt = JSON.parse(e.target.result)
            if (jsonTxt.application === "online-ordrumbox") {
                const newPattern = MfGlobals.mfCmd.importPatternFromJson(jsonTxt)
                const importedPatternNum = MfGlobals.patterns.indexOf(newPattern)

              //  alert('Pattern : ' + jsonTxt.name + ' imported with success as ptn #' + importedPatternNum)
                MfGlobals.mfCmd.setSelectedPatternNum(importedPatternNum)
                MfGlobals.mfUpdates.onPatternChange()
            } else {
                alert('file is not a ordrumbox file')
            }

            MfGlobals.mfCmd.setSelectedPatternNum(MfGlobals.selectedPatternNum)
            MfGlobals.mfUpdates.updateSelectedPattern()
            ev.target.value = ""
        }
    }

    onDrumkitChange = (newitemNum) => {
        MfGlobals.selectedDrumkitNum = newitemNum
        const selectedDrumkit = MfGlobals.drumkitList[MfGlobals.selectedDrumkitNum]
        MfGlobals.drumkitsDropBox.fillDropBox(MfGlobals.drumkitList, selectedDrumkit, "Kit")
    }

    onPatternChange = async (newItemNum) => {
        const selectedPattern = MfGlobals.patterns[MfGlobals.selectedPatternNum]
        if (MfGlobals.patternsDropBox) {
            MfGlobals.patternsDropBox.fillDropBox(MfGlobals.patterns, selectedPattern, "Ptn:")
        }
        //should ajust strips to fit with pattern
        const mfAutoAssign = await MfGlobals.getAutoAssign()
        mfAutoAssign.autoAssignSounds(selectedPattern)
        MfGlobals.mfPatterns.computeFlatNotesFromPattern(selectedPattern)
        this.updateSelectedPattern()
        document.getElementById("warn-modal").style.display = "none";
    }

}
