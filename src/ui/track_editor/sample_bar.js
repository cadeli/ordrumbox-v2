// src/ui/track_editor/sample_bar.js
// Sample bar — analysis text (pitch / duration / peak), waveform drawing,
// and sample file import. The rows are static HTML from the coordinator's
// createDOM(); sync() only updates text and repaints the canvas.

import { showToast } from '../../core/notify.js'
import { logger } from '../../core/logger.js'
import { sampleWaveformTheme } from '../theme.js'
import { analyzeSample, clearAnalysisCache, drawDecayMarker, drawEnvelope } from '../../audio/sample_analyzer.js'
import { emitTrackChanged } from '../../state/event_bus.js'

export default class SampleBar {
    #editor
    #sampleBarEl
    #sampleInfoEl
    #waveCanvas
    #waveObserver
    /** @type {HTMLCanvasElement|null} */
    #waveObservedCanvas = null

    /** @param {import('../track_editor.js').default} editor */
    /** @param {import('../track_editor.js').default} editor */
    constructor(editor) {
        this.#editor = editor
    }

    /**
     * Cache the DOM refs built once by TrackEditor.createDOM().
     * @param {HTMLElement} root
     */
    mount(root) {
        this.#sampleBarEl = root.querySelector('.te-sample-bar')
        this.#sampleInfoEl = root.querySelector('.te-sample-info')
        this.#waveCanvas = root.querySelector('canvas.te-waveform')
    }

    /** Toggle the sample bar and refresh its analysis text. @param {import('../../model/track_schema.js').Track} track */
    sync(track) {
        const sound = track.useSoftSynth ? null : this.#editor.soundRegistry.sounds[track.sampleId ?? '']
        if (!sound?.buffer) {
            this.#sampleBarEl.style.display = 'none'
            return
        }
        this.#sampleBarEl.style.display = ''
        const analysis = analyzeSample(sound.buffer)
        const pitchStr = analysis?.noteInfo ? `${analysis.noteInfo.note}${analysis.noteInfo.octave}` : '—'
        const durStr = analysis?.durationSec != null ? (analysis.durationSec * 1000).toFixed(0) + ' ms' : '—'
        const peakStr = analysis?.peakDb != null ? analysis.peakDb.toFixed(1) + ' dB' : '—'
        this.#sampleInfoEl.textContent = `${pitchStr} · ${durStr} · ${peakStr}`
    }

    /** Redraw the envelope and decay marker. @param {import('../../model/track_schema.js').Track} track */
    draw(track) {
        const canvas = this.#waveCanvas
        if (!canvas || !track) return
        if (track.useSoftSynth) return
        const sound = this.#editor.soundRegistry.sounds[track?.sampleId]
        if (!sound?.buffer) return
        const analysis = analyzeSample(sound.buffer)
        if (!analysis?.envelope?.length) return

        // The canvas box is set by CSS (66% of the sample bar), so the fixed
        // 500px backing store was scaled down and the curve landed on
        // sub-pixel lines. Match the backing store to the rendered size.
        const dpr = window.devicePixelRatio || 1
        const w = canvas.clientWidth > 0 ? Math.max(1, Math.round(canvas.clientWidth * dpr)) : canvas.width
        const h = canvas.clientHeight > 0 ? Math.max(1, Math.round(canvas.clientHeight * dpr)) : canvas.height
        if (canvas.width !== w || canvas.height !== h) {
            canvas.width = w
            canvas.height = h
        }
        this.#observeWaveformCanvas(canvas)

        const ctx = /** @type {HTMLCanvasElement} */ (canvas).getContext('2d')
        const theme = sampleWaveformTheme(2 * dpr)
        drawEnvelope(ctx, analysis.envelope, w, h, theme)

        drawDecayMarker(ctx, sound, w, h, theme, dpr)
    }

    /** Open the OS file picker behind the load button. */
    openFilePicker() {
        const input = this.#editor.container?.querySelector('.te-load-input')
        if (input) /** @type {HTMLElement} */ (input).click()
    }

    /** Replace the track's sample buffer with the chosen file. @param {Event} e */
    async onFileSelected(e) {
        const file = /** @type {HTMLInputElement} */ (e.target).files?.[0]
        const track = this.#editor.track
        if (!file || !track) return
        const ctx = this.#editor.serviceRegistry.audioCtx
        if (!ctx) return
        try {
            const arrayBuffer = await file.arrayBuffer()
            const buffer = await ctx.decodeAudioData(arrayBuffer)
            const sampleId = track.sampleId ?? ''
            const oldSound = this.#editor.soundRegistry.sounds[sampleId]
            if (oldSound) {
                clearAnalysisCache(oldSound.buffer)
                oldSound.buffer = buffer
                oldSound.display_name = file.name
                oldSound.duration = Math.floor(buffer.duration * 1000)
            } else {
                this.#editor.soundRegistry.sounds[sampleId] = {
                    url: sampleId,
                    key: sampleId,
                    display_name: file.name,
                    buffer,
                    duration: Math.floor(buffer.duration * 1000),
                    isLoad: true,
                }
            }
            this.#editor.sync()
            emitTrackChanged(this.#editor.track, this.#editor.playbackEvents)
        } catch (err) {
            logger.warn('TrackEditor', `Sample import failed: ${err.message}`)
            showToast('Sample import failed: ' + err.message, 'error')
        }
        const input = /** @type {HTMLInputElement} */ (e.target)
        input.value = ''
    }

    destroy() {
        this.#waveObserver?.disconnect()
        this.#waveObserver = null
        this.#waveObservedCanvas = null
    }

    /** Redraw the waveform when its CSS box changes (window / panel resize). */
    #observeWaveformCanvas(canvas) {
        if (typeof ResizeObserver !== 'function' || this.#waveObservedCanvas === canvas) return
        this.#waveObserver?.disconnect()
        this.#waveObservedCanvas = canvas
        this.#waveObserver = new ResizeObserver(() => this.draw(this.#editor.track))
        this.#waveObserver.observe(canvas)
    }
}
