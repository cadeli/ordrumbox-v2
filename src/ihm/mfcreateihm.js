import { MfGlobals } from '../mfglobals.js'

import Utils from '../utils.js'
import MfSliderBox from './mfsliderbox.js'

export default class MfCreateIhm {
    static TAG = "MFCREATEIHM"

    constructor() {

    }

    formatTrackFilterFreq = (value) => {
        const hz = Math.round(Number(value) || 0)
        return `${hz}Hz`
    }

    formatTrackFilterQ = (value) => {
        return Number(value).toFixed(2)
    }

    getLfoRangeConfig = (selectedLfo) => {
        if (selectedLfo === 'pitchLfo') {
            return {
                minValue: -12,
                maxValue: 12,
                step: 1,
                formatDisplayValue: (value) => `${Math.round(Number(value) || 0)}st`
            }
        }
        if (selectedLfo === 'filterFreqLfo') {
            return {
                minValue: 20,
                maxValue: 20000,
                step: 10,
                formatDisplayValue: (value) => `${Math.round(Number(value) || 0)}Hz`
            }
        }
        if (selectedLfo === 'filterQLfo') {
            return {
                minValue: 0.707,
                maxValue: 18.707,
                step: 0.1,
                formatDisplayValue: (value) => Number(value).toFixed(2)
            }
        }
        return {
            minValue: 0,
            maxValue: 1,
            step: 0.05,
            formatDisplayValue: null
        }
    }

    createMixerCtrl = (mixerCtrlDiv) => {
        Utils.recursiveClear(mixerCtrlDiv)
        const paramDiv = document.createElement('div')
        paramDiv.className = ""
        this.createMixerCtrlParam(paramDiv)
        mixerCtrlDiv.appendChild(paramDiv)
    }

    createMixerCtrlParam = (paramDiv) => {
        const mixer = MfGlobals.mfMixer;
        if (!mixer || !mixer.compressor) return;

        /* ---------- HELPERS ---------- */
        const createCtrlWrapper = () => {
            const div = document.createElement("div");
            div.className = "mf-button-wrapper";
            div.style.display = "inline-block";
            div.style.padding = "5px";
            paramDiv.appendChild(div);
            return div;
        };

        const ctx = MfGlobals.audioCtx;

        /* ---------- MASTER GAIN ---------- */
        const gainNode = mixer.masterGain?.gain;
        if (gainNode) {
            const div = createCtrlWrapper();
            MfGlobals.mfRotativeBtn.addRotativeBtn(div, "Gain", gainNode.value, (v) => {
                gainNode.setTargetAtTime(v, ctx.currentTime, 0.01);
            }, { isNormalized: false, min: 0, max: 10, step: 0.1 });
        }

        /* ---------- THRESHOLD ---------- */
        const thrNode = mixer.compressor.threshold;
        if (thrNode) {
            const div = createCtrlWrapper();
            MfGlobals.mfRotativeBtn.addRotativeBtn(div, "Thresh", thrNode.value, (v) => {
                thrNode.setTargetAtTime(v, ctx.currentTime, 0.01);
            }, { isNormalized: false, min: -60, max: 0, step: 0.5 });
        }

        /* ---------- RATIO ---------- */
        const ratioNode = mixer.compressor.ratio;
        if (ratioNode) {
            const div = createCtrlWrapper();
            MfGlobals.mfRotativeBtn.addRotativeBtn(div, "Ratio", ratioNode.value, (v) => {
                ratioNode.setTargetAtTime(v, ctx.currentTime, 0.01);
            }, { isNormalized: false, min: 1, max: 20, step: 0.1 });
        }

        /* ---------- ATTACK ---------- */
        const attackNode = mixer.compressor.attack;
        if (attackNode) {
            const div = createCtrlWrapper();
            MfGlobals.mfRotativeBtn.addRotativeBtn(div, "Attack", attackNode.value, (v) => {
                attackNode.setTargetAtTime(v, ctx.currentTime, 0.01);
            }, { isNormalized: false, min: 0.001, max: 0.2, step: 0.001 });
        }

        /* ---------- RELEASE ---------- */
        const releaseNode = mixer.compressor.release;
        if (releaseNode) {
            const div = createCtrlWrapper();
            MfGlobals.mfRotativeBtn.addRotativeBtn(div, "Release", releaseNode.value, (v) => {
                releaseNode.setTargetAtTime(v, ctx.currentTime, 0.01);
            }, { isNormalized: false, min: 0.01, max: 1.0, step: 0.001 });
        }
    }

    createLfoCtrl = (lfoCtrlDiv) => {
        Utils.recursiveClear(lfoCtrlDiv)
        const mainDiv = Utils.createMfElement("div", null, "box-h", lfoCtrlDiv)
        this.createLfoCtrlMain(mainDiv)

        const lfoCtrlDiv2 = Utils.createMfElement("div", null, "box-v", lfoCtrlDiv)
        lfoCtrlDiv2.className = 'box-v'

        const paramDiv = Utils.createMfElement("div", null, "box-h", lfoCtrlDiv2)
        this.createLfoCtrlParam(paramDiv)

        //const freqDiv = Utils.createMfElement("div", null, "box-h", lfoCtrlDiv2)
        //this.createLfoCtrlFreq(freqDiv)
    }

    createFxCtrl = (fxCtrlDiv) => {
        Utils.recursiveClear(fxCtrlDiv)
        const mainDiv = Utils.createMfElement("div", null, "box-h", fxCtrlDiv)
        const onFxToggle = (event) => {
            const track = MfGlobals.patterns[MfGlobals.selectedPatternNum].tracks[MfGlobals.selectedTrackNum]
            if (event.target.checked) {
                if (track.reverbType === "none") {
                    track.reverbType = "room"
                }
                if (!track.reverbAmount || track.reverbAmount <= 0) {
                    track.reverbAmount = 0.3
                }
                if (!track.saturationType) {
                    track.saturationType = "soft"
                }
                if (!track.saturationAmount || track.saturationAmount <= 0) {
                    track.saturationAmount = 0.2
                }
            } else {
                track.reverbType = "none"
                track.reverbAmount = 0
                track.saturationAmount = 0
            }
            MfGlobals.mfUpdates.updateFxPanel()
        }
        this.addTitleBox(mainDiv, "fxOnOff", "fxname", onFxToggle, null)

        const fxCtrlDiv2 = Utils.createMfElement("div", null, "box-v", fxCtrlDiv)
        fxCtrlDiv2.className = 'box-v'

        const paramDiv = Utils.createMfElement("div", null, "box-h", fxCtrlDiv2)
        this.createFxCtrlParam(paramDiv)
    }

    createFxCtrlParam = (paramDiv) => {
        const track = MfGlobals.patterns[MfGlobals.selectedPatternNum].tracks[MfGlobals.selectedTrackNum]
        track.reverbType ??= "none"
        track.reverbAmount ??= 0
        track.saturationType ??= "soft"
        track.saturationAmount ??= 0

        const wrapper = Utils.createMfElement("div", null, "mf-button-sl", paramDiv)
        wrapper.style.display = "flex"
        wrapper.style.flexDirection = "column"
        wrapper.style.alignItems = "stretch"
        wrapper.style.gap = "6px"
        wrapper.style.margin = "6px"
        wrapper.style.minWidth = "220px"

        const select = Utils.createMfElement("select", "trackFxReverbType", null, wrapper)
        select.style.padding = "6px"
        select.style.background = "#111"
        select.style.color = "#eee"
        select.style.border = "1px solid #444"
        select.style.borderRadius = "4px"

        const reverbTypes = ["none", "room", "hall", "plate", "spring", "gated"]
        reverbTypes.forEach((reverbType) => {
            const option = Utils.createMfElement("option", null, null, select)
            option.value = reverbType
            option.text = reverbType
            if (track.reverbType === reverbType) {
                option.selected = true
            }
        })

        select.addEventListener('change', () => {
            const currentTrack = MfGlobals.patterns[MfGlobals.selectedPatternNum].tracks[MfGlobals.selectedTrackNum]
            currentTrack.reverbType = select.value
            MfGlobals.mfUpdates.updateFxPanel()
        })

        const amountContainer = Utils.createMfElement("div", null, "mf-button-sl", wrapper)
        MfGlobals.mfSliderBtn.addSliderBtn(
            amountContainer,
            "RevAmt",
            track.reverbAmount,
            (value) => {
                const currentTrack = MfGlobals.patterns[MfGlobals.selectedPatternNum].tracks[MfGlobals.selectedTrackNum]
                currentTrack.reverbAmount = parseFloat(value)
            },
            {
                min: 0,
                max: 1,
                step: 0.05,
                isNormalized: true
            }
        )

        const saturationContainer = Utils.createMfElement("div", null, "mf-button-sl", wrapper)
        const saturationTypeSelect = Utils.createMfElement("select", "trackFxSaturationType", null, saturationContainer)
        saturationTypeSelect.style.padding = "6px"
        saturationTypeSelect.style.background = "#111"
        saturationTypeSelect.style.color = "#eee"
        saturationTypeSelect.style.border = "1px solid #444"
        saturationTypeSelect.style.borderRadius = "4px"

        ;["soft", "hard", "tape"].forEach((saturationType) => {
            const option = Utils.createMfElement("option", null, null, saturationTypeSelect)
            option.value = saturationType
            option.text = saturationType
            if (track.saturationType === saturationType) {
                option.selected = true
            }
        })

        saturationTypeSelect.addEventListener('change', () => {
            const currentTrack = MfGlobals.patterns[MfGlobals.selectedPatternNum].tracks[MfGlobals.selectedTrackNum]
            currentTrack.saturationType = saturationTypeSelect.value
            MfGlobals.mfUpdates.updateFxPanel()
        })

        MfGlobals.mfSliderBtn.addSliderBtn(
            saturationContainer,
            "Sat",
            track.saturationAmount,
            (value) => {
                const currentTrack = MfGlobals.patterns[MfGlobals.selectedPatternNum].tracks[MfGlobals.selectedTrackNum]
                currentTrack.saturationAmount = parseFloat(value)
            },
            {
                min: 0,
                max: 1,
                step: 0.05,
                isNormalized: true
            }
        )
    }

    createLfoCtrlMain = (mainDiv) => {
        const _this = this
        const selPat = MfGlobals.patterns[MfGlobals.selectedPatternNum]
        const selTrack = selPat.tracks[MfGlobals.selectedTrackNum]
        let selLfo = selTrack[MfGlobals.selectedLfo]
        if (!selLfo) {
            selLfo = { "name": 'noname' }
        }

        const onclickCb = function (event) {
            if (event.target.checked) {
                const selPat = MfGlobals.patterns[MfGlobals.selectedPatternNum]
                const selTrack = selPat.tracks[MfGlobals.selectedTrackNum]
                const lfoRangeConfig = _this.getLfoRangeConfig(MfGlobals.selectedLfo)
                selTrack[MfGlobals.selectedLfo] = {
                    "name": "lfo",
                    "freq": 1,
                    "min": lfoRangeConfig.minValue,
                    "max": lfoRangeConfig.maxValue,
                    "phase": 0
                }
            } else {
                const selPat = MfGlobals.patterns[MfGlobals.selectedPatternNum]
                const selTrack = selPat.tracks[MfGlobals.selectedTrackNum]
                selTrack[MfGlobals.selectedLfo] = null
            }
            MfGlobals.mfUpdates.updateTrackCtrl(MfGlobals.selectedTrackNum)
        }
        this.addTitleBox(mainDiv, "lfoOnOff", "lfoname", onclickCb, null)
    }

    createLfoCtrlParam = (paramDiv) => {
        const selPat = MfGlobals.patterns[MfGlobals.selectedPatternNum];
        const selTrack = selPat.tracks[MfGlobals.selectedTrackNum];

        // Récupération du LFO sélectionné via la clé globale (ex: 'pitchLfo')
        let selLfo = selTrack[MfGlobals.selectedLfo];

        // Initialisation par défaut si le LFO n'existe pas encore
        const lfoRangeConfig = this.getLfoRangeConfig(MfGlobals.selectedLfo);
        if (!selLfo) {
            selLfo = { min: lfoRangeConfig.minValue, max: lfoRangeConfig.maxValue, phase: 0 };
        }

        // Configuration des paramètres du LFO
        const lfoParams = [
            { label: "Min", prop: "min", min: lfoRangeConfig.minValue, max: lfoRangeConfig.maxValue, step: lfoRangeConfig.step, isNorm: false, formatDisplayValue: lfoRangeConfig.formatDisplayValue },
            { label: "Max", prop: "max", min: lfoRangeConfig.minValue, max: lfoRangeConfig.maxValue, step: lfoRangeConfig.step, isNorm: false, formatDisplayValue: lfoRangeConfig.formatDisplayValue },
            { label: "Phase", prop: "phase", min: 0, max: 1, step: 0.05, isNorm: true },
            { label: "Freq", prop: "freq", min: 1, max: 16, step: 1, isNorm: false }
        ];

        lfoParams.forEach(param => {
            // 1. Création du conteneur parent (le bouton)
            const container = Utils.createMfElement("div", null, "mf-button-sl", paramDiv);

            // 2. Injection du slider avec la nouvelle signature :
            // (container, label, initialValue, onChange, options)
            MfGlobals.mfSliderBtn.addSliderBtn(
                container,
                param.label,
                selLfo[param.prop],
                (value) => {
                    // On récupère la référence actuelle à chaque changement
                    const currentTrack = MfGlobals.patterns[MfGlobals.selectedPatternNum].tracks[MfGlobals.selectedTrackNum];
                    const currentLfo = currentTrack[MfGlobals.selectedLfo];

                    if (currentLfo) {
                        currentLfo[param.prop] = parseFloat(value);
                    }
                },
                {
                    min: param.min,
                    max: param.max,
                    step: param.step,
                    isNormalized: param.isNorm,
                    formatDisplayValue: param.formatDisplayValue ?? null
                }
            );
        });
    }

    createNoteCtrl = (noteCtrlDiv) => {
        Utils.recursiveClear(noteCtrlDiv);

        const onclickCb = () => {
            const selPat = MfGlobals.patterns[MfGlobals.selectedPatternNum];
            const selTrack = selPat.tracks[MfGlobals.selectedTrackNum];
            const selNote = MfGlobals.mfCmd.isNoteAt(selTrack, MfGlobals.selectedNoteBar, MfGlobals.selectedNoteStep)[0];

            if (selNote) {
                MfGlobals.mfCmd.deleteNote(selTrack, selNote);
            } else {
                MfGlobals.mfCmd.addNote(selTrack, MfGlobals.selectedNoteBar, MfGlobals.selectedNoteStep);
            }
            MfGlobals.mfUpdates.updatePatternView(selPat, MfGlobals.displayBars);
            MfGlobals.mfPatterns.computeFlatNotesFromPattern(selPat);
        };

        const mainDiv = document.createElement('div');
        mainDiv.className = "box-h";
        this.addTitleBox(mainDiv, "noteCtrlChkId", "noteCtrlLblId", onclickCb, null);
        noteCtrlDiv.appendChild(mainDiv);

        const subDiv = document.createElement('div');
        subDiv.className = "box-v";

        // Création des conteneurs de paramètres
        const sections = [
            { id: 'param', method: this.createNoteCtrlParam },
            { id: 'trigger', method: this.createNoteCtrlTrigger },
            { id: 'repeat', method: this.createNoteCtrlRepeat },
            { id: 'arp', method: this.createNoteCtrlArp }
        ];

        sections.forEach(sec => {
            const div = document.createElement('div');
            div.className = "box-h";
            subDiv.appendChild(div);
            sec.method(div);
        });

        noteCtrlDiv.appendChild(subDiv);
        document.getElementById('noteCtrlLblId').innerText = "Note Controls";
    }

    createNoteCtrlParam = (paramDiv) => {
        // Récupération de la note sélectionnée ou objet par défaut
        let selNote = MfGlobals.mfUpdates.getSelectedNote() || { "pitch": 0, "velo": 1, "pano": 0 };

        // Configuration des paramètres spécifiques à la note
        const noteParams = [
            { label: "Pitch", prop: "pitch", min: -12, max: 12, step: 1, isNorm: false },
            { label: "Velo", prop: "velo", min: 0, max: 1, step: 0.05, isNorm: true },
            { label: "Pano", prop: "pano", min: -1, max: 1, step: 0.1, isNorm: false }
        ];

        noteParams.forEach(param => {
            // 1. Création du conteneur parent
            const container = Utils.createMfElement("div", null, "mf-button-sl", paramDiv);

            // 2. Appel de addSliderBtn
            MfGlobals.mfSliderBtn.addSliderBtn(
                container,
                param.label,
                selNote[param.prop],
                (value) => {
                    // On récupère la note actuelle à chaque changement pour être sûr de modifier la bonne
                    const currentNote = MfGlobals.mfUpdates.getSelectedNote();
                    if (currentNote) {
                        currentNote[param.prop] = parseFloat(value);
                    }
                },
                {
                    min: param.min,
                    max: param.max,
                    step: param.step,
                    isNormalized: param.isNorm
                }
            );
        });
    }

    createNoteCtrlTrigger = (paramDiv) => {
        const selNote = MfGlobals.mfUpdates.getSelectedNote() || { triggFreq: 0, triggPhase: 0 };

        const controls = [
            { label: "Trigg_Freq", prop: "triggFreq", min: 1, max: 16 },
            { label: "Trigg_Phas", prop: "triggPhase", min: 0, max: 15 }
        ];

        controls.forEach(ctrl => {
            const container = Utils.createMfElement("div", null, "mf-button-sl", paramDiv);
            MfGlobals.mfSliderBtn.addSliderBtn(
                container,
                ctrl.label,
                selNote[ctrl.prop],
                (value) => {
                    const note = MfGlobals.mfUpdates.getSelectedNote();
                    if (note) note[ctrl.prop] = parseInt(value);
                },
                { min: ctrl.min, max: ctrl.max, step: 1, isNormalized: false }
            );
        });
    }

    createNoteCtrlRepeat = (paramDiv) => {
        const selNote = MfGlobals.mfUpdates.getSelectedNote() || {
            retriggNum: 1,
            retriggStep: 1,
            euclidianFill: 0
        };

        const controls = [
            { label: "Rep_Num", prop: "retriggNum", min: 0, max: 16 },
            { label: "Rep_Step", prop: "retriggStep", min: 1, max: 16 },
            { label: "Eucl_Fill", prop: "euclidianFill", min: 0, max: 8 }
        ];

        controls.forEach(ctrl => {
            const container = Utils.createMfElement("div", null, "mf-button-sl", paramDiv);
            MfGlobals.mfSliderBtn.addSliderBtn(
                container,
                ctrl.label,
                selNote[ctrl.prop],
                (value) => {
                    const note = MfGlobals.mfUpdates.getSelectedNote();
                    if (note) note[ctrl.prop] = parseInt(value);
                },
                { min: ctrl.min, max: ctrl.max, step: 1, isNormalized: false }
            );
        });
    }

    createNoteCtrlArp = (paramDiv) => {
        const selNote = MfGlobals.mfUpdates.getSelectedNote() || { arp: null }
        const currentArp = this.normalizeArpForUi(selNote.arp)
        const scaleNames = Object.keys(MfGlobals.scales).sort((a, b) => a.localeCompare(b))

        const wrapper = Utils.createMfElement("div", null, "mf-button-sl", paramDiv)
        wrapper.style.display = "flex"
        wrapper.style.flexDirection = "column"
        wrapper.style.alignItems = "stretch"
        wrapper.style.gap = "6px"
        wrapper.style.margin = "6px"
        wrapper.style.minWidth = "220px"

        const title = Utils.createMfElement("div", null, "mf-button", wrapper)
        title.innerText = "Arp"
        title.style.margin = "0"

        const scaleSelect = Utils.createMfElement("select", "noteCtrlArpScale", null, wrapper)
        scaleSelect.style.padding = "6px"
        scaleSelect.style.background = "#111"
        scaleSelect.style.color = "#eee"
        scaleSelect.style.border = "1px solid #444"
        scaleSelect.style.borderRadius = "4px"

        const ensureScaleOptions = () => {
            scaleSelect.replaceChildren()

            const emptyOption = Utils.createMfElement("option", null, null, scaleSelect)
            emptyOption.value = ""
            emptyOption.text = "No arp"

            const availableScaleNames = Object.keys(MfGlobals.scales).sort((a, b) => a.localeCompare(b))
            availableScaleNames.forEach((scaleName) => {
                const option = Utils.createMfElement("option", null, null, scaleSelect)
                option.value = scaleName
                option.text = scaleName
                if (currentArp.scaleName === scaleName) {
                    option.selected = true
                }
            })
        }

        ensureScaleOptions()

        if (scaleNames.length === 0 && MfGlobals.mfResourcesLoader) {
            MfGlobals.mfResourcesLoader.loadScales(MfGlobals.urlscales, ensureScaleOptions)
        }

        const controlsRow = Utils.createMfElement("div", null, null, wrapper)
        controlsRow.style.display = "flex"
        controlsRow.style.gap = "6px"
        controlsRow.style.alignItems = "center"
        controlsRow.style.flexWrap = "wrap"

        const modeSelect = Utils.createMfElement("select", "noteCtrlArpMode", null, controlsRow)
        modeSelect.style.flex = "1"
        modeSelect.style.minWidth = "120px"
        modeSelect.style.padding = "6px"
        modeSelect.style.background = "#111"
        modeSelect.style.color = "#eee"
        modeSelect.style.border = "1px solid #444"
        modeSelect.style.borderRadius = "4px"

        ;["up", "down", "updown"].forEach((mode) => {
            const option = Utils.createMfElement("option", null, null, modeSelect)
            option.value = mode
            option.text = mode
            if (currentArp.mode === mode) {
                option.selected = true
            }
        })

        const applyArp = () => {
            const note = MfGlobals.mfUpdates.getSelectedNote()
            if (!note) {
                return
            }

            const selectedScaleName = scaleSelect.value
            if (!selectedScaleName) {
                note.arp = null
                return
            }

            const scale = MfGlobals.scales[selectedScaleName]
            const intervals = Array.isArray(scale?.scaleSteps) ? [...scale.scaleSteps] : []
            if (intervals.length === 0) {
                note.arp = null
                return
            }

            note.arp = {
                scaleName: selectedScaleName,
                intervals,
                mode: modeSelect.value
            }
        }

        scaleSelect.addEventListener('change', applyArp)
        modeSelect.addEventListener('change', applyArp)
    }

    normalizeArpForUi = (arp) => {
        if (Array.isArray(arp)) {
            return {
                scaleName: this.findScaleNameFromIntervals(arp),
                mode: 'up'
            }
        }

        if (typeof arp === 'string') {
            return {
                scaleName: this.findScaleNameFromIntervals(
                    arp.split(',').map((value) => Number(value.trim())).filter((value) => Number.isFinite(value))
                ),
                mode: 'up'
            }
        }

        if (arp && typeof arp === 'object') {
            return {
                scaleName: arp.scaleName ?? this.findScaleNameFromIntervals(arp.intervals ?? []),
                mode: arp.mode ?? 'up'
            }
        }

        return {
            scaleName: '',
            mode: 'up'
        }
    }

    findScaleNameFromIntervals = (intervals) => {
        if (!Array.isArray(intervals) || intervals.length === 0) {
            return ''
        }

        const normalized = [...intervals].map((value) => Number(value)).filter((value) => Number.isFinite(value)).join(',')
        for (const [scaleName, scale] of Object.entries(MfGlobals.scales)) {
            const scaleSteps = Array.isArray(scale?.scaleSteps) ? scale.scaleSteps.join(',') : ''
            if (scaleSteps === normalized) {
                return scaleName
            }
        }
        return ''
    }

    createTrackCtrl = (trackCtrlDiv) => {
        console.log('mfCreateIhm::createTrackCtrl')
        Utils.recursiveClear(trackCtrlDiv)
        const onCheckBox = function () {
            const track = MfGlobals.patterns[MfGlobals.selectedPatternNum].tracks[MfGlobals.selectedTrackNum]
            MfGlobals.mfUpdates.trackToggleMute(track)
            MfGlobals.mfUpdates.updateSelectedPattern()
        }
        this.addTitleBox(trackCtrlDiv, "trackNameChkBtn", "trackNameBtn", onCheckBox, null)

        const bDiv = document.createElement('div')
        bDiv.className = "box-v"
        const sndDiv = document.createElement('div')
        sndDiv.className = "box-h"
        bDiv.appendChild(sndDiv)
        this.createTrackCtrlSoundPanel(sndDiv)

        const paramDiv = document.createElement('div')
        paramDiv.className = "box-h"
        bDiv.appendChild(paramDiv)
        this.createTrackCtrlParamPanel(paramDiv)

        const filterDiv = document.createElement('div')
        filterDiv.className = "box-h"
        bDiv.appendChild(filterDiv)
        this.createTrackCtrlFilterPanel(filterDiv)

        trackCtrlDiv.appendChild(bDiv)
    }

    createTrackCtrlSoundPanel = (paramDiv) => {
        const track = MfGlobals.patterns[MfGlobals.selectedPatternNum].tracks[MfGlobals.selectedTrackNum];
        const controls = [
            { label: "Length", prop: "sampleLength", min: 0, max: 1, step: 0.05 },
        ];
        controls.forEach(ctrl => {
            const container = Utils.createMfElement("div", null, "mf-button-sl", paramDiv);

            MfGlobals.mfSliderBtn.addSliderBtn(
                container,
                ctrl.label,
                track[ctrl.prop],
                (value) => {
                    track[ctrl.prop] = parseFloat(value);
                },
                {
                    min: ctrl.min,
                    max: ctrl.max,
                    step: ctrl.step,
                    isNormalized: true
                }
            );
        });


        const btnAuto = MfGlobals.mfComponents.addTwostatesBtn('trackCtrlAutoSound', 'auto')
        btnAuto.onclick = async function (event) {
            const track = MfGlobals.patterns[MfGlobals.selectedPatternNum].tracks[MfGlobals.selectedTrackNum]
            track.autoSound = true
            track.generated = false
            const mfAutoAssign = await MfGlobals.getAutoAssign()
            mfAutoAssign.autoAssignTrackSounds(track, MfGlobals.selectedTrackNum)
            MfGlobals.mfUpdates.updateTrackCtrl(MfGlobals.selectedTrackNum)
            MfGlobals.mfPatterns.computeFlatNotesFromPattern(MfGlobals.patterns[MfGlobals.selectedPatternNum])
        }

        const btnPick = MfGlobals.mfComponents.addTwostatesBtn("trackCtrlPickSound", "pick")
        btnPick.onclick = async function (event) {
            const track = MfGlobals.patterns[MfGlobals.selectedPatternNum].tracks[MfGlobals.selectedTrackNum]
            track.generated = false
            const mfSampleIhm = await MfGlobals.mfUpdates.getSampleIhm()
            mfSampleIhm.displayModalDialogPickSound()
        }

        const btnGen = MfGlobals.mfComponents.addTwostatesBtn("trackCtrlGenSound", "synth")
        btnGen.onclick = async function (event) {
            const track = MfGlobals.patterns[MfGlobals.selectedPatternNum].tracks[MfGlobals.selectedTrackNum]
            track.generated = true
            track.autoSound = false
            MfGlobals.mfUpdates.updateTrackCtrl(MfGlobals.selectedTrackNum)
            const mfSoftSynthIhm = await MfGlobals.mfUpdates.getSoftSynthIhm()
            mfSoftSynthIhm.displayModalDialogGenSound()
        }
        const btnShow = MfGlobals.mfComponents.addLbl("trackCtrlShowSound", "show")
        btnShow.style.backgroundColor = 'black';
        const btnMono = MfGlobals.mfComponents.addTwostatesBtn("trackCtrlMono", "mono")
        btnMono.onclick = function (event) {
            const track = MfGlobals.patterns[MfGlobals.selectedPatternNum].tracks[MfGlobals.selectedTrackNum]
            track.mono = !track.mono
            MfGlobals.mfUpdates.updateTrackCtrl(MfGlobals.selectedTrackNum)
        }

        const aDiv = document.createElement('div')
        aDiv.className = "box-v"
        aDiv.appendChild(btnAuto)
        aDiv.appendChild(btnPick)
        aDiv.appendChild(btnGen)
        aDiv.appendChild(btnMono)

        paramDiv.appendChild(aDiv)
        paramDiv.appendChild(btnShow)

    }

    createTrackCtrlParamPanel = (paramDiv) => {
        // Raccourci vers la piste sélectionnée
        const track = MfGlobals.patterns[MfGlobals.selectedPatternNum].tracks[MfGlobals.selectedTrackNum];

        const controls = [
            { label: "Pitch", prop: "pitch", lfo: 'pitchLfo', min: -12, max: 12, step: 1 },
            { label: "Velo", prop: "velo", lfo: 'veloLfo', min: 0, max: 1, step: 0.05 },
            { label: "Pano", prop: "pano", lfo: 'panoLfo', min: -1, max: 1, step: 0.1 },
            { label: "Swing", prop: "swingDepth", lfo: 'swingLfo', min: 0, max: 1, step: 0.1 }
        ];

        controls.forEach(ctrl => {
            const container = Utils.createMfElement("div", null, "mf-button-sl", paramDiv);

            MfGlobals.mfSliderBtn.addSliderBtn(
                container,
                ctrl.label,
                track[ctrl.prop],
                (value) => {
                    track[ctrl.prop] = parseFloat(value);
                },
                {
                    lfo: ctrl.lfo,
                    min: ctrl.min,
                    max: ctrl.max,
                    step: ctrl.step,
                    isNormalized: false,
                    formatDisplayValue: ctrl.prop === 'filterFreq'
                        ? this.formatTrackFilterFreq
                        : this.formatTrackFilterQ
                }
            );
        });
    }

    createTrackCtrlFilterPanel = (paramDiv) => {
        const track = MfGlobals.patterns[MfGlobals.selectedPatternNum].tracks[MfGlobals.selectedTrackNum];
        let inputBoxFilterType = MfGlobals.mfComponents.addListInputBox("Fltr Type", "trackCtrlFilterType",
            Utils.filterTypeList,
            MfGlobals.patterns[MfGlobals.selectedPatternNum].tracks[MfGlobals.selectedTrackNum].filterType,
            function (value) {
                const track = MfGlobals.patterns[MfGlobals.selectedPatternNum].tracks[MfGlobals.selectedTrackNum]
                track.filterType = value
            })
        paramDiv.appendChild(inputBoxFilterType)


        const controls = [
            { label: "Fltr_F", prop: "filterFreq", lfo: 'filterFreqLfo', min: 20, max: 20000, step: 10 },
            { label: "Fltr_Q", prop: "filterQ", lfo: 'filterQLfo', min: 0.707, max: 18.707, step: 0.1 }
        ];

        controls.forEach(ctrl => {
            const container = Utils.createMfElement("div", null, "mf-button-sl", paramDiv);

            MfGlobals.mfSliderBtn.addSliderBtn(
                container,
                ctrl.label,
                track[ctrl.prop],
                (value) => {
                    track[ctrl.prop] = parseFloat(value);
                },
                {
                    lfo: ctrl.lfo,
                    min: ctrl.min,
                    max: ctrl.max,
                    step: ctrl.step,
                    isNormalized: false
                }
            );
        });
    }


    addTitleBox = (panel, idCheckBox, idLabel, chkBoxClick, labelClick) => {
        const aDiv = Utils.createMfElement("div", null, "mf-title-box-c", panel)
        const lblDiv = Utils.createMfElement("div", idLabel, "labelLong", aDiv)
        lblDiv.innerText = ""
        lblDiv.onclick = labelClick
        const inputDiv = Utils.createMfElement("input", idCheckBox, null, aDiv)
        inputDiv.type = "checkbox"
        inputDiv.onclick = chkBoxClick
    }

}
