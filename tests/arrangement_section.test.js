/**
 * @vitest-environment jsdom
 *
 * Arrangement grid geometry: one column per *used* pattern, one row per measure,
 * one rectangle per clip whose height is its duration.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { appState } from '../src/state/app_state.js'
import { serviceRegistry } from '../src/state/service_registry.js'
import ArrangementSection from '../src/ui/song_panel/arrangement_section.js'
import { MEASURE_WIDTH, CLIP_INSET, HEADER_HEIGHT, LABEL_WIDTH, ROW_HEIGHT } from '../src/ui/song_panel/layout.js'
import { BEATS_PER_MEASURE } from '../src/model/song_schema.js'
import { TICK } from '../src/core/constants.js'

/** ticks in one measure — the grid's X axis */
const MEASURE_TICKS = TICK * BEATS_PER_MEASURE

// Classes, not ids: jsdom resolves a `#id` selector through a per-document id
// cache, so a second element reusing an id (which the real app never does —
// there is exactly one #sa-title) makes the scoped querySelector return null.
function build() {
    const root = document.createElement('div')
    root.innerHTML = '<span class="t"></span><div class="l"></div>'
    document.body.appendChild(root)
    const list = root.querySelector('.l')
    // the host panel supplies listen() for the two delegated grid listeners and
    // sub() for the playback subscriptions (cursor loop)
    const handlers = new Map()
    const panel = { listen: vi.fn((el, type, fn) => handlers.set(type, fn)), sub: vi.fn() }
    const section = new ArrangementSection(panel, root, root.querySelector('.t'), list)
    return { root, section, list, panel, handlers }
}

const clips = () => [...build2.list.querySelectorAll('.sa-clip')]

/** Fires the delegated grid click the way the host panel binds it. */
const clickOn = (el) => build2.handlers.get('click')({ target: el })
/** Clicks the ruler cell of a 0-based measure. */
const clickMeasure = (measure) => clickOn(build2.list.querySelector(`.sa-measure-head[data-measure="${measure}"]`))
const cursorPx = () => {
    const el = build2.list.querySelector('.sa-cursor')
    return Number(/translateX\((-?[\d.]+)px\)/.exec(el?.style.transform ?? '')?.[1])
}
const markedMeasure = () => build2.list.querySelector('.sa-measure-head.sa-measure-current')?.dataset.measure

let build2
beforeEach(() => {
    appState.reset()
    // the grid asks the sequencer where the transport is and aims it, so the
    // tests drive that one collaborator instead of the whole audio stack
    serviceRegistry.transport = null
    serviceRegistry.seq = {
        // mirrors Sequencer.tick, so a test can drive the transport alone
        get tick() {
            return serviceRegistry.transport?.tick ?? 0
        },
        songCursorMeasure: 0,
        setSongCursor: vi.fn(function (measure) {
            this.songCursorMeasure = measure
        }),
    }
    appState.patterns = [
        { id: 'rock', name: 'Rock' },
        { id: 'bass', name: 'Bass' },
        { id: 'unused', name: 'Unused' },
    ]
    appState.songs = [
        {
            id: 'demo',
            name: 'Demo',
            bpm: 120,
            clips: [
                { pattern: 'rock', startMeasure: 0, measureCount: 2 },
                { pattern: 'bass', startMeasure: 0, measureCount: 1 },
                { pattern: 'rock', startMeasure: 8, measureCount: 4 },
            ],
        },
    ]
    build2 = build()
})

afterEach(() => {
    // build() appends a fresh root per test and the cursor loop outlives the
    // test that started it — neither is torn down by beforeEach.
    build2.section.stopCursorLoop()
    document.body.innerHTML = ''
})

describe('ArrangementSection', () => {
    it('renders one rectangle per clip', () => {
        build2.section.sync()
        expect(clips()).toHaveLength(3)
    })

    // Showing all 40 library patterns would leave a grid 95% empty rows.
    it('only makes a row for the patterns the arrangement uses', () => {
        build2.section.sync()
        const names = [...build2.list.querySelectorAll('.sa-row-name')].map((h) => h.textContent.trim())
        expect(names).toEqual(['Rock', 'Bass'])
    })

    // The first column holds the names; the ruler starts after it.
    it('numbers the measures along X, after the name column', () => {
        build2.section.sync()
        const heads = [...build2.list.querySelectorAll('.sa-measure-head')]
        const left = (el) => Number(el.style.left.replace('px', ''))
        expect(heads).toHaveLength(12)
        expect(left(heads[0])).toBe(LABEL_WIDTH)
        expect(left(heads[1])).toBe(LABEL_WIDTH + MEASURE_WIDTH)
        expect(heads[0].textContent).toBe('1')
    })

    it('pulls the row names into the frozen column, left of the body', () => {
        build2.section.sync()
        const name = build2.list.querySelector('.sa-row-name')
        expect(Number(name.style.left.replace('px', ''))).toBe(-LABEL_WIDTH)
        expect(Number(name.style.width.replace('px', ''))).toBe(LABEL_WIDTH)
    })

    // Clips of different patterns sit on different rows.
    it('stacks clips of different patterns on their own row', () => {
        build2.section.sync()
        const [first, second] = clips()
        const top = (el) => Number(el.style.top.replace('px', ''))
        expect(top(first)).toBe(CLIP_INSET / 2)
        expect(top(second)).toBe(ROW_HEIGHT + CLIP_INSET / 2)
    })

    // X is time: a clip's left is its start measure.
    it('offsets the clip along X by its start measure', () => {
        build2.section.sync()
        const atMeasure0 = clips()[0]
        const atMeasure8 = clips()[2]
        const left = (el) => Number(el.style.left.replace('px', ''))
        expect(left(atMeasure0)).toBe(0)
        expect(left(atMeasure8)).toBe(8 * MEASURE_WIDTH)
    })

    it('places the body right of the name column and under the ruler', () => {
        build2.section.sync()
        const body = build2.list.querySelector('.sa-body')
        expect(body.style.left).toBe(`${LABEL_WIDTH}px`)
        expect(body.style.top).toBe(`${HEADER_HEIGHT}px`)
    })

    // The width is what tells a 4-measure clip from a 1-measure one.
    it('makes the width equal the duration', () => {
        build2.section.sync()
        const [twoMeasures, oneMeasure, fourMeasures] = clips()
        const width = (el) => Number(el.style.width.replace('px', ''))
        expect(width(twoMeasures)).toBe(2 * MEASURE_WIDTH - CLIP_INSET)
        expect(width(oneMeasure)).toBe(MEASURE_WIDTH - CLIP_INSET)
        expect(width(fourMeasures)).toBe(4 * MEASURE_WIDTH - CLIP_INSET)
    })

    it('keeps a sub-measure clip narrower than a full cell but visible', () => {
        appState.songs[0].clips = [{ pattern: 'rock', startMeasure: 0, measureCount: 0.75 }]
        build2.section.sync()
        expect(Number(clips()[0].style.width.replace('px', ''))).toBeGreaterThan(4)
        expect(Number(clips()[0].style.width.replace('px', ''))).toBeLessThan(MEASURE_WIDTH)
    })

    it('exposes the clip data for assertions', () => {
        build2.section.sync()
        expect(build2.section.clipRects()).toEqual([
            { pattern: 'rock', row: 0, startMeasure: 0, measureCount: 2 },
            { pattern: 'bass', row: 1, startMeasure: 0, measureCount: 1 },
            { pattern: 'rock', row: 0, startMeasure: 8, measureCount: 4 },
        ])
    })

    it('shows an empty state when there is no arrangement', () => {
        appState.songs = []
        build2.section.sync()
        expect(build2.list.querySelector('.sa-empty')).not.toBeNull()
        expect(clips()).toHaveLength(0)
    })

    it('shows the song name and its bpm', () => {
        build2.section.sync()
        expect(build2.root.querySelector('.t').textContent).toBe('Demo')
        expect(build2.list.dataset.bpm).toBe('120')
    })

    it('reports the total length in measures', () => {
        build2.section.sync()
        expect(build2.list.dataset.totalMeasures).toBe('12')
    })

    // A clip pointing at a pattern that is not in the library must stay visible
    // instead of silently shrinking the grid.
    it('keeps a column for a clip whose pattern is missing', () => {
        appState.songs[0].clips = [{ pattern: 'ghost', startMeasure: 0, measureCount: 1 }]
        build2.section.sync()
        expect(clips()).toHaveLength(1)
        expect(build2.list.querySelector('.sa-orphan')).not.toBeNull()
    })

    it('escapes pattern names', () => {
        appState.patterns[0].name = '<img src=x onerror=alert(1)>'
        appState.songs[0].clips = [{ pattern: 'rock', startMeasure: 0, measureCount: 1 }]
        build2.section.sync()
        expect(build2.list.querySelector('img')).toBeNull()
    })
})

/**
 * The ruler click: aim the arrangement cursor at a measure, and play from there.
 * The cursor stays put while the transport is stopped (it marks where the next
 * play starts) and hands over to the transport once playback runs.
 */
describe('ArrangementSection — ruler cursor', () => {
    it('numbers every ruler cell with the measure it stands for', () => {
        build2.section.sync()
        const heads = [...build2.list.querySelectorAll('.sa-measure-head')]
        expect(heads.map((h) => h.dataset.measure)).toEqual(heads.map((_, i) => String(i)))
        expect(heads[5].textContent).toBe('6')
    })

    it('rests on the first measure until the user aims it somewhere', () => {
        build2.section.sync()
        expect(cursorPx()).toBe(0)
        expect(markedMeasure()).toBe('0')
        expect(build2.list.querySelector('.sa-cursor').classList.contains('sa-cursor-idle')).toBe(true)
    })

    it('clicking a measure aims the cursor there', () => {
        build2.section.sync()
        clickMeasure(5)
        expect(serviceRegistry.seq.setSongCursor).toHaveBeenCalledWith(5)
        expect(cursorPx()).toBe(5 * MEASURE_WIDTH)
        expect(markedMeasure()).toBe('5')
    })

    // The highlighted measure must follow the cursor, not accumulate.
    it('marks a single measure at a time', () => {
        build2.section.sync()
        clickMeasure(5)
        clickMeasure(2)
        expect(build2.list.querySelectorAll('.sa-measure-head.sa-measure-current')).toHaveLength(1)
        expect(markedMeasure()).toBe('2')
    })

    // Clips are edited from the right-click menu; a left click must not move the
    // cursor, or every selection would re-aim playback.
    it('ignores a click outside the ruler', () => {
        build2.section.sync()
        clickOn(clips()[0])
        clickOn(build2.list.querySelector('.sa-row-name'))
        expect(serviceRegistry.seq.setSongCursor).not.toHaveBeenCalled()
        expect(cursorPx()).toBe(0)
    })

    // A re-render rebuilds the whole grid, the cursor has to come back with it.
    it('survives a re-render', () => {
        build2.section.sync()
        clickMeasure(3)
        build2.section.sync()
        expect(cursorPx()).toBe(3 * MEASURE_WIDTH)
        expect(markedMeasure()).toBe('3')
    })

    // Another arrangement can be shorter than the mark the cursor was left on.
    it('keeps a cursor aimed on a longer song inside the grid', () => {
        serviceRegistry.seq.songCursorMeasure = 40
        build2.section.sync()
        expect(cursorPx()).toBe(11 * MEASURE_WIDTH)
        expect(markedMeasure()).toBe('11')
    })

    it('follows the transport while it runs, and drops the idle look', async () => {
        build2.section.sync()
        clickMeasure(3)
        serviceRegistry.transport = { isRunning: true, tick: 5 * MEASURE_TICKS }
        build2.section.startCursorLoop()
        await new Promise((resolve) => requestAnimationFrame(resolve))

        expect(cursorPx()).toBe(5 * MEASURE_WIDTH)
        expect(markedMeasure()).toBe('5')
        expect(build2.list.querySelector('.sa-cursor').classList.contains('sa-cursor-idle')).toBe(false)

        // stopping falls back on the marker the user aimed, not on where the
        // playback happened to be
        serviceRegistry.transport = { isRunning: false, tick: 9 * MEASURE_TICKS }
        build2.section.stopCursorLoop()
        expect(cursorPx()).toBe(3 * MEASURE_WIDTH)
        expect(build2.list.querySelector('.sa-cursor').classList.contains('sa-cursor-idle')).toBe(true)
    })
})
