/**
 * @vitest-environment jsdom
 *
 * Device detection (user agent) + union with viewport size + orientation watch.
 *  - detectDeviceClass: phone/tablet/desktop from the UA (size excluded)
 *  - isMobileViewport: UA class OR size (the union keeps narrow desktop
 *    windows compact — same verdict the CSS html.is-compact class uses)
 *  - watchOrientation: onFlip fires only when the landscape flag flips
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { detectDeviceClass, isCompactDevice, isLandscape, watchOrientation } from '../src/core/device.js'
import { isMobileViewport } from '../src/core/constants.js'

const UA = {
    iPhone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    androidPhone:
        'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
    androidTablet:
        'Mozilla/5.0 (Linux; Android 13; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    iPad: 'Mozilla/5.0 (iPad; CPU OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
    // iPadOS 13+ pretends to be a desktop Mac
    ipadOsMasquerade: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15',
    windowsPhone: 'Mozilla/5.0 (Windows Phone 10.0; Android 6.0.1; Microsoft; Lumia 950) Edge/15.15063',
    desktopChrome:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    kindle: 'Mozilla/5.0 (Linux; Android 9; KFTRWI) AppleWebKit/537.36 (KHTML, like Gecko) Silk/119.3.4 like Chrome/119.0.6045.163 Safari/537.36',
}

const ORIGINALS = {
    userAgent: window.navigator.userAgent,
    platform: window.navigator.platform,
    width: window.innerWidth,
    height: window.innerHeight,
}

const setNavigator = (props) => {
    for (const [key, value] of Object.entries(props)) {
        Object.defineProperty(window.navigator, key, { value, configurable: true })
    }
}
const setViewport = (width, height) => {
    Object.assign(window, { innerWidth: width, innerHeight: height })
}

beforeEach(() => {
    setViewport(1200, 800)
})
afterEach(() => {
    setNavigator({ userAgent: ORIGINALS.userAgent, platform: ORIGINALS.platform })
    delete window.navigator.maxTouchPoints
    setViewport(ORIGINALS.width, ORIGINALS.height)
    vi.useRealTimers()
})

describe('detectDeviceClass (user agent)', () => {
    it('detects iPhone as phone', () => {
        setNavigator({ userAgent: UA.iPhone })
        expect(detectDeviceClass()).toBe('phone')
    })

    it('detects Android phone (with Mobi) as phone', () => {
        setNavigator({ userAgent: UA.androidPhone })
        expect(detectDeviceClass()).toBe('phone')
    })

    it('detects Android tablet (no Mobi) as tablet', () => {
        setNavigator({ userAgent: UA.androidTablet })
        expect(detectDeviceClass()).toBe('tablet')
    })

    it('detects iPad as tablet', () => {
        setNavigator({ userAgent: UA.iPad })
        expect(detectDeviceClass()).toBe('tablet')
    })

    it('detects the iPadOS desktop masquerade (MacIntel + multi-touch) as tablet', () => {
        setNavigator({ userAgent: UA.ipadOsMasquerade, platform: 'MacIntel', maxTouchPoints: 5 })
        expect(detectDeviceClass()).toBe('tablet')
    })

    it('detects Windows Phone as phone', () => {
        setNavigator({ userAgent: UA.windowsPhone })
        expect(detectDeviceClass()).toBe('phone')
    })

    it('detects Kindle/Silk as tablet', () => {
        setNavigator({ userAgent: UA.kindle })
        expect(detectDeviceClass()).toBe('tablet')
    })

    it('detects desktop Chrome as desktop', () => {
        setNavigator({ userAgent: UA.desktopChrome })
        expect(detectDeviceClass()).toBe('desktop')
        expect(isCompactDevice()).toBe(false)
    })

    it('defaults to desktop with the jsdom UA', () => {
        setNavigator({ userAgent: ORIGINALS.userAgent })
        expect(detectDeviceClass()).toBe('desktop')
    })
})

describe('isMobileViewport (union: UA OR size)', () => {
    it('desktop UA + large viewport → not compact', () => {
        setNavigator({ userAgent: UA.desktopChrome })
        setViewport(1200, 800)
        expect(isMobileViewport()).toBe(false)
    })

    it('desktop UA + narrow window → compact (size fallback)', () => {
        setNavigator({ userAgent: UA.desktopChrome })
        setViewport(700, 800)
        expect(isMobileViewport()).toBe(true)
    })

    it('desktop UA + short window → compact (size fallback)', () => {
        setNavigator({ userAgent: UA.desktopChrome })
        setViewport(1400, 400)
        expect(isMobileViewport()).toBe(true)
    })

    it('phone UA + huge viewport → compact (UA wins)', () => {
        setNavigator({ userAgent: UA.androidPhone })
        setViewport(2000, 1200)
        expect(isMobileViewport()).toBe(true)
    })

    it('tablet UA + screen beyond the size breakpoints → compact (the gap the size check missed)', () => {
        setNavigator({ userAgent: UA.androidTablet })
        setViewport(834, 1194)
        expect(isMobileViewport()).toBe(true)
    })

    it('jsdom default UA follows the size only (existing test contract)', () => {
        setNavigator({ userAgent: ORIGINALS.userAgent })
        setViewport(768, 480)
        expect(isMobileViewport()).toBe(true)
        setViewport(1200, 800)
        expect(isMobileViewport()).toBe(false)
    })
})

describe('isLandscape', () => {
    it('is true when width > height', () => {
        setViewport(1000, 500)
        expect(isLandscape()).toBe(true)
    })
    it('is false when height >= width', () => {
        setViewport(500, 1000)
        expect(isLandscape()).toBe(false)
    })
})

describe('watchOrientation', () => {
    it('fires only on a real portrait/landscape flip (debounced)', () => {
        vi.useFakeTimers()
        const onFlip = vi.fn()
        setViewport(500, 1000)
        const stop = watchOrientation(onFlip, { debounceMs: 150 })

        // resize without a flip → nothing
        setViewport(520, 980)
        window.dispatchEvent(new Event('resize'))
        vi.advanceTimersByTime(300)
        expect(onFlip).not.toHaveBeenCalled()

        // portrait → landscape
        setViewport(1000, 520)
        window.dispatchEvent(new Event('resize'))
        vi.advanceTimersByTime(300)
        expect(onFlip).toHaveBeenCalledTimes(1)
        expect(onFlip).toHaveBeenCalledWith({ landscape: true })

        // same orientation again → nothing
        setViewport(1100, 500)
        window.dispatchEvent(new Event('resize'))
        vi.advanceTimersByTime(300)
        expect(onFlip).toHaveBeenCalledTimes(1)

        // landscape → portrait
        setViewport(500, 1100)
        window.dispatchEvent(new Event('orientationchange'))
        vi.advanceTimersByTime(300)
        expect(onFlip).toHaveBeenCalledTimes(2)
        expect(onFlip).toHaveBeenLastCalledWith({ landscape: false })

        stop()
    })

    it('stops firing after cleanup', () => {
        vi.useFakeTimers()
        const onFlip = vi.fn()
        setViewport(500, 1000)
        const stop = watchOrientation(onFlip, { debounceMs: 150 })
        stop()

        setViewport(1000, 500)
        window.dispatchEvent(new Event('resize'))
        vi.advanceTimersByTime(300)
        expect(onFlip).not.toHaveBeenCalled()
    })

    it('batches a rotation storm into one callback', () => {
        vi.useFakeTimers()
        const onFlip = vi.fn()
        setViewport(500, 1000)
        const stop = watchOrientation(onFlip, { debounceMs: 150 })

        for (let i = 0; i < 5; i++) {
            setViewport(1000 - i, 500 + i)
            window.dispatchEvent(new Event('resize'))
            vi.advanceTimersByTime(50)
        }
        vi.advanceTimersByTime(300)
        expect(onFlip).toHaveBeenCalledTimes(1)
        expect(onFlip).toHaveBeenCalledWith({ landscape: true })

        stop()
    })
})
