export default class MfResourcesLoader {
    static TAG = "MFResourcesLoader"

    loadDrumkitList(file, complete) {
        fetch(file)
            .then(response => response.json())
            .then(jsonKitList => {
                Object.assign(MfGlobals.drumkits, jsonKitList)
                complete()
            })
    }


    loadScales(file, complete) {
        fetch(file)
            .then((response) => response.json())
            .then((scales) => {
                Object.assign(MfGlobals.scales, scales)
                complete()
            })
            .catch((error) => {
                console.error('mfressourceloader::loadScales: ' + file, error);
            })
    }

    loadGeneratedSounds(file, complete) {
        fetch(file)
            .then((response) => response.json())
            .then((generatedSounds) => {
                Object.assign(MfGlobals.generatedSounds, generatedSounds)
                complete()
            })
            .catch((error) => {
                console.error('mfressourceloader::loadGeneratedSounds: ' + file, error);
            })
    }

    loadPatterns(file, complete) {
        this.isPatternsComplete = false
        fetch(file)
            .then((response) => response.json())
            .then((patterns) => {
                MfGlobals.patterns = patterns
                Object.assign(MfGlobals.patterns, patterns)
                console.log("mfressourceloader::loadPatterns: " + file + "=" + patterns.length)
                this.fix(patterns)
                complete()
            })
            .catch((error) => {
                console.error('mfressourceloader::loadPatterns: ' + file, error);
            })
    }

    loadSerializedPatterns(file, complete) {
        fetch(file)
            .then((response) => response.json())
            .then((song) => {
                for (const [key, value] of Object.entries(song)) {
                    let pattern = MfGlobals.mfUpdates.mfCmd.addPattern()
                    pattern.name = key
                    let cols = value.split(",")
                    cols.forEach((col, indexCol) => {
                        //console.log ("col="+indexCol+":"+col)
                        let notes = col.split("_")
                        notes.forEach((note, indexNote) => {
                            // console.log ("col="+indexCol+":"+indexNote+":"+note)
                            if (note.length > 1) {
                                let inst = note.split("-")
                                let bar = Math.floor(indexCol / 4)
                                let step = indexCol % 4
                                let track = MfGlobals.mfUpdates.mfCmd.getTrackFromType(pattern, inst[0])
                                if (track == null) {
                                    console.log("::loadSerializedPatterns track not found :" + inst[0] + " bar=" + bar + " step=" + step)
                                    track = pattern.tracks[5] //TODO
                                }
                                if (inst[1].startsWith('R')) {
                                    let note = MfGlobals.mfUpdates.mfCmd.addNote(track, bar, step)
                                    note.triggFreq = inst[1].charAt(1)
                                } else {
                                    track.loopPoint = step + track.nbStepPerBar * bar
                                    track.loopPointBar = bar
                                    track.loopPointStep = step
                                }

                            }
                        })
                    })
                }
                console.log("mfressourceloader::loadSerializedPatterns:")
                complete()
            })
            .catch((error) => {
                console.error('mfressourceloader::loadSerializedPatterns: ' + file, error);
            })
    }


    loadSamples(file, complete, progress) {
        if (MfGlobals.audioCtx == null) {
            MfGlobals.audioCtx = new AudioContext()
        }
        this.nbLoad = 0
        this.nbToLoad = 0
        let self = this
        fetch(file)
            .then(response => response.json())
            .then(jsonKitList => { //just to count nbToLoad
                Object.assign(MfGlobals.drumkits , jsonKitList)
                for (const [kitKey, kit] of Object.entries(jsonKitList)) {
                    kit.instruments.forEach(sound => {
                        self.nbToLoad++
                    })
                }
                console.log("mfresourceloader::loadsamples nb sample to load =" + self.nbToLoad)
                for (const [kitKey, kit] of Object.entries(jsonKitList)) {
                    //console.log("read kit :" + kit.name)
                    kit.instruments.forEach(sound => {
                        //console.log(">"+self.nbLoad+" read instrument :" + sound.url)
                        this.loadSample(sound, kit.name, complete,progress)
                    })
                }
            })
    }

    loadSample = (sample, kit_name, complete,progress) => {
        let self = this;
        let req = new XMLHttpRequest();
        req.open("GET", "assets/kits/" + sample.url, true);
        req.responseType = "arraybuffer";
        req.onerror = (event) => {
            console.error("akoader error " + sample.url + " " + event.message)
        }
        req.ontimeout = (event) => {
            console.error("akoader error " + sample.url + " " + event.message)
        }
        req.onreadystatechange = function(event) {
            if (req.readyState === 4) {
                if (req.status === 200) {
                    // console.log("akoader ok " + sample.url)
                } else {
                    console.error("akoader error " + sample.url + " " + event.message)
                }
            }
        }
        req.onload = function() {
            if (req.response) {
                MfGlobals.audioCtx.decodeAudioData(req.response, function(buffer) {
                    let sound = {
                        kit_name: kit_name,
                        url: sample.url,
                        key: sample.key,
                        index: self.nbLoad,
                        display_name: sample.display_name,
                        buffer: buffer,
                        duration: Math.floor(buffer.duration * 1000),
                        isLoad: true,
                        playStatus: false
                    }
                    console.log("mfRessourceLoader::loadSample" + (kit_name + "_" + sample.key) +
                        " load ok  duration:" + (buffer.duration).toFixed(2) +
                        " nb : " + self.nbLoad + "/" + self.nbToLoad + "  url=" + sound.url)

                    MfGlobals.sounds[MfGlobals.sounds.length] = sound
                    self.nbLoad++
                    progress(Math.floor(self.nbLoad * 100 / self.nbToLoad)) //TODO nbTotalToLoad
                    if (self.nbLoad >= self.nbToLoad) {
                        MfGlobals.sounds = MfGlobals.sounds.sort((a, b) => (a.key > b.key) ? 1 : ((b.key > a.key) ? -1 : 0))
                        Object.values(MfGlobals.sounds).forEach((sound, soundIndex) => { sound.index = soundIndex }) //TODO better way
                        complete()
                    }
                });
            } else {
                console.error((kit_name + "_" + sample.key) + " load ok :" + self.nbLoad + "/" + nbToLoad + "  =" + sound.url)
            }
        }
        req.send();
    }

    fix = (patterns) => { //TODO fix loops
        Object.values(patterns).forEach((pattern, indexPattern) => {
            //pattern.nbBars = pattern.tracks[0].bars
            if (!pattern.application) { pattern.application = "online-ordrumbox" }
            if (!pattern.url) { pattern.url = "https://www.ordrumbox.com" }
            Object.values(pattern.tracks).forEach((track, indexTrack) => {
                this.trackPanningFix(track, indexTrack)
                track.generated = false
                track.loopPointBar = Math.floor(track.loopPoint / track.nbStepPerBar)
                track.loopPointStep = track.loopPoint % track.nbStepPerBar

                if (!track.swingRez) { track.swingRez = 1 }
                if (!track.swingDepth) { track.swingDepth = 0 }
                if (!track.veloLfo) { track.veloLfo = null }
                if (!track.pitchLfo) { track.pitchLfo = null }
                if (!track.panoLfo) { track.panoLfo = null }
                if (!track.filterFreqLfo) { track.filterFreqLfo = null }
                if (!track.filterQLfo) { track.filterQLfo = null }
                if (!track.filterType) { track.filterType = "allpass" }
                if (!track.filterFreq) { track.filterFreq = 0 }
                if (!track.filterQ) { track.filterQ = 0 }
                if (!track.filterLfoFreq) { track.filterLfoFreq = 0 }
                if (!track.sampleLength) { track.sampleLength = 1 }
                Object.values(track.notes).forEach((note) => {
                    this.stepBarFix(track, note) //TODO due to inconsistant json 
                    if (!note.retriggNum) { note.retriggNum = 1 }
                    if (!note.retriggStep) { note.retriggStep = 1 }
                    if (!note.retriggStepMulpt) { note.retriggStepMulpt = 1 }
                    if (!note.triggFreq) { note.triggFreq = 1 }
                    if (!note.triggPhase) { note.triggPhase = 0 }
                    if (!note.euclidianFill) { note.euclidianFill = 0 }
                })
            })
        })
    }

    stepBarFix = (track, note) => { // json is not consistant TODO fix json
        if (note.step >= track.nbStepPerBar) {
            let pStep = note.step
            note.step %= track.nbStepPerBar
            note.bar = Math.floor(pStep / track.nbStepPerBar)
        }
        note.steppc = Math.round((note.step * 100) / track.nbStepPerBar)
    }

    trackPanningFix = (track, indexTrack) => {
        switch (indexTrack) {
            case 0:
                track.pano = 0
                break;
            case 1:
                track.pano = 0.3
                break;
            case 2:
                track.pano = 0.5
                break;
            case 3:
                track.pano = -0.4
                break;
            case 4:
                track.pano = 0.4
                break;
            case 5:
                track.pano = -0.3
                break;
            case 6:
                track.pano = -0.2
                break;
            case 7:
                track.pano = 1
                break;
            default:
                track.pano = 0
                break;
        }
    }

}