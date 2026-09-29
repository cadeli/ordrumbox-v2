import { vi } from 'vitest'
import { logger } from '../src/core/logger.js'

logger.setLevel(logger.LEVELS.ERROR)

const stubContext = () => ({
    fillRect: vi.fn(),
    clearRect: vi.fn(),
    getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(0) })),
    putImageData: vi.fn(),
    createImageData: vi.fn(() => ({ data: new Uint8ClampedArray(0) })),
    setTransform: vi.fn(),
    drawImage: vi.fn(),
    save: vi.fn(),
    fillText: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    stroke: vi.fn(),
    translate: vi.fn(),
    scale: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    measureText: vi.fn(() => ({ width: 0 })),
    transform: vi.fn(),
    rect: vi.fn(),
    clip: vi.fn(),
    setLineDash: vi.fn(),
    canvas: { width: 0, height: 0 },
    getByteTimeDomainData: vi.fn(),
    getByteFrequencyData: vi.fn(),
})

if (typeof HTMLCanvasElement !== 'undefined') {
    // Cache the stub context per canvas so repeated getContext() calls
    // return the same object (matches browser behavior and lets tests
    // assert on drawing calls made by production code).
    HTMLCanvasElement.prototype.getContext = function getContext() {
        if (!this.__stubCtx) this.__stubCtx = stubContext()
        return this.__stubCtx
    }
}

if (typeof ResizeObserver === 'undefined') {
    globalThis.ResizeObserver = class ResizeObserver {
        constructor() {}
        observe() {}
        unobserve() {}
        disconnect() {}
    }
}
