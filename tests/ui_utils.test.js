/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { downloadBlob } from '../src/core/download.js'
import {
    promptNumericInput,
    fmt,
    escapeHtml,
    pitchToNoteName,
    formatNoteTooltip,
    injectUiCss,
    bindCloseButton,
    bindTabToggles,
    setViewBtn,
    setViewMode,
    downloadJson,
    knobFormat,
    renderOptions,
    renderIconChoices,
    setPatternPanelHidden,
} from '../src/ui/components/ui_utils.js'

vi.mock('../src/core/download.js', () => ({
    downloadBlob: vi.fn(),
}))

describe('promptNumericInput', () => {
    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('returns null when prompt is cancelled', () => {
        vi.spyOn(window, 'prompt').mockReturnValue(null)
        expect(promptNumericInput('Gain', 0, 1, 0.5)).toBeNull()
    })

    it('returns null for empty or whitespace input', () => {
        vi.spyOn(window, 'prompt').mockReturnValueOnce('').mockReturnValueOnce('   ')
        expect(promptNumericInput('Gain', 0, 1, 0.5)).toBeNull()
        expect(promptNumericInput('Gain', 0, 1, 0.5)).toBeNull()
    })

    it('returns null for non-numeric input', () => {
        vi.spyOn(window, 'prompt').mockReturnValue('abc')
        expect(promptNumericInput('Gain', 0, 1, 0.5)).toBeNull()
    })

    it('clamps to [min, max]', () => {
        vi.spyOn(window, 'prompt').mockReturnValueOnce('99').mockReturnValueOnce('-5')
        expect(promptNumericInput('Gain', 0, 1, 0.5)).toBe(1)
        expect(promptNumericInput('Gain', 0, 1, 0.5)).toBe(0)
    })

    it('accepts a value inside the range', () => {
        vi.spyOn(window, 'prompt').mockReturnValue('0.75')
        expect(promptNumericInput('Gain', 0, 1, 0.5)).toBe(0.75)
    })

    it('uses a custom clampFn when provided', () => {
        vi.spyOn(window, 'prompt').mockReturnValue('10')
        const clampEven = (n) => (n % 2 === 0 ? n : n + 1)
        expect(promptNumericInput('X', 0, 100, 0, '', clampEven)).toBe(10)
        vi.spyOn(window, 'prompt').mockReturnValue('11')
        expect(promptNumericInput('X', 0, 100, 0, '', clampEven)).toBe(12)
    })

    it('includes unit in the prompt title', () => {
        const spy = vi.spyOn(window, 'prompt').mockReturnValue('1')
        promptNumericInput('Decay', 0, 100, 50, 'ms')
        expect(spy.mock.calls[0][0]).toContain('ms')
    })
})

describe('fmt', () => {
    it('rounds to at most 2 decimals', () => {
        expect(fmt(1.239)).toBe(1.24)
        expect(fmt(1.5)).toBe(1.5)
        expect(fmt(1)).toBe(1)
    })

    it('coerces string numbers', () => {
        expect(fmt('3.14159')).toBe(3.14)
    })

    it('returns NaN for non-numeric', () => {
        expect(fmt('abc')).toBeNaN()
    })
})

describe('escapeHtml', () => {
    it('escapes &, <, >, " in the right order', () => {
        expect(escapeHtml('&<>"')).toBe('&amp;&lt;&gt;&quot;')
        expect(escapeHtml('<script>')).toBe('&lt;script&gt;')
    })

    it('returns empty string for null/undefined', () => {
        expect(escapeHtml(null)).toBe('')
        expect(escapeHtml(undefined)).toBe('')
    })

    it('stringifies numbers', () => {
        expect(escapeHtml(42)).toBe('42')
    })
})

describe('pitchToNoteName', () => {
    it('maps pitch 0 to C4', () => {
        expect(pitchToNoteName(0)).toBe('C4')
    })

    it('applies trackPitch offset', () => {
        expect(pitchToNoteName(0, 12)).toBe('C5')
        expect(pitchToNoteName(0, -12)).toBe('C3')
    })

    it('maps pitch 12 to C5', () => {
        expect(pitchToNoteName(12)).toBe('C5')
    })

    it('maps -1 to B3 (below C4)', () => {
        expect(pitchToNoteName(-1)).toBe('B3')
    })
})

describe('formatNoteTooltip', () => {
    it('shows note name and MIDI number', () => {
        expect(formatNoteTooltip({ pitch: 0 })).toContain('C4')
        expect(formatNoteTooltip({ pitch: 0 })).toContain('MIDI 60')
    })

    it('omits default vel/prob/every/retrig/rate/pan', () => {
        const tip = formatNoteTooltip({ pitch: 0 })
        expect(tip).not.toContain('vel:')
        expect(tip).not.toContain('prob:')
        expect(tip).not.toContain('every:')
        expect(tip).not.toContain('retrig:')
        expect(tip).not.toContain('rate:')
        expect(tip).not.toContain('pan:')
    })

    it('includes non-default properties', () => {
        const tip = formatNoteTooltip({
            pitch: 0,
            velocity: 0.5,
            prob: 0.7,
            every: 2,
            retriggerNum: 3,
            rate: 2,
            pan: -0.5,
            euclidianFill: 4,
            arpTriggerProbability: 0.5,
        })
        expect(tip).toContain('vel:')
        expect(tip).toContain('prob:')
        expect(tip).toContain('every:2')
        expect(tip).toContain('retrig:3')
        expect(tip).toContain('rate:2')
        expect(tip).toContain('pan:')
        expect(tip).toContain('eucl:4')
        expect(tip).toContain('arpProb:')
    })

    it('formats arp as array', () => {
        const tip = formatNoteTooltip({ pitch: 0, arp: [0, 4, 7] })
        expect(tip).toContain('arp:[0,4,7]')
    })

    it('formats arp as object with intervals', () => {
        const tip = formatNoteTooltip({ pitch: 0, arp: { intervals: [0, 4, 7] } })
        expect(tip).toContain('arp:[0,4,7]')
    })

    it('skips arp arrays shorter than 2 entries', () => {
        const tip = formatNoteTooltip({ pitch: 0, arp: [0] })
        expect(tip).not.toContain('arp:')
    })

    it('uses trackPitch for note name and MIDI', () => {
        const tip = formatNoteTooltip({ pitch: 0 }, 12)
        expect(tip).toContain('C5')
        expect(tip).toContain('MIDI 72')
    })
})

describe('injectUiCss', () => {
    beforeEach(() => {
        document.getElementById('ui-styles')?.remove()
    })

    it('injects a #ui-styles link into head', () => {
        injectUiCss()
        const el = document.getElementById('ui-styles')
        expect(el).toBeTruthy()
        expect(el.tagName).toBe('LINK')
        expect(el.rel).toBe('stylesheet')
    })

    it('is idempotent', () => {
        injectUiCss()
        injectUiCss()
        expect(document.querySelectorAll('#ui-styles')).toHaveLength(1)
    })
})

describe('bindCloseButton', () => {
    it('calls onClose on .ne-close click', () => {
        const container = document.createElement('div')
        container.innerHTML = '<button class="ne-close">x</button>'
        const onClose = vi.fn()
        bindCloseButton(container, onClose)
        container.querySelector('.ne-close').click()
        expect(onClose).toHaveBeenCalledTimes(1)
    })

    it('does not throw when .ne-close is missing', () => {
        const container = document.createElement('div')
        expect(() => bindCloseButton(container, vi.fn())).not.toThrow()
    })
})

describe('bindTabToggles', () => {
    function makeTabs() {
        const container = document.createElement('div')
        container.innerHTML = `
            <button class="ne-tab-btn active" data-ne-tab="a">A</button>
            <button class="ne-tab-btn" data-ne-tab="b">B</button>
            <div class="ne-tab-panel" data-tab-panel="a"></div>
            <div class="ne-tab-panel ne-tab-panel-hidden" data-tab-panel="b"></div>
        `
        document.body.appendChild(container)
        return container
    }

    afterEach(() => {
        document.body.innerHTML = ''
    })

    it('activates the clicked tab and hides the others', () => {
        const container = makeTabs()
        const onChange = vi.fn()
        bindTabToggles(container, onChange)

        container.querySelector('[data-ne-tab="b"]').click()

        expect(container.querySelector('[data-ne-tab="b"]').classList).toContain('active')
        expect(container.querySelector('[data-ne-tab="a"]').classList).not.toContain('active')
        expect(container.querySelector('[data-tab-panel="b"]').classList).not.toContain('ne-tab-panel-hidden')
        expect(container.querySelector('[data-tab-panel="a"]').classList).toContain('ne-tab-panel-hidden')
        expect(onChange).toHaveBeenCalledWith('b')
    })

    it('works without onChange', () => {
        const container = makeTabs()
        bindTabToggles(container)
        expect(() => container.querySelector('[data-ne-tab="a"]').click()).not.toThrow()
    })
})

describe('setViewBtn / setViewMode', () => {
    beforeEach(() => {
        document.body.innerHTML = `
            <button class="tb-view-btn" data-view="synth"></button>
            <button class="tb-view-btn" data-view="edit"></button>
            <button class="tb-view-btn" data-view="proll"></button>
        `
    })

    afterEach(() => {
        document.body.innerHTML = ''
    })

    it('setViewBtn toggles active on one button', () => {
        setViewBtn('synth', true)
        expect(document.querySelector('[data-view="synth"]').classList).toContain('active')
        setViewBtn('synth', false)
        expect(document.querySelector('[data-view="synth"]').classList).not.toContain('active')
    })

    it('setViewMode activates only the matching button', () => {
        setViewMode('proll')
        expect(document.querySelector('[data-view="proll"]').classList).toContain('active')
        expect(document.querySelector('[data-view="synth"]').classList).not.toContain('active')
        expect(document.querySelector('[data-view="edit"]').classList).not.toContain('active')
    })

    it("setViewMode('mobileTrack') activates edit", () => {
        setViewMode('mobileTrack')
        expect(document.querySelector('[data-view="edit"]').classList).toContain('active')
        expect(document.querySelector('[data-view="synth"]').classList).not.toContain('active')
    })

    it('does not throw when button is missing', () => {
        expect(() => setViewBtn('missing', true)).not.toThrow()
    })
})

describe('downloadJson', () => {
    beforeEach(() => {
        downloadBlob.mockClear()
    })

    it('creates a JSON blob and delegates to downloadBlob', async () => {
        downloadJson({ a: 1 }, 'file.json')

        expect(downloadBlob).toHaveBeenCalledTimes(1)
        const [blob, filename] = downloadBlob.mock.calls[0]
        expect(filename).toBe('file.json')
        expect(blob.type).toBe('application/json')
        const text = await blob.text()
        expect(text).toBe(JSON.stringify({ a: 1 }, null, 2))
    })
})

describe('knobFormat', () => {
    it('formats velocity as percent', () => {
        expect(knobFormat({ key: 'velocity' })(0.75)).toBe(75)
    })

    it('formats pitch with explicit sign', () => {
        expect(knobFormat({ key: 'pitch' })(7)).toBe('+7')
        expect(knobFormat({ key: 'pitch' })(-3)).toBe('-3')
        expect(knobFormat({ key: 'pitch' })(0)).toBe('+0')
    })

    it('formats decay as ms', () => {
        expect(knobFormat({ key: 'decay' })(120)).toBe('120 ms')
    })

    it('falls back to fmt for unknown keys', () => {
        expect(knobFormat({ key: 'unknown' })(1.239)).toBe(1.24)
    })
})

describe('renderOptions', () => {
    it('renders string options', () => {
        const html = renderOptions(['a', 'b'], 'a')
        expect(html).toContain('<option value="a" selected>a</option>')
        expect(html).toContain('<option value="b">b</option>')
    })

    it('renders object options with value/label', () => {
        const html = renderOptions([{ value: 'x', label: 'Ex' }], 'x')
        expect(html).toContain('value="x" selected')
        expect(html).toContain('>Ex</option>')
    })

    it('applies labels override', () => {
        const html = renderOptions(['a', 'b'], 'a', { labels: ['Alpha', 'Beta'] })
        expect(html).toContain('>Alpha</option>')
        expect(html).toContain('>Beta</option>')
    })

    it('applies escape function to value and label', () => {
        const html = renderOptions(['<b>'], null, { escape: escapeHtml })
        expect(html).toContain('value="&lt;b&gt;"')
        expect(html).toContain('>&lt;b&gt;</option>')
    })

    it('matches selection via string coercion', () => {
        const html = renderOptions([1, 2], '1')
        expect(html).toContain('value="1" selected')
    })
})

describe('renderIconChoices', () => {
    it('renders buttons with selected class', () => {
        const html = renderIconChoices(
            ['sine', 'square'],
            'sine',
            { sine: '~', square: '[]' },
            {
                cssClass: 'wbtn',
                valueDataAttr: 'data-wave-val',
            },
        )
        expect(html).toContain('<button class="wbtn selected" data-wave-val="sine"')
        expect(html).toContain('~')
        expect(html).toContain('<button class="wbtn" data-wave-val="square"')
        expect(html).toContain('[]')
    })

    it('falls back to value when iconMap misses', () => {
        const html = renderIconChoices(['saw'], 'saw', {}, { cssClass: 'wb', valueDataAttr: 'data-v' })
        expect(html).toContain('>saw</button>')
    })

    it('injects extraAttrs and uses titleMap', () => {
        const html = renderIconChoices(
            ['a'],
            'a',
            { a: 'A' },
            {
                cssClass: 'c',
                valueDataAttr: 'data-x',
                extraAttrs: (v) => ` data-extra="${v}"`,
                titleMap: { a: 'Title A' },
            },
        )
        expect(html).toContain('data-extra="a"')
        expect(html).toContain('title="Title A"')
    })

    it('defaults title to value when titleMap misses', () => {
        const html = renderIconChoices(['z'], 'z', { z: 'Z' }, { cssClass: 'c', valueDataAttr: 'data-x' })
        expect(html).toContain('title="z"')
    })
})

describe('setPatternPanelHidden', () => {
    beforeEach(() => {
        document.body.innerHTML = '<div id="pattern-panel"></div>'
    })

    afterEach(() => {
        document.body.innerHTML = ''
    })

    it('toggles ui-hidden', () => {
        setPatternPanelHidden(true)
        expect(document.getElementById('pattern-panel').classList).toContain('ui-hidden')
        setPatternPanelHidden(false)
        expect(document.getElementById('pattern-panel').classList).not.toContain('ui-hidden')
    })

    it('does not throw when element is missing', () => {
        document.body.innerHTML = ''
        expect(() => setPatternPanelHidden(true)).not.toThrow()
    })
})
