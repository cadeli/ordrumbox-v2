import { showToast } from '../core/notify.js'
import { initClickBursts } from '../core/click_bursts.js'
import { clamp, toFiniteNumber } from '../core/numbers.js'
import { isMobileViewport } from '../core/constants.js'
import { isLandscape, watchOrientation } from '../core/device.js'
import { serviceRegistry } from '../state/service_registry.js'
import { playbackEvents } from '../state/playback_events.js'
import { logger } from '../core/logger.js'
import { EVENTS } from '../core/events.js'
import { initKeyboardShortcuts } from '../keyboard_shortcuts.js'
import { initServiceWorker } from '../service_worker.js'

/** Global window/DOM listeners and bus subscriptions. Call once at startup. */
export function initGlobalListeners() {
    // Device/orientation classes: `html.is-compact` mirrors isMobileViewport()
    // so the CSS (converted media queries) and the JS verdict can never
    // diverge — updated synchronously on every resize (no debounce), while
    // ORIENTATION_CHANGE (debounced, flip only) drives layout re-application.
    const syncDeviceClasses = () => {
        document.documentElement.classList.toggle('is-compact', isMobileViewport())
        document.documentElement.dataset.orientation = isLandscape() ? 'landscape' : 'portrait'
    }
    syncDeviceClasses()
    window.addEventListener('resize', syncDeviceClasses)
    watchOrientation(({ landscape }) => {
        syncDeviceClasses()
        playbackEvents.emit(EVENTS.ORIENTATION_CHANGE, { landscape })
    })

    window.addEventListener('unhandledrejection', (event) => {
        logger.error('Main', 'Unhandled promise rejection', event.reason)
        showToast('Unexpected error: ' + (event.reason?.message ?? event.reason), 'error')
    })

    if (window.orientation > 1) {
        // Vendor-prefixed variants are missing from the DOM types
        const de = /** @type {Document['documentElement'] & Record<string, () => void>} */ (document.documentElement)
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
            serviceRegistry.cmd.setSelectedTrackIdx(data.trackIdx)
        }
    })

    playbackEvents.on(EVENTS.STALL, (/** @type {{reason?: string}} */ payload = {}) => {
        const { reason } = payload
        if (reason === 'context-suspended') {
            showToast('Audio suspended by the browser — click Play to resume', 'warning')
        } else {
            showToast('Audio playback stalled', 'warning')
        }
    })
    // STALL_RESUME was emitted on every recovery but had no subscriber: nothing
    // ever told the user playback came back on its own.
    playbackEvents.on(EVENTS.STALL_RESUME, () => {
        showToast('Audio playback resumed', 'info')
    })
    playbackEvents.on(EVENTS.WORKLET_STATUS_CHANGE, (status) => {
        if (status === 'unavailable') {
            showToast('Audio engine unavailable — synth and effects disabled', 'error')
        }
    })

    // --tb-h drives the panel offsets below the fixed toolbar. #tb is rendered
    // after this module runs, so watch for its insertion before observing it.
    const watchToolbarHeight = (el) => {
        const setHeight = () => {
            document.documentElement.style.setProperty('--tb-h', `${Math.round(el.getBoundingClientRect().height)}px`)
        }
        const ro = new ResizeObserver(setHeight)
        ro.observe(el)
        setHeight()
    }
    const tbEl = document.getElementById('tb')
    if (tbEl) {
        watchToolbarHeight(tbEl)
    } else if (document.body) {
        const mo = new MutationObserver(() => {
            const el = document.getElementById('tb')
            if (!el) return
            mo.disconnect()
            watchToolbarHeight(el)
        })
        mo.observe(document.body, { childList: true, subtree: true })
    }

    // Delegated range-slider arrow-key stepping — kept in sync with tests/slider_keyboard.test.js
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
        const el = e.target
        if (!(el instanceof HTMLInputElement) || el.type !== 'range') return
        if (el.disabled || el.readOnly) return

        const min = toFiniteNumber(parseFloat(el.min), 0, 'min')
        const max = toFiniteNumber(parseFloat(el.max), 100, 'max')
        const step = toFiniteNumber(parseFloat(el.step), 1, 'step')
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
        const slider = /** @type {HTMLInputElement|null} */ (row.querySelector('input[type="range"]'))
        if (slider && !slider.disabled) slider.focus()
    })

    initKeyboardShortcuts()
    initServiceWorker()
    initClickBursts()
}
