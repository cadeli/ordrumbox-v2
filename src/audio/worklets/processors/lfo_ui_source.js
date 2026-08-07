export default `
const WAVE_LIST = ["sine","triangle","sawtooth","square","random"];

function _toFinite(val, fallback) {
    const n = parseFloat(val);
    return Number.isFinite(n) ? n : fallback;
}

function _lfoWf(phase, wave) {
    const p = (phase - 0.25) - Math.floor(phase - 0.25);
    if (wave < 0.5) return Math.sin(2 * Math.PI * p);
    if (wave < 1.5) return p < 0.25 ? p * 4 - 1 : (p < 0.75 ? 3 - p * 4 : p * 4 - 5);
    if (wave < 2.5) return p * 2 - 1;
    if (wave < 3.5) return p < 0.5 ? 1 : -1;
    const c = Math.floor(phase);
    let r = ((c * 1234567 + 890123) | 0);
    r ^= r << 13; r ^= r >> 17; r ^= r << 5;
    return (r | 0) / 2147483648;
}

function _computeLfo(lfo, tick, nbTicks, key) {
    if (!lfo) return 0;
    const f = Math.min(2, _toFinite(lfo.freq, 1));
    const min = _toFinite(lfo.min, 0);
    const max = _toFinite(lfo.max, 1);
    const ph = _toFinite(lfo.phase, 0);
    const wn = lfo.type ?? lfo.waveform ?? 'sine';
    let w = WAVE_LIST.indexOf(wn);
    if (w === -1) w = _toFinite(wn, 0);

    const cp = (tick / 128) * f + ph;
    let v = _lfoWf(cp, w);
    v = (v + 1) / 2;
    v = min + v * (max - min);
    return Math.round(100 * v) / 100;
}

class LfoUiProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this.port.onmessage = (e) => {
            const { id, lfos, tick, nbTicks } = e.data;
            const vals = {};
            for (const [key, lfo] of Object.entries(lfos)) {
                vals[key] = _computeLfo(lfo, tick, nbTicks, key);
            }
            this.port.postMessage({ id, vals });
        };
    }
    process() { return true; }
}
registerProcessor('lfo-ui', LfoUiProcessor);
`
