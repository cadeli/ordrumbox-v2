import Utils from '../utils.js'
import MfComponents from './mfcomponents.js'

export default class MfCreateIhm {
    static TAG = "MFCREATEIHM"

    constructor() {
        this.mfComponents = new MfComponents()
    }

    createMixerCtrl = (mixerCtrlDiv) => {
        Utils.clearInnerDom(mixerCtrlDiv)
        const paramDiv = document.createElement('div')
        paramDiv.className = "box-h"
        this.createMixerCtrlParam(paramDiv)
        mixerCtrlDiv.appendChild(paramDiv)
    }

    createMixerCtrlParam = (paramDiv) => {
        let gainValue = (MfGlobals.mfMixer.gain.gain.value - 0.5) / (4)
        gainValue = Math.floor(gainValue * 100) / 100
        const btnGain = this.mfComponents.addSliderBox(
            "mixerCtrlGain", "Gain",
            gainValue,
            function(value) {
                if (!MfGlobals.mfMixer) return
                if (!MfGlobals.mfMixer.gain) return
                MfGlobals.mfMixer.gain.gain.value = eval(event.target.value) * 4 + 0.5
            },
            null,
            0, 1, 0.1
        )
        paramDiv.appendChild(btnGain)

        let theresholdValue = MfGlobals.mfMixer.compressor.threshold.value / (-50)
        theresholdValue = Math.floor(theresholdValue * 100) / 100
        const btnThrereshold = this.mfComponents.addSliderBox(
            "mixerCtrlThereshold", "Thereshold",
            theresholdValue,
            function(value) {
                if (!MfGlobals.compressor) return
                if (!MfGlobals.compressor.threshold) return
                MfGlobals.mfMixer.compressor.threshold.value = eval(event.target.value) * (-50)
            },
            null,
            0, 1, 0.1
        )
        paramDiv.appendChild(btnThrereshold)

        let ratioValue = (MfGlobals.mfMixer.compressor.ratio.value - 1) / (19)
        ratioValue = Math.floor(ratioValue * 100) / 100
        const btnRatio = this.mfComponents.addSliderBox(
            "mixerCtrlRatio", "Ratio",
            ratioValue,
            function(value) {
                if (!MfGlobals.compressor) return
                if (!MfGlobals.compressor.ratio) return
                MfGlobals.mfMixer.compressor.ratio.value = eval(event.target.value) * (19) + 1
            },
            null,
            0, 1, 0.1
        )
        paramDiv.appendChild(btnRatio)

    }


    createLfoCtrl = (lfoCtrlDiv) => {
        Utils.clearInnerDom(lfoCtrlDiv)

        const mainDiv = document.createElement('div')
        mainDiv.className = "box-h"
        this.createLfoCtrlMain(mainDiv)

        const paramDiv = document.createElement('div')
        paramDiv.className = "box-h"
        this.createLfoCtrlParam(paramDiv)

        const freqDiv = document.createElement('div')
        freqDiv.className = "box-h"
        this.createLfoCtrlFreq(freqDiv)


        const lfoCtrlDiv2 = document.createElement('div')
        lfoCtrlDiv2.className = 'box-v'
        lfoCtrlDiv2.appendChild(paramDiv)
        lfoCtrlDiv2.appendChild(freqDiv)

        lfoCtrlDiv.appendChild(mainDiv)
        lfoCtrlDiv.appendChild(lfoCtrlDiv2)
    }

    createLfoCtrlMain = (mainDiv) => {
        const selPat = MfGlobals.patterns[MfGlobals.selectedPatternNum]
        const selTrack = selPat.tracks[MfGlobals.selectedTrackNum]
        let selLfo = selTrack[MfGlobals.selectedLfo]
        if (!selLfo) {
            selLfo = { "name": 'noname' }
        }

        const onclickCb = function(event) {
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
        const btnMin = this.mfComponents.addSliderBox(
            "lfoMin", "Min",
            selLfo.min,
            function(value) {
                const selPat = MfGlobals.patterns[MfGlobals.selectedPatternNum]
                const selTrack = selPat.tracks[MfGlobals.selectedTrackNum]
                const selLfo = selTrack[MfGlobals.selectedLfo]
                if (selLfo) {
                    selLfo.min = eval(value)
                }
            },
            null,
            0, 1, 0.1
        )
        paramDiv.appendChild(btnMin)

        const btnMax = this.mfComponents.addSliderBox(
            "lfoMax", "Max",
            selLfo.max,
            function(value) {
                const selPat = MfGlobals.patterns[MfGlobals.selectedPatternNum]
                const selTrack = selPat.tracks[MfGlobals.selectedTrackNum]
                const selLfo = selTrack[MfGlobals.selectedLfo]
                if (selLfo) {
                    selLfo.max = eval(value)
                }
            },
            null,
            0, 1, 0.1
        )
        paramDiv.appendChild(btnMax)

        const btnPhase = this.mfComponents.addSliderBox(
            "lfoPhase", "Phase",
            selLfo.phase,
            function(value) {
                const selPat = MfGlobals.patterns[MfGlobals.selectedPatternNum]
                const selTrack = selPat.tracks[MfGlobals.selectedTrackNum]
                const selLfo = selTrack[MfGlobals.selectedLfo]
                if (selLfo) {
                    selLfo.phase = eval(value)
                }
            },
            null,
            0, 1, 0.1
        )
        paramDiv.appendChild(btnPhase)
    }

    createLfoCtrlFreq = (freqDiv) => {
        const selPat = MfGlobals.patterns[MfGlobals.selectedPatternNum]
        const selTrack = selPat.tracks[MfGlobals.selectedTrackNum]
        let selLfo = selTrack[MfGlobals.selectedLfo]
        if (!selLfo) {
            selLfo = { "freq": 1, "freqMulpt": 1 }
        }
        const btnLfoFreq = this.mfComponents.addSliderBox(
            "lfoFreq", "Freq",
            selLfo.freq,
            function(value) {
                const selPat = MfGlobals.patterns[MfGlobals.selectedPatternNum]
                const selTrack = selPat.tracks[MfGlobals.selectedTrackNum]
                const selLfo = selTrack[MfGlobals.selectedLfo]
                if (selLfo) {
                    selLfo.freq = eval(value)
                }
            },
            null,
            1, 16, 1
        )
        freqDiv.appendChild(btnLfoFreq)

        const btnLfoFreqMulpt = this.mfComponents.addSliderBox(
            "lfoFreqMulpt", "Freq Mulpt",
            selLfo.freqMulpt,
            function(value) {
                const selPat = MfGlobals.patterns[MfGlobals.selectedPatternNum]
                const selTrack = selPat.tracks[MfGlobals.selectedTrackNum]
                const selLfo = selTrack[MfGlobals.selectedLfo]
                if (selLfo) {
                    selLfo.freqMulpt = eval(value)
                }
            },
            null,
            1, 16, 1
        )
        freqDiv.appendChild(btnLfoFreqMulpt)
    }

    createNoteCtrl = (noteCtrlDiv) => {
        Utils.clearInnerDom(noteCtrlDiv)

        const onclickCb = function() { //TODO create in mfUdate / refact 
            const selPat = MfGlobals.patterns[MfGlobals.selectedPatternNum]
            const selTrack = selPat.tracks[MfGlobals.selectedTrackNum]
            const selNote = MfGlobals.mfUpdates.mfCmd.isNoteAt(selTrack, MfGlobals.selectedNoteBar, MfGlobals.selectedNoteStep)[0]
            if (selNote) {
                MfGlobals.mfUpdates.mfCmd.deleteNote(selTrack, selNote)
            } else {
                MfGlobals.mfUpdates.mfCmd.addNote(selTrack, MfGlobals.selectedNoteBar, MfGlobals.selectedNoteStep)
            }
            MfGlobals.mfUpdates.updatePatternView(selPat, MfGlobals.displayBars)
            MfGlobals.mfPatterns.getFlatNotesFromPattern(selPat)
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

    createNoteCtrlTrigger = (triggerDiv) => {
        let selNote = MfGlobals.mfUpdates.getSelectedNote()
        if (!selNote) {
            selNote = { "triggFreq": 0, "triggPhase": 0 }
        }
        const btnTriggFreq = this.mfComponents.addSliderBox(
            "noteCtrlTriggFreq", "Trigg Freq",
            selNote.triggFreq,
            function(value) {
                const selNote = MfGlobals.mfUpdates.getSelectedNote()
                if (selNote) {
                    selNote.triggFreq = eval(value)
                }
            },
            null,
            1, 16, 1
        )
        triggerDiv.appendChild(btnTriggFreq)

        const btnTriggPhase = this.mfComponents.addSliderBox(
            "noteCtrlTriggPhase", "Trigg Phas",
            selNote.triggPhase,
            function(value) {
                const selNote = MfGlobals.mfUpdates.getSelectedNote()
                if (selNote) {
                    selNote.triggPhase = eval(value)
                }
            },
            null,
            0, 15, 1
        )
        triggerDiv.appendChild(btnTriggPhase)
    }

    createNoteCtrlRepeat = (repeatDiv) => {
        let selNote = MfGlobals.mfUpdates.getSelectedNote()
        if (!selNote) {
            selNote = {
                'retriggNum': 1,
                'retriggStep': 1,
                'retriggStepMulpt': 1,
                'euclidianFill': 0
            }
        }
        const btnRetriggNum = this.mfComponents.addSliderBox(
            "noteCtrlRetriggNum", "Repeat Num",
            selNote.retriggNum,
            function(value) {
                const selNote = MfGlobals.mfUpdates.getSelectedNote()
                if (selNote) {
                    selNote.retriggNum = eval(value)
                }
            },
            null,
            0, 8, 1
        )
        repeatDiv.appendChild(btnRetriggNum)

        const btnRetriggStep = this.mfComponents.addSliderBox(
            "noteCtrlRetriggStep", "Rep Step",
            selNote.retriggStep,
            function(value) {
                const selNote = MfGlobals.mfUpdates.getSelectedNote()
                if (selNote) {
                    selNote.retriggStep = eval(value)
                }
            },
            null,
            1, 8, 1
        )
        repeatDiv.appendChild(btnRetriggStep)

        const btnRetriggStepMulpt = this.mfComponents.addSliderBox(
            "noteCtrlRetriggStepMulpt", "Repeat Mpl",
            selNote.retriggStepMulpt,
            function(value) {
                const selNote = MfGlobals.mfUpdates.getSelectedNote()
                if (selNote) {
                    selNote.retriggStepMulpt = eval(value)
                }
            },
            null,
            1, 8, 1
        )
        repeatDiv.appendChild(btnRetriggStepMulpt)

        const btnRetriggEuclidianFill = this.mfComponents.addSliderBox(
            "noteCtrlEuclidianFill", "Eucl Fill",
            selNote.retriggStepMulpt,
            function(value) {
                const selNote = MfGlobals.mfUpdates.getSelectedNote()
                if (selNote) {
                    selNote.euclidianFill = eval(value)
                }
            },
            null,
            0, 8, 1
        )
        repeatDiv.appendChild(btnRetriggEuclidianFill)
    }

    createNoteCtrlParam = (paramDiv) => {
        let selNote = MfGlobals.mfUpdates.getSelectedNote()
        if (!selNote) {
            selNote = { "pitch": 0, "velo": 1, "pano": 0 }
        }
        const btnPitch = this.mfComponents.addSliderBox(
            "noteCtrlPitch", "Pitch",
            selNote.pitch,
            function(value) {
                const selNote = MfGlobals.mfUpdates.getSelectedNote()
                if (selNote) {
                    selNote.pitch = eval(value)
                }
            },
            null,
            -12, 12, 1
        )
        paramDiv.appendChild(btnPitch)

        const btnVelo = this.mfComponents.addSliderBox(
            "noteCtrlVelo", "Velo",
            selNote.velo,
            function(value) {
                const selNote = MfGlobals.mfUpdates.getSelectedNote()
                if (selNote) {
                    selNote.velo = eval(value)
                }
            },
            null,
            0, 1, 0.05
        )
        paramDiv.appendChild(btnVelo)

        const btnPano = this.mfComponents.addSliderBox(
            "noteCtrlPano", "Pano",
            selNote.pano,
            function(value) {
                const selNote = MfGlobals.mfUpdates.getSelectedNote()
                if (selNote) {
                    selNote.pano = eval(value)
                }
            },
            null,
            -1, 1, 0.1
        )
        paramDiv.appendChild(btnPano)
    }


    createTrackCtrl = (trackCtrlDiv) => {
        console.log('mfCreateIhm::createTrackCtrl')
        Utils.clearInnerDom(trackCtrlDiv)
        const onCheckBox = function() {
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

    createTrackCtrlSoundPanel = (soundDiv) => {

        const btnLength = this.mfComponents.addSliderBox(
            "trackCtrlSampleLength", "Length",
            MfGlobals.patterns[MfGlobals.selectedPatternNum].tracks[MfGlobals.selectedTrackNum].sampleLength,
            function(value) {
                MfGlobals.patterns[MfGlobals.selectedPatternNum].tracks[MfGlobals.selectedTrackNum].sampleLength = eval(value)
            },
            null,
            0, 1, 0.05
        )
        soundDiv.appendChild(btnLength)

        const btnAuto = this.mfComponents.addTwostatesBtn("trackCtrlAutoSound", "auto")
        btnAuto.onclick = function(event) {
            const track = MfGlobals.patterns[MfGlobals.selectedPatternNum].tracks[MfGlobals.selectedTrackNum]
            track.autoSound = true
            track.generated = false
            MfGlobals.mfUpdates.mfCmd.autoAssignTrackSounds(track, MfGlobals.selectedTrackNum)
            MfGlobals.mfUpdates.updateTrackCtrl(MfGlobals.selectedTrackNum)
            MfGlobals.mfPatterns.getFlatNotesFromPattern(MfGlobals.patterns[MfGlobals.selectedPatternNum])
        }
        const btnGen = this.mfComponents.addTwostatesBtn("trackCtrlGenSound", "synth")
        btnGen.onclick = function(event) {
            const track = MfGlobals.patterns[MfGlobals.selectedPatternNum].tracks[MfGlobals.selectedTrackNum]
            track.generated = true
            track.autoSound = false
            MfGlobals.mfUpdates.updateTrackCtrl(MfGlobals.selectedTrackNum)
            MfGlobals.mfUpdates.displayModalDialogGenSound()
        }
        const btnPick = this.mfComponents.addTwostatesBtn("trackCtrlPickSound", "pick")
        btnPick.onclick = function(event) {
            const track = MfGlobals.patterns[MfGlobals.selectedPatternNum].tracks[MfGlobals.selectedTrackNum]
            track.generated = false
            MfGlobals.mfUpdates.mfSampleIhm.displayModalDialogPickSound()
        }

        const aDiv = document.createElement('div')
        aDiv.className = "box-v"
        aDiv.appendChild(btnAuto)
        aDiv.appendChild(btnGen)

        soundDiv.appendChild(aDiv)
        soundDiv.appendChild(btnPick)

    }

    createTrackCtrlParamPanel = (paramDiv) => {
        const btnPitch = this.mfComponents.addSliderBox(
            "trackCtrlPitch", "Pitch",
            MfGlobals.patterns[MfGlobals.selectedPatternNum].tracks[MfGlobals.selectedTrackNum].pitch,
            function(value) {
                MfGlobals.patterns[MfGlobals.selectedPatternNum].tracks[MfGlobals.selectedTrackNum].pitch = eval(value)
            },
            'pitchLfo',
            -12, 12, 1
        )
        paramDiv.appendChild(btnPitch)

        const btnVelo = this.mfComponents.addSliderBox(
            "trackCtrlVelo", "Velo",
            MfGlobals.patterns[MfGlobals.selectedPatternNum].tracks[MfGlobals.selectedTrackNum].velo,
            function(value) {
                MfGlobals.patterns[MfGlobals.selectedPatternNum].tracks[MfGlobals.selectedTrackNum].velo = eval(value)
            },
            'veloLfo',
            0, 1, 0.05
        )
        paramDiv.appendChild(btnVelo)

        const btnPano = this.mfComponents.addSliderBox(
            "trackCtrlPano", "Pano",
            MfGlobals.patterns[MfGlobals.selectedPatternNum].tracks[MfGlobals.selectedTrackNum].pano,
            function(value) {
                MfGlobals.patterns[MfGlobals.selectedPatternNum].tracks[MfGlobals.selectedTrackNum].pano = eval(value)
            },
            'panoLfo',
            -1, 1, 0.1
        )
        paramDiv.appendChild(btnPano)

        const btnSwing = this.mfComponents.addSliderBox(
            "trackCtrlSwing", "Swing",
            MfGlobals.patterns[MfGlobals.selectedPatternNum].tracks[MfGlobals.selectedTrackNum].swingDepth,
            function(value) {
                MfGlobals.patterns[MfGlobals.selectedPatternNum].tracks[MfGlobals.selectedTrackNum].swingDepth = eval(value)
            },
            null,
            0, 1, 0.1
        )
        paramDiv.appendChild(btnSwing)
    }

    createTrackCtrlFilterPanel = (filterDiv) => {
        const filterTypeList = ["lp", "hp", "bp", "no", "all"]
        let inputBoxFilterType = this.mfComponents.addListInputBox("FilterType", "trackCtrlFilterType", filterTypeList, MfGlobals.patterns[MfGlobals.selectedPatternNum].tracks[MfGlobals.selectedTrackNum].filterType, function(value) {
            const track = MfGlobals.patterns[MfGlobals.selectedPatternNum].tracks[MfGlobals.selectedTrackNum]
            track.filterType = Utils.getFilterNameFromValue(value)
            MfGlobals.mfMixer.updateFilter(track.name, track.filterType, track.filterFreq, track.filterQ)
        })
        filterDiv.appendChild(inputBoxFilterType)

        const btnFilterFreq = this.mfComponents.addSliderBox(
            "trackCtrlFilterFreq", "Fltr Freq",
            MfGlobals.patterns[MfGlobals.selectedPatternNum].tracks[MfGlobals.selectedTrackNum].filterFreq,
            function(value) {
                MfGlobals.patterns[MfGlobals.selectedPatternNum].tracks[MfGlobals.selectedTrackNum].filterFreq = eval(value)
            },
            'filterFreqLfo',
            0, 1, 0.05
        )
        filterDiv.appendChild(btnFilterFreq)

        const btnFilterQ = this.mfComponents.addSliderBox(
            "trackCtrlFilterQ", "Filter Q",
            MfGlobals.patterns[MfGlobals.selectedPatternNum].tracks[MfGlobals.selectedTrackNum].filterQ,
            function(value) {
                MfGlobals.patterns[MfGlobals.selectedPatternNum].tracks[MfGlobals.selectedTrackNum].filterQ = eval(value)
            },
            'filterQLfo',
            0, 1, 0.05
        )
        filterDiv.appendChild(btnFilterQ)
    }


    addTitleBox = (panel, idCheckBox, idLabel, chkBoxClick, labelClick) => {
        const aDiv = document.createElement('div')
        aDiv.className = "box-v"
        const lblDiv = document.createElement('span')
        lblDiv.className = "labelLong"
        lblDiv.innerText = ""
        lblDiv.id = idLabel
        lblDiv.onclick = labelClick
        const inputDiv = document.createElement('input')
        inputDiv.type = "checkbox"
        inputDiv.id = idCheckBox
        inputDiv.onclick = chkBoxClick

        aDiv.appendChild(inputDiv)
        aDiv.appendChild(lblDiv)
        panel.appendChild(aDiv)
    }


}