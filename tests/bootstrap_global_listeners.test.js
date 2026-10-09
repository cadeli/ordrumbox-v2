/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest'
import { serviceRegistry } from '../src/state/service_registry.js'
import { playbackEvents } from '../src/state/event_bus.js'
import { EVENTS } from '../src/core/events.js'
import { showToast } from '../src/core/notify.js'

vi.mock('../src/core/notify.js', () => ({
    showToast: vi.fn(),
}))

vi.mock('../src/keyboard_shortcuts.js', () => ({
    initKeyboardShortcuts: vi.fn(),
}))

vi.mock('../src/service_worker.js', () => ({
    initServiceWorker: vi.fn(),
}))

describe('bootstrap/global_listeners', () => {
    let initGlobalListeners

    beforeAll(async () => {
        ;({ initGlobalListeners } = await import('../src/bootstrap/global_listeners.js'))
        initGlobalListeners()
    })

    beforeEach(() => {
        serviceRegistry.reset()
        vi.clearAllMocks()
    })

    afterEach(() => {
        document.body.innerHTML = ''
    })

    it('TRACK_SELECT sets the selected track index', () => {
        serviceRegistry.cmd = { setSelectedTrackIdx: vi.fn() }
        playbackEvents.emit(EVENTS.TRACK_SELECT, { trackIdx: 3 })
        expect(serviceRegistry.cmd.setSelectedTrackIdx).toHaveBeenCalledWith(3)
    })

    it('TRACK_SELECT without trackIdx does not call cmd', () => {
        serviceRegistry.cmd = { setSelectedTrackIdx: vi.fn() }
        playbackEvents.emit(EVENTS.TRACK_SELECT, {})
        playbackEvents.emit(EVENTS.TRACK_SELECT, null)
        expect(serviceRegistry.cmd.setSelectedTrackIdx).not.toHaveBeenCalled()
    })

    it('STALL context-suspended shows resume warning', () => {
        playbackEvents.emit(EVENTS.STALL, { reason: 'context-suspended' })
        expect(showToast).toHaveBeenCalledWith('Audio suspended by the browser — click Play to resume', 'warning')
    })

    it('STALL with other reason shows generic stall warning', () => {
        playbackEvents.emit(EVENTS.STALL, { reason: 'underrun' })
        expect(showToast).toHaveBeenCalledWith('Audio playback stalled', 'warning')
    })

    it('STALL without payload shows generic stall warning', () => {
        playbackEvents.emit(EVENTS.STALL)
        expect(showToast).toHaveBeenCalledWith('Audio playback stalled', 'warning')
    })

    it('WORKLET_STATUS_CHANGE unavailable shows error toast', () => {
        playbackEvents.emit(EVENTS.WORKLET_STATUS_CHANGE, 'unavailable')
        expect(showToast).toHaveBeenCalledWith('Audio engine unavailable — synth and effects disabled', 'error')
    })

    it('WORKLET_STATUS_CHANGE available shows no toast', () => {
        playbackEvents.emit(EVENTS.WORKLET_STATUS_CHANGE, 'ready')
        expect(showToast).not.toHaveBeenCalled()
    })

    describe('range slider arrow-key stepping (real handler)', () => {
        function makeSlider({ min = 0, max = 100, step = 1, value = 50, disabled = false } = {}) {
            const el = document.createElement('input')
            el.type = 'range'
            el.min = String(min)
            el.max = String(max)
            el.step = String(step)
            el.value = String(value)
            el.disabled = disabled
            document.body.appendChild(el)
            return el
        }

        function press(el, key) {
            el.focus()
            el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
        }

        it('ArrowRight increases by one step and fires input+change', () => {
            const s = makeSlider({ value: 50 })
            const inputSpy = vi.fn()
            const changeSpy = vi.fn()
            s.addEventListener('input', inputSpy)
            s.addEventListener('change', changeSpy)

            press(s, 'ArrowRight')

            expect(s.value).toBe('51')
            expect(inputSpy).toHaveBeenCalledTimes(1)
            expect(changeSpy).toHaveBeenCalledTimes(1)
        })

        it('ArrowLeft decreases by one step', () => {
            const s = makeSlider({ value: 50 })
            press(s, 'ArrowLeft')
            expect(s.value).toBe('49')
        })

        it('clamps at min', () => {
            const s = makeSlider({ min: 0, max: 100, value: 0 })
            press(s, 'ArrowLeft')
            expect(s.value).toBe('0')
        })

        it('clamps at max', () => {
            const s = makeSlider({ min: 0, max: 100, value: 100 })
            press(s, 'ArrowRight')
            expect(s.value).toBe('100')
        })

        it('respects fractional steps', () => {
            const s = makeSlider({ min: 0, max: 1, step: 0.01, value: 0.5 })
            press(s, 'ArrowRight')
            expect(parseFloat(s.value)).toBeCloseTo(0.51, 5)
        })

        it('ignores disabled sliders', () => {
            const s = makeSlider({ value: 50, disabled: true })
            press(s, 'ArrowRight')
            expect(s.value).toBe('50')
        })

        it('ignores non-range inputs', () => {
            const input = document.createElement('input')
            input.type = 'text'
            document.body.appendChild(input)
            input.focus()
            input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }))
            expect(input.value).toBe('')
        })

        it('ignores non-arrow keys', () => {
            const s = makeSlider({ value: 50 })
            press(s, 'a')
            expect(s.value).toBe('50')
        })

        it('respects negative ranges and offsets', () => {
            const s = makeSlider({ min: -24, max: 24, step: 1, value: 0 })
            press(s, 'ArrowRight')
            expect(s.value).toBe('1')
            press(s, 'ArrowLeft')
            expect(s.value).toBe('0')
        })

        it('does not fire input/change when value is already at boundary', () => {
            const s = makeSlider({ min: 0, max: 10, value: 10 })
            const inputSpy = vi.fn()
            s.addEventListener('input', inputSpy)
            press(s, 'ArrowRight')
            expect(inputSpy).not.toHaveBeenCalled()
        })

        it('ignores readonly sliders', () => {
            const s = makeSlider({ value: 50 })
            s.readOnly = true
            press(s, 'ArrowRight')
            expect(s.value).toBe('50')
        })

        it('works on LFO dual-range sliders (min/max)', () => {
            const wrap = document.createElement('div')
            wrap.className = 'ne-range-container'
            const min = makeSlider({ min: 0, max: 1, step: 0.01, value: 0 })
            min.dataset.lfoKey = 'min'
            const max = makeSlider({ min: 0, max: 1, step: 0.01, value: 1 })
            max.dataset.lfoKey = 'max'
            wrap.append(min, max)
            document.body.appendChild(wrap)

            press(min, 'ArrowRight')
            expect(parseFloat(min.value)).toBeCloseTo(0.01, 5)
            press(max, 'ArrowLeft')
            expect(parseFloat(max.value)).toBeCloseTo(0.99, 5)
        })

        it('slider keeps focus after an arrow key changes the value', () => {
            const s = makeSlider({ value: 50 })
            s.focus()
            expect(document.activeElement).toBe(s)
            press(s, 'ArrowRight')
            expect(document.activeElement).toBe(s)
            expect(s.value).toBe('51')
            press(s, 'ArrowRight')
            expect(document.activeElement).toBe(s)
            expect(s.value).toBe('52')
        })
    })

    describe('label / .ne-val click focuses the row slider', () => {
        function makeRow() {
            const row = document.createElement('div')
            row.className = 'ne-row'
            row.innerHTML =
                '<label>Gain</label><input type="range" min="0" max="100" value="50"><span class="ne-val">50</span>'
            document.body.appendChild(row)
            return row
        }

        it('focuses the range input when the label is clicked', () => {
            makeRow()
            document.querySelector('label').click()
            expect(document.activeElement).toBe(document.querySelector('input[type="range"]'))
        })

        it('focuses the range input when .ne-val is clicked', () => {
            makeRow()
            document.querySelector('.ne-val').click()
            expect(document.activeElement).toBe(document.querySelector('input[type="range"]'))
        })

        it('ignores clicks outside a .ne-row', () => {
            const orphan = document.createElement('span')
            orphan.className = 'ne-val'
            document.body.appendChild(orphan)
            orphan.click()
            expect(document.activeElement).not.toBe(orphan)
        })

        it('does not focus anything if the row has no range input', () => {
            const row = document.createElement('div')
            row.className = 'ne-row'
            row.innerHTML = '<label>Title</label><span class="ne-val">val</span>'
            document.body.appendChild(row)
            const before = document.activeElement
            row.querySelector('label').click()
            expect(document.activeElement).toBe(before)
        })

        it('skips disabled sliders', () => {
            const row = makeRow()
            const slider = row.querySelector('input[type="range"]')
            slider.disabled = true
            const before = document.activeElement
            row.querySelector('label').click()
            expect(document.activeElement).toBe(before)
        })

        it('focuses the first slider in LFO dual-range rows', () => {
            const row = document.createElement('div')
            row.className = 'ne-row'
            row.innerHTML = `
                <label>Range</label>
                <div class="ne-range-container">
                    <input type="range" min="0" max="1" step="0.01" value="0" data-lfo-key="min">
                    <input type="range" min="0" max="1" step="0.01" value="1" data-lfo-key="max">
                </div>
                <span class="ne-val">0.0..1.0</span>
            `
            document.body.appendChild(row)
            const minSlider = row.querySelector('input[data-lfo-key="min"]')
            row.querySelector('label').click()
            expect(document.activeElement).toBe(minSlider)
        })
    })

    describe('OrSlider does not double-fire with the fallback handler', () => {
        let OrSlider

        beforeAll(async () => {
            OrSlider = (await import('../src/ui/components/or_slider.js')).OrSlider
        })

        function mountOrSlider({ value = 0.5, onChange = vi.fn() } = {}) {
            const s = new OrSlider({
                key: 'test',
                label: 'T',
                min: 0,
                max: 1,
                step: 0.01,
                value,
                onChange,
            })
            document.body.appendChild(s.createElement())
            return { slider: s, input: s.input }
        }

        it('ArrowRight on an OrSlider moves by exactly ONE step (not two)', () => {
            const { input, slider } = mountOrSlider({ value: 0.5 })
            input.focus()
            input.dispatchEvent(
                new KeyboardEvent('keydown', {
                    key: 'ArrowRight',
                    bubbles: true,
                    cancelable: true,
                }),
            )
            expect(parseFloat(input.value)).toBeCloseTo(0.51, 5)
            expect(slider.getValue()).toBeCloseTo(0.51, 5)
        })

        it('onChange fires exactly once per arrow press', () => {
            const counted = vi.fn()
            const { input } = mountOrSlider({ onChange: counted })
            input.focus()
            input.dispatchEvent(
                new KeyboardEvent('keydown', {
                    key: 'ArrowRight',
                    bubbles: true,
                    cancelable: true,
                }),
            )
            expect(counted).toHaveBeenCalledTimes(1)
        })
    })
})
