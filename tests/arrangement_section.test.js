/**
 * @vitest-environment jsdom
 *
 * Arrangement grid geometry: one column per *used* pattern, one row per measure,
 * one rectangle per clip whose height is its duration.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { appState } from '../src/state/app_state.js'
import ArrangementSection from '../src/ui/song_panel/arrangement_section.js'

const ROW_HEIGHT = 22
const LABEL_WIDTH = 74
const BAR_WIDTH = 24
const HEADER = 18

// Classes, not ids: jsdom resolves a `#id` selector through a per-document id
// cache, so a second element reusing an id (which the real app never does —
// there is exactly one #sa-title) makes the scoped querySelector return null.
function build() {
    const root = document.createElement('div')
    root.innerHTML = '<span class="t"></span><div class="l"></div>'
    document.body.appendChild(root)
    const list = root.querySelector('.l')
    // the host panel only supplies listen() for the delegated contextmenu
    const panel = { listen: vi.fn() }
    const section = new ArrangementSection(panel, root, root.querySelector('.t'), list)
    return { root, section, list, panel }
}

const clips = () => [...build2.list.querySelectorAll('.sa-clip')]

let build2
beforeEach(() => {
    appState.reset()
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
                { pattern: 'rock', startBar: 0, bars: 2 },
                { pattern: 'bass', startBar: 0, bars: 1 },
                { pattern: 'rock', startBar: 8, bars: 4 },
            ],
        },
    ]
    build2 = build()
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
        const heads = [...build2.list.querySelectorAll('.sa-bar-head')]
        const left = (el) => Number(el.style.left.replace('px', ''))
        expect(heads).toHaveLength(12)
        expect(left(heads[0])).toBe(LABEL_WIDTH)
        expect(left(heads[1])).toBe(LABEL_WIDTH + BAR_WIDTH)
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
        expect(top(first)).toBe(2)
        expect(top(second)).toBe(ROW_HEIGHT + 2)
    })

    // X is time: a clip's left is its start bar.
    it('offsets the clip along X by its start bar', () => {
        build2.section.sync()
        const atBar0 = clips()[0]
        const atBar8 = clips()[2]
        const left = (el) => Number(el.style.left.replace('px', ''))
        expect(left(atBar0)).toBe(0)
        expect(left(atBar8)).toBe(8 * BAR_WIDTH)
    })

    it('places the body right of the name column and under the ruler', () => {
        build2.section.sync()
        const body = build2.list.querySelector('.sa-body')
        expect(body.style.left).toBe(`${LABEL_WIDTH}px`)
        expect(body.style.top).toBe(`${HEADER}px`)
    })

    // The width is what tells a 4-bar clip from a 1-bar one.
    it('makes the width equal the duration', () => {
        build2.section.sync()
        const [twoBars, oneBar, fourBars] = clips()
        const width = (el) => Number(el.style.width.replace('px', ''))
        expect(width(twoBars)).toBe(2 * BAR_WIDTH - 2)
        expect(width(oneBar)).toBe(BAR_WIDTH - 2)
        expect(width(fourBars)).toBe(4 * BAR_WIDTH - 2)
    })

    it('keeps a sub-bar clip narrower than a full cell but visible', () => {
        appState.songs[0].clips = [{ pattern: 'rock', startBar: 0, bars: 0.75 }]
        build2.section.sync()
        expect(Number(clips()[0].style.width.replace('px', ''))).toBeGreaterThan(4)
        expect(Number(clips()[0].style.width.replace('px', ''))).toBeLessThan(BAR_WIDTH)
    })

    it('exposes the clip data for assertions', () => {
        build2.section.sync()
        expect(build2.section.clipRects()).toEqual([
            { pattern: 'rock', row: 0, startBar: 0, bars: 2 },
            { pattern: 'bass', row: 1, startBar: 0, bars: 1 },
            { pattern: 'rock', row: 0, startBar: 8, bars: 4 },
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

    it('reports the total length in bars', () => {
        build2.section.sync()
        expect(build2.list.dataset.totalBars).toBe('12')
    })

    // A clip pointing at a pattern that is not in the library must stay visible
    // instead of silently shrinking the grid.
    it('keeps a column for a clip whose pattern is missing', () => {
        appState.songs[0].clips = [{ pattern: 'ghost', startBar: 0, bars: 1 }]
        build2.section.sync()
        expect(clips()).toHaveLength(1)
        expect(build2.list.querySelector('.sa-orphan')).not.toBeNull()
    })

    it('escapes pattern names', () => {
        appState.patterns[0].name = '<img src=x onerror=alert(1)>'
        appState.songs[0].clips = [{ pattern: 'rock', startBar: 0, bars: 1 }]
        build2.section.sync()
        expect(build2.list.querySelector('img')).toBeNull()
    })
})
