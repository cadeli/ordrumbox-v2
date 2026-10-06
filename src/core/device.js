// src/core/device.js
// Device-class detection (user agent) + orientation watching.
// Pure module: no imports outside core — see tests/module_graph.test.js.

/**
 * Device class derived from the user agent.
 * Size is deliberately NOT part of this classification: a narrow desktop
 * window is still a desktop, and a large tablet is still a tablet.
 * @returns {'phone' | 'tablet' | 'desktop'}
 */
export function detectDeviceClass() {
    if (typeof navigator === 'undefined') return 'desktop'
    const userAgent = navigator.userAgent || ''
    const platform = navigator.platform || ''

    // iPadOS 13+ masquerades as desktop Safari (Macintosh + multi-touch)
    if (/iPad/.test(userAgent) || (platform === 'MacIntel' && (navigator.maxTouchPoints ?? 0) > 1)) {
        return 'tablet'
    }
    // Windows Phone UAs may embed an "Android" compat token → check first
    if (/Windows Phone|IEMobile|Opera Mini|webOS|BlackBerry|BB10/i.test(userAgent)) {
        return 'phone'
    }
    // Android: phones carry "Mobi"/"Mobile", tablets do not
    if (/Android/.test(userAgent)) {
        return /Mobi|Mobile/i.test(userAgent) ? 'phone' : 'tablet'
    }
    if (/iPhone|iPod/i.test(userAgent)) {
        return 'phone'
    }
    if (/Tablet|Kindle|Silk/i.test(userAgent)) {
        return 'tablet'
    }
    if (/Mobi|Mobile|Phone/i.test(userAgent)) {
        return 'phone'
    }
    return 'desktop'
}

/** True when the device itself is a phone or a tablet (regardless of window size). */
export function isCompactDevice() {
    return detectDeviceClass() !== 'desktop'
}

/** True when the current viewport is landscape (width > height). */
export function isLandscape() {
    return typeof window !== 'undefined' && window.innerWidth > window.innerHeight
}

/**
 * Watch for orientation flips (portrait ↔ landscape).
 * Listens on screen.orientation (guarded), the legacy orientationchange
 * event and window resize; onFlip is called ONLY when the landscape flag
 * actually changes, debounced by debounceMs.
 * @param {(info: {landscape: boolean}) => void} onFlip
 * @param {object} [opts]
 * @param {number} [opts.debounceMs] - debounce window (default 150)
 * @returns {() => void} cleanup - removes every listener
 */
export function watchOrientation(onFlip, { debounceMs = 150 } = {}) {
    if (typeof window === 'undefined') return () => {}
    let lastLandscape = isLandscape()
    let timer = null

    const check = () => {
        timer = null
        const landscape = isLandscape()
        if (landscape === lastLandscape) return
        lastLandscape = landscape
        onFlip({ landscape })
    }
    const schedule = () => {
        if (timer !== null) clearTimeout(timer)
        timer = setTimeout(check, debounceMs)
    }

    const orientationApi = typeof window.screen !== 'undefined' ? window.screen.orientation : undefined
    orientationApi?.addEventListener?.('change', schedule)
    window.addEventListener('orientationchange', schedule)
    window.addEventListener('resize', schedule)

    return () => {
        if (timer !== null) clearTimeout(timer)
        orientationApi?.removeEventListener?.('change', schedule)
        window.removeEventListener('orientationchange', schedule)
        window.removeEventListener('resize', schedule)
    }
}
