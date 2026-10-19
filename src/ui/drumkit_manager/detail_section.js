// src/ui/drumkit_manager/detail_section.js
// Detail pane rendering for the selected sample: knobs, waveform, kit/instrument
// selects, replace/remove actions.

import { soundRegistry } from '../../state/sound_registry.js'
import InstrumentsManager, { instrumentsManager } from '../../logic/services/instruments_manager/index.js'
import { drawDecayMarker, drawEnvelope } from '../../audio/sample_analyzer.js'
import { formatNote } from '../../core/hz_to_note.js'
import { NOT_FOUND } from '../../core/constants.js'
import { showToast } from '../../core/notify.js'
import { renderOptions, knobFormat, formatSignedDb } from '../components/ui_utils.js'
import { escapeHtml } from '../components/ui_utils.js'
import { syncKnobs } from '../components/sync_helpers.js'
import { sampleWaveformTheme } from '../theme.js'

const SOUND_KNOB_DEFS = [
    { key: 'gain', label: 'Gain', min: -24, max: 6, step: 0.1, unit: 'dB', format: (v) => v.toFixed(1) },
    { key: 'tune', label: 'Tune', min: -12, max: 12, step: 0.1, unit: 'st', format: formatSignedDb },
    { key: 'decay', label: 'Decay', min: 20, max: 5000, step: 10, scale: 'log', unit: '', format: knobFormat({ key: 'decay' }) },
]

export default class DetailSection {
    #editor
    #detailEl

    /** @param {import('../drumkit_manager.js').default} editor @param {HTMLElement} detailEl */
    constructor(editor, detailEl) {
        this.#editor = editor
        this.#detailEl = detailEl
    }

    get detailEl() {
        return this.#detailEl
    }

    get knobDefs() {
        return SOUND_KNOB_DEFS
    }

    /** @param {string} key */
    renderDetail(key) {
        const editor = this.#editor
        const sound = soundRegistry.sounds[key]
        if (!sound) {
            this.#detailEl.innerHTML = '<div class="dm-detail-empty">Sample not found</div>'
            return
        }

        const analysis = this.#editor.serviceRegistry.drumkitService.getAnalysisInfo(sound)
        const detected = instrumentsManager.findInstrumentFromFileName(sound.display_name ?? sound.url)
        const noteStr = analysis?.noteInfo ? formatNote(analysis.noteInfo) : '—'
        const peakDb = analysis?.peakDb != null ? analysis.peakDb.toFixed(1) : '—'
        const rmsDb = analysis?.rmsDb != null ? analysis.rmsDb.toFixed(1) : '—'
        const duration = analysis?.durationSec != null ? (analysis.durationSec * 1000).toFixed(0) + ' ms' : '—'
        const decayStr = sound.decay != null ? sound.decay + ' ms' : '—'
        const tooltipText = `${detected.id !== NOT_FOUND ? 'Detected: ' + detected.id : 'No instrument detected'}\nPeak: ${peakDb} dB\nRMS: ${rmsDb} dB\nDuration: ${duration}\nDecay: ${decayStr}`

        const kitNames = soundRegistry.drumkitList.map((k) => k.name)
        if (sound.kitName && !kitNames.includes(sound.kitName)) {
            kitNames.unshift(sound.kitName)
        }
        const kitOptions = renderOptions(kitNames, sound.kitName, { escape: escapeHtml })

        const instOptions = InstrumentsManager.DATA?.instruments
            ? renderOptions(
                  InstrumentsManager.DATA.instruments.map((i) => i.id),
                  sound.key,
                  { escape: escapeHtml },
              )
            : ''

        this.#detailEl.innerHTML = `
            <div class="dm-detail-header">
                <button class="dm-play-btn dm-play-large" id="dm-detail-play" title="Audition">\u25B6</button>
                <span class="dm-detail-filename">${editor.esc(sound.display_name ?? sound.url)}</span>
            </div>
            <div class="dm-detail-columns">
                <div class="dm-detail-left">
                    <div class="dm-waveform-container">
                        <canvas id="dm-waveform" class="dm-waveform" width="300" height="80"></canvas>
                    </div>
                    <div class="dm-detail-info">
                        ${noteStr} · ${duration} · ${peakDb} dB peak · ${rmsDb} dB RMS
                    </div>
                    <div class="dm-detail-actions">
                        <button class="ne-btn" id="dm-replace" title="Replace this sample with a WAV file">Replace</button>
                        <button class="ne-btn dm-danger" id="dm-remove" title="Remove this sample from the kit">Remove</button>
                        <input type="file" id="dm-replace-file" class="hidden-file-input" accept=".wav,.flac,.mp3,.aac">
                    </div>
                </div>
                <div class="dm-detail-right">
                    <div class="dm-select-row">
                        <div class="ne-row no-cursor">
                            <label>Kit:</label>
                            <select id="dm-kit-select">${kitOptions}</select>
                        </div>
                        <div class="ne-row no-cursor" title="${editor.esc(tooltipText)}">
                            <label>Instrument:</label>
                            <select id="dm-inst-select">${instOptions}</select>
                        </div>
                    </div>
                    <div class="or-knob-bar">
                        <div data-or-knob="gain"></div>
                        <div data-or-knob="tune"></div>
                        <div data-or-knob="decay"></div>
                    </div>
                </div>
            </div>
        `

        this.syncKnobs(sound)
        this.drawWaveform(sound, analysis, { resize: true })

        editor.listen(this.#detailEl.querySelector('#dm-detail-play'), 'click', () => {
            editor.audition(sound.url)
        })

        editor.listen(this.#detailEl.querySelector('#dm-kit-select'), 'change', (e) => {
            const displayName = this.#editor.serviceRegistry.drumkitService.moveToKit(key, /** @type {HTMLInputElement} */ (e.target).value)
            if (displayName)
                showToast(
                    `Moved "${displayName}" to kit "${/** @type {HTMLInputElement} */ (e.target).value}"`,
                    'success',
                )
            editor.sync()
        })

        editor.listen(this.#detailEl.querySelector('#dm-inst-select'), 'change', (e) => {
            const displayName = this.#editor.serviceRegistry.drumkitService.setInstrument(key, /** @type {HTMLInputElement} */ (e.target).value)
            if (displayName)
                showToast(
                    `Set "${displayName}" to instrument "${/** @type {HTMLInputElement} */ (e.target).value}"`,
                    'success',
                )
            editor.sync()
        })

        editor.listen(this.#detailEl.querySelector('#dm-replace'), 'click', () => {
            this.#detailEl.querySelector('#dm-replace-file').click()
        })

        editor.listen(this.#detailEl.querySelector('#dm-replace-file'), 'change', (e) => {
            editor.onReplaceSample(key, e)
        })

        editor.listen(this.#detailEl.querySelector('#dm-remove'), 'click', () => {
            editor.removeSample(key)
        })
    }

    /** @param {import('../../state/sound_registry.js').SoundEntry} sound */
    syncKnobs(sound) {
        const editor = this.#editor
        const values = { gain: sound.gainDb ?? 0, tune: sound.tune ?? 0, decay: sound.decay ?? 0 }
        editor.knobs = [
            ...syncKnobs({
                container: this.#detailEl,
                configs: SOUND_KNOB_DEFS.map((def) => ({
                    ...def,
                    val: values[def.key],
                    onChange: (v) => editor.onKnobChange(sound, def.key, v),
                })),
                prev: new Map(editor.knobs.map((k) => [k.key, k])),
            }).values(),
        ]
    }

    /** @param {import('../../state/sound_registry.js').SoundEntry} sound @param {{envelope?: number[]}} analysis @param {{resize?: boolean}} config */
    drawWaveform(sound, analysis, { resize = false } = {}) {
        const canvas = this.#detailEl.querySelector('#dm-waveform')
        if (!canvas || !analysis?.envelope?.length) return

        const draw = () => {
            const ctx = canvas.getContext('2d')
            if (!ctx) return
            const dpr = window.devicePixelRatio || 1
            const theme = sampleWaveformTheme(2 * dpr)
            drawEnvelope(ctx, analysis.envelope, canvas.width, canvas.height, theme)
            drawDecayMarker(ctx, sound, canvas.width, canvas.height, theme, dpr)
        }

        if (resize) {
            requestAnimationFrame(() => {
                const dpr = window.devicePixelRatio || 1
                const w = canvas.clientWidth && canvas.clientWidth > 0 ? Math.round(canvas.clientWidth * dpr) : 300
                const h = canvas.clientHeight && canvas.clientHeight > 0 ? Math.round(canvas.clientHeight * dpr) : 80
                canvas.width = w
                canvas.height = h
                draw()
            })
        } else {
            draw()
        }
    }
}
