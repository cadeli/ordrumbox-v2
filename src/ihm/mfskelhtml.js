import { MfGlobals } from '../mfglobals.js'
import Utils from '../utils.js'
import MfDropBox from './mfdropbox.js'


export default class MfSkelHtml {
    constructor() {
        this.mfDropBoxDrumkits = new MfDropBox("kit")
        this.mfDropBoxPatterns = new MfDropBox("pat")
        this.initialPatternLoadScheduled = false
        this.initialKitLoadScheduled = false
        this.isDrumkitListLoaded = false
    }

    createSkelMainIhm = () => {
        let destDiv = document.getElementById("insert-ordrumbox-v2-here")
        if (destDiv) {
            Utils.recursiveClear(destDiv)
        } else {
            destDiv = document.body
        }
        let mainDiv = Utils.createMfElement("div", "ordrumbox-v2", "main-ihm", destDiv)
        mainDiv.onclick = function (event) {
            //Utils.collapseSliders()
            Utils.collapseDropBoxs()
        }

        this.createSkelToolbarIhm(mainDiv)
        this.createSkelMainIhmPatternView(mainDiv)
        this.createSkelMixerIhm(mainDiv)
        this.createskelLinecontrols(mainDiv)

        this.createSkelWarnModal(mainDiv)
        this.createSkelVisuModal(mainDiv)
    }

    createSkelWarnModal = (mainDiv) => {
        let modalDiv = Utils.createMfElement("div", "warn-modal", null, mainDiv)
        let modalContentDiv = Utils.createMfElement("div", null, "modal-content", modalDiv)
        let modalTitle = Utils.createMfElement("div", "modal-title", null, modalContentDiv)
        let modalTitleText = Utils.createMfElement("div", "modal-title-text", null, modalTitle)
        let modalClose = Utils.createMfElement("div", "modal-close", null, modalTitle)
        let modalMessage = Utils.createMfElement("div", "modal-message", null, modalContentDiv)
        modalTitleText.innerText = " WARNING "
        modalClose.innerText = "×"
        modalClose.onclick = function () {
            modalDiv.style.display = "none"
        }
    }

    createSkelVisuModal = (mainDiv) => {
        let visuDiv = Utils.createMfElement("div", "visu-modal", null, mainDiv)
        let svgElem = document.createElementNS("http://www.w3.org/2000/svg", "svg")
        svgElem.id = "visuformSvg"
        svgElem.style.backgroundColor = "#000"
        svgElem.setAttribute("width", "100%")
        visuDiv.appendChild(svgElem)
    }

    onClickOnPattern = (indexPattern) => {
        MfGlobals.mfCmd.setSelectedPatternNum(indexPattern)
        MfGlobals.mfUpdates.onPatternChange(indexPattern)
    }

    onClickOnDrumkit = (indexDrumkit) => {
        MfGlobals.mfCmd.setSelectedDrumkitNum(indexDrumkit)
        MfGlobals.mfUpdates.onDrumkitChange(indexDrumkit)
    }

    createSkelToolbarIhm = (mainDiv) => {
        let toolbarDiv = Utils.createMfElement("div", "toolbar", "line-controls", mainDiv)

        let playstopBtn = Utils.createMfElement("div", "playstop", "mf-tb-button mf-tb-play", toolbarDiv)
        playstopBtn.innerText = "play"
        playstopBtn.onclick = function () {
            MfGlobals.mfSeq.toggleStartStop()
        }

        let vuMetterBorderDiv = Utils.createMfElement("div", "vuMetterBorder", " mf-tb-button", toolbarDiv)

        let vuMetterBorderSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg")
        vuMetterBorderSvg.id = "vuMetterBorderSvg"
        vuMetterBorderSvg.setAttribute("height", "18px")
        vuMetterBorderSvg.setAttribute("width", "64px")
        vuMetterBorderDiv.appendChild(vuMetterBorderSvg)
        vuMetterBorderDiv.onclick = function () {
            MfGlobals.mfUpdates.toggleMixerControls()
        }

        let currentMarkSpan = Utils.createMfElement("span", "currentMark", "mf-tb-button", toolbarDiv)
        currentMarkSpan.innerText = "00:0"
        currentMarkSpan.onclick = function () {
            MfGlobals.mfUpdates.displayModalDialogNbBar()
        }

        let patternLengthDiv = Utils.createMfElement("div", "patternLength", " mf-tb-button", toolbarDiv)
        patternLengthDiv.innerText = "1/1"
        patternLengthDiv.onclick = function () {
            MfGlobals.mfUpdates.incrDisplayBarIhm()
        }

        let bpmBoxDiv = Utils.createMfElement("div", "bpmBoxDiv", " mf-tb-button", toolbarDiv)
        const btnBpm = MfGlobals.mfSliderBox.addSliderBox2(
            "bpmCtrl", "Bpm",
            MfGlobals.mfSeq.bpm,
            function (value) {
                MfGlobals.mfSeq.setBpm(parseInt(event.target.value))
            },
            null,
            20, 250, 1, bpmBoxDiv
        )
        document.getElementById("bpmCtrl-inputLabel").classList.remove('inputLabel');
        document.getElementById("bpmCtrl-inputLabel").classList.add('inputLabel-lb');

        this.selectedDrumkitDb = Utils.createMfElement("div", "selectedDrumkitDbId", "mf-tb-button-large", toolbarDiv)
        this.selectedDrumkitDb.innerHTML = "<b>" + "KIT:" + "</b>:" + "init" + " ▾"
        let _this = this
        this.selectedDrumkitDb.onclick = function () {
            _this.loadDrumkitList()
        }

        this.selectedPatternDb = Utils.createMfElement("div", "selectedPatternDbId", "mf-tb-button-large", toolbarDiv)
        this.selectedPatternDb.innerHTML = "<b>" + "PTN:" + "</b>:" + "init" + " ▾"
        this.selectedPatternDb.onclick = function () {
            _this.loadPatternList()
        }

        let patternAutoModeDiv = MfGlobals.mfComponents.addTwostatesBtn("patternAutoMode", "auto")
        patternAutoModeDiv.onclick = function () {
            MfGlobals.mfUpdates.togglePatternAutoMode()
        }
        toolbarDiv.appendChild(patternAutoModeDiv)

        let cleanPatternBtn = Utils.createMfElement("div", "cleanPattern", "mf-tb-button mf-tb-clear", toolbarDiv)
        cleanPatternBtn.innerText = "clear"
        cleanPatternBtn.onclick = function () {
            MfGlobals.mfUpdates.clearPattern()
        }

        let toolsBtn = Utils.createMfElement("div", "tools", "mf-tb-button mf-tb-tools", toolbarDiv)
        toolsBtn.innerText = "tools"
        toolsBtn.onclick = function () {
            MfGlobals.mfUpdates.createRecordPanel()
        }
    }

    loadDrumkitList = (complete = null) => {
        this.selectedDrumkitDb.onclick = function () { }
        this.selectedDrumkitDb.innerHTML = ""
        MfGlobals.mfResourcesLoader.loadDrumkitList(MfGlobals.urldrumkits, () => {
            this.onDrumkitlistLoaded()
            complete?.()
        })
    }

    onDrumkitlistLoaded = () => {
        console.log("main:onDrumkitlistLoaded :")
        console.log(MfGlobals.drumkitList)
        this.isDrumkitListLoaded = true
        MfGlobals.drumkitsDropBox = this.mfDropBoxDrumkits.addDropbox("Kit", MfGlobals.drumkitList, MfGlobals.drumkitList[MfGlobals.selectedDrumkitNum], "drumkitDropBoxId", this.selectedDrumkitDb, this.onClickOnDrumkit)
        MfGlobals.drumkitsDropBox.fillDropBox(MfGlobals.drumkitList, MfGlobals.drumkitList[MfGlobals.selectedDrumkitNum], "Kit")
        document.getElementById("toolbar").style.display = 'flex'
    }

    loadPatternList = (complete = null) => {
        console.log("mfskelhtml::loadPatternList called")
        this.selectedPatternDb.onclick = function () { }
        this.selectedPatternDb.innerHTML = ""
        MfGlobals.mfResourcesLoader.loadPatterns(MfGlobals.urlpatterns, () => {
            this.onPatternsLoaded()
            complete?.()
        })
    }

    onPatternsLoaded = () => {
        console.log("main:onPatternsLoaded :")
        console.log(MfGlobals.patterns)
        const smurfPatternNum = MfGlobals.patterns.findIndex((pattern) => pattern?.name?.toUpperCase?.() === "SLROCK")
        if (smurfPatternNum >= 0) {
            MfGlobals.mfCmd.setPatternName(MfGlobals.patterns[smurfPatternNum], "SLROCK")
            MfGlobals.mfCmd.setSelectedPatternNum(smurfPatternNum)
            document.getElementById("loading-box").style.display = 'none'
            document.getElementById("showPattern").style.display = 'block'
            //document.getElementById("toolbar").style.display = 'flex'

        } else if (MfGlobals.patterns.length > 0) {
            MfGlobals.mfCmd.setSelectedPatternNum(0)
        }

        const selectedPattern = MfGlobals.patterns[MfGlobals.selectedPatternNum]
        MfGlobals.patternsDropBox = this.mfDropBoxPatterns.addDropbox("Pat", MfGlobals.patterns, selectedPattern, "patternDropBoxId", this.selectedPatternDb, this.onClickOnPattern)
        MfGlobals.patternsDropBox.fillDropBox(MfGlobals.patterns, selectedPattern, "Ptn")
        MfGlobals.mfUpdates.onPatternChange()
        // requestAnimFrame(draw)
    }

   // scheduleInitialPatternLoad = () => {
        // if (this.initialPatternLoadScheduled) {
        //     return
        // }
        // this.initialPatternLoadScheduled = true
        // window.setTimeout(() => {
        //     this.loadPatternList(this.loadAllDrumkits)
        // }, 2000)
   // }

   // scheduleInitialKitLoad = () => {
        // if (this.initialKitLoadScheduled) {
        //     return
        // }
        // this.initialKitLoadScheduled = true
        // window.setTimeout(() => {
        //     this.ensureDrumkitListLoaded(this.scheduleInitialPatternLoad)
        // }, 2000)
   // }

    scheduleInitialKitLoad = () => {
        if (this.initialKitLoadScheduled) {
            return
        }
        this.initialKitLoadScheduled = true
        
        // Load drumkit list first
        this.loadDrumkitList(() => {
            // Then load all drumkits samples
            this.loadAllDrumkits()
        })
        
        // Load patterns
        this.loadPatternList()
    }

    ensureDrumkitListLoaded = (complete = null) => {
        if (this.isDrumkitListLoaded) {
            complete?.()
            return
        }
        this.loadDrumkitList(complete)
    }

    loadAllDrumkits = () => {
        const drumkits = [...MfGlobals.drumkitList]
        const loadNextDrumkit = (indexDrumkit) => {
            if (indexDrumkit >= drumkits.length) {
                console.log("main:loadAllDrumkits complete")
                this.selectLoadedDrumkit("punchy")
                return
            }

            const drumkit = drumkits[indexDrumkit]
            if (MfGlobals.mfCmd.kitIsLoaded(drumkit)) {
                loadNextDrumkit(indexDrumkit + 1)
                return
            }

            console.log("main:loadAllDrumkits loading", drumkit.name)
            MfGlobals.mfResourcesLoader.loadSamplesFromDrumkit(drumkit, () => {
                loadNextDrumkit(indexDrumkit + 1)
            })
        }

        loadNextDrumkit(0)
    }

    selectLoadedDrumkit = (drumkitName) => {
        const drumkitNum = MfGlobals.drumkitList.findIndex((drumkit) => drumkit?.name?.toLowerCase?.() === drumkitName.toLowerCase())
        if (drumkitNum < 0) {
            return
        }

        MfGlobals.mfCmd.setSelectedDrumkitNum(drumkitNum)
        MfGlobals.mfUpdates.onDrumkitChange(drumkitNum)
        MfGlobals.mfUpdates.onPatternChange()
    }

    createSkelMixerIhm = (mainDiv) => {
        let mixerDiv = Utils.createMfElement("div", "showMixerCtrl", "line-controls-d", mainDiv)
        let waveformSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg")
        waveformSvg.id = "waveformSvg"
        waveformSvg.style.backgroundColor = "#000"

        waveformSvg.style.borderRadius = "6px"
        waveformSvg.style.width = "100%"
        mixerDiv.appendChild(waveformSvg)
        let mixerCtrlDiv = Utils.createMfElement("div", "mixerCtrl", null, mixerDiv)
    }

    createskelLinecontrols = (mainDiv) => {
        let lineControlsDiv = Utils.createMfElement("div", "lineControls", "line-controls", mainDiv)
        let showTrackCtrlDiv = Utils.createMfElement("div", "showTrackCtrl", "box-h sliders-block-e", lineControlsDiv)
        let showLfoCtrlDiv = Utils.createMfElement("div", "showLfoCtrl", "box-h sliders-block-e", lineControlsDiv)
        let showFxCtrlDiv = Utils.createMfElement("div", "showFxCtrl", "box-h sliders-block-e", lineControlsDiv)
        let showNoteCtrlDiv = Utils.createMfElement("div", "showNoteCtrl", "box-h sliders-block-e", lineControlsDiv)
        let downloadDiv = Utils.createMfElement("div", "download", "line-controls", mainDiv)
        let statusDiv = Utils.createMfElement("div", "statusBar", "line-controls", mainDiv)
        let loadingBoxDiv = Utils.createMfElement("div", "loading-box",  "loading-box", mainDiv)
        loadingBoxDiv.innerHTML = ""
        let resourcesProgressDiv = Utils.createMfElement("div", "resourcesProgress", "resourcesProgress", loadingBoxDiv)
        let resourcesProgressBar = Utils.createMfElement("progress", "resourcesProgressBar", "resourcesProgressBar", resourcesProgressDiv)
    }

    createSkelMainIhmPatternView = (mainDiv) => {
        const patternViewDiv = Utils.createMfElement("div", "showPattern", "line-controls", mainDiv)
        //patternViewDiv.style.display = "none";

        const slidersBlockDiv = Utils.createMfElement("div", "slidersBlock", "sliders-block", patternViewDiv)
        const stepProgressionDiv = Utils.createMfElement("div", "stepProgression", null, slidersBlockDiv)
        let stepProgressionPadDiv = Utils.createMfElement("div", "stepProgressionPad", null, stepProgressionDiv)
        const stepProgressionRuleDiv = Utils.createMfElement("div", "stepProgressionRule", null, stepProgressionDiv)
        let stepProgressionMarkDiv = Utils.createMfElement("div", "stepProgressionMark", null, stepProgressionRuleDiv)
        this.createSkelTrackIhm(slidersBlockDiv, 0, "KICK")
        this.createSkelTrackIhm(slidersBlockDiv, 1, "SNARE")
        this.createSkelTrackIhm(slidersBlockDiv, 2, "TOM")
        this.createSkelTrackIhm(slidersBlockDiv, 3, "CLAP")
        this.createSkelTrackIhm(slidersBlockDiv, 4, "COWBELL")
        this.createSkelTrackIhm(slidersBlockDiv, 5, "CHH")
        this.createSkelTrackIhm(slidersBlockDiv, 6, "OHH")
        this.createSkelTrackIhm(slidersBlockDiv, 7, "CRASH")
        this.createSkelTrackIhm(slidersBlockDiv, 8, "BASS")
        this.createSkelTrackIhm(slidersBlockDiv, 9, "SNR2")

    }

    createSkelTrackIhm = (slidersBlockDiv, trkNum, trkName) => {
        let trackDisplDiv = Utils.createMfElement("div", "trackDispl_" + trkNum, "trackDispl", slidersBlockDiv)
        let trackBtnDiv = Utils.createMfElement("div", "trackBtn_" + trkNum, "trackBtn", trackDisplDiv)
        //trackBtnDiv.style.backgroundColor = "#555"
        let trackLedSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg")
        trackLedSvg.setAttribute("version", "1.1")
        trackLedSvg.setAttribute("xmlns", "http://www.w3.org/2000/svg")
        trackLedSvg.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink")
        trackLedSvg.setAttribute("width", "8px")
        trackLedSvg.setAttribute("height", "14px")
        trackLedSvg.setAttribute("padding", "0px")
        trackLedSvg.setAttribute("viewBox", "0 0 100 100")
        trackBtnDiv.appendChild(trackLedSvg)
        let trackLedCircle = document.createElementNS("http://www.w3.org/2000/svg", "circle")
        trackLedCircle.id = "trackLed_"+trkNum
        trackLedCircle.setAttribute("cx", "50")
        trackLedCircle.setAttribute("cy", "50")
        trackLedCircle.setAttribute("r", "1")
        trackLedCircle.setAttribute("fill", "lightblue")
        trackLedSvg.appendChild(trackLedCircle)
        let trackNameDiv = Utils.createMfElement("div", "trackName_" + trkNum, null, trackBtnDiv)
        trackNameDiv.innerText = trkName
        let trackNbBarsDiv = Utils.createMfElement("div", "trackNbBars_" + trkNum, "trackNbBars", trackDisplDiv)
        trackNbBarsDiv.innerText = "4"
        let trackLoopPointDiv = Utils.createMfElement("div", "trackLoopPoint_" + trkNum, "trackLoopPoint", trackDisplDiv)
        trackLoopPointDiv.innerText = "4"
        let trackMuteBtnOffDiv = Utils.createMfElement("div", "trackMuteBtnOff_" + trkNum, "trackMuteBtnOff", trackDisplDiv)
        let trackAutoBtnOffDiv = Utils.createMfElement("div", "trackAutoBtnOff_" + trkNum, "trackAutoBtnOff", trackDisplDiv)
        let notesListDiv = Utils.createMfElement("div", "noteList_" + trkNum, "notesList", trackDisplDiv)
    }
}
