import { MfGlobals } from '../mfglobals.js'
import Utils from '../utils.js'

export default class MfSliderBtn {
    static TAG = "MFSLIDERBTN"

    constructor(label) {
        this.label = label
    }

    addSliderBtn = (container, label, initialValue = 0.5, onChange, options = {}) => {
        const config = {
            lfo: options.lfo ?? '',
            min: options.min ?? 0,
            max: options.max ?? 1,
            step: options.step ?? 0.01,
            isNormalized: options.isNormalized ?? true,
            formatDisplayValue: options.formatDisplayValue ?? null
        };

        // 1. LE CONTENEUR PRINCIPAL
        const wrapper = document.createElement('div');
        wrapper.className = 'slider-horizontal-wrapper';
        wrapper.id = 'trackCtrl' + label;
        wrapper.tabIndex = 0; // Permet de recevoir le focus pour le clavier
        wrapper.style.cssText = `
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin: 5px;
            padding: 4px;
            background: rgba(0,0,0,0.2);
            border-radius: 4px;
            font-family: 'Segoe UI', sans-serif;
            user-select: none;
            width: 200px;
            outline: none;
        `;

        // Style focus pour ordinateur
        wrapper.onfocus = () => wrapper.style.border = "1px solid #00ffcc";
        wrapper.onblur = () => wrapper.style.border = "none";

        wrapper.onclick = (event) => {
            if (config.lfo) {
                MfGlobals.selectedLfo = wrapper.getLfoNameFromLabel(label);
                MfGlobals.mfUpdates.updateLfoPanel(" LFO " + label);
            }
            event.stopPropagation();
            event.preventDefault();
        };

        // 2. LE LABEL
        const labelEl = document.createElement('div');
        labelEl.innerText = label.toUpperCase();
        labelEl.style.cssText = `
            font-size: 11px;
            font-weight: bold;
            color: #ffffff;
            width: 50px;
            text-align: left;
            letter-spacing: 0.5px;
        `;

        // 3. LA PISTE DU SLIDER
        const track = document.createElement('div');
        track.style.cssText = `
            flex-grow: 1;
            height: 6px;
            background: #111;
            border: 1px solid #444;
            border-radius: 3px;
            margin: 0 15px;
            position: relative;
            cursor: ew-resize;
            touch-action: none; /* Empêche le scroll pendant le drag sur mobile */
        `;

        const handle = document.createElement('div');
        handle.style.cssText = `
            width: 10px;
            height: 18px;
            background: #666;
            border: 1px solid #888;
            border-radius: 2px;
            position: absolute;
            top: -7px;
            left: 0;
            box-shadow: 0 0 5px rgba(0,0,0,0.5);
            pointer-events: none;
        `;

        const progress = document.createElement('div');
        progress.style.cssText = `
            position: absolute;
            left: 0;
            top: 0;
            height: 100%;
            background: #00ffcc;
            border-radius: 3px;
            width: 0%;
            pointer-events: none;
        `;

        track.appendChild(progress);
        track.appendChild(handle);

        const valueDisplay = document.createElement('div');
        valueDisplay.style.cssText = `
            font-size: 12px;
            color: #ffcc00;
            font-family: monospace;
            font-weight: bold;
            width: 40px;
            text-align: right;
        `;

        wrapper.appendChild(labelEl);
        wrapper.appendChild(track);
        wrapper.appendChild(valueDisplay);
        container.appendChild(wrapper);

        /* ---------- LOGIQUE ---------- */

        let internalVal = 0;

        const getSteppedRealValue = (normVal) => {
            const realVal = config.isNormalized
                ? normVal
                : normVal * (config.max - config.min) + config.min;
            return Math.round(realVal / config.step) * config.step;
        };

        const updateUI = (normVal) => {
            const percent = Math.min(Math.max(normVal * 100, 0), 100);
            handle.style.left = `calc(${percent}% - 5px)`;
            progress.style.width = `${percent}%`;

            const steppedVal = getSteppedRealValue(normVal);
            if (typeof config.formatDisplayValue === 'function') {
                valueDisplay.innerText = config.formatDisplayValue(steppedVal);
            } else if (config.isNormalized) {
                valueDisplay.innerText = normVal.toFixed(2);
            } else {
                valueDisplay.innerText = steppedVal.toFixed(2);
            }
        };

        const triggerChange = () => {
            if (onChange) {
                onChange(getSteppedRealValue(internalVal));
            }
        };

        wrapper.setValue = (newValue) => {
            if (config.isNormalized) {
                internalVal = newValue;
            } else {
                internalVal = (newValue - config.min) / (config.max - config.min);
            }
            internalVal = Math.min(Math.max(internalVal, 0), 1);
            updateUI(internalVal);
        };

        wrapper.setValue(initialValue);

        /* ---------- INPUTS (MOUSE, TOUCH, KEYBOARD) ---------- */

        let isDragging = false;

        const handleMove = (clientX) => {
            const rect = track.getBoundingClientRect();
            let norm = (clientX - rect.left) / rect.width;
            internalVal = Math.min(Math.max(norm, 0), 1);
            updateUI(internalVal);
            triggerChange();
        };

        // Souris
        const onMouseDown = (e) => {
            isDragging = true;
            handle.style.background = '#00ffcc';
            handleMove(e.clientX);
            wrapper.focus();
        };

        // Toucher (Mobile)
        const onTouchStart = (e) => {
            isDragging = true;
            handle.style.background = '#00ffcc';
            handleMove(e.touches[0].clientX);
            wrapper.focus();
        };

        window.addEventListener('mousemove', (e) => { if (isDragging) handleMove(e.clientX); });
        window.addEventListener('touchmove', (e) => { if (isDragging) handleMove(e.touches[0].clientX); }, { passive: false });

        window.addEventListener('mouseup', () => { isDragging = false; handle.style.background = '#666'; });
        window.addEventListener('touchend', () => { isDragging = false; handle.style.background = '#666'; });

        track.addEventListener('mousedown', onMouseDown);
        track.addEventListener('touchstart', onTouchStart);

        // Clavier (Flèches)
        wrapper.addEventListener('keydown', (e) => {
            let step = config.isNormalized ? 0.05 : (config.step / (config.max - config.min));
            if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
                internalVal = Math.min(internalVal + step, 1);
                updateUI(internalVal);
                triggerChange();
                e.preventDefault();
            } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
                internalVal = Math.max(internalVal - step, 0);
                updateUI(internalVal);
                triggerChange();
                e.preventDefault();
            }
        });

        /* ---------- UTILITAIRES ---------- */

        wrapper.getLfoNameFromLabel = (label) => {
            const l = label.toUpperCase();
            if (l.includes("PITCH")) return "pitchLfo";
            if (l.includes("VELO")) return "veloLfo";
            if (l.includes("PANO")) return "panoLfo";
            if (l.includes("FLTR_Q")) return "filterQLfo";
            if (l.includes("FLTR_F")) return "filterFreqLfo";
            return "unknownLfo";
        };

        wrapper.destroy = () => { wrapper.remove(); };

        return wrapper;
    }
}
