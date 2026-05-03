import { MfGlobals } from '../mfglobals.js'
import Utils from '../utils.js'

export default class MfRotativeBtn {
    static TAG = "MFROTATIVEBTN"

    constructor(label) {
        this.label = label
    }

    addRotativeBtn = (container, label, initialValue = 0.5, onChange, options = {}) => {
        const config = {
            min: options.min ?? 0,
            max: options.max ?? 1,
            step: options.step ?? 0.01,
            isNormalized: options.isNormalized ?? true
        };

        const wrapper = document.createElement('div');
        wrapper.className = 'knob-wrapper';
        wrapper.style.cssText = `
            text-align: center; 
            display: inline-block; 
            margin: 15px; 
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            user-select: none;
            touch-action: none; /* Empêche le scroll sur mobile */
        `;

        const valueDisplay = document.createElement('div');
        valueDisplay.style.cssText = `
            font-size: 13px; color: #ffcc00; margin-bottom: 8px; 
            font-family: 'Courier New', monospace; font-weight: bold;
            text-shadow: 0 0 5px rgba(255, 204, 0, 0.4); height: 15px;
        `;

        const knob = document.createElement('div');
        knob.className = 'knob-circle';
        knob.style.cssText = `
            width: 50px; height: 50px; border-radius: 50%; 
            background: radial-gradient(circle, #444 0%, #222 100%); 
            border: 3px solid #555; position: relative; 
            cursor: ns-resize; margin: 0 auto; transition: border-color 0.2s;
        `;

        const pointer = document.createElement('div');
        pointer.style.cssText = `
            width: 4px; height: 18px; background: #00ffcc; 
            position: absolute; top: 4px; left: 23px; 
            border-radius: 2px; transform-origin: bottom center;
            pointer-events: none;
        `;
        knob.appendChild(pointer);

        const labelEl = document.createElement('div');
        labelEl.innerText = label.toUpperCase();
        labelEl.style.cssText = `
            font-size: 14px; font-weight: 900; color: #ffffff; 
            margin-top: 10px; letter-spacing: 1.5px; text-transform: uppercase;
        `;

        wrapper.appendChild(valueDisplay);
        wrapper.appendChild(knob);
        wrapper.appendChild(labelEl);
        container.appendChild(wrapper);

        /* ---------- LOGIQUE DE CALCUL (CONSERVÉE) ---------- */

        let internalVal = config.isNormalized 
            ? initialValue 
            : (initialValue - config.min) / (config.max - config.min);

        let isDragging = false;
        let lastY = 0;

        const updateUI = (normVal) => {
            const rotation = (normVal * 270) - 135; 
            knob.style.transform = `rotate(${rotation}deg)`;

            if (config.isNormalized) {
                valueDisplay.innerText = normVal.toFixed(2);
            } else {
                const realVal = normVal * (config.max - config.min) + config.min;
                const steppedVal = Math.round(realVal / config.step) * config.step;
                valueDisplay.innerText = steppedVal.toFixed(2);
            }
        };

        const handleMove = (clientY) => {
            if (!isDragging) return;
            
            // Calcul relatif basé sur le déplacement vertical (deltaY)
            // Identique à ta version originale
            const deltaY = lastY - clientY;
            lastY = clientY;
            
            internalVal += deltaY / 200; // Sensibilité
            internalVal = Math.min(Math.max(internalVal, 0), 1);

            updateUI(internalVal);

            if (onChange) {
                const realVal = config.isNormalized 
                    ? internalVal 
                    : internalVal * (config.max - config.min) + config.min;
                const steppedVal = Math.round(realVal / config.step) * config.step;
                onChange(steppedVal);
            }
        };

        updateUI(internalVal);

        /* ---------- GESTION DES ÉVÉNEMENTS ---------- */

        // Fonction commune pour démarrer le drag
        const startDrag = (clientY) => {
            isDragging = true;
            lastY = clientY;
            knob.style.borderColor = '#00ffcc';
        };

        // SOURIS (Originale préservée)
        knob.addEventListener('mousedown', (e) => {
            startDrag(e.clientY);
            e.preventDefault();
        });

        window.addEventListener('mousemove', (e) => {
            handleMove(e.clientY);
        });

        window.addEventListener('mouseup', () => {
            isDragging = false;
            knob.style.borderColor = '#555';
        });

        // TACTILE (Adaptation Mobile)
        knob.addEventListener('touchstart', (e) => {
            // On prend le premier point de contact
            startDrag(e.touches[0].clientY);
            // On ne fait pas preventDefault ici pour laisser le clic LFO possible si besoin
        });

        window.addEventListener('touchmove', (e) => {
            if (isDragging) {
                handleMove(e.touches[0].clientY);
                // Important : empêcher le scroll uniquement pendant qu'on tourne le bouton
                if (e.cancelable) e.preventDefault();
            }
        }, { passive: false });

        window.addEventListener('touchend', () => {
            isDragging = false;
            knob.style.borderColor = '#555';
        });

        /* ---------- MÉTHODES PUBLIQUES ---------- */

        wrapper.destroy = () => {
            // Nettoyage complet
            wrapper.remove();
        };

        wrapper.externalUpdate = (val) => {
            internalVal = config.isNormalized 
                ? val 
                : (val - config.min) / (config.max - config.min);
            updateUI(internalVal);
        };

        return wrapper;
    }
}