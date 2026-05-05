import { MfGlobals } from '../mfglobals.js'

import Utils from '../utils.js'
import MfAudioAnalyze from '../snd/mfaudioanalyze.js'
import InstrumentManager from '../ctrl/instrumentsManager.js'

export default class MfSampleIhm {
    static TAG = "MFSAMPLEIHM"

    constructor() {
        this.oldSoundId = "NOT_DEFINED"
        this.audioAnalyze = new MfAudioAnalyze()
        this.isLoadingDrumkitListForPick = false
        this.isLoadingMissingSamplesForPick = false
    }

    displayModalDialogPickSound = async (afterLoad = false) => {
        if (!MfGlobals.mfResourcesLoader.isDrumkitListLoaded) {
            if (this.isLoadingDrumkitListForPick) {
                return
            }
            this.isLoadingDrumkitListForPick = true
            MfGlobals.mfResourcesLoader.loadDrumkitList(MfGlobals.urldrumkits, () => {
                this.isLoadingDrumkitListForPick = false
                this.displayModalDialogPickSound(true)
            }).catch(() => {
                this.isLoadingDrumkitListForPick = false
            })
            return
        }

        const unloadedSamples = MfGlobals.mfResourcesLoader.getUnloadedSamplesFromDrumkits(MfGlobals.drumkitList)
        if (!afterLoad && unloadedSamples.length > 0) {
            if (this.isLoadingMissingSamplesForPick) {
                return
            }
            this.isLoadingMissingSamplesForPick = true
            MfGlobals.mfResourcesLoader.loadMissingSamplesFromDrumkits(MfGlobals.drumkitList, () => {
                this.isLoadingMissingSamplesForPick = false
                this.displayModalDialogPickSound(true)
            })
            return
        }

        let selPat = MfGlobals.patterns[MfGlobals.selectedPatternNum]
        let selTrack = selPat.tracks[MfGlobals.selectedTrackNum]
        if (!selTrack) { return } // should not happen 
        if (!MfGlobals.sounds[selTrack.soundId]) {
            const mfAutoAssign = await MfGlobals.getAutoAssign()
            mfAutoAssign.autoAssignSounds(selPat)
        }
        // Snapshot initial state for explicit restoration on Cancel
        this.oldSoundId = selTrack.soundId
        this.oldTrackName = selTrack.name
        this.modalInitialState = {
            soundId: selTrack.soundId,
            trackName: selTrack.name
        }
        document.getElementById("warn-modal").style.display = "block"
        document.getElementById("modal-title-text").innerText = "Pick Sound for track:" + selTrack.name + " of pattern: " + selPat.name

        let modalContentDiv = document.getElementById('modal-message')
        Utils.recursiveClear(modalContentDiv)
        this.createLayout(modalContentDiv, selPat, selTrack)
    }

    createLayout = (modalContentDiv, selPat, selTrack) => {
        let box = document.createElement('div')
        box.classList.add("box-h")

        let mainDiv = document.createElement('div')
        mainDiv.className = "line-controls"
        
        if (selTrack.soundId === "NOT_DEFINED") {
            selTrack.soundId= Utils.getRandomKey(MfGlobals.sounds)   // TODO
        }
        this.createSoundTypeList(mainDiv, selPat, selTrack, MfGlobals.sounds[selTrack.soundId].key)
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
        visuWave.className = "sliders-block-e box-h"
        let canvas = document.createElement('canvas')
        canvas.id = "visualWaveCanvas"
        visuWave.appendChild(canvas)

        let analysisDiv = document.createElement('div')
        analysisDiv.id = "sampleAnalysis"
        analysisDiv.className = "sample-analysis"
        visuWave.appendChild(analysisDiv)

        let previewBtn = document.createElement('label')
        previewBtn.className = "mf-button"
        previewBtn.innerHTML = "Preview"
        previewBtn.onclick = () => {
            this.previewSample(selTrack)
        }
        visuWave.appendChild(previewBtn)

        mainDiv.appendChild(visuWave)
        this.displayWave(selPat, selTrack, canvas)

    }

    previewSample = (selTrack) => {
        const sound = MfGlobals.sounds[selTrack.soundId]
        if (!sound?.buffer) {
            return
        }
        const source = MfGlobals.audioCtx.createBufferSource()
        source.buffer = sound.buffer
        source.connect(MfGlobals.audioCtx.destination)
        source.start()
    }

    createSoundTypeList = (mainDiv, selPat, selTrack) => {
        let box1 = document.createElement('div')
        box1.classList.add("sliders-block-e")
        box1.classList.add("box-h")

        let box2 = document.createElement('div')
        box2.classList.add("sliders-block-e")
        box2.classList.add("box-h")

        let soundTypeTitle = document.createElement('div')
        soundTypeTitle.className = "sample-list-title"
        soundTypeTitle.textContent = "Instruments"

        let soundTypeListDiv = document.createElement('select')
        soundTypeListDiv.id = "soundTypeListDiv"
        soundTypeListDiv.className = "sample-listbox"
        soundTypeListDiv.setAttribute("role", "listbox")
        soundTypeListDiv.setAttribute("aria-label", "Instrument list")
        soundTypeListDiv.size = 10

        let sampleTitle = document.createElement('div')
        sampleTitle.className = "sample-list-title"
        sampleTitle.textContent = "Samples"

        let sampleListDiv = document.createElement("select")
        sampleListDiv.id = "sampleList"
        sampleListDiv.className = "sample-listbox"
        sampleListDiv.setAttribute("role", "listbox")
        sampleListDiv.setAttribute("aria-label", "Sample list")
        sampleListDiv.size = 10

        soundTypeListDiv.addEventListener('change', () => {
            this.onSoundTypeSelected(selPat, selTrack, soundTypeListDiv, sampleListDiv)
        })
        sampleListDiv.addEventListener('change', () => {
            this.onSampleSelected(selPat, selTrack, sampleListDiv)
        })

        box1.appendChild(soundTypeTitle)
        box1.appendChild(soundTypeListDiv)
        box2.appendChild(sampleTitle)
        box2.appendChild(sampleListDiv)
        mainDiv.appendChild(box1)
        mainDiv.appendChild(box2)

        let selectedSoundType = MfGlobals.sounds[selTrack.soundId].key
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
        // Cancel button (reverts to initial modal state)
        const btnCancel = document.createElement('button')
        btnCancel.className = "mf-tb-button"
        btnCancel.textContent = "Cancel"
        btnCancel.type = "button"
        btnCancel.setAttribute('aria-label', 'Cancel and restore initial sound selection')
        btnCancel.onclick = () => {
            const init = this.modalInitialState || {}
            const soundId = init.soundId
            if (selTrack) {
                selTrack.name = init.trackName ?? selTrack.name
                MfGlobals.mfCmd.changeTrackSound(selTrack, soundId)
            }
            MfGlobals.mfPatterns.computeFlatNotesFromPattern(selPat)
            MfGlobals.mfUpdates.updateTrackCtrl(MfGlobals.selectedTrackNum)
            MfGlobals.mfUpdates.updatePatternView(selPat, MfGlobals.displayBars)
            document.getElementById("warn-modal").style.display = "none"
        }

        // OK button: just close modal
        const btnOk = document.createElement('button')
        btnOk.className = "mf-tb-button"
        btnOk.textContent = "OK"
        btnOk.type = "button"
        btnOk.setAttribute('aria-label', 'Close the dialog')
        btnOk.onclick = () => {
            document.getElementById("warn-modal").style.display = "none"
        }

        let box2 = document.createElement('div')
        box2.className = "box-v modal-pick-buttons"
        box2.appendChild(btnCancel)
        box2.appendChild(btnOk)
        mainDiv.appendChild(box2)
    }

    fillSoundTypeList = (selPat, selTrack, selectedSoundType, soundTypeListDiv, sampleListDiv) => {
        console.log("mfSampleIhm::fillSoundTypeList:: for track:" + selTrack.name)
        const  im =  new InstrumentManager()
        const soundTypes = Utils.sortObj(im.getAllIds())
        console.log(soundTypes)
       
        Utils.recursiveClear(soundTypeListDiv)
        const soundTypeEntries = Object.keys(soundTypes)
            .map((soundKey) => ({
                soundKey,
                soundsForType: Utils.sortObj(MfGlobals.mfCmd.getAllSoundsForType(soundKey))
            }))
            .filter(({ soundsForType }) => Object.keys(soundsForType).length > 0)
        const selectedEntry = soundTypeEntries.find(({ soundKey }) => soundKey === selectedSoundType) || soundTypeEntries[0]
        soundTypeListDiv.size = Math.max(4, Math.min(12, soundTypeEntries.length || 4))
        for (const { soundKey, soundsForType } of soundTypeEntries) {
            let opt = document.createElement('option')
            opt.value = soundKey
            opt.textContent = soundKey
            opt.selected = selectedEntry?.soundKey === soundKey
            soundTypeListDiv.appendChild(opt)
        }
        if (selectedEntry) {
            soundTypeListDiv.value = selectedEntry.soundKey
            this.fillSampleList(selPat, selTrack, selectedEntry.soundsForType, sampleListDiv)
        } else if (sampleListDiv) {
            Utils.recursiveClear(sampleListDiv)
            sampleListDiv.size = 4
        }
    }

    onSoundTypeSelected = async (selPat, selTrack, soundTypeListDiv, sampleListDiv) => {
        const soundKey = soundTypeListDiv.value
        console.log("mfSampleIhm::fillSoundTypeList:: click on sound type:" + soundKey)
        if (soundKey === "BASS") {
            selTrack.mono = true
        }
        MfGlobals.mfCmd.changeTrackName(selTrack, soundKey)
        const mfAutoAssign = await MfGlobals.getAutoAssign()
        mfAutoAssign.autoAssignSounds(selPat)
        MfGlobals.mfPatterns.computeFlatNotesFromPattern(selPat)
        MfGlobals.mfUpdates.updateTrackCtrl(MfGlobals.selectedTrackNum)
        MfGlobals.mfUpdates.updatePatternView(selPat, MfGlobals.displayBars)
        const soundsForType = Utils.sortObj(MfGlobals.mfCmd.getAllSoundsForType(soundKey))
        this.fillSampleList(selPat, selTrack, soundsForType, sampleListDiv)
     }


    fillSampleList = (selPat, selTrack, soundsForType, sampleListDiv) => {
        console.log("mfSampleIhm::fillSampleList:: for sound key:" + MfGlobals.sounds[selTrack.soundId].key)
        console.log(soundsForType)
        if (!sampleListDiv) return
        Utils.recursiveClear(sampleListDiv)
        const seenUrls = new Set()
        const currentUrl = MfGlobals.sounds[selTrack.soundId]?.url
        sampleListDiv.size = Math.max(4, Math.min(14, soundsForType.length || 4))
        for (let i = 0; i < Object.keys(soundsForType).length; i++) {
            if (seenUrls.has(soundsForType[i].url)) continue
            seenUrls.add(soundsForType[i].url)
            let opt = document.createElement('option');
            opt.setAttribute("role", "option")
            opt.value = soundsForType[i].url
            opt.textContent = soundsForType[i].url
            if (currentUrl && soundsForType[i].url === currentUrl) {
                opt.selected = true
            }
            sampleListDiv.appendChild(opt)
        }
        const currentSound = MfGlobals.sounds[selTrack.soundId]
        if (currentSound && sampleListDiv.value !== currentSound.url) {
            sampleListDiv.value = currentSound.url
        }
    }

    onSampleSelected = (selPat, selTrack, sampleListDiv) => {
        const soundUrl = sampleListDiv.value
        console.log("mfSampleIhm::onSampleSelected:: click on sound url:" + soundUrl)
        const soundId = MfGlobals.mfCmd.getSoundIdFromUrl(soundUrl)
        MfGlobals.mfCmd.changeTrackSound(selTrack, soundId)
        MfGlobals.mfPatterns.computeFlatNotesFromPattern(selPat)
        MfGlobals.mfUpdates.updateTrackCtrl(MfGlobals.selectedTrackNum)
        MfGlobals.mfUpdates.updatePatternView(selPat, MfGlobals.displayBars)
        const canvas = document.getElementById("visualWaveCanvas")
        this.displayWave(selPat, selTrack, canvas)

        const currentSound = MfGlobals.sounds[selTrack.soundId]
        if (currentSound) {
            const soundsForType = Utils.sortObj(MfGlobals.mfCmd.getAllSoundsForType(currentSound.key))       

            this.fillSampleList(selPat, selTrack, soundsForType, sampleListDiv)
        }
    }

    getSoundAnalysis = (sound) => {
        if (!sound?.buffer) {
            return null
        }
        if (!sound.__mfAnalysis) {
            try {
                sound.__mfAnalysis = {
                    ...this.audioAnalyze.analyzeAudioBuffer(sound.buffer),
                    sampleRate: sound.buffer.sampleRate,
                    numberOfChannels: sound.buffer.numberOfChannels
                }
            } catch (error) {
                console.error("mfSampleIhm::getSoundAnalysis", error)
                sound.__mfAnalysis = null
            }
        }
        return sound.__mfAnalysis
    }

    formatMetric = (value, unit = "", digits = 2) => {
        if (value == null || Number.isNaN(value)) {
            return "n/a"
        }
        if (typeof value === "number" && !Number.isFinite(value)) {
            return "-inf"
        }
        if (typeof value === "number") {
            return `${value.toFixed(digits)}${unit}`
        }
        return `${value}${unit}`
    }

    updateSampleAnalysis = (selTrack) => {
        const analysisDiv = document.getElementById("sampleAnalysis")
        if (!analysisDiv) {
            return
        }
        Utils.recursiveClear(analysisDiv)

        const sound = MfGlobals.sounds[selTrack.soundId]
        const analysis = this.getSoundAnalysis(sound)

        const addRow = (label, value) => {
            const row = document.createElement('div')
            row.className = "sample-analysis-row"

            const labelDiv = document.createElement('div')
            labelDiv.className = "sample-analysis-label"
            labelDiv.textContent = label

            const valueDiv = document.createElement('div')
            valueDiv.className = "sample-analysis-value"
            valueDiv.textContent = value

            row.appendChild(labelDiv)
            row.appendChild(valueDiv)
            analysisDiv.appendChild(row)
        }

        if (!sound || !sound.buffer || !analysis) {
            addRow("Analysis", "Unavailable")
            return
        }

        addRow("File", sound.url)
        addRow("Display", sound.display_name || sound.url)
        addRow("Duration", this.formatMetric(analysis.length, " s", 3))
        addRow("Sample rate", this.formatMetric(analysis.sampleRate, " Hz", 0))
        addRow("Channels", this.formatMetric(analysis.numberOfChannels, "", 0))
        addRow("Volume RMS", this.formatMetric(analysis.volume, "", 4))
        //addRow("Peak dB", this.formatMetric(analysis.peakDb, " dB", 2))
        //addRow("RMS dB", this.formatMetric(analysis.rmsDb, " dB", 2))
        addRow("Fundamental", this.formatMetric(analysis.fundamentalHz, " Hz", 2))
        addRow("Spectral centroid", this.formatMetric(analysis.spectralCentroidHz, " Hz", 2))
        addRow("Sub energy", this.formatMetric(analysis.energySubPct, " %", 2))
        addRow("High energy", this.formatMetric(analysis.energyHighPct, " %", 2))
        addRow("Harmonic ratio", this.formatMetric(analysis.harmonicRatio, "", 4))
       // addRow("Pitch confidence", this.formatMetric(analysis.pitchConfidence, "", 4))
    }

    displayWave = (selPat, selTrack, canvas) => {
        const sound = MfGlobals.sounds[selTrack.soundId]
        if (!sound?.buffer || !canvas) {
            this.updateSampleAnalysis(selTrack)
            return
        }
        const leftBuffer = sound.buffer.getChannelData(0) //mono  
        let ctx = canvas.getContext('2d')
        ctx.fillStyle = '#000'
        ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height)
        ctx.fillStyle = '#0f0'
        ctx.fillRect(0, ctx.canvas.height / 2 - 1, ctx.canvas.width, 2)
        //ctx.fillStyle = '#f00'
        const nbFrame = leftBuffer.length
        for (let i = 0; i < ctx.canvas.width; i++) {
            const sampleValue = leftBuffer[Math.floor(i * nbFrame / ctx.canvas.width)]
            if (sampleValue >= -1 && sampleValue <= 1) {
                const h = sampleValue * ctx.canvas.height
                ctx.fillRect(i, ctx.canvas.height / 2, 1, h)
            }
        }
        this.updateSampleAnalysis(selTrack)
    }

    onWaveFileSelected = async (ev) => {
        const file = ev.target.files?.[0]
        if (!file) {
            return
        }

        const audioUrl = URL.createObjectURL(file)
        try {
            const response = await fetch(audioUrl)
            const arrayBuffer = await response.arrayBuffer()
            const buffer = await MfGlobals.audioCtx.decodeAudioData(arrayBuffer)
            const selPat = MfGlobals.patterns[MfGlobals.selectedPatternNum]
            const selTrack = selPat.tracks[MfGlobals.selectedTrackNum]
            const soundKey = this.importAudioBufferForTrack(selPat, selTrack, file.name, buffer)

            this.refreshPickLists(selPat, selTrack, soundKey)
            this.displayWave(selPat, selTrack, document.getElementById("visualWaveCanvas"))
        } finally {
            URL.revokeObjectURL(audioUrl)
        }
    }

    importAudioBufferForTrack = (selPat, selTrack, fileName, buffer) => {
        const currentSound = MfGlobals.sounds[selTrack.soundId]
        if (!currentSound) {
            return null
        }

        const soundKey = this.findSoundKeyFromFileName(fileName, currentSound.key)
        const soundId = this.addImportedSound(currentSound, fileName, soundKey, buffer)

        MfGlobals.mfCmd.changeTrackName(selTrack, soundKey)
        MfGlobals.mfCmd.changeTrackSound(selTrack, soundId)
        MfGlobals.mfPatterns.computeFlatNotesFromPattern(selPat)
        MfGlobals.mfUpdates.updateTrackCtrl(MfGlobals.selectedTrackNum)
        MfGlobals.mfUpdates.updatePatternView(selPat, MfGlobals.displayBars)
        return soundKey
    }

    findSoundKeyFromFileName = (fileName, fallbackKey) => {
        const instrument = new InstrumentManager().findInstrumentFromFileName(fileName)
        return instrument?.id && instrument.id !== "NOT_FOUND" ? instrument.id : fallbackKey
    }

    addImportedSound = (sourceSound, fileName, soundKey, buffer) => {
        const soundId = this.getUniqueImportedSoundId(sourceSound.kit_name, fileName)
        MfGlobals.sounds[soundId] = {
            ...sourceSound,
            url: soundId,
            key: soundKey,
            display_name: fileName,
            buffer: buffer,
            duration: Math.floor(buffer.duration * 1000),
            isLoad: true,
            playStatus: false,
            __mfAnalysis: null
        }
        return soundId
    }

    getUniqueImportedSoundId = (kitName, fileName) => {
        const baseSoundId = (kitName || "imported") + "/" + fileName
        if (!MfGlobals.sounds[baseSoundId]) {
            return baseSoundId
        }

        const dotIndex = fileName.lastIndexOf(".")
        const name = dotIndex > 0 ? fileName.slice(0, dotIndex) : fileName
        const ext = dotIndex > 0 ? fileName.slice(dotIndex) : ""
        let index = 1
        let soundId = ""
        do {
            soundId = (kitName || "imported") + "/" + name + "-" + index + ext
            index++
        } while (MfGlobals.sounds[soundId])
        return soundId
    }

    refreshPickLists = (selPat, selTrack, selectedSoundType) => {
        const soundTypeListDiv = document.getElementById("soundTypeListDiv")
        const sampleListDiv = document.getElementById("sampleList")
        this.fillSoundTypeList(selPat, selTrack, selectedSoundType, soundTypeListDiv, sampleListDiv)
    }


    }
