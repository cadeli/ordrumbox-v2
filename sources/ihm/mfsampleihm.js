import Utils from '../utils.js'
import MfResourcesLoader from '../load/mfresourcesloader.js'

export default class MfSampleIhm {
    static TAG = "MFSAMPLEIHM"

    constructor() {
        this.oldSoundNum = 0

    }

    displayModalDialogPickSound = () => {
        if (Object.keys(MfGlobals.sounds).length == 0) {//in case of ressource where not load 
             MfGlobals.mfResourcesLoader.loadSamplesFromDrumkit(  MfGlobals.drumkitList[0])
        } else {
            let selPat = MfGlobals.patterns[MfGlobals.selectedPatternNum]
            let selTrack = selPat.tracks[MfGlobals.selectedTrackNum]
            if (!selTrack) { return } // should not happen 
            this.oldSoundNum = selTrack.soundNum

            document.getElementById("warn-modal").style.display = "block"
            document.getElementById("modal-title-text").innerText = "Pick Sound for track:" + selTrack.name + " of pattern: " + selPat.name

            let modalContentDiv = document.getElementById('modal-message')
            Utils.clearInnerDom(modalContentDiv)
            this.createLayout(modalContentDiv, selPat, selTrack)
        }
    }

    onAllResourceLoad = () => {
        console.log("mfSampleIhm::onAllResourceLoad :")
        this.displayModalDialogPickSound()
    }

    createLayout = (modalContentDiv, selPat, selTrack) => {
        let box = document.createElement('div')
        box.classList.add("box-h")

        let mainDiv = document.createElement('div')
        mainDiv.className = "line-controls"
        if (selTrack.soundNum >= MfGlobals.sounds.length) {
            MfGlobals.mfUpdates.mfCmd.autoAssignSounds(MfGlobals.patterns[MfGlobals.selectedPatternNum])
            if (selTrack.soundNum >= MfGlobals.sounds.length) {
                selTrack.soundNum = 0
            }
        }
        
        this.createSoundTypeList(mainDiv, selPat, selTrack, MfGlobals.sounds[selTrack.soundNum].key)
        let box1 = document.createElement('div')
        box1.classList.add("sliders-block-e")
        box1.classList.add("box-h")
        mainDiv.appendChild(box1)
        this.createVisuWave(selPat, selTrack, box1)
        this.createHeaderButtonBar(box1)

        let bottomDiv = document.createElement('div')
        bottomDiv.className = "line-controls"
        this.createBottomButtonBar(bottomDiv, selPat, selTrack)

        box.appendChild(mainDiv)
        box.appendChild(bottomDiv)
        modalContentDiv.appendChild(box)
    }

    createVisuWave = (selPat, selTrack, mainDiv) => {
        let visuWave = document.createElement('div')
        visuWave.className = "sliders-block-e"
        let canvas = document.createElement('canvas')
        canvas.id = "visualWaveCanvas"
        visuWave.appendChild(canvas)
        mainDiv.appendChild(visuWave)
        this.displayWave(selPat, selTrack, canvas)

    }

    createSoundTypeList = (mainDiv, selPat, selTrack) => {
        let box1 = document.createElement('div')
        box1.classList.add("sliders-block-e")
        box1.classList.add("box-h")

        let box2 = document.createElement('div')
        box2.classList.add("sliders-block-e")
        box2.classList.add("box-h")

        let soundTypeListDiv = document.createElement('div')
        soundTypeListDiv.id = "soundTypeListDiv"
        soundTypeListDiv.className = "box-h"

        let sampleListDiv = document.createElement("div")
        sampleListDiv.id = "sampleList"
        sampleListDiv.className = "box-h"

        box1.appendChild(soundTypeListDiv)
        box2.appendChild(sampleListDiv)
        mainDiv.appendChild(box1)
        mainDiv.appendChild(box2)

        let selectedSoundType = MfGlobals.sounds[selTrack.soundNum].key
        this.fillSoundTypeList(selPat, selTrack, selectedSoundType, soundTypeListDiv, sampleListDiv)
    }

    createHeaderButtonBar = (mainDiv) => {
        const imporWavBtn = document.createElement('input')
        imporWavBtn.type = "file"
        imporWavBtn.id = "importWave"
        imporWavBtn.addEventListener('change', this.onWaveFileSelected)

        const labelImportWave = document.createElement('label')
        labelImportWave.for = "importWave"
        labelImportWave.className = "mf-button"
        labelImportWave.innerHTML = "Import Audio"
        labelImportWave.onclick = function (ev) {
            imporWavBtn.click(ev)
        }
        let box = document.createElement('div')
        box.className = "box-v"
        box.appendChild(labelImportWave)
        mainDiv.appendChild(box)
    }

    createBottomButtonBar = (mainDiv, selPat, selTrack) => {
        let btnCancel = document.createElement('label')
        btnCancel.className = "mf-button"
        btnCancel.innerHTML = "Cancel"
        btnCancel.onclick = function () {
            const soundNum = this.oldSoundNum
            MfGlobals.mfUpdates.mfCmd.changeTrackSound(selTrack, soundNum)
            MfGlobals.mfPatterns.computeFlatNotesFromPattern(selPat)
            MfGlobals.mfUpdates.updateTrackCtrl(MfGlobals.selectedTrackNum)
            MfGlobals.mfUpdates.updatePatternView(selPat, MfGlobals.displayBars)
            document.getElementById("warn-modal").style.display = "none"
        }

        let btnOk = document.createElement('label')
        btnOk.className = "mf-button"
        btnOk.innerHTML = "OK"
        btnOk.onclick = function () {
            document.getElementById("warn-modal").style.display = "none"
        }

        let box2 = document.createElement('div')
        box2.className = "box-v"
        box2.appendChild(btnCancel)
        box2.appendChild(btnOk)
        mainDiv.appendChild(box2)
    }

    fillSoundTypeList = (selPat, selTrack, selectedSoundType, soundTypeListDiv, sampleListDiv) => {
        console.log("mfSampleIhm::fillSoundTypeList:: for track:" + selTrack.name)
        const soundTypes = Utils.sortObj(MfGlobals.mfUpdates.mfCmd.getAllSoundsByTypes())
        Utils.clearInnerDom(soundTypeListDiv)
        if (selTrack.soundNum >= MfGlobals.sounds.length) { selTrack.soundNum = 0 }// TODO should autoassign sounds
        for (const [soundKey, sounds] of Object.entries(soundTypes)) {
            let opt = document.createElement('div')
            opt.className = "mf-button"
            if (selectedSoundType === soundKey) {
                opt.classList.add("selected-button")
                this.fillSampleList(selPat, selTrack, sounds, sampleListDiv)
            }
            opt.innerHTML = soundKey
            const _this = this
            soundTypeListDiv.appendChild(opt)
            opt.onclick = function () {
                console.log("mfSampleIhm::fillSoundTypeList:: click on sound type:" + soundKey)
                _this.fillSoundTypeList(selPat, selTrack, soundKey, soundTypeListDiv, sampleListDiv)
                opt.classList.add("selected-button")
            }
        }
    }


    fillSampleList = (selPat, selTrack, sounds, sampleListDiv) => {
        console.log("mfSampleIhm::fillSampleList:: for sound key:" + MfGlobals.sounds[selTrack.soundNum].key)
        if (!sampleListDiv) return
        Utils.clearInnerDom(sampleListDiv)
        const self = this
        for (let i = 0; i < sounds.length; i++) {
            let opt = document.createElement('div');
            opt.className = "mf-button"
            if (sounds[i].index === selTrack.soundNum) {
                opt.classList.add("selected-button")
            }
            opt.innerHTML = sounds[i].url
            //console.log("mfSampleIhm::fillSampleList:: add sound url:" + sounds[i].url)
            opt.onclick = function () {
                console.log("mfSampleIhm::fillSampleList:: click on sound url:" + sounds[i].url)
                const soundNum = MfGlobals.mfUpdates.mfCmd.getSoundNumFromUrl(sounds[i].url)
                MfGlobals.mfUpdates.mfCmd.changeTrackSound(selTrack, soundNum)
                MfGlobals.mfPatterns.computeFlatNotesFromPattern(selPat)
                MfGlobals.mfUpdates.updateTrackCtrl(MfGlobals.selectedTrackNum)
                MfGlobals.mfUpdates.updatePatternView(selPat, MfGlobals.displayBars)
                const canvas = document.getElementById("visualWaveCanvas")
                self.displayWave(selPat, selTrack, canvas)
                self.fillSampleList(selPat, selTrack, sounds, sampleListDiv)
                // document.getElementById("warn-modal").style.display = "none"
            }
            sampleListDiv.appendChild(opt)
        }
    }

    displayWave = (selPat, selTrack, canvas) => {
        const leftBuffer = MfGlobals.sounds[selTrack.soundNum].buffer.getChannelData(0) //mono  
        //if (!canvas) return
        let ctx = canvas.getContext('2d')
        ctx.fillStyle = '#000'
        ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height)
        ctx.fillStyle = '#0f0'
        ctx.fillRect(0, ctx.canvas.height / 2 - 1, ctx.canvas.width, 2)
        //ctx.fillStyle = '#f00'
        for (let i = 0; i < ctx.canvas.width; i++) {
            const nbFrame = leftBuffer.length
            if (leftBuffer[i] >= -1 && leftBuffer[i] <= 1) {
                const h = leftBuffer[Math.floor(i * nbFrame / ctx.canvas.width)] * ctx.canvas.height
                ctx.fillRect(i, ctx.canvas.height / 2, 1, h)
            }
        }
    }

    onWaveFileSelected = (ev) => {
        let fr = new FileReader();
        fr.readAsText(ev.target.files[0])
        console.log("onWaveFileSelected:: file pick=" + ev.target.files[0].name)
        let fileName = ev.target.files[0].name
        let audioFile = fetch(URL.createObjectURL(ev.target.files[0]))
            .then(response => response.arrayBuffer())
            .then(buffer => MfGlobals.audioCtx.decodeAudioData(buffer))
            .then(buffer => {
                let selPat = MfGlobals.patterns[MfGlobals.selectedPatternNum]
                let selTrack = selPat.tracks[MfGlobals.selectedTrackNum]
                MfGlobals.sounds[selTrack.soundNum].buffer = buffer
                MfGlobals.sounds[selTrack.soundNum].display_name = fileName
                MfGlobals.sounds[selTrack.soundNum].url = MfGlobals.sounds[selTrack.soundNum].kit_name+"/" + fileName
               // MfGlobals.sounds[selTrack.soundNum].kit_name = "import"
                this.displayModalDialogPickSound()
            });
//DEBUG----start
            let selPat = MfGlobals.patterns[MfGlobals.selectedPatternNum]
            let selTrack = selPat.tracks[MfGlobals.selectedTrackNum]
            let debugtxt = ""
            for (let i = 0; i < MfGlobals.sounds.length; i++) {
                let sound = MfGlobals.sounds[i]
                if (sound) {
                    if (sound.kit_name === MfGlobals.drumkitList[MfGlobals.selectedDrumkitNum].name) {
                        debugtxt += sound.key + ","
                    }
                }
            }
            console.log("mfSampleIhm::onWaveFileSelected " + selTrack.name + " <" + MfGlobals.drumkitList[MfGlobals.selectedDrumkitNum].name + " : " + debugtxt + "> ")
//DEBUG----end

        }


    }