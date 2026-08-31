// src/ui/pattern_panel/PlaybackOverlaySection.js
// Playhead animation, VU meter updates, waveform canvas drawing, RAF loop.

import { TICK, BEATS_PER_PAGE } from '../../core/constants.js'
import { appState } from '../../state/app_state.js'
import Utils from '../../core/utils.js'
import { color } from '../theme.js'

export default class PlaybackOverlaySection {
    /** @type {import('./pattern_panel.js').default} */
    #editor;
    /** @type {number | null} */
    #rafId;
    /** @type {HTMLDivElement | null} */
    #playhead;
    /** @type {number} */
    #prevLoopTick;
    /** @type {HTMLCanvasElement | null} */
    #waveformCanvas;
    /** @type {HTMLElement | null} */
    #tracksEl;
    /** @type {NodeListOf<HTMLElement> | null} */
    #vuElCache;

    /** @param {import('./pattern_panel.js').default} editor */
    constructor(editor) {
        this.#editor = editor
        this.#rafId = null
        this.#playhead = null
        this.#prevLoopTick = -1
        this.#waveformCanvas = null
        this.#tracksEl = null
        this.#vuElCache = null
    }

    ensurePlayhead() {
        const editor = this.#editor
        if (!this.#playhead || !editor.container.contains(this.#playhead)) {
            if (this.#playhead) this.#playhead.remove()
            this.#playhead = document.createElement('div')
            this.#playhead.className = 'pp-playhead'
            this.#playhead.style.display = 'none'
            this.#playhead.style.position = 'absolute'
            this.#playhead.style.left = '0'
            this.#playhead.style.top = '0'
            this.#playhead.style.bottom = '0'
            this.#playhead.style.width = '2px'
            this.#playhead.style.zIndex = '10'
            this.#playhead.style.pointerEvents = 'none'
            this.#playhead.style.willChange = 'transform'
            const header = editor.container.querySelector('.pp-header')
            if (header) {
                header.appendChild(this.#playhead)
            } else {
                editor.container.appendChild(this.#playhead)
            }
        }
    }

    hidePlayhead() {
        if (this.#playhead) this.#playhead.style.display = 'none'
    }

    resetPrevLoopTick() {
        this.#prevLoopTick = -1
    }

    startRafLoop() {
        if (this.#rafId) return
        const editor = this.#editor
        this.#waveformCanvas = editor.container?.querySelector('.pp-waveform-overlay')
        this.#tracksEl = editor.container?.querySelector('.pp-tracks')
        this.#vuElCache = editor.container?.querySelectorAll('.pp-vu')

        const loop = () => {
            const transport = editor._serviceRegistry.transport
            const mixer = editor._serviceRegistry.audioEngine?.mixer
            if (!transport?.isRunning || !mixer || !editor.container) {
                this.#rafId = null
                this.hidePlayhead()
                this.#resetVuAndWaveform()
                return
            }

            this.#updateVus(mixer)
            this.#drawWaveform(mixer)
            this.#updatePlayhead()

            this.#rafId = requestAnimationFrame(loop)
        }
        this.#rafId = requestAnimationFrame(loop)
    }

    stopRafLoop() {
        if (this.#rafId) {
            cancelAnimationFrame(this.#rafId)
            this.#rafId = null
        }
        this.#waveformCanvas = null
        this.#tracksEl = null
        this.#vuElCache = null
    }

    #updateVus(mixer) {
        if (appState.showVus === false) return
        if (!this.#vuElCache) {
            this.#vuElCache = this.#editor.container?.querySelectorAll('.pp-vu')
            if (!this.#vuElCache) return
        }
        const strips = mixer.strips
        const vuEls = this.#vuElCache
        const currentPattern = appState.patterns[appState.selectedPatternNum]
        const tracks = Utils.getTracksArray(currentPattern)
        for (let i = 0; i < vuEls.length; i++) {
            const vuEl = vuEls[i]
            let tIdx = vuEl._tIdx
            if (tIdx === undefined) {
                tIdx = vuEl._tIdx = parseInt(vuEl.dataset.track, 10)
            }
            const track = tracks?.[tIdx]
            const strip = track?.name ? strips[track.name] : null
            const level = strip?.getLevel ? strip.getLevel() : 0

            let fill = vuEl._fill
            if (!fill) fill = vuEl._fill = vuEl.querySelector('.pp-vu-fill')

            if (fill) {
                const roundedPct = Math.round(Math.min(level * 10, 1) * 100)
                if (vuEl._lastPct !== roundedPct) {
                    vuEl._lastPct = roundedPct
                    fill.style.height = roundedPct + '%'
                }
            }
        }
    }

    #drawWaveform(mixer) {
        if (appState.showVus === false) return
        const editor = this.#editor
        if (!this.#waveformCanvas) {
            this.#waveformCanvas = editor.container?.querySelector('.pp-waveform-overlay')
        }
        const canvas = this.#waveformCanvas
        if (!canvas || !editor._layoutCache) return

        if (!this.#tracksEl) {
            this.#tracksEl = editor.container?.querySelector('.pp-tracks')
        }
        const tracksEl = this.#tracksEl
        if (!tracksEl) return

        const dpr = window.devicePixelRatio ?? 1

        const firstBeatCache = editor._beatRectsCache[appState.currentPage * 4]
        const lastBeatIdx = Math.min(editor._beatRectsCache.length - 1, (appState.currentPage + 1) * 4 - 1)
        const lastBeatCache = editor._beatRectsCache[lastBeatIdx]

        if (!firstBeatCache || !lastBeatCache) return

        const { containerLeft, containerRight, tracksLeft, tracksHeight } = editor._layoutCache

        const visibleLeft = Math.max(firstBeatCache.absLeft, containerLeft)
        const visibleRight = Math.min(lastBeatCache.absRight, containerRight)
        const vW = Math.max(0, visibleRight - visibleLeft)
        const vH = tracksHeight

        if (vW <= 0 || vH <= 0) {
            if (canvas.style.display !== 'none') canvas.style.display = 'none'
            return
        }
        if (canvas.style.display !== 'block') canvas.style.display = 'block'

        const canvasLeft = (visibleLeft - tracksLeft) + 'px'
        const canvasTop = (tracksEl.scrollTop ?? 0) + 'px'
        const canvasWidth = vW + 'px'
        const canvasHeight = vH + 'px'

        if (canvas.style.left !== canvasLeft) canvas.style.left = canvasLeft
        if (canvas.style.top !== canvasTop) canvas.style.top = canvasTop
        if (canvas.style.width !== canvasWidth) canvas.style.width = canvasWidth
        if (canvas.style.height !== canvasHeight) canvas.style.height = canvasHeight

        const w = Math.round(vW * dpr)
        const h = Math.round(vH * dpr)

        if (canvas.width !== w || canvas.height !== h) {
            canvas.width = w
            canvas.height = h
        }

        const ctx = canvas.getContext('2d')
        if (!ctx) return

        const data = editor._serviceRegistry.audioEngine?.getAnalyserData?.()
        if (!data) {
            ctx.fillStyle = color('bg-canvas')
            ctx.fillRect(0, 0, w, h)
            return
        }

        data.analyser.getByteTimeDomainData(data.dataArray)

        ctx.fillStyle = color('bg-canvas')
        ctx.fillRect(0, 0, w, h)

        ctx.strokeStyle = color('color-success')
        ctx.lineWidth = 2 * dpr
        ctx.beginPath()

        const len = data.dataArray.length
        const sliceW = w / len
        const mid = h * 0.5
        const step = len > w && w > 0 ? Math.max(1, Math.floor(len / w)) : 1

        let first = true
        for (let i = 0; i < len; i += step) {
            const v = (data.dataArray[i] - 128) / 128
            const x = i * sliceW
            const y = v * h * 0.45 + mid
            if (first) {
                ctx.moveTo(x, y)
                first = false
            } else {
                ctx.lineTo(x, y)
            }
        }
        ctx.stroke()
    }

    syncVusVisibility() {
        const editor = this.#editor
        if (!editor.container) return
        const hidden = appState.showVus === false
        editor.container.classList.toggle('pp-vus-hidden', hidden)

        if (hidden && this.#waveformCanvas) {
            this.#waveformCanvas.style.display = ''
        }
    }

    resetVuAndWaveform() {
        this.#resetVuAndWaveform()
    }

    #resetVuAndWaveform() {
        const editor = this.#editor
        if (!editor.container) return
        const vuEls = this.#vuElCache ?? editor.container.querySelectorAll('.pp-vu')
        for (const vuEl of vuEls) {
            vuEl._lastPct = 0
            const fill = vuEl.querySelector('.pp-vu-fill')
            if (fill) {
                fill.style.height = '0%'
            }
        }
        const canvas = editor.container.querySelector('.pp-waveform-overlay')
        if (canvas) {
            const ctx = canvas.getContext('2d')
            if (ctx) {
                ctx.fillStyle = color('bg-canvas')
                ctx.fillRect(0, 0, canvas.width, canvas.height)
            }
        }
    }

    #updatePlayhead() {
        const editor = this.#editor
        const transport = editor._serviceRegistry.transport
        if (!transport?.isRunning) return

        const pattern = appState.patterns[appState.selectedPatternNum]
        if (!pattern || !editor.container || !editor._layoutCache) return
        this.ensurePlayhead()

        const nbTicks = TICK * (pattern.nbBeats ?? 4)
        if (nbTicks <= 0) return

        const loopTick = (transport.tick ?? 0) % nbTicks

        if (loopTick === this.#prevLoopTick && this.#playhead.style.display !== 'none') return
        this.#prevLoopTick = loopTick

        const currentPatternBeat = Math.floor(loopTick / TICK)
        const startBeat = appState.currentPage * BEATS_PER_PAGE
        const endBeat = startBeat + BEATS_PER_PAGE

        if (currentPatternBeat < startBeat || currentPatternBeat >= endBeat) {
            const newPage = Math.floor(currentPatternBeat / BEATS_PER_PAGE)
            if (newPage !== appState.currentPage) {
                appState.currentPage = newPage
                editor.requestSync()
                editor._playbackEvents.batch(() => {
                    editor._playbackEvents.emit("patternMetaChange")
                    editor._playbackEvents.emit("patternChange")
                })
            }
            if (this.#playhead.style.display !== 'none') this.#playhead.style.display = 'none'
            return
        }

        const beatCache = editor._beatRectsCache[currentPatternBeat]
        if (!beatCache) {
            if (this.#playhead.style.display !== 'none') this.#playhead.style.display = 'none'
            return
        }

        const tickInBar = loopTick % TICK
        const normInBar = tickInBar / TICK

        if (this.#playhead.style.display !== 'block') this.#playhead.style.display = 'block'
        const x = beatCache.left + normInBar * beatCache.width

        this.#playhead.style.transform = `translate3d(${x}px, 0, 0)`
    }

    /** Clear loop element caches (called after full sync). */
    clearCaches() {
        this.#waveformCanvas = null
        this.#tracksEl = null
        this.#vuElCache = null
    }
}
