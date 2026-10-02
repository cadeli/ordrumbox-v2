/**
 * @vitest-environment jsdom
 *
 * Arrangement grid geometry: one column per *used* pattern, one row per measure,
 * one rectangle per clip whose height is its duration.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { appState } from '../src/state/app_state.js'
import ArrangementSection from '../src/ui/song_panel/arrangement_section.js'

const ROW_HEIGHT = 16
const COL_WIDTH = 74
const GUTTER = 40
const HEADER = 44

// Classes, not ids: jsdom resolves a `#id` selector through a per-document id
// cache, so a second element reusing an id (which the real app never does —
// there is exactly one #sa-title) makes the scoped querySelector return null.
function build() {
    const root = document.createElement('div')
    root.innerHTML = '<span class="t"></span><div class="l"></div>'
    document.body.appendChild(root)
    const list = root.querySelector('.l')
    const section = new ArrangementSection(root, root.querySelector('.t'), list)
    return { root, section, list }
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

    // Showing all 40 library patterns would leave a grid 95% empty.
    it('only makes a column for the patterns the arrangement uses', () => {
        build2.section.sync()
        const heads = [...build2.list.querySelectorAll('.sa-col-head')].map((h) => h.textContent.trim())
        expect(heads).toEqual(['Rock', 'Bass'])
    })

    // `left` is the column origin; the 2px visual inset lives in CSS.
    it('places a clip on its own column', () => {
        build2.section.sync()
        const [first, second] = clips()
        const left = (el) => Number(el.style.left.replace('px', ''))
        expect(left(first)).toBe(GUTTER)
        expect(left(second)).toBe(GUTTER + COL_WIDTH)
    })

    it('offsets the row by its start bar', () => {
        build2.section.sync()
        const atBar0 = clips()[0]
        const atBar8 = clips()[2]
        expect(Math.round(Number(atBar0.style.top.replace('px', '')))).toBe(HEADER)
        expect(Math.round(Number(atBar8.style.top.replace('px', '')))).toBe(HEADER + 8 * ROW_HEIGHT)
    })

    // The height is what tells a 4-bar clip from a 1-bar one.
    it('makes the height equal the duration', () => {
        build2.section.sync()
        const [twoBars, oneBar, fourBars] = clips()
        expect(Math.round(Number(twoBars.style.height.replace('px', '')))).toBe(2 * ROW_HEIGHT)
        expect(Math.round(Number(oneBar.style.height.replace('px', '')))).toBe(ROW_HEIGHT)
        expect(Math.round(Number(fourBars.style.height.replace('px', '')))).toBe(4 * ROW_HEIGHT)
    })

    it('keeps a sub-bar clip shorter than a full row but visible', () => {
        appState.songs[0].clips = [{ pattern: 'rock', startBar: 0, bars: 0.75 }]
        build2.section.sync()
        expect(Number(clips()[0].style.height.replace('px', ''))).toBeGreaterThan(0)
        expect(Number(clips()[0].style.height.replace('px', ''))).toBeLessThan(ROW_HEIGHT)
    })

    it('exposes the clip data for assertions', () => {
        build2.section.sync()
        expect(build2.section.clipRects()).toEqual([
            { pattern: 'rock', column: 0, startBar: 0, bars: 2 },
            { pattern: 'bass', column: 1, startBar: 0, bars: 1 },
            { pattern: 'rock', column: 0, startBar: 8, bars: 4 },
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
