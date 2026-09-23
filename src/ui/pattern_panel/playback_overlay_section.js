// src/ui/pattern_panel/PlaybackOverlaySection.js
// Playhead animation, VU meter updates, RAF loop.

import { TICK, BEATS_PER_PAGE } from '../../core/constants.js'

import { appState } from '../../state/app_state.js'
import Utils from '../../core/utils.js'
import { color } from '../theme.js'

export default class PlaybackOverlaySection {
    /** @type {import('./pattern_panel.js').default} */
    #editor
    /** @type {number | null} */
    #rafId
    /** @type {HTMLDivElement | null} */
    #playhead
    /** @type {number} */
    #prevLoopTick
    /** @type {HTMLCanvasElement | null} */
    #waveformCanvas
    /** @type {NodeListOf<HTMLElement> | null} */
    #vuElCache

    /** @param {import('./pattern_panel.js').default} editor */
    constructor(editor) {
        this.#editor = editor
        this.#rafId = null
        this.#playhead = null
        this.#prevLoopTick = -1
        this.#waveformCanvas = null
        this.#vuElCache = null
    }

    ensurePlayhead() {
        const editor = this.#editor
        if (!this.#playhead || !editor.container.contains(this.#playhead)) {
            if (this.#playhead) this.#playhead.remove()
            this.#playhead = document.createElement('div')
            this.#playhead.className = 'pp-playhead'
            this.#playhead.style.display = 'none'
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
        if (this.#waveformCanvas) this.#waveformCanvas.style.display = ''
        this.#vuElCache = editor.container?.querySelectorAll('.pp-vu')

        const loop = () => {
            const transport = editor.serviceRegistry.transport
            const mixer = editor.serviceRegistry.audioEngine?.mixer
            if (!transport?.isRunning || !mixer || !editor.container) {
                this.#rafId = null
                this.hidePlayhead()
                this.#resetVuAndWaveform()
                return
            }

            this.#updateVus(mixer)
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
                ctx.fillStyle = color('surface-2')
                ctx.fillRect(0, 0, canvas.width, canvas.height)
            }
            canvas.style.display = 'none'
        }
    }

    #updatePlayhead() {
        const editor = this.#editor
        const transport = editor.serviceRegistry.transport
        if (!transport?.isRunning) return

        const pattern = appState.patterns[appState.selectedPatternNum]
        if (!pattern || !editor.container || !editor.layoutCache) return
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
                editor.playbackEvents.batch(() => {
                    editor.playbackEvents.emit('patternMetaChange')
                    editor.playbackEvents.emit('patternChange')
                })
            }
            if (this.#playhead.style.display !== 'none') this.#playhead.style.display = 'none'
            return
        }

        const beatCache = editor.beatRectsCache[currentPatternBeat]
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
        this.#vuElCache = null
    }
}
