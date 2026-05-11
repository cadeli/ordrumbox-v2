import { MfGlobals } from '../mfglobals.js'
import Utils from '../utils.js'

export default class MfSoftSynthIhm {
    static TAG = "MFSOFTSYNTHIHM"

    constructor() {
        this.isGeneratedSoundsLoading = false
        this.generatedSoundsLoadFailed = false
    }

    formatSynthFilterFreq = (value) => {
        const hz = Math.round(Number(value) || 0)
        return `${hz}Hz`
    }

    formatSynthFilterQ = (value) => {
        return Number(value).toFixed(2)
    }

    displayModalDialogGenSound = () => {
        /* ---------- LOAD ---------- */
        if (!Object.keys(MfGlobals.generatedSounds).length) {
            this.loadGeneratedsounds()
            return
        }

        /* ---------- UI INIT ---------- */
        const modal = document.getElementById("warn-modal")
        const title = document.getElementById("modal-title-text")
        const content = document.getElementById("modal-message")

        modal.style.display = "block"
        title.innerText = "Soft Synth"
        Utils.recursiveClear(content)

        const line = document.createElement("div")
        line.className = "line-controls"
        line.style.display = "flex"
        content.appendChild(line)

        /* ---------- HELPERS ---------- */
        const createBlock = (titleText) => {
            const div = document.createElement("div")
            div.className = "sliders-block"
            // Optionnel : ajouter un petit titre au bloc si besoin
            line.appendChild(div)
            const titleDiv = document.createElement("div")
            titleDiv.className = "mf-title-box"
            titleDiv.textContent = titleText
            div.appendChild(titleDiv)
            return div
        }

        // Utilisation du nouveau addSliderBtn
        const addSlider = (container, label, obj, key, options = {}) => {
            obj[key] ??= 0

            // Création du wrapper .mf-button-sl pour le style
            const btnContainer = Utils.createMfElement("div", null, "mf-button-sl", container)

            return MfGlobals.mfSliderBtn.addSliderBtn(
                btnContainer,
                label,
                obj[key],
                v => obj[key] = parseFloat(v),
                {
                    min: options.min ?? 0,
                    max: options.max ?? 1,
                    step: options.step ?? 0.01,
                    isNormalized: options.isNormalized ?? true,
                    formatDisplayValue: options.formatDisplayValue ?? null
                }
            )
        }

        const addSelect = (container, label, list, value, cb) => {
            const btnContainer = Utils.createMfElement("div", null, "mf-button-sl", container)
            const el = MfGlobals.mfComponents.addListInputBox(
                label,
                "id_" + label,
                list,
                value,
                v => cb(v)
            )
            btnContainer.appendChild(el)
        }

        /* ---------- DATA ---------- */
        const selPat = MfGlobals.patterns[MfGlobals.selectedPatternNum]
        const selTrack = selPat.tracks[MfGlobals.selectedTrackNum]

        selTrack.synthSoundKey ??= Object.keys(MfGlobals.generatedSounds)[0]

        const sound = MfGlobals.generatedSounds[selTrack.synthSoundKey]
        if (!sound) return

        /* ---------- SAFE DEFAULTS ---------- */
        sound.enveloppe ??= { attack: 0.1, decay: 0.2, sustain: 0.7, release: 0.5 }
        sound.vco1 ??= { gain: 0.5, detune: 0, octave: 0, wave: "sawtooth" }
        sound.vco2 ??= { gain: 0.5, detune: 0, octave: 0, wave: "sawtooth" }
        sound.vco3 ??= { gain: 0.5, detune: 0, octave: 0, wave: "sawtooth" }
        sound.lfo ??= { depth: 0, freq: 1, wave: "sine", target: "NOT" }
        sound.filter ??= { freq: 1050, Q: 11, type: "lowpass", filterEnvelopeAmount: 0 }
        sound.filter.filterEnvelopeAmount ??= 0
        sound.masterVolume ??= 0.8
        sound.slide ??= 0
        sound.noise ??= { mix: 0, filterType: "highpass", filterFreq: 1000, filterQ: 1 }

        /* ---------- BLOCKS ---------- */
        const blocks = {
            main: createBlock("sounds"),
            vco1: createBlock("VCO-1"),
            vco2: createBlock("VCO-2"),
            vco3: createBlock("VCO-3"),
            lfo: createBlock("LFO"),
            filter: createBlock("FILTER"),
            noise: createBlock("NOISE")
        }

        /* ---------- PRESET SELECTION ---------- */
        addSelect(
            blocks.main,
            "Preset",
            Object.keys(MfGlobals.generatedSounds),
            selTrack.synthSoundKey,
            (v) => this.changeSoundName(v)
        )

            /* ---------- ENVELOPE ---------- */
            ;["attack", "decay", "sustain", "release"].forEach(p =>
                addSlider(blocks.main, p, sound.enveloppe, p)
            )

        /* ---------- MASTER VOLUME ---------- */
        addSlider(blocks.main, "Volume", sound, "masterVolume", { min: 0, max: 1, step: 0.01, isNormalized: false })

        /* ---------- VCOs ---------- */
     
        const setupVCO = (block, name, vco) => {
            if (!vco) return

            addSelect(
                block,
                name,
                Utils.waveList,
                vco.wave,
                v => vco.wave = v
            )

            addSlider(block, "Gain", vco, "gain")
            addSlider(block, "Detune", vco, "detune", { min: -100, max: 100, step: 1, isNormalized: false })
            addSlider(block, "Octave", vco, "octave", { min: -4, max: 4, step: 1, isNormalized: false })
        }

        setupVCO(blocks.vco1, "VCO 1", sound.vco1)
        setupVCO(blocks.vco2, "VCO 2", sound.vco2)
        setupVCO(blocks.vco3, "VCO 3", sound.vco3)

        /* ---------- LFO ---------- */
        const lfoTargets = ["VCO1", "VCO2", "VCO3", "FLT", "NOT"]

        addSelect(
            blocks.lfo,
            "LFO Wave",
            Utils.waveList,
            sound.lfo.wave,
            v => sound.lfo.wave = v
        )

        addSelect(
            blocks.lfo,
            "Target",
            lfoTargets,
            sound.lfo.target,
            v => sound.lfo.target = v
        )

        addSlider(blocks.lfo, "Depth", sound.lfo, "depth")
        addSlider(blocks.lfo, "Freq", sound.lfo, "freq", { min: 0.01, max: 10, step: 0.01, isNormalized: false })

        /* ---------- FILTER ---------- */
    
        addSelect(
            blocks.filter,
            "Type",
            Utils.filterTypeList,
            sound.filter.type,
            v => sound.filter.type = v
        )

        addSlider(blocks.filter, "Freq", sound.filter, "freq", {
            min: 50,
            max: 2050,
            step: 10,
            isNormalized: false,
            formatDisplayValue: this.formatSynthFilterFreq
        })
        addSlider(blocks.filter, "Reso", sound.filter, "Q", {
            min: 1,
            max: 21,
            step: 0.1,
            isNormalized: false,
            formatDisplayValue: this.formatSynthFilterQ
        })
        addSlider(blocks.filter, "EnvAmt", sound.filter, "filterEnvelopeAmount", {
            min: 0,
            max: 1,
            step: 0.01,
            isNormalized: true
        })
        addSlider(blocks.filter, "Slide", sound, "slide", { min: 0, max: 500, step: 1, isNormalized: false })

        /* ---------- NOISE ---------- */
        addSlider(blocks.noise, "Mix", sound.noise, "mix", {
            min: 0,
            max: 1,
            step: 0.01,
            isNormalized: false,
            formatDisplayValue: (v) => Math.round(v * 100) + "%"
        })

        addSelect(
            blocks.noise,
            "Filter",
            ["lowpass", "highpass", "bandpass", "notch"],
            sound.noise.filterType,
            v => sound.noise.filterType = v
        )

        addSlider(blocks.noise, "Freq", sound.noise, "filterFreq", {
            min: 100,
            max: 15000,
            step: 10,
            isNormalized: false
        })

        addSlider(blocks.noise, "Reso", sound.noise, "filterQ", {
            min: 0.1,
            max: 20,
            step: 0.1,
            isNormalized: false
        })
    }

    changeSoundName = (value) => {
        const selPat = MfGlobals.patterns[MfGlobals.selectedPatternNum]
        const selTrack = selPat.tracks[MfGlobals.selectedTrackNum]
        selTrack.synthSoundKey = value
        this.displayModalDialogGenSound()
    }

    loadGeneratedsounds = () => {
        if (this.isGeneratedSoundsLoading || this.generatedSoundsLoadFailed) {
            return
        }

        this.isGeneratedSoundsLoading = true
        MfGlobals.mfResourcesLoader.loadGeneratedSounds(MfGlobals.urlgeneratedsounds, () => {
            this.isGeneratedSoundsLoading = false
            if (!Object.keys(MfGlobals.generatedSounds).length) {
                this.generatedSoundsLoadFailed = true
                console.warn("MfSoftSynthIhm::loadGeneratedsounds loaded no generated sounds")
                return
            }
            this.displayModalDialogGenSound()
        }).catch((error) => {
            this.isGeneratedSoundsLoading = false
            this.generatedSoundsLoadFailed = true
            console.error("MfSoftSynthIhm::loadGeneratedsounds failed", error)
        })
    }
}
