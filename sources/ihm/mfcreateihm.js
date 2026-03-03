import Utils from '../utils.js'
import MfComponents from './mfcomponents.js'

export default class MfCreateIhm {
    static TAG = "MFCREATEIHM"

    constructor() {

    }

    createMixerCtrl = (mixerCtrlDiv) => {
        Utils.clearInnerDom(mixerCtrlDiv)
        const paramDiv = document.createElement('div')
        paramDiv.className = "box-grid"
        this.createMixerCtrlParam(paramDiv)
        mixerCtrlDiv.appendChild(paramDiv)
    }

    createMixerCtrlParam = (paramDiv) => {
        const mfBtnGain = Utils.createMfElement("div", null, "mf-button", paramDiv)
        const mfBtnThrereshold = Utils.createMfElement("div", null, "mf-button", paramDiv)
        const mfbtnRatio = Utils.createMfElement("div", null, "mf-button", paramDiv)
        let gainValue = (MfGlobals.mfMixer.gain.gain.value - 0.5) / (4)
        gainValue = Math.floor(gainValue * 100) / 100
        const btnGain = MfGlobals.mfSliderBox.addSliderBox2(
            "mixerCtrlGain", "Gain",
            gainValue,
            function (value) {
                if (!MfGlobals.mfMixer) return
                if (!MfGlobals.mfMixer.gain) return
                MfGlobals.mfMixer.gain.gain.value = eval(event.target.value) * 4 + 0.5
            },
            null,
            0, 1, 0.1,
            mfBtnGain
        )

        let theresholdValue = MfGlobals.mfMixer.compressor.threshold.value / (-50)
        theresholdValue = Math.floor(theresholdValue * 100) / 100
        const btnThrereshold = MfGlobals.mfSliderBox.addSliderBox2(
            "mixerCtrlThereshold", "Thereshold",
            theresholdValue,
            function (value) {
                if (!MfGlobals.compressor) return
                if (!MfGlobals.compressor.threshold) return
                MfGlobals.mfMixer.compressor.threshold.value = eval(event.target.value) * (-50)
            },
            null,
            0, 1, 0.1, mfBtnThrereshold
        )

        let ratioValue = (MfGlobals.mfMixer.compressor.ratio.value - 1) / (19)
        ratioValue = Math.floor(ratioValue * 100) / 100
        const btnRatio = MfGlobals.mfSliderBox.addSliderBox2(
            "mixerCtrlRatio", "Ratio",
            ratioValue,
            function (value) {
                if (!MfGlobals.compressor) return
                if (!MfGlobals.compressor.ratio) return
                MfGlobals.mfMixer.compressor.ratio.value = eval(event.target.value) * (19) + 1
            },
            null,
            0, 1, 0.1, mfbtnRatio
        )
    }


    createLfoCtrl = (lfoCtrlDiv) => {
        Utils.clearInnerDom(lfoCtrlDiv)
        const mainDiv = Utils.createMfElement("div", null, "box-h", lfoCtrlDiv)
        this.createLfoCtrlMain(mainDiv)

        const lfoCtrlDiv2 = Utils.createMfElement("div", null, "box-v", lfoCtrlDiv)
        lfoCtrlDiv2.className = 'box-v'

        const paramDiv = Utils.createMfElement("div", null, "box-h", lfoCtrlDiv2)
        this.createLfoCtrlParam(paramDiv)

        const freqDiv = Utils.createMfElement("div", null, "box-h", lfoCtrlDiv2)
        this.createLfoCtrlFreq(freqDiv)
    }

    createLfoCtrlMain = (mainDiv) => {
        const selPat = MfGlobals.patterns[MfGlobals.selectedPatternNum]
        const selTrack = selPat.tracks[MfGlobals.selectedTrackNum]
        let selLfo = selTrack[MfGlobals.selectedLfo]
        if (!selLfo) {
            selLfo = { "name": 'noname' }
        }

        const onclickCb = function (event) {
            if (event.target.checked) {
                const selPat = MfGlobals.patterns[MfGlobals.selectedPatternNum]
                const selTrack = selPat.tracks[MfGlobals.selectedTrackNum]
                selTrack[MfGlobals.selectedLfo] = {
                    "name": "lfo",
                    "freq": 1,
                    "freqMulpt": 1,
                    "min": 0,
                    "max": 1,
                    "phase": 0
                }
            } else {
                const selPat = MfGlobals.patterns[MfGlobals.selectedPatternNum]
                const selTrack = selPat.tracks[MfGlobals.selectedTrackNum]
                selTrack[MfGlobals.selectedLfo] = null
            }
            MfGlobals.mfUpdates.updateTrackCtrl(MfGlobals.selectedTrackNum)
        }
        this.addTitleBox(mainDiv, "lfoOnOff", "lfoname", onclickCb, null)
    }

    createLfoCtrlParam = (paramDiv) => {
        const selPat = MfGlobals.patterns[MfGlobals.selectedPatternNum]
        const selTrack = selPat.tracks[MfGlobals.selectedTrackNum]
        let selLfo = selTrack[MfGlobals.selectedLfo]
        if (!selLfo) {
            selLfo = { "min": 0, "max": 1, "phase": 0 }
        }

        const mfBtnMin = Utils.createMfElement("div", null, "mf-button", paramDiv)
        const mfBtnMax = Utils.createMfElement("div", null, "mf-button", paramDiv)
        const mfBtnPhase = Utils.createMfElement("div", null, "mf-button", paramDiv)

        const btnMin = MfGlobals.mfSliderBox.addSliderBox2(
            "lfoMin", "Min",
            selLfo.min,
            function (value) {
                const selPat = MfGlobals.patterns[MfGlobals.selectedPatternNum]
                const selTrack = selPat.tracks[MfGlobals.selectedTrackNum]
                const selLfo = selTrack[MfGlobals.selectedLfo]
                if (selLfo) {
                    selLfo.min = eval(value)
                }
            },
            null,
            0, 1, 0.1, mfBtnMin
        )

        const btnMax = MfGlobals.mfSliderBox.addSliderBox2(
            "lfoMax", "Max",
            selLfo.max,
            function (value) {
                const selPat = MfGlobals.patterns[MfGlobals.selectedPatternNum]
                const selTrack = selPat.tracks[MfGlobals.selectedTrackNum]
                const selLfo = selTrack[MfGlobals.selectedLfo]
                if (selLfo) {
                    selLfo.max = eval(value)
                }
            },
            null,
            0, 1, 0.1, mfBtnMax
        )

        const btnPhase = MfGlobals.mfSliderBox.addSliderBox2(
            "lfoPhase", "Phase",
            selLfo.phase,
            function (value) {
                const selPat = MfGlobals.patterns[MfGlobals.selectedPatternNum]
                const selTrack = selPat.tracks[MfGlobals.selectedTrackNum]
                const selLfo = selTrack[MfGlobals.selectedLfo]
                if (selLfo) {
                    selLfo.phase = eval(value)
                }
            },
            null,
            0, 1, 0.1, mfBtnPhase
        )
    }

    createLfoCtrlFreq = (paramDiv) => {
        const selPat = MfGlobals.patterns[MfGlobals.selectedPatternNum]
        const selTrack = selPat.tracks[MfGlobals.selectedTrackNum]
        let selLfo = selTrack[MfGlobals.selectedLfo]
        if (!selLfo) {
            selLfo = { "freq": 1, "freqMulpt": 1 }
        }

        const mfBtnFreq = Utils.createMfElement("div", null, "mf-button", paramDiv)
        const mfBtnFreqM = Utils.createMfElement("div", null, "mf-button", paramDiv)

        const btnLfoFreq = MfGlobals.mfSliderBox.addSliderBox2(
            "lfoFreq", "Freq",
            selLfo.freq,
            function (value) {
                const selPat = MfGlobals.patterns[MfGlobals.selectedPatternNum]
                const selTrack = selPat.tracks[MfGlobals.selectedTrackNum]
                const selLfo = selTrack[MfGlobals.selectedLfo]
                if (selLfo) {
                    selLfo.freq = eval(value)
                }
            },
            null,
            1, 16, 1, mfBtnFreq
        )

        const btnLfoFreqMulpt = MfGlobals.mfSliderBox.addSliderBox2(
            "lfoFreqMulpt", "Freq Mulpt",
            selLfo.freqMulpt,
            function (value) {
                const selPat = MfGlobals.patterns[MfGlobals.selectedPatternNum]
                const selTrack = selPat.tracks[MfGlobals.selectedTrackNum]
                const selLfo = selTrack[MfGlobals.selectedLfo]
                if (selLfo) {
                    selLfo.freqMulpt = eval(value)
                }
            },
            null,
            1, 16, 1, mfBtnFreqM
        )
    }

    createNoteCtrl = (noteCtrlDiv) => {
        Utils.clearInnerDom(noteCtrlDiv)

        const onclickCb = function () { //TODO create in mfUdate / refact 
            const selPat = MfGlobals.patterns[MfGlobals.selectedPatternNum]
            const selTrack = selPat.tracks[MfGlobals.selectedTrackNum]
            const selNote = MfGlobals.mfUpdates.mfCmd.isNoteAt(selTrack, MfGlobals.selectedNoteBar, MfGlobals.selectedNoteStep)[0]
            if (selNote) {
                MfGlobals.mfUpdates.mfCmd.deleteNote(selTrack, selNote)
            } else {
                MfGlobals.mfUpdates.mfCmd.addNote(selTrack, MfGlobals.selectedNoteBar, MfGlobals.selectedNoteStep)
            }
            MfGlobals.mfUpdates.updatePatternView(selPat, MfGlobals.displayBars)
            MfGlobals.mfPatterns.computeFlatNotesFromPattern(selPat)
        }

        const mainDiv = document.createElement('div')
        mainDiv.className = "box-h"
        this.addTitleBox(mainDiv, "noteCtrlChkId", "noteCtrlLblId", onclickCb, null)
        noteCtrlDiv.appendChild(mainDiv)

        const subDiv = document.createElement('div')
        subDiv.className = "box-v"

        const paramDiv = document.createElement('div')
        paramDiv.className = "box-h"
        subDiv.appendChild(paramDiv)
        this.createNoteCtrlParam(paramDiv)

        const repeatDiv = document.createElement('div')
        repeatDiv.className = "box-h"
        subDiv.appendChild(repeatDiv)
        this.createNoteCtrlRepeat(repeatDiv)

        const triggerDiv = document.createElement('div')
        triggerDiv.className = "box-h"
        subDiv.appendChild(triggerDiv)
        this.createNoteCtrlTrigger(triggerDiv)

        noteCtrlDiv.appendChild(subDiv)

        document.getElementById('noteCtrlLblId').innerText = "Note Controls"

    }

    createNoteCtrlTrigger = (paramDiv) => {
        const mfBtnTrigFreq = Utils.createMfElement("div", null, "mf-button", paramDiv)
        const mfBtnRTrigPhase = Utils.createMfElement("div", null, "mf-button", paramDiv)

        let selNote = MfGlobals.mfUpdates.getSelectedNote()
        if (!selNote) {
            selNote = { "triggFreq": 0, "triggPhase": 0 }
        }
        const btnTriggFreq = MfGlobals.mfSliderBox.addSliderBox2(
            "noteCtrlTriggFreq", "Trigg Freq",
            selNote.triggFreq,
            function (value) {
                const selNote = MfGlobals.mfUpdates.getSelectedNote()
                if (selNote) {
                    selNote.triggFreq = eval(value)
                }
            },
            null,
            1, 16, 1, mfBtnTrigFreq
        )

        const btnTriggPhase = MfGlobals.mfSliderBox.addSliderBox2(
            "noteCtrlTriggPhase", "Trigg Phas",
            selNote.triggPhase,
            function (value) {
                const selNote = MfGlobals.mfUpdates.getSelectedNote()
                if (selNote) {
                    selNote.triggPhase = eval(value)
                }
            },
            null,
            0, 15, 1, mfBtnRTrigPhase
        )
    }

    createNoteCtrlRepeat = (paramDiv) => {
        const mfBtnRepNum = Utils.createMfElement("div", null, "mf-button", paramDiv)
        const mfBtnRepStep = Utils.createMfElement("div", null, "mf-button", paramDiv)
        const mfBtnRepMlp = Utils.createMfElement("div", null, "mf-button", paramDiv)
        const mfBtnEuclFill = Utils.createMfElement("div", null, "mf-button", paramDiv)

        let selNote = MfGlobals.mfUpdates.getSelectedNote()
        if (!selNote) {
            selNote = {
                'retriggNum': 1,
                'retriggStep': 1,
                'retriggStepMulpt': 1,
                'euclidianFill': 0
            }
        }
        const btnRetriggNum = MfGlobals.mfSliderBox.addSliderBox2(
            "noteCtrlRetriggNum", "Repeat Num",
            selNote.retriggNum,
            function (value) {
                const selNote = MfGlobals.mfUpdates.getSelectedNote()
                if (selNote) {
                    selNote.retriggNum = eval(value)
                }
            },
            null,
            0, 8, 1, mfBtnRepNum
        )

        const btnRetriggStep = MfGlobals.mfSliderBox.addSliderBox2(
            "noteCtrlRetriggStep", "Rep Step",
            selNote.retriggStep,
            function (value) {
                const selNote = MfGlobals.mfUpdates.getSelectedNote()
                if (selNote) {
                    selNote.retriggStep = eval(value)
                }
            },
            null,
            1, 8, 1, mfBtnRepStep
        )

        const btnRetriggStepMulpt = MfGlobals.mfSliderBox.addSliderBox2(
            "noteCtrlRetriggStepMulpt", "Repeat Mpl",
            selNote.retriggStepMulpt,
            function (value) {
                const selNote = MfGlobals.mfUpdates.getSelectedNote()
                if (selNote) {
                    selNote.retriggStepMulpt = eval(value)
                }
            },
            null,
            1, 8, 1, mfBtnRepMlp
        )

        const btnRetriggEuclidianFill = MfGlobals.mfSliderBox.addSliderBox2(
            "noteCtrlEuclidianFill", "Eucl Fill",
            selNote.retriggStepMulpt,
            function (value) {
                const selNote = MfGlobals.mfUpdates.getSelectedNote()
                if (selNote) {
                    selNote.euclidianFill = eval(value)
                }
            },
            null,
            0, 8, 1, mfBtnEuclFill
        )
    }

    createNoteCtrlParam = (paramDiv) => {
        const mfBtnPitch = Utils.createMfElement("div", null, "mf-button", paramDiv)
        const mfBtnVelo = Utils.createMfElement("div", null, "mf-button", paramDiv)
        const mfBtnPano = Utils.createMfElement("div", null, "mf-button", paramDiv)

        let selNote = MfGlobals.mfUpdates.getSelectedNote()
        if (!selNote) {
            selNote = { "pitch": 0, "velo": 1, "pano": 0 }
        }
        const btnPitch = MfGlobals.mfSliderBox.addSliderBox2(
            "noteCtrlPitch", "Pitch",
            selNote.pitch,
            function (value) {
                const selNote = MfGlobals.mfUpdates.getSelectedNote()
                if (selNote) {
                    selNote.pitch = eval(value)
                }
            },
            null,
            -12, 12, 1, mfBtnPitch
        )

        const btnVelo = MfGlobals.mfSliderBox.addSliderBox2(
            "noteCtrlVelo", "Velo",
            selNote.velo,
            function (value) {
                const selNote = MfGlobals.mfUpdates.getSelectedNote()
                if (selNote) {
                    selNote.velo = eval(value)
                }
            },
            null,
            0, 1, 0.05, mfBtnVelo
        )

        const btnPano = MfGlobals.mfSliderBox.addSliderBox2(
            "noteCtrlPano", "Pano",
            selNote.pano,
            function (value) {
                const selNote = MfGlobals.mfUpdates.getSelectedNote()
                if (selNote) {
                    selNote.pano = eval(value)
                }
            },
            null,
            -1, 1, 0.1, mfBtnPano
        )
    }


    createTrackCtrl = (trackCtrlDiv) => {
        console.log('mfCreateIhm::createTrackCtrl')
        Utils.clearInnerDom(trackCtrlDiv)
        const onCheckBox = function () {
            const track = MfGlobals.patterns[MfGlobals.selectedPatternNum].tracks[MfGlobals.selectedTrackNum]
            MfGlobals.mfUpdates.trackToggleMute(track)
            MfGlobals.mfUpdates.updateSelectedPattern()
        }
        this.addTitleBox(trackCtrlDiv, "trackNameChkBtn", "trackNameBtn", onCheckBox, null)

        const bDiv = document.createElement('div')
        bDiv.className = "box-v"
        const sndDiv = document.createElement('div')
        sndDiv.className = "box-h"
        bDiv.appendChild(sndDiv)
        this.createTrackCtrlSoundPanel(sndDiv)

        const paramDiv = document.createElement('div')
        paramDiv.className = "box-h"
        bDiv.appendChild(paramDiv)
        this.createTrackCtrlParamPanel(paramDiv)

        const filterDiv = document.createElement('div')
        filterDiv.className = "box-h"
        bDiv.appendChild(filterDiv)
        this.createTrackCtrlFilterPanel(filterDiv)

        trackCtrlDiv.appendChild(bDiv)
    }

    createTrackCtrlSoundPanel = (paramDiv) => {
        const mfBtnLength = Utils.createMfElement("div", null, "mf-button", paramDiv)

        const btnLength = MfGlobals.mfSliderBox.addSliderBox2(
            "trackCtrlSampleLength", "Length",
            MfGlobals.patterns[MfGlobals.selectedPatternNum].tracks[MfGlobals.selectedTrackNum].sampleLength,
            function (value) {
                MfGlobals.patterns[MfGlobals.selectedPatternNum].tracks[MfGlobals.selectedTrackNum].sampleLength = eval(value)
            },
            null,
            0, 1, 0.05, mfBtnLength
        )

        const btnAuto = MfGlobals.mfComponents.addTwostatesBtnTb('trackCtrlAutoSound', 'auto')
        btnAuto.onclick = function (event) {
            const track = MfGlobals.patterns[MfGlobals.selectedPatternNum].tracks[MfGlobals.selectedTrackNum]
            track.autoSound = true
            track.generated = false
            MfGlobals.mfUpdates.mfCmd.autoAssignTrackSounds(track, MfGlobals.selectedTrackNum)
            MfGlobals.mfUpdates.updateTrackCtrl(MfGlobals.selectedTrackNum)
           MfGlobals.mfPatterns.computeFlatNotesFromPattern(MfGlobals.patterns[MfGlobals.selectedPatternNum])
        }
        const btnGen = MfGlobals.mfComponents.addTwostatesBtnTb("trackCtrlGenSound", "synth")
        btnGen.onclick = function (event) {
            const track = MfGlobals.patterns[MfGlobals.selectedPatternNum].tracks[MfGlobals.selectedTrackNum]
            track.generated = true
            track.autoSound = false
            MfGlobals.mfUpdates.updateTrackCtrl(MfGlobals.selectedTrackNum)
            MfGlobals.mfUpdates.mfSoftSynthIhm.displayModalDialogGenSound()
        }
        const btnPick = MfGlobals.mfComponents.addTwostatesBtn("trackCtrlPickSound", "pick")
        btnPick.onclick = function (event) {
            const track = MfGlobals.patterns[MfGlobals.selectedPatternNum].tracks[MfGlobals.selectedTrackNum]
            track.generated = false
            MfGlobals.mfUpdates.mfSampleIhm.displayModalDialogPickSound()
        }

        const aDiv = document.createElement('div')
        aDiv.className = "box-v"
        aDiv.appendChild(btnAuto)
        aDiv.appendChild(btnGen)

        paramDiv.appendChild(aDiv)
        paramDiv.appendChild(btnPick)

    }

    createTrackCtrlParamPanel = (paramDiv) => {
        const mfBtnPitch = Utils.createMfElement("div", null, "mf-button", paramDiv)
        const mfBtnVelo = Utils.createMfElement("div", null, "mf-button", paramDiv)
        const mfBtnPano = Utils.createMfElement("div", null, "mf-button", paramDiv)
        const mfBtnSwing = Utils.createMfElement("div", null, "mf-button", paramDiv)

        const btnPitch = MfGlobals.mfSliderBox.addSliderBox2(
            "trackCtrlPitch", "Pitch",
            MfGlobals.patterns[MfGlobals.selectedPatternNum].tracks[MfGlobals.selectedTrackNum].pitch,
            function (value) {
                MfGlobals.patterns[MfGlobals.selectedPatternNum].tracks[MfGlobals.selectedTrackNum].pitch = eval(value)
            },
            'pitchLfo',
            -12, 12, 1, mfBtnPitch
        )

        const btnVelo = MfGlobals.mfSliderBox.addSliderBox2(
            "trackCtrlVelo", "Velo",
            MfGlobals.patterns[MfGlobals.selectedPatternNum].tracks[MfGlobals.selectedTrackNum].velo,
            function (value) {
                MfGlobals.patterns[MfGlobals.selectedPatternNum].tracks[MfGlobals.selectedTrackNum].velo = eval(value)
            },
            'veloLfo',
            0, 1, 0.05, mfBtnVelo
        )

        const btnPano = MfGlobals.mfSliderBox.addSliderBox2(
            "trackCtrlPano", "Pano",
            MfGlobals.patterns[MfGlobals.selectedPatternNum].tracks[MfGlobals.selectedTrackNum].pano,
            function (value) {
                MfGlobals.patterns[MfGlobals.selectedPatternNum].tracks[MfGlobals.selectedTrackNum].pano = eval(value)
            },
            'panoLfo',
            -1, 1, 0.1, mfBtnPano
        )

        const btnSwing = MfGlobals.mfSliderBox.addSliderBox2(
            "trackCtrlSwing", "Swing",
            MfGlobals.patterns[MfGlobals.selectedPatternNum].tracks[MfGlobals.selectedTrackNum].swingDepth,
            function (value) {
                MfGlobals.patterns[MfGlobals.selectedPatternNum].tracks[MfGlobals.selectedTrackNum].swingDepth = eval(value)
            },
            null,
            0, 1, 0.1, mfBtnSwing
        )
    }

    createTrackCtrlFilterPanel = (paramDiv) => {
        const mfBtnFltFreq = Utils.createMfElement("div", null, "mf-button", paramDiv)
        const mfBtnFltQ = Utils.createMfElement("div", null, "mf-button", paramDiv)


        const filterTypeList = ["LP", "HP", "BP", "NO", "ALL"]
        let inputBoxFilterType = MfGlobals.mfComponents.addListInputBox("Fltr Type", "trackCtrlFilterType", filterTypeList, MfGlobals.patterns[MfGlobals.selectedPatternNum].tracks[MfGlobals.selectedTrackNum].filterType, function (value) {
            const track = MfGlobals.patterns[MfGlobals.selectedPatternNum].tracks[MfGlobals.selectedTrackNum]
            track.filterType = Utils.getFilterNameFromValue(value)
            MfGlobals.mfMixer.updateFilter(track.name, track.filterType, track.filterFreq, track.filterQ)
        })
        paramDiv.appendChild(inputBoxFilterType)

        const btnFilterFreq = MfGlobals.mfSliderBox.addSliderBox2(
            "trackCtrlFilterFreq", "FLTR FREQ",
            MfGlobals.patterns[MfGlobals.selectedPatternNum].tracks[MfGlobals.selectedTrackNum].filterFreq,
            function (value) {
                MfGlobals.patterns[MfGlobals.selectedPatternNum].tracks[MfGlobals.selectedTrackNum].filterFreq = eval(value)
            },
            'filterFreqLfo',
            0, 1, 0.05, mfBtnFltFreq
        )

        const btnFilterQ = MfGlobals.mfSliderBox.addSliderBox2(
            "trackCtrlFilterQ", "FLTR Q",
            MfGlobals.patterns[MfGlobals.selectedPatternNum].tracks[MfGlobals.selectedTrackNum].filterQ,
            function (value) {
                MfGlobals.patterns[MfGlobals.selectedPatternNum].tracks[MfGlobals.selectedTrackNum].filterQ = eval(value)
            },
            'filterQLfo',
            0, 1, 0.05, mfBtnFltQ
        )
    }


    addTitleBox = (panel, idCheckBox, idLabel, chkBoxClick, labelClick) => {
        const aDiv = Utils.createMfElement("div", null, "mf-title-box", panel)
        const lblDiv = Utils.createMfElement("div", idLabel, "labelLong", aDiv)
        lblDiv.innerText = ""
        lblDiv.onclick = labelClick
        const inputDiv = Utils.createMfElement("input", idCheckBox, null, aDiv)
        inputDiv.type = "checkbox"
        inputDiv.onclick = chkBoxClick
    }

}