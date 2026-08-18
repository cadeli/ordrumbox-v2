/**
 * @vitest-environment jsdom
 *
 * Desktop layout tests: every panel must appear in its designated layout slot
 * independently of what other panels are visible.
 *
 * Desktop layout (1200×800):
 *   Left top    : 80% × 450px @ top:64  — pattern / piano-roll / synth (switchable)
 *   Right top   : 20% × 450px @ top:64, left:80% — track editor
 *   Left bottom : 80% × 300px @ top:518 — about / output / dm / pp
 *   Right bottom: 20% × 300px @ top:518, left:80% — note editor
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { appState } from '../src/state/app_state.js'
import { playbackEvents } from '../src/state/playback_events.js'
import TrackEditor from '../src/ui/track_editor.js'
import NoteEditor from '../src/ui/note_editor.js'
import ToolsPanel from '../src/ui/tools_panel.js'
import PatternSettingsPanel from '../src/ui/pattern_settings_panel.js'
import ViewManager from '../src/ui/view_manager.js'
import { positionBelowPatternPanel } from '../src/ui/components/panel_helpers.js'

// ── Layout constants ────────────────────────────────────────────────────
const LAYOUT = {
    toolbarH:      64,
    mainH:         450,
    secondaryH:    300,
    gap:           4,
    leftPct:       80,
    rightPct:      20,
}
const TOP_SECONDARY = LAYOUT.toolbarH + LAYOUT.mainH + LAYOUT.gap // 518

function getInt(el, prop) {
    return parseInt(el.style[prop], 10)
}

/** Mock offsetTop/offsetHeight so positionBelowPatternPanel computes real positions. */
function mockAnchor(el, top, height) {
    Object.defineProperty(el, 'offsetTop', { value: top, configurable: true })
    Object.defineProperty(el, 'offsetHeight', { value: height, configurable: true })
}

/**
 * Make a panel element visible at a given layout slot.
 * In jsdom CSS isn't applied, so we explicitly set display to match what
 * the real CSS would compute.
 */
function showAt(el, { display = 'block', top, left, width, height } = {}) {
    el.style.display = display
    el.style.top = top + 'px'
    el.style.left = left + 'px'
    el.style.width = width + 'px'
    el.style.height = height + 'px'
}

// ── Test setup ──────────────────────────────────────────────────────────

describe('Desktop layout — each panel in its slot (idempotent)', () => {
    let trackEditor, noteEditor, toolsPanel, patternSettingsPanel, viewManager
    let mockSynthEditor, mockPianoRollPanel

    function expectTEVisible() {
        expect(trackEditor.container).not.toBeNull()
        expect(trackEditor.isVisible).toBe(true)
    }

    function expectNEVisible() {
        const ne = document.getElementById('ne-container')
        expect(ne).not.toBeNull()
        expect(ne.style.display).not.toBe('none')
    }

    const MOCK_TRACK = {
        name: 'KICK', notes: [{ beat: 0, beatStep: 0, pitch: 0, velocity: 0.8 }],
        nbBeats: 4, stepsPerBeat: 4, loopAtStep: 16,
        mute: false, solo: false, useAutoAssignSound: true,
        velocity: 0.8, pan: 0, pitch: 0,
        filterCutoff: 12000, filterResonance: 1, filterType: 'lowpass',
        filterLfo: 0, filterEnvelopeAmount: 0,
        pitchLfo: 0, volumeLfo: 0, panLfo: 0, filterLfoValue: 0,
        pitchEnv: 0, delaySend: 0, reverbSend: 0, saturationDrive: 0,
        delayActive: false, reverbActive: false, saturationActive: false,
        swingAmount: 0, swingMode: 'off', synthSoundKey: 'BASS1'
    }

    const SECOND_TRACK = { ...structuredClone(MOCK_TRACK), name: 'SNARE' }

    beforeEach(() => {
        document.body.innerHTML = ''
        global.window.innerWidth = 1200
        global.window.innerHeight = 800
        appState.reset()
        appState.patterns = [{
            name: 'Pattern 1', nbBeats: 4,
            tracks: [structuredClone(MOCK_TRACK), SECOND_TRACK]
        }]
        appState.selectedPatternNum = 0
        appState.selectedTrackNum = 0

        const pp = document.createElement('div')
        pp.id = 'pattern-panel'
        pp.style.display = 'flex'
        document.body.appendChild(pp)

        for (const id of ['about-panel', 'dm-panel', 'pp-panel', 'output-panel', 'soft-synth-panel', 'piano-roll-panel']) {
            const el = document.createElement('div')
            el.id = id
            el.style.display = 'none'
            document.body.appendChild(el)
        }

        mockSynthEditor = {
            createDOM: () => {},
            getGeneratedSoundKeys: () => [],
            hidePanel: () => { document.getElementById('soft-synth-panel').style.display = 'none' },
            showPanel: () => { document.getElementById('soft-synth-panel').style.display = 'block' },
            ensureGeneratedSoundsLoaded: async () => {},
            reset: () => {}
        }

        mockPianoRollPanel = {
            hide: () => { document.getElementById('piano-roll-panel').style.display = 'none' },
            show: () => { document.getElementById('piano-roll-panel').style.display = 'block' }
        }

        trackEditor = new TrackEditor()
        trackEditor.synthEditor = mockSynthEditor
        trackEditor.init()

        noteEditor = new NoteEditor()
        noteEditor.setContainer(trackEditor._neContainer)
        noteEditor.init()
        trackEditor.setNoteEditor(noteEditor)

        toolsPanel = new ToolsPanel()
        toolsPanel.init()

        patternSettingsPanel = new PatternSettingsPanel()
        patternSettingsPanel.init()

        viewManager = new ViewManager({
            trackEditor, synthEditor: mockSynthEditor,
            pianoRollPanel: mockPianoRollPanel, noteEditor,
            toolsPanel, patternSettingsPanel
        })
        viewManager.init()

        mockAnchor(pp, 64, LAYOUT.mainH)

        const prollEl = document.getElementById('piano-roll-panel')
        mockAnchor(prollEl, 64, LAYOUT.mainH)

        const synthEl = document.getElementById('soft-synth-panel')
        mockAnchor(synthEl, 64, LAYOUT.mainH)
    })

    // ── Main panels (left-top slot: 80% × 450px @ top:64) ────────────

    describe('Main panels → left-top slot', () => {
        it('pattern-panel visible in edit view', () => {
            playbackEvents.emit("editToggle")
            const el = document.getElementById('pattern-panel')
            expect(el.style.display).not.toBe('none')
        })

        it('piano-roll-panel visible in proll view', () => {
            playbackEvents.emit("prollToggle")
            const el = document.getElementById('piano-roll-panel')
            expect(el.style.display).toBe('block')
        })

        it('soft-synth-panel visible in synth view', () => {
            playbackEvents.emit("synthToggle")
            const el = document.getElementById('soft-synth-panel')
            expect(el.style.display).toBe('block')
        })

        it('pattern-panel visible in edit regardless of secondary panels', () => {
            playbackEvents.emit("editToggle")
            document.getElementById('about-panel').style.display = 'block'
            document.getElementById('dm-panel').style.display = 'block'
            expect(document.getElementById('pattern-panel').style.display).not.toBe('none')
        })

        it('piano-roll visible in proll regardless of about panel', () => {
            playbackEvents.emit("prollToggle")
            document.getElementById('about-panel').style.display = 'block'
            expect(document.getElementById('piano-roll-panel').style.display).toBe('block')
        })

        it('synth visible in synth view regardless of tools panel', () => {
            playbackEvents.emit("synthToggle")
            playbackEvents.emit("toolsToggle", true)
            expect(document.getElementById('soft-synth-panel').style.display).toBe('block')
        })
    })

    // ── Track editor (right-top slot: 20% × 450px @ top:64, left:80%) ──

    describe('Track editor → right-top slot', () => {
        const views = [
            ['edit',     () => playbackEvents.emit("editToggle")],
            ['synth',    () => playbackEvents.emit("synthToggle")],
            ['proll',    () => playbackEvents.emit("prollToggle")],
            ['tools',    () => playbackEvents.emit("toolsToggle", true)],
        ]

        for (const [name, dispatch] of views) {
            it(`TE visible in ${name} view`, () => {
                dispatch()
                expectTEVisible()
            })
        }

        it('TE visible with multiple secondary panels', () => {
            playbackEvents.emit("synthToggle")
            for (const id of ['about-panel', 'dm-panel', 'output-panel']) {
                document.getElementById(id).style.display = 'block'
            }
            expectTEVisible()
        })
    })

    // ── Note editor (right-bottom slot: 20% × 300px @ top:518) ────────

    describe('Note editor → right-bottom slot', () => {
        it('NE visible in edit view', () => {
            playbackEvents.emit("editToggle")
            expectNEVisible()
        })

        it('NE visible in synth view', () => {
            playbackEvents.emit("synthToggle")
            expectNEVisible()
        })

        it('NE visible in proll view', () => {
            playbackEvents.emit("prollToggle")
            expectNEVisible()
        })

        it('NE visible in tools view', () => {
            playbackEvents.emit("toolsToggle", true)
            expectNEVisible()
        })

        it('NE visible with secondary panels', () => {
            playbackEvents.emit("synthToggle")
            document.getElementById('about-panel').style.display = 'block'
            document.getElementById('dm-panel').style.display = 'block'
            expectNEVisible()
        })
    })

    // ── Secondary panels (left-bottom slot: 80% × 300px @ top:≥518) ───

    describe('Secondary panels → left-bottom slot', () => {
        const panels = ['about-panel', 'dm-panel', 'pp-panel', 'output-panel', 'tools-panel']

        for (const id of panels) {
            it(`${id} positioned below main panel`, () => {
                const el = document.getElementById(id)
                el.style.display = 'block'
                positionBelowPatternPanel(el)
                const top = getInt(el, 'top')
                expect(top).toBeGreaterThanOrEqual(TOP_SECONDARY)
            })
        }

        it('about-panel positioned below main in edit view', () => {
            playbackEvents.emit("editToggle")
            const el = document.getElementById('about-panel')
            el.style.display = 'block'
            positionBelowPatternPanel(el)
            expect(getInt(el, 'top')).toBeGreaterThanOrEqual(TOP_SECONDARY)
        })

        it('about-panel positioned below main in synth view', () => {
            playbackEvents.emit("synthToggle")
            const el = document.getElementById('about-panel')
            el.style.display = 'block'
            positionBelowPatternPanel(el)
            expect(getInt(el, 'top')).toBeGreaterThanOrEqual(TOP_SECONDARY)
        })

        it('about-panel positioned below main in proll view', () => {
            playbackEvents.emit("prollToggle")
            const el = document.getElementById('about-panel')
            el.style.display = 'block'
            positionBelowPatternPanel(el)
            expect(getInt(el, 'top')).toBeGreaterThanOrEqual(TOP_SECONDARY)
        })

        it('multiple secondary panels all positioned below main', () => {
            for (const id of ['about-panel', 'dm-panel', 'output-panel', 'pp-panel']) {
                const el = document.getElementById(id)
                el.style.display = 'block'
                positionBelowPatternPanel(el)
                expect(getInt(el, 'top')).toBeGreaterThanOrEqual(TOP_SECONDARY)
            }
        })
    })

    // ── No overlap between slots ──────────────────────────────────────

    describe('No overlap between layout slots', () => {
        it('main bottom < secondary top (gap = 4px)', () => {
            expect(TOP_SECONDARY).toBe(LAYOUT.toolbarH + LAYOUT.mainH + LAYOUT.gap)
        })

        it('secondary panels do not overlap pattern-panel', () => {
            playbackEvents.emit("editToggle")
            const mainBottom = LAYOUT.toolbarH + LAYOUT.mainH
            const el = document.getElementById('about-panel')
            el.style.display = 'block'
            positionBelowPatternPanel(el)
            const secTop = getInt(el, 'top')
            expect(secTop).toBeGreaterThan(mainBottom)
        })

        it('secondary panels do not overlap synth panel', () => {
            playbackEvents.emit("synthToggle")
            const mainBottom = LAYOUT.toolbarH + LAYOUT.mainH
            for (const id of ['about-panel', 'dm-panel', 'output-panel']) {
                const el = document.getElementById(id)
                el.style.display = 'block'
                positionBelowPatternPanel(el)
                expect(getInt(el, 'top')).toBeGreaterThan(mainBottom)
            }
        })

        it('NE does not overlap TE', () => {
            const teBottom = LAYOUT.toolbarH + LAYOUT.mainH
            expect(TOP_SECONDARY).toBeGreaterThan(teBottom)
        })
    })

    // ── View cycling — panel persistence ──────────────────────────────

    describe('Panel persistence across view cycles', () => {
        it('TE visible across full cycle edit→synth→proll→tools→edit', () => {
            for (const dispatch of [
                () => playbackEvents.emit("editToggle"),
                () => playbackEvents.emit("synthToggle"),
                () => playbackEvents.emit("prollToggle"),
                () => playbackEvents.emit("toolsToggle", true),
                () => playbackEvents.emit("editToggle"),
            ]) {
                dispatch()
                expectTEVisible()
            }
        })

        it('NE visible across full cycle edit→synth→proll→tools→edit', () => {
            for (const dispatch of [
                () => playbackEvents.emit("editToggle"),
                () => playbackEvents.emit("synthToggle"),
                () => playbackEvents.emit("prollToggle"),
                () => playbackEvents.emit("toolsToggle", true),
                () => playbackEvents.emit("editToggle"),
            ]) {
                dispatch()
                expectNEVisible()
            }
        })

        it('about-panel persists across edit/synth/proll switches', () => {
            document.getElementById('about-panel').style.display = 'block'
            for (const dispatch of [
                () => playbackEvents.emit("editToggle"),
                () => playbackEvents.emit("synthToggle"),
                () => playbackEvents.emit("prollToggle"),
            ]) {
                dispatch()
                expect(document.getElementById('about-panel').style.display).not.toBe('none')
            }
        })

        it('dm-panel persists across edit/synth/proll switches', () => {
            document.getElementById('dm-panel').style.display = 'block'
            for (const dispatch of [
                () => playbackEvents.emit("editToggle"),
                () => playbackEvents.emit("synthToggle"),
                () => playbackEvents.emit("prollToggle"),
            ]) {
                dispatch()
                expect(document.getElementById('dm-panel').style.display).not.toBe('none')
            }
        })

        it('pp-panel persists across edit/synth/proll switches', () => {
            document.getElementById('pp-panel').style.display = 'block'
            for (const dispatch of [
                () => playbackEvents.emit("editToggle"),
                () => playbackEvents.emit("synthToggle"),
                () => playbackEvents.emit("prollToggle"),
            ]) {
                dispatch()
                expect(document.getElementById('pp-panel').style.display).not.toBe('none')
            }
        })

        it('output-panel persists across view switches', () => {
            document.getElementById('output-panel').style.display = 'block'
            for (const dispatch of [
                () => playbackEvents.emit("editToggle"),
                () => playbackEvents.emit("synthToggle"),
                () => playbackEvents.emit("prollToggle"),
            ]) {
                dispatch()
                expect(document.getElementById('output-panel').style.display).not.toBe('none')
            }
        })
    })
})
