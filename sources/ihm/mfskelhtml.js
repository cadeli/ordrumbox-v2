import MfComponents from './mfcomponents.js'

import Utils from '../utils.js'
import MfDropBox from './mfdropbox.js'
import MfSliderBox from './mfsliderbox.js'


export default class MfSkelHtml {
    constructor() {
        this.mfDropBoxDrumkits = new MfDropBox("kit")
        this.mfDropBoxPatterns = new MfDropBox("pat")
    }

    createSkelMainIhm = () => {
        let destDiv = document.getElementById("insert-ordrumbox-v2-here")
        if (destDiv) {
            Utils.clearInnerDom(destDiv)
        } else {
            destDiv = document.body
        }
        let mainDiv = Utils.createMfElement("div", "ordrumbox-v2", "main-ihm", destDiv)
        mainDiv.onclick = function (event) {
            Utils.collapseSliders()
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
        MfGlobals.mfUpdates.mfCmd.setSelectedPatternNum(indexPattern)
        MfGlobals.mfUpdates.onPatternChange(indexPattern)
    }

    onClickOnDrumkit = (indexDrumkit) => {
        MfGlobals.mfUpdates.mfCmd.setSelectedDrumkitNum(indexDrumkit)
        MfGlobals.mfUpdates.onDrumkitChange(indexDrumkit)
    }

    createSkelToolbarIhm = (mainDiv) => {
        let toolbarDiv = Utils.createMfElement("div", "toolbar", "line-controls", mainDiv)

        let playstopBtn = Utils.createMfElement("div", "playstop", "mf-tb-button", toolbarDiv)
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
                MfGlobals.mfSeq.setBpm(eval(event.target.value))
            },
            null,
            50, 250, 1, bpmBoxDiv
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

        let patternAutoModeDiv = Utils.createMfElement("div", "patternAutoMode", "twostates mf-tb-button", toolbarDiv)
        patternAutoModeDiv.innerText = "auto"
        patternAutoModeDiv.onclick = function () {
            MfGlobals.mfUpdates.togglePatternAutoMode()
        }

        let cleanPatternBtn = Utils.createMfElement("div", "cleanPattern", "mf-tb-button", toolbarDiv)
        cleanPatternBtn.innerText = "clear"
        cleanPatternBtn.onclick = function () {
            MfGlobals.mfUpdates.clearPattern()
        }

        let toolsBtn = Utils.createMfElement("div", "tools", "mf-tb-button", toolbarDiv)
        toolsBtn.innerText = "tools"
        toolsBtn.onclick = function () {
            MfGlobals.mfUpdates.createRecordPanel()
        }
    }

    loadDrumkitList = () => {
        this.selectedDrumkitDb.onclick = function () { }
        this.selectedDrumkitDb.innerHTML = ""
        MfGlobals.mfResourcesLoader.loadDrumkitList("./assets/drumkits.json", this.onDrumkitlistLoaded)
    }

    onDrumkitlistLoaded = () => {
        console.log("main:onDrumkitlistLoaded :")
        console.log(MfGlobals.drumkitList)
        MfGlobals.drumkitsDropBox = this.mfDropBoxDrumkits.addDropbox("Kit", MfGlobals.drumkitList, MfGlobals.drumkitList[MfGlobals.selectedDrumkitNum], "drumkitDropBoxId", this.selectedDrumkitDb, this.onClickOnDrumkit)
        MfGlobals.drumkitsDropBox.fillDropBox(MfGlobals.drumkitList, MfGlobals.drumkitList[MfGlobals.selectedDrumkitNum], "Kit")
    }

    loadPatternList = () => {
        this.selectedPatternDb.onclick = function () { }
        this.selectedPatternDb.innerHTML = ""
        MfGlobals.mfResourcesLoader.loadPatterns("./assets/patterns.json", this.onPatternsLoaded)
    }

    onPatternsLoaded = () => {
        console.log("main:onPatternsLoaded :")
        console.log(MfGlobals.patterns)
        MfGlobals.patternsDropBox = this.mfDropBoxPatterns.addDropbox("Pat", MfGlobals.patterns, MfGlobals.patterns[MfGlobals.selectedPatternNum], "patternDropBoxId", this.selectedPatternDb, this.onClickOnPattern)
        MfGlobals.mfUpdates.mfCmd.setSelectedPatternNum(31)
        MfGlobals.patternsDropBox.fillDropBox(MfGlobals.patterns, MfGlobals.patterns[MfGlobals.selectedPatternNum], "Ptn")
        MfGlobals.mfUpdates.updateSelectedPattern()
        // requestAnimFrame(draw)
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
        let showNoteCtrlDiv = Utils.createMfElement("div", "showNoteCtrl", "box-h sliders-block-e", lineControlsDiv)
        let downloadDiv = Utils.createMfElement("div", "download", "line-controls", mainDiv)
        let loadingBoxDiv = Utils.createMfElement("div", "loading-box", null, mainDiv)
        let resourcesProgressDiv = Utils.createMfElement("div", "resourcesProgress", "ordbBtnBig", loadingBoxDiv)
        resourcesProgressDiv.innerHTML = " LOADING<br />"
        let resourcesProgressBar = Utils.createMfElement("progress", "resourcesProgressBar", null, resourcesProgressDiv)
    }

    createSkelMainIhmPatternView = (mainDiv) => {
        let patternViewDiv = Utils.createMfElement("div", "showPattern", "line-controls", mainDiv)
        let slidersBlockDiv = Utils.createMfElement("div", "slidersBlock", "sliders-block", patternViewDiv)
        let stepProgressionDiv = Utils.createMfElement("div", "stepProgression", null, slidersBlockDiv)
        let stepProgressionPadDiv = Utils.createMfElement("div", "stepProgressionPad", null, stepProgressionDiv)
        let stepProgressionRuleDiv = Utils.createMfElement("div", "stepProgressionRule", null, stepProgressionDiv)
        let stepProgressionMarkDiv = Utils.createMfElement("div", "stepProgressionMark", null, stepProgressionRuleDiv)
        this.createskaleTrackIhm(slidersBlockDiv, 0, "KICK")
        this.createskaleTrackIhm(slidersBlockDiv, 1, "SNARE")
        this.createskaleTrackIhm(slidersBlockDiv, 2, "TOM")
        this.createskaleTrackIhm(slidersBlockDiv, 3, "CLAP")
        this.createskaleTrackIhm(slidersBlockDiv, 4, "COW")
        this.createskaleTrackIhm(slidersBlockDiv, 5, "CHH")
        this.createskaleTrackIhm(slidersBlockDiv, 6, "OHH")
        this.createskaleTrackIhm(slidersBlockDiv, 7, "CRASH")
        this.createskaleTrackIhm(slidersBlockDiv, 8, "BASS")
        this.createskaleTrackIhm(slidersBlockDiv, 9, "SNR2")

    }

    createskaleTrackIhm = (slidersBlockDiv, trkNum, trkName) => {
        let trackDisplDiv = Utils.createMfElement("div", "trackDispl_" + trkNum, "trackDispl", slidersBlockDiv)
        let trackBtnDiv = Utils.createMfElement("div", "trackBtn_" + trkNum, "trackBtn", trackDisplDiv)
        trackBtnDiv.style.backgroundColor = "#555"
        let trackLedSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg")
        trackLedSvg.setAttribute("version", "1.1")
        trackLedSvg.setAttribute("xmlns", "http://www.w3.org/2000/svg")
        trackLedSvg.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink")
        trackLedSvg.setAttribute("width", "4px")
        trackLedSvg.setAttribute("height", "14px")
        trackLedSvg.setAttribute("padding", "0px")
        trackLedSvg.setAttribute("viewBox", "0 0 100 100")
        trackBtnDiv.appendChild(trackLedSvg)
        let trackLedCircle = document.createElementNS("http://www.w3.org/2000/svg", "circle")
        trackLedCircle.id = "trackLed_0"
        trackLedCircle.setAttribute("cx", "50")
        trackLedCircle.setAttribute("cy", "200")
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