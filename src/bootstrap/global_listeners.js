import { showToast } from '../core/notify.js'
import { clamp } from '../audio/math.js'
import Utils from '../core/utils.js'
import { serviceRegistry } from '../state/service_registry.js'
import { playbackEvents } from '../state/playback_events.js'
import { logger } from '../core/logger.js'
import { EVENTS } from '../core/events.js'
import { initKeyboardShortcuts } from '../keyboard_shortcuts.js'
import { initServiceWorker } from '../service_worker.js'

/** Global window/DOM listeners and bus subscriptions. Call once at startup. */
export function initGlobalListeners() {
    window.addEventListener('unhandledrejection', (event) => {
        logger.error('Main', 'Unhandled promise rejection', event.reason)
        showToast('Unexpected error: ' + (event.reason?.message ?? event.reason), 'error')
    })

    if (window.orientation > 1) {
        const de = document.documentElement
        if (de.requestFullscreen) {
            de.requestFullscreen()
        } else if (de.mozRequestFullScreen) {
            de.mozRequestFullScreen()
        } else if (de.webkitRequestFullscreen) {
            de.webkitRequestFullscreen()
        } else if (de.msRequestFullscreen) {
            de.msRequestFullscreen()
        }
        screen.orientation.lock('landscape-primary')
    }

    playbackEvents.on(EVENTS.TRACK_SELECT, (data) => {
        if (data && data.trackIdx !== undefined) {
            serviceRegistry.cmd.setSelectedTrackNum(data.trackIdx)
        }
    })

    playbackEvents.on(EVENTS.STALL, ({ reason } = {}) => {
        if (reason === 'context-suspended') {
            showToast('Audio suspended by the browser — click Play to resume', 'warning')
        } else {
            showToast('Audio playback stalled', 'warning')
        }
    })
    playbackEvents.on(EVENTS.WORKLET_STATUS_CHANGE, (status) => {
        if (status === 'unavailable') {
            showToast('Audio engine unavailable — synth and effects disabled', 'error')
        }
    })

    const tbEl = document.getElementById('tb')
    if (tbEl) {
        const ro = new ResizeObserver((entries) => {
            for (const entry of entries) {
                document.documentElement.style.setProperty('--tb-h', `${entry.contentRect.height}px`)
            }
        })
        ro.observe(tbEl)
        document.documentElement.style.setProperty('--tb-h', `${tbEl.getBoundingClientRect().height}px`)
    }

    // Delegated range-slider arrow-key stepping — kept in sync with tests/slider_keyboard.test.js
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
        const el = e.target
        if (!(el instanceof HTMLInputElement) || el.type !== 'range') return
        if (el.disabled || el.readOnly) return

        const min = Utils.toFiniteNumber(parseFloat(el.min), 0, 'min')
        const max = Utils.toFiniteNumber(parseFloat(el.max), 100, 'max')
        const step = Utils.toFiniteNumber(parseFloat(el.step), 1, 'step')
        const cur = parseFloat(el.value)
        const dir = e.key === 'ArrowRight' ? 1 : -1
        let next = cur + dir * step
        next = Math.round((next - min) / step) * step + min
        next = clamp(next, min, max)

        if (next === cur) {
            e.preventDefault()
            return
        }
        el.value = String(next)
        el.dispatchEvent(new Event('input', { bubbles: true }))
        el.dispatchEvent(new Event('change', { bubbles: true }))
        e.preventDefault()
    })

    document.addEventListener('click', (e) => {
        const t = e.target
        if (!(t instanceof HTMLElement)) return
        const isLabel = t.tagName === 'LABEL'
        const isValue = t instanceof HTMLSpanElement && t.classList.contains('ne-val')
        if (!isLabel && !isValue) return
        const row = t.closest('.ne-row')
        if (!row) return
        const slider = row.querySelector('input[type="range"]')
        if (slider && !slider.disabled) slider.focus()
    })

    initKeyboardShortcuts()
    initServiceWorker()
}
