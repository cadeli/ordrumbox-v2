export default class Utils {
    static TAG = "UTILS"

    static filterTypeList = ['lowpass','highpass','bandpass','peaking','lowshelf','highshelf','notch','allpass']
    static waveList = ["square", "sawtooth", "triangle", "sine"]

    static TRACK_DEFAULTS = {
        "name": "",
        "useAutoAssignSound": true,
        "soundId": "NOT_DEFINED",
        "bars": 4,
        "stepsPerBar": 4,
        "loopAtStep": null,
        "swingResolution": 1,
        "swingAmount": 0,
        "velocity": 1,
        "velocityLfo": null,
        "pitch": 0,
        "pitchLfo": null,
        "pan": 0,
        "panLfo": null,
        "solo": false,
        "mute": false,
        "auto": false,
        "useSoftSynth": false,
        "mono": false,
        "filterType": "allpass",
        "filterFreqLfo": null,
        "filterFreq": 20,
        "filterQLfo": null,
        "filterQ": 0.707,
        "reverbType": "none",
        "reverbAmount": 0,
        "saturationType": "soft",
        "saturationAmount": 0,
        "notes": []
    };

    static TRACK_RECALCULATED = ["loopPointBar", "loopPointStep"];

    static PATTERN_DEFAULTS = {
        "nbBars": 4,
        "bpm": 120,
        "description": "",
        "tags": [],
        "tracks": []
    };

    static NOTE_DEFAULTS = { 
        bar: 0, 
        stepInBar: 0, 
        pitch: 0, 
        velocity: 0.8,
        pan: 0,
        arp: null,
        triggerFreq: 1,
        triggerPhase: 0,
        retriggerNum: 1,
        retriggStep: 1,
        euclidianFill: 0
    };

    static NOTE_RECALCULATED = ["steppc", "stepPercent"];


    constructor() { }

    //we use stop propagation
    static collapseDropBoxs() {
        const dropboxElements = document.getElementsByClassName("mf-dropbox-list");
        Array.prototype.forEach.call(dropboxElements, (dropboxElement) => {
            dropboxElement.style.display = 'none'
        })
    }



    static toggleDisplayDiv(adiv) {
        const display = getComputedStyle(adiv).display;
        if (display == "none") {
            adiv.style.display = "block";
        } else {
            adiv.style.display = "none";
        }
    }

   static createMfElement = (type, id, className, parent) => {
        //    if (className !== null)
        //         console.log("MfSkelHtml::createMfElement: " + type + " id:" + id + " class:" + className)
        let elem = document.createElement(type)
        if (id) {
            elem.id = id
        }
        if (className) {
            elem.className = className
        }
        parent.appendChild(elem)
        return elem
    }

    static displayModalMessage = (message) => {
        document.getElementById("warn-modal").style.display = "block"
        document.getElementById("modal-message").innerText = message
        setTimeout(() => {
            document.getElementById("warn-modal").style.display = "none"
        }, 1000)
    }

    static displayStatusBar = (message) => {
      //  document.getElementById("statusBar").innerText = message
    }

    static recursiveClear(node) {
        if (!node) return;

        while (node.hasChildNodes()) {
            const child = node.firstChild;

            if (child.hasChildNodes()) {
                this.recursiveClear(child);
            }

            const newChild = child.cloneNode(true);
            child.parentNode.replaceChild(newChild, child);

            node.removeChild(node.firstChild);
        }
    }
    static sortObj = (obj) => {
        return Object.keys(obj).sort().reduce(function (result, key) {
            result[key] = obj[key];
            return result;
        }, {});
    }

    // static mysanitize = (txt) => {
    //     let ret = txt
    //     ret = ret.replace(/\s+/g, '')
    //     ret = ret.replace(/[^a-z0-9áéíóúñü \.,_-]/gim, "");
    //     ret = ret.trim();
    //     ret = ret.slice(0, 10)
    //     return ret
    // }

    static sanitizePatternFileName(patternName) {
  return String(patternName)
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .replace(/-+/g, '-')
    .slice(0, 64) || 'new-pattern';
}


    static pitchToSemiTone = (fpitch) => (fpitch - 1) * 12;
    static semiToneToPitch = (semiTone) => (semiTone / 12) + 1;

    static normalizedTrackFilterFreqToHz = (value) => Math.floor(20 * Math.pow(1000, Number(value) || 0))
    static normalizedTrackFilterQToValue = (value) => ((Number(value) || 0) * 18) + 0.707
    static normalizedSynthFilterFreqToHz = (value) => Math.floor((2000 * (Number(value) || 0)) + 50)
    static normalizedSynthFilterQToValue = (value) => (20 * (Number(value) || 0)) + 1

    static normalizeTrackFilterFreqValue = (value) => {
        const numericValue = Number(value)
        if (!Number.isFinite(numericValue)) {
            return 20
        }
        if (numericValue <= 1) {
            return Utils.normalizedTrackFilterFreqToHz(numericValue)
        }
        return numericValue
    }

    static normalizeTrackFilterQValue = (value) => {
        const numericValue = Number(value)
        if (!Number.isFinite(numericValue)) {
            return 0.707
        }
        if (numericValue <= 1) {
            return Utils.normalizedTrackFilterQToValue(numericValue)
        }
        return numericValue
    }

    static normalizeSynthFilterFreqValue = (value) => {
        const numericValue = Number(value)
        if (!Number.isFinite(numericValue)) {
            return 50
        }
        if (numericValue <= 1) {
            return Utils.normalizedSynthFilterFreqToHz(numericValue)
        }
        return numericValue
    }

    static normalizeSynthFilterQValue = (value) => {
        const numericValue = Number(value)
        if (!Number.isFinite(numericValue)) {
            return 1
        }
        if (numericValue <= 1) {
            return Utils.normalizedSynthFilterQToValue(numericValue)
        }
        return numericValue
    }

    static getStepSpacing = (value) => {
        let ret = 1
        switch (value) {
            case 0:
                ret = 0
            case 1:
                ret = 1 / 4
            case 2:
                ret = 1 / 2
            case 3:
                ret = 1 / 3
            case 4:
                ret = 1
            case 5:
                ret = 2 / 3
            case 6:
                ret = 2
            case 7:
                ret = 4 / 3
            case 8:
                ret = 4
            case 9:
                ret = 5
            case 10:
                ret = 6
            case 11:
                ret = 7
            case 12:
                ret = 8
            case 13:
                ret = 10
            case 14:
                ret = 12
            case 16:
                ret = 14
            case 16:
                ret = 16
        }
        return ret
    }

 static getRandomKey(obj) {
        const keys = Object.keys(obj); 
        if (keys.length === 0) return null;

        const randomIndex = Math.floor(Math.random() * keys.length);
        return keys[randomIndex];
    }
}
