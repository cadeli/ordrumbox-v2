export default class Utils {
    static TAG = "UTILS"

    constructor() {}

    static displayModalMessage = (message) => {
        document.getElementById("warn-modal").style.display = "block"
        document.getElementById("modal-message").innerText = message
        setTimeout(() => {
            document.getElementById("warn-modal").style.display = "none"
        }, 1000)
    }

    static displayStatusBar = (message) => {
        document.getElementById("statusBar").innerText = message
    }

    static clearInnerDom(node) {
        while (node.hasChildNodes()) {
            this.clearDom(node.firstChild);
        }
    }

    static clearDom(node) {
        while (node.hasChildNodes()) {
            this.clearDom(node.firstChild);
        }
        node.parentNode.removeChild(node);
        //  console.log("clear "+ node);
    }

    static sortObj = (obj) => {
        return Object.keys(obj).sort().reduce(function(result, key) {
            result[key] = obj[key];
            return result;
        }, {});
    }

    static mysanitize = (txt) => {
        let ret = txt
        ret = ret.replace(/\s+/g, '')
        ret = ret.replace(/[^a-z0-9áéíóúñü \.,_-]/gim, "");
        ret = ret.trim();
        ret = ret.slice(0, 10)
        return ret
    }

    static getFilterNameFromValue = (txt) => {
        switch (txt) {
            case "lp":
                return "lowpass"
                break;
            case "hp":
                return "highpass"
                break;
            case "bp":
                return "bandpass"
                break;
            case "nt":
                return "notch"
                break;
            case "all":
                return "allpass"
                break;
            default:
                return "allpass"
        }
    }

       static getValueFromFilterName = (txt) => {
        switch (txt) {
            case "lowpass":
                return "lp"
                break;
            case "highpass":
                return "hp"
                break;
            case "bandpass":
                return "bp"
                break;
            case "notch":
                return "nt"
                break;
            case "allpass":
                return "all"
                break;
            default:
                return "all"
        }
    }

       static getWaveNameFromValue = (txt) => {
        switch (txt) {
            case "sqr":
                return "square"
                break;
            case "saw":
                return "sawtooth"
                break;
            case "tri":
                return "triangle"
                break;
            case "sin":
                return "sine"
                break;
            default:
                return "sine"
        }
    }

       static getValueFromWaveName = (txt) => {
        switch (txt) {
            case "square":
                return "sqr"
                break;
            case "sawtooth":
                return "saw"
                break;
            case "triangle":
                return "tri"
                break;
            case "sine":
                return "sin"
                break;
            default:
                return "sin"
        }
    }
}