import { vi } from 'vitest'
import { logger } from '../src/core/logger.js'

logger.setLevel(logger.LEVELS.ERROR)

// Inject minimal CSS for jsdom tests (jsdom doesn't load <link> stylesheets)
if (typeof document !== 'undefined') {
    const style = document.createElement('style')
    style.textContent = `
.ne-tab-panel-hidden { display: none !important; }
.ne-row-hidden { display: none !important; }
.fx-tab-panel-hidden { display: none !important; }
.ne-row-label { min-width: 20px; }
.ne-row-separator { border-top: 1px solid #444; margin-top: 6px; padding-top: 6px; }
.ne-val-wide { min-width: 60px; }
.ss-body-empty { padding: 20px; color: #666; text-align: center; }
.ss-tb-btn-boolean { font-size: 9px; height: 22px; padding: 0 8px; }
.fx-icon-row { display: flex; gap: 3px; align-items: center; }
`
    document.head.appendChild(style)
}

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
    canvas: { width: 0, height: 0 },
    getByteTimeDomainData: vi.fn(),
    getByteFrequencyData: vi.fn(),
})

if (typeof HTMLCanvasElement !== 'undefined') {
    HTMLCanvasElement.prototype.getContext = stubContext
}
