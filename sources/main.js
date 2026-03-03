import MfSeq from './mfseq.js'
import MfSerialize from './ctrl/mfserialize.js'
import MfAutoGenerate from './ctrl/mfautogenerate.js'
import MfPatterns from './ctrl/mfpatterns.js'
import MfUpdates from './ihm/mfupdates.js'
import WaveVisu from './ihm/wavevisu.js'
import MfSkelHtml from './ihm/mfskelhtml.js'
import MfResourcesLoader from './load/mfresourcesloader.js'
import MfComponents from './ihm/mfcomponents.js'
import MfSliderBox from './ihm/mfsliderbox.js'
import MfCss from './mfcss.js'
import Utils from './utils.js'


MfGlobals.audioCtx = null
MfGlobals.mfResourcesLoader = new MfResourcesLoader()
MfGlobals.mfSeq = new MfSeq()
MfGlobals.mfAutoGenerate = new MfAutoGenerate()
MfGlobals.mfUpdates = new MfUpdates()
MfGlobals.mfPatterns = new MfPatterns()
MfGlobals.mfSkelHtml = new MfSkelHtml()
MfGlobals.mfComponents = new MfComponents()
MfGlobals.mfSliderBox = new MfSliderBox()

MfGlobals.textInput = false
MfGlobals.autoMode = false
let waveVisu = new WaveVisu()

var mfAudioRec = null
let lastStepDrawn = 0


function startApp() {
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
    //MfGlobals.mfUpdates.mfCmd.addPattern("default")

    if (MfGlobals.audioCtx == null) {
        MfGlobals.audioCtx = new AudioContext()
    }
    MfGlobals.mfUpdates.mfCmd.setSelectedPatternNum(0)
    //MfGlobals.mfUpdates.onPatternChange(0)
    MfGlobals.mfUpdates.updatePatternView(MfGlobals.patterns[0], MfGlobals.displayBars)
    requestAnimFrame(draw)

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
    let w = document.getElementById('stepProgression').getBoundingClientRect().width - 128 //stepProgressionPad.width
    //    let stepNb = (pattern.nbBars * MfGlobals.TICK)
    let stepNb = (4 * MfGlobals.TICK)
    let coef = w / stepNb
    let width = Math.floor(w / stepNb)
    if (lastStepDrawn != (MfGlobals.mfSeq.tick - 1)) {
        lastStepDrawn = (MfGlobals.mfSeq.tick - 1) % (stepNb)
        document.getElementById('stepProgressionMark').style.marginLeft = Math.floor((lastStepDrawn) * coef) + 'px'
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

function keyPressed(name, code) {
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
        let mfSerialize = new MfSerialize()
        mfSerialize.serializePatterns()
    }
    if (code == 'KeyA') {
        if (MfGlobals.autoMode === false) {
            MfGlobals.autoMode = true
        } else {
            MfGlobals.autoMode = false
        }
    }
    if (code == 'KeyB') {
        MfGlobals.mfAutoGenerate.generatePattern()
    }
    if (code == 'KeyS') {
        console.log(JSON.stringify(MfGlobals.patterns))
        console.log(JSON.stringify(MfGlobals.generatedSounds))
    }
    if (code == 'KeyD') {
        //document.getElementById("resourcesProgress").style.display = 'block'
        //MfGlobals.mfLoader.loadExtendedDrumkits()
        const keys = Object.keys(MfGlobals.drumkits)
        //MfGlobals.selectedDrumkit = MfGlobals.drumkits[keys[keys.length * Math.random() << 0]].name
        MfGlobals.mfUpdates.onDrumkitChange()
    }
    if (code == 'KeyF') {
        const num = Math.floor(Math.random() * MfGlobals.patterns.length)
        MfGlobals.mfUpdates.mfCmd.setSelectedPatternNum(num)
        MfGlobals.mfUpdates.onPatternChange()
    }

    if (code == 'KeyG') {
        const selPat = MfGlobals.patterns[MfGlobals.selectedPatternNum]
        Object.values(selPat.tracks).forEach((track, indexTrack) => {
            track.soundNum = Math.floor(Math.random() * MfGlobals.sounds.length)
            track.autoSound = false
        })
        MfGlobals.mfUpdates.onPatternChange()
        MfGlobals.mfUpdates.onDrumkitChange()
    }

    if (code == 'KeyH') {
        MfGlobals.mfUpdates.mfCmd.addPattern()
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
        Utils.collapseSliders()
        Utils.collapseDropBoxs()

    }
}
//

startApp()