

import { MfGlobals } from './mfglobals.js'

import MfSeq from './mfseq.js'
import MfCmd from './ctrl/mfcmd.js'
import MfPatterns from './ctrl/mfpatterns.js'
import MfUpdates from './ihm/mfupdates.js'
import MfSkelHtml from './ihm/mfskelhtml.js'
import MfResourcesLoader from './load/mfresourcesloader.js'
import MfComponents from './ihm/mfcomponents.js'
import MfSliderBox from './ihm/mfsliderbox.js'
import MfRotativeBtn from './ihm/mfrotativebtn.js'
import MfSliderBtn from './ihm/mfsliderbtn.js'


import MfCss from './mfcss.js'
import Utils from './utils.js'

MfGlobals.audioCtx = null
MfGlobals.mfCmd = new MfCmd()
MfGlobals.mfResourcesLoader = new MfResourcesLoader()
MfGlobals.mfSeq = new MfSeq()
MfGlobals.mfAutoGenerate = null
MfGlobals.mfUpdates = new MfUpdates()
MfGlobals.mfPatterns = new MfPatterns()
MfGlobals.mfSkelHtml = new MfSkelHtml()
MfGlobals.mfComponents = new MfComponents()
MfGlobals.mfSliderBox = new MfSliderBox()
MfGlobals.mfRotativeBtn = new MfRotativeBtn()
MfGlobals.mfSliderBtn = new MfSliderBtn()
MfGlobals.mfAutoAssign = null
MfGlobals.midiManager = null



MfGlobals.textInput = false
MfGlobals.autoMode = false
let waveVisu = null
let waveVisuPromise = null

let lastStepDrawn = 0

MfGlobals.getAutoGenerate = async () => {
    if (!MfGlobals.mfAutoGenerate) {
        const { default: MfAutoGenerate } = await import('./ctrl/mfautogenerate.js')
        MfGlobals.mfAutoGenerate = new MfAutoGenerate()
    }
    return MfGlobals.mfAutoGenerate
}

MfGlobals.getAutoAssign = async () => {
    if (!MfGlobals.mfAutoAssign) {
        const { default: MfAutoAssign } = await import('./ctrl/mfautoassign.js')
        MfGlobals.mfAutoAssign = new MfAutoAssign()
    }
    return MfGlobals.mfAutoAssign
}

MfGlobals.getMidiManager = async () => {
    if (!MfGlobals.midiManager) {
        const { default: MfMidi } = await import('./ctrl/mfmidi.js')
        MfGlobals.midiManager = new MfMidi()
    }
    return MfGlobals.midiManager
}

async function getWaveVisu() {
    if (waveVisu) {
        return waveVisu
    }
    if (!waveVisuPromise) {
        waveVisuPromise = import('./ihm/wavevisu.js').then(({ default: WaveVisu }) => {
            waveVisu = new WaveVisu()
            return waveVisu
        })
    }
    return waveVisuPromise
}

function scheduleAfterFirstPaint(callback) {
    requestAnimationFrame(() => {
        const scheduleIdle = window.requestIdleCallback ?? ((idleCallback) => window.setTimeout(idleCallback, 0))
        scheduleIdle(callback, { timeout: 500 })
    })
}


export function init() {
    if (window.orientation > 1) {
        let de = document.documentElement;
        if (de.requestFullscreen) {
            de.requestFullscreen();
        } else if (de.mozRequestFullScreen) {
            de.mozRequestFullScreen();
        } else if (de.webkitRequestFullscreen) {
            de.webkitRequestFullscreen();
        } else if (de.msRequestFullscreen) {
            de.msRequestFullscreen();
        }
        screen.orientation.lock("landscape-primary");
    }

    const mfCss = new MfCss();
    mfCss.inject();

    MfGlobals.mfSkelHtml.createSkelMainIhm()
   MfGlobals.mfSkelHtml.scheduleInitialKitLoad()

    scheduleAfterFirstPaint(() => {
        MfGlobals.mfCmd.setSelectedPatternNum(0)
        MfGlobals.mfUpdates.updatePatternView(MfGlobals.patterns[0], MfGlobals.displayBars)
    })
    requestAnimFrame(draw)
    //console.warn("Actual Mode  :", import.meta.env.MODE);
}

window.requestAnimFrame = (function () {
    return window.requestAnimationFrame ||
        window.webkitRequestAnimationFrame ||
        window.mozRequestAnimationFrame ||
        window.oRequestAnimationFrame ||
        window.msRequestAnimationFrame ||
        function (callback) {
            window.setTimeout(callback, 1000 / 60);
        };
})();

function draw() {
    if (MfGlobals.mfSeq.isRunning === true) {
        if (!waveVisu) {
            getWaveVisu()
            requestAnimFrame(draw)
            return
        }
        if (document.getElementById('stepProgressionMark')) {
            if (document.getElementById('stepProgression')) {
                displayStepMark(MfGlobals.patterns[MfGlobals.selectedPatternNum])
            }
        }
        waveVisu.displaySpectrum()
        waveVisu.displayLeds()
        if (document.getElementById('showMixerCtrl').style.display != 'none') {
            waveVisu.drawWaveform()
        }
        if (document.getElementById('visu-modal').style.display != 'none') {
            waveVisu.drawWaveformAlt()
        }
    }
    requestAnimFrame(draw)
}

function displayStepMark(pattern) {
    const stepRule = document.getElementById('stepProgressionRule')
    const stepMark = document.getElementById('stepProgressionMark')
    if (!stepRule || !stepMark) {
        return
    }

    const ruleWidth = stepRule.getBoundingClientRect().width
    const markWidth = stepMark.getBoundingClientRect().width || 8
    const availableWidth = Math.max(0, ruleWidth - markWidth)
    let stepNb = (4 * MfGlobals.TICK)
    const coef = stepNb > 1 ? availableWidth / (stepNb - 1) : 0
    if (lastStepDrawn != (MfGlobals.mfSeq.tick - 1)) {
        lastStepDrawn = (MfGlobals.mfSeq.tick - 1) % (stepNb)
        const x = Math.max(0, Math.min(availableWidth, Math.floor(lastStepDrawn * coef)))
        stepMark.style.left = x + 'px'
    }
}

window.onkeydown = function (e) { //prevent page to scoll down on space bar
    return e.keyCode !== 32;
}

document.addEventListener('keydown', (event) => {
    let name = event.key;
    let code = event.code;
    if (MfGlobals.textInput === false) { //TODO
        keyPressed(name, code);
    }
}, false);

async function keyPressed(name, code) {
    console.log("key pressed " + name + " = " + code)
    let selPat = MfGlobals.patterns[MfGlobals.selectedPatternNum]
    if (code == 'Digit1') {
        MfGlobals.mfUpdates.trackToggleMute(selPat.tracks[0])
    }
    if (code == 'Digit2') {
        MfGlobals.mfUpdates.trackToggleMute(selPat.tracks[1])
    }
    if (code == 'Digit3') {
        MfGlobals.mfUpdates.trackToggleMute(selPat.tracks[2])
    }
    if (code == 'Digit4') {
        MfGlobals.mfUpdates.trackToggleMute(selPat.tracks[3])
    }
    if (code == 'Digit5') {
        MfGlobals.mfUpdates.trackToggleMute(selPat.tracks[4])
    }
    if (code == 'Digit6') {
        MfGlobals.mfUpdates.trackToggleMute(selPat.tracks[5])
    }
    if (code == 'Digit7') {
        MfGlobals.mfUpdates.trackToggleMute(selPat.tracks[6])
    }
    if (code == 'Digit8') {
        MfGlobals.mfUpdates.trackToggleMute(selPat.tracks[7])
    }
    if (code == 'Digit9') {
        MfGlobals.mfUpdates.trackToggleMute(selPat.tracks[8])
    }


    if (code == 'KeyQ') {
        MfGlobals.mfSeq.simpleBeep(0)
    }
    if (code == 'KeyW') {
        MfGlobals.mfSeq.simpleBeep(1)
    }
    if (code == 'KeyE') {
        MfGlobals.mfSeq.simpleBeep(2)
    }
    if (code == 'KeyR') {
        MfGlobals.mfSeq.simpleBeep(3)
    }
    if (code == 'KeyT') {
        MfGlobals.mfSeq.simpleBeep(4)
    }
    if (code == 'KeyY') {
        MfGlobals.mfSeq.simpleBeep(5)
    }
    if (code == 'KeyU') {
        MfGlobals.mfSeq.simpleBeep(6)
    }
    if (code == 'KeyI') {
        MfGlobals.mfSeq.simpleBeep(7)
    }
    if (code == 'KeyO') {
        //document.getElementById("resourcesProgress").style.display = 'block'
        //MfGlobals.mfLoader.loadExtendedDrumkits()
    }
    if (code == 'KeyP') {
        const { default: MfSerialize } = await import('./ctrl/mfserialize.js')
        let mfSerialize = new MfSerialize()
        mfSerialize.serializePatterns()
    }
    if (code == 'KeyA') {
        MfGlobals.mfUpdates.togglePatternAutoMode()
    }
    if (code == 'KeyB') {
        const mfAutoGenerate = await MfGlobals.getAutoGenerate()
        await mfAutoGenerate.generatePattern()
    }
    if (code == 'KeyS') {
        console.log(JSON.stringify(MfGlobals.patterns))
        console.log(JSON.stringify(MfGlobals.generatedSounds))
    }
    if (code == 'KeyD') {
        //document.getElementById("resourcesProgress").style.display = 'block'
        //MfGlobals.mfLoader.loadExtendedDrumkits()
        //const keys = Object.keys(MfGlobals.drumkits)
        //MfGlobals.selectedDrumkit = MfGlobals.drumkits[keys[keys.length * Math.random() << 0]].name
       // MfGlobals.mfUpdates.onDrumkitChange(MfGlobals.selectedDrumkitNum)
    }
    if (code == 'KeyF') {
        const num = Math.floor(Math.random() * MfGlobals.patterns.length)
        MfGlobals.mfCmd.setSelectedPatternNum(num)
        MfGlobals.mfUpdates.onPatternChange()
    }

    if (code == 'KeyG') {
        const selPat = MfGlobals.patterns[MfGlobals.selectedPatternNum]
        MfGlobals.mfUpdates.onDrumkitChange(MfGlobals.selectedDrumkitNum)
    }

    if (code == 'KeyH') {
        MfGlobals.mfCmd.addPattern()
    }

    if (code == 'KeyV') {
        const div = document.getElementById("visu-modal")
        if (div.style.display != "flex") {
            div.style.display = "flex"
        } else {
            div.style.display = "none"
        }
    }

    if (code == 'Space') {
        MfGlobals.mfSeq.toggleStartStop()

    }
    if (code == 'Escape') {
        document.getElementById("warn-modal").style.display = "none"
        //Utils.collapseSliders()
        Utils.collapseDropBoxs()

    }
}
//

//startApp()
