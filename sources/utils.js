export default class Utils {
    static TAG = "UTILS"

    constructor() { }

    //we use stop propagation
    static collapseDropBoxs() {
        const dropboxElements = document.getElementsByClassName("mf-dropbox-list");
        const bDivs = Array.prototype.filter.call(dropboxElements, (dropboxElement) => {
            dropboxElement.style.display = 'none'
        }
        )
    }

    //we use stop propagation
    static collapseSliders() {
        const slidersElements = document.getElementsByClassName("tooltiptext");
        const aDivs = Array.prototype.filter.call(slidersElements, (slidersElement) =>
            slidersElement.style.display = 'none')

    }

    static toggleDisplayDiv(adiv) {
        const display = getComputedStyle(adiv).display;
        if (display == "none") {
            adiv.style.display = "block";
        } else {
            adiv.style.display = "none";
        }
    }

    //helper to create namespaced elements
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
        return Object.keys(obj).sort().reduce(function (result, key) {
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
            case "LP":
                return "lowpass"
                break;
            case "HP":
                return "highpass"
                break;
            case "BP":
                return "bandpass"
                break;
            case "NT":
                return "notch"
                break;
            case "ALL":
                return "allpass"
                break;
            default:
                console.warn("Utils::getFilterNameFromValue value not found :", txt)
                return "allpass"
        }
    }

    static getValueFromFilterName = (txt) => {
        switch (txt) {
            case "lowpass":
                return "LP"
                break;
            case "highpass":
                return "HP"
                break;
            case "bandpass":
                return "BP"
                break;
            case "notch":
                return "NT"
                break;
            case "allpass":
                return "ALL"
                break;
            default:
                console.warn("Utils::getValueFromFilterName value not found :", txt)
                return "ALL"
        }
    }

    static getWaveNameFromValue = (txt) => {
        switch (txt) {
            case "SQR":
                return "square"
                break;
            case "SAW":
                return "sawtooth"
                break;
            case "TRI":
                return "triangle"
                break;
            case "SIN":
                return "sine"
                break;
            default:
                console.warn("Utils::getWaveNameFromValue value not found :", txt)
                return "sine"
        }
    }

    static getValueFromWaveName = (txt) => {
        switch (txt) {
            case "square":
                return "SQR"
                break;
            case "sawtooth":
                return "SAW"
                break;
            case "triangle":
                return "TRI"
                break;
            case "sine":
                return "SIN"
                break;
            default:
                console.warn("Utils::getValueFromWaveName value not found :", txt)
                return "SIN"
        }
    }
}