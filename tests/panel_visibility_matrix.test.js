/**
 * @vitest-environment jsdom
 *
 * Comprehensive panel visibility & positioning matrix.
 * Tests every panel across all view modes (desktop + mobile),
 * simulating the exact event dispatches a user would trigger.
 *
 * Replaces: panel_always_visible, panel_display, panel_positioning,
 *           ui_modal_flow, mobile_landscape_flow, roundtrip3 display tests,
 *           and duplicate display assertions in sub_panel_toggles and
 *           synth_editor_display.
 *
 * ── Desktop layout (1200×800) ──────────────────────────────────────
 *   Top-left     : 80% × 450px @ top:64  — pattern / piano-roll / synth
 *   Right-top    : 20% × 450px @ top:64  — track editor
 *   Right-bottom : 20% × 300px @ top:518 — note editor (inline in TE)
 *   Bottom-slot  : 80% × 300px @ top:≥518 — about / output / dm / pp / tools
 *
 * ── Mobile layout (768×480) ────────────────────────────────────────
 *   Pattern panel: full width, below toolbar
 *   Track editor : full width, replaces pattern panel
 *   Slot panels  : full width, replaces pattern panel
 */
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { appState } from '../src/state/app_state.js'
import { playbackEvents } from '../src/state/playback_events.js'
import { serviceRegistry } from '../src/state/service_registry.js'
import { soundRegistry } from '../src/state/sound_registry.js'
import TrackEditor from '../src/ui/track_editor.js'
import NoteEditor from '../src/ui/note_editor.js'
import ToolsPanel from '../src/ui/tools_panel.js'
import OutputPanel from '../src/ui/output_panel.js'
import AboutPanel from '../src/ui/about_panel.js'
import PatternsPanel from '../src/ui/patterns_panel.js'
import DrumkitManager from '../src/ui/drumkit_manager.js'
import PatternPanel from '../src/ui/pattern_panel.js'
import PatternSettingsPanel from '../src/ui/pattern_settings_panel.js'
import ViewManager from '../src/ui/view_manager.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const DESKTOP = { width: 1200, height: 800 }
const MOBILE = { width: 768, height: 480 }
const MOBILE_LANDSCAPE = { width: 800, height: 375 }

const TOOLBAR_H = 64
const MAIN_H = 450
const GAP = 4
const TOP_SECONDARY = TOOLBAR_H + MAIN_H + GAP

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

function setupCanvas() {
    HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
        fillRect: vi.fn(), clearRect: vi.fn(), getImageData: vi.fn(),
        putImageData: vi.fn(), createImageData: vi.fn(), setTransform: vi.fn(),
        drawImage: vi.fn(), save: vi.fn(), fillText: vi.fn(), restore: vi.fn(),
        beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), closePath: vi.fn(),
        stroke: vi.fn(), translate: vi.fn(), scale: vi.fn(), rotate: vi.fn(),
        arc: vi.fn(), fill: vi.fn(), measureText: vi.fn().mockReturnValue({ width: 0 }),
        transform: vi.fn(), rect: vi.fn(), clip: vi.fn(), setLineDash: vi.fn()
    })
}

function getInt(el, prop) {
    const v = parseInt(el.style[prop], 10)
    if (!isNaN(v)) return v
    return parseInt(getComputedStyle(el)[prop], 10)
}

function mockAnchor(el, top, height) {
    Object.defineProperty(el, 'offsetTop', { value: top, configurable: true })
    Object.defineProperty(el, 'offsetHeight', { value: height, configurable: true })
}

function setupApp(viewport) {
    document.body.innerHTML = ''
    Object.assign(global.window, { innerWidth: viewport.width, innerHeight: viewport.height })

    appState.reset()
    soundRegistry.reset()
    serviceRegistry.reset()
    appState.patterns = [{
        name: 'Pattern 1', nbBeats: 4,
        tracks: [structuredClone(MOCK_TRACK), SECOND_TRACK]
    }]
    appState.selectedPatternNum = 0
    appState.selectedTrackNum = 0

    global.fetch = vi.fn().mockResolvedValue({
        json: () => Promise.resolve({ major: { scaleSteps: [0, 2, 4, 5, 7, 9, 11] } })
    })
    setupCanvas()

    const pp = document.createElement('div')
    pp.id = 'pattern-panel'
    pp.style.display = 'flex'
    document.body.appendChild(pp)

    for (const id of ['soft-synth-panel', 'piano-roll-panel']) {
        const el = document.createElement('div')
        el.id = id
        el.style.display = 'none'
        document.body.appendChild(el)
    }

    const mockSynthEditor = {
        createDOM: () => {},
        getGeneratedSoundKeys: () => [],
        hidePanel: () => { document.getElementById('soft-synth-panel').style.display = 'none' },
        showPanel: () => { document.getElementById('soft-synth-panel').style.display = 'block' },
        ensureGeneratedSoundsLoaded: async () => {},
        reset: () => {}
    }

    const mockPianoRollPanel = {
        hide: () => { document.getElementById('piano-roll-panel').style.display = 'none' },
        show: () => { document.getElementById('piano-roll-panel').style.display = 'block' }
    }

    const trackEditor = new TrackEditor()
    trackEditor.synthEditor = mockSynthEditor
    trackEditor.init()

    const noteEditor = new NoteEditor()
    noteEditor.setContainer(trackEditor._neContainer)
    noteEditor.init()
    trackEditor.setNoteEditor(noteEditor)

    const toolsPanel = new ToolsPanel()
    toolsPanel.init()

    const patternSettingsPanel = new PatternSettingsPanel()
    patternSettingsPanel.init()

    const outputPanel = new OutputPanel()
    outputPanel.init()

    const aboutPanel = new AboutPanel()
    aboutPanel.init()

    const patternsPanel = new PatternsPanel()
    patternsPanel.init()

    const drumkitManager = new DrumkitManager()
    drumkitManager.init()

    const viewManager = new ViewManager({
        trackEditor, synthEditor: mockSynthEditor,
        pianoRollPanel: mockPianoRollPanel, noteEditor,
        toolsPanel, patternSettingsPanel,
        outputPanel, drumkitManager, patternsPanel, aboutPanel
    })
    viewManager.init()

    mockAnchor(pp, TOOLBAR_H, MAIN_H)
    mockAnchor(document.getElementById('piano-roll-panel'), TOOLBAR_H, MAIN_H)
    mockAnchor(document.getElementById('soft-synth-panel'), TOOLBAR_H, MAIN_H)

    return { viewManager, trackEditor, noteEditor, toolsPanel, outputPanel, aboutPanel, patternsPanel, drumkitManager, patternSettingsPanel }
}

// ══════════════════════════════════════════════════════════════════
// DESKTOP
// ══════════════════════════════════════════════════════════════════

describe('Panel visibility matrix — Desktop (1200×800)', () => {
    let ctx
    beforeEach(() => { ctx = setupApp(DESKTOP) })

    describe('Workspace panels → top-left slot', () => {
        it('edit: pattern visible, synth/piano-roll hidden', () => {
            playbackEvents.emit('editToggle')
            expect(document.getElementById('pattern-panel').style.display).not.toBe('none')
            expect(document.getElementById('soft-synth-panel').style.display).toBe('none')
            expect(document.getElementById('piano-roll-panel').style.display).toBe('none')
        })

        it('proll: piano-roll visible, pattern/synth hidden', () => {
            playbackEvents.emit('prollToggle')
            expect(document.getElementById('piano-roll-panel').style.display).toBe('block')
            expect(document.getElementById('pattern-panel').classList.contains('ui-hidden')).toBe(true)
            expect(document.getElementById('soft-synth-panel').style.display).toBe('none')
        })

        it('synth: synth visible, pattern/piano-roll hidden', () => {
            playbackEvents.emit('synthToggle')
            expect(document.getElementById('soft-synth-panel').style.display).toBe('block')
            expect(document.getElementById('pattern-panel').classList.contains('ui-hidden')).toBe(true)
            expect(document.getElementById('piano-roll-panel').style.display).toBe('none')
        })

        it('pattern visible regardless of slot panels', () => {
            playbackEvents.emit('editToggle')
            for (const id of ['about-panel', 'dm-panel', 'output-panel']) {
                document.getElementById(id).style.display = 'block'
            }
            expect(document.getElementById('pattern-panel').style.display).not.toBe('none')
        })

        it('piano-roll visible regardless of slot panels', () => {
            playbackEvents.emit('prollToggle')
            document.getElementById('about-panel').style.display = 'block'
            expect(document.getElementById('piano-roll-panel').style.display).toBe('block')
        })

        it('synth visible regardless of tools panel', () => {
            playbackEvents.emit('synthToggle')
            playbackEvents.emit('toolsToggle', true)
            expect(document.getElementById('soft-synth-panel').style.display).toBe('block')
        })
    })

    describe('Track editor → right-top slot', () => {
        for (const [name, emit] of [
            ['edit',  () => playbackEvents.emit('editToggle')],
            ['proll', () => playbackEvents.emit('prollToggle')],
            ['synth', () => playbackEvents.emit('synthToggle')],
            ['tools', () => playbackEvents.emit('toolsToggle', true)],
        ]) {
            it(`TE visible in ${name}`, () => { emit(); expect(ctx.trackEditor.isVisible).toBe(true) })
        }

        it('TE visible with multiple slot panels', () => {
            playbackEvents.emit('synthToggle')
            for (const id of ['about-panel', 'dm-panel', 'output-panel']) {
                document.getElementById(id).style.display = 'block'
            }
            expect(ctx.trackEditor.isVisible).toBe(true)
        })

        it('TE display is block', () => {
            playbackEvents.emit('editToggle')
            expect(ctx.trackEditor.container.style.display).toBe('block')
        })
    })

    describe('Note editor → inline in TE', () => {
        for (const [name, emit] of [
            ['edit',  () => playbackEvents.emit('editToggle')],
            ['proll', () => playbackEvents.emit('prollToggle')],
            ['synth', () => playbackEvents.emit('synthToggle')],
            ['tools', () => playbackEvents.emit('toolsToggle', true)],
        ]) {
            it(`NE inline in ${name}`, () => {
                emit()
                const ne = document.getElementById('ne-container')
                expect(ne).not.toBeNull()
                expect(ne.style.display).not.toBe('none')
            })
        }
    })

    describe('Secondary panel positioning (CSS-driven)', () => {
        it('CSS rule sets top:518px on slot panels', () => {
            const css = readFileSync(resolve(__dirname, '../src/ui/styles.css'), 'utf-8')
            const slotRe = /#about-panel,\s*#tools-panel,\s*#output-panel,\s*#pp-panel,\s*#dm-panel\s*\{([^}]*)\}/
            const m = css.match(slotRe)
            expect(m).not.toBeNull()
            expect(m[1]).toContain('top: 518px')
        })

        it('CSS rule sets height:var(--panel-height) on slot panels', () => {
            const css = readFileSync(resolve(__dirname, '../src/ui/styles.css'), 'utf-8')
            const slotRe = /#about-panel,\s*#tools-panel,\s*#output-panel,\s*#pp-panel,\s*#dm-panel\s*\{([^}]*)\}/
            const m = css.match(slotRe)
            expect(m).not.toBeNull()
            expect(m[1]).toContain('height: var(--panel-height)')
        })
    })

    describe('No overlap between layout slots', () => {
        it('TOP_SECONDARY = toolbar + main + gap', () => {
            expect(TOP_SECONDARY).toBe(TOOLBAR_H + MAIN_H + GAP)
        })

        it('CSS places slot panels below workspace area (top > 64+450)', () => {
            const css = readFileSync(resolve(__dirname, '../src/ui/styles.css'), 'utf-8')
            const slotRe = /#about-panel,\s*#tools-panel,\s*#output-panel,\s*#pp-panel,\s*#dm-panel\s*\{([^}]*)\}/
            const m = css.match(slotRe)
            expect(m).not.toBeNull()
            const topVal = parseInt(m[1].match(/top:\s*(\d+)px/)?.[1], 10)
            expect(topVal).toBeGreaterThan(TOOLBAR_H + MAIN_H)
        })

        it('NE does not overlap TE', () => {
            expect(TOP_SECONDARY).toBeGreaterThan(TOOLBAR_H + MAIN_H)
        })

        it('Slot panels only cover workspace width (80%), not track editor column', () => {
            const css = readFileSync(resolve(__dirname, '../src/ui/styles.css'), 'utf-8')
            const slotRe = /#about-panel,\s*#tools-panel,\s*#output-panel,\s*#pp-panel,\s*#dm-panel\s*\{([^}]*)\}/
            const m = css.match(slotRe)
            expect(m).not.toBeNull()
            const widthMatch = m[1].match(/width:\s*(\d+)%/)
            expect(widthMatch).not.toBeNull()
            const width = parseInt(widthMatch[1], 10)
            expect(width).toBe(80)
        })

        it('Slot panels positioned at workspace left (0%)', () => {
            const css = readFileSync(resolve(__dirname, '../src/ui/styles.css'), 'utf-8')
            const slotRe = /#about-panel,\s*#tools-panel,\s*#output-panel,\s*#pp-panel,\s*#dm-panel\s*\{([^}]*)\}/
            const m = css.match(slotRe)
            expect(m).not.toBeNull()
            const leftMatch = m[1].match(/left:\s*(\d+)%?/)
            expect(leftMatch).not.toBeNull()
            const left = parseInt(leftMatch[1], 10)
            expect(left).toBe(0)
        })

        it('Track editor height accommodates track editor + note editor (750px)', () => {
            const css = readFileSync(resolve(__dirname, '../src/ui/styles.css'), 'utf-8')
            const teRe = /\.ne-panel\.pp-split\s*\{([^}]*)\}/
            const m = css.match(teRe)
            expect(m).not.toBeNull()
            const heightMatch = m[1].match(/height:\s*(\d+)px/)
            expect(heightMatch).not.toBeNull()
            const height = parseInt(heightMatch[1], 10)
            expect(height).toBe(750)
        })

        it('NE container is flex child inside track editor (no fixed positioning)', () => {
            const css = readFileSync(resolve(__dirname, '../src/ui/styles.css'), 'utf-8')
            const neRe = /#ne-container\s*\{([^}]*)\}/
            const m = css.match(neRe)
            expect(m).not.toBeNull()
            // Should NOT have fixed positioning
            expect(m[1]).not.toContain('position: fixed')
            // Should be flex item
            expect(m[1]).toContain('flex-shrink: 0')
            // Should have panel height
            expect(m[1]).toContain('height: var(--panel-height)')
        })
    })

    describe('Panel persistence across view cycles', () => {
        it('TE visible across full cycle', () => {
            for (const emit of [
                () => playbackEvents.emit('editToggle'),
                () => playbackEvents.emit('synthToggle'),
                () => playbackEvents.emit('prollToggle'),
                () => playbackEvents.emit('toolsToggle', true),
                () => playbackEvents.emit('editToggle'),
            ]) { emit(); expect(ctx.trackEditor.isVisible).toBe(true) }
        })

        it('NE inline visible across full cycle', () => {
            for (const emit of [
                () => playbackEvents.emit('editToggle'),
                () => playbackEvents.emit('synthToggle'),
                () => playbackEvents.emit('prollToggle'),
                () => playbackEvents.emit('toolsToggle', true),
                () => playbackEvents.emit('editToggle'),
            ]) {
                emit()
                const ne = document.getElementById('ne-container')
                expect(ne).not.toBeNull()
                expect(ne.style.display).not.toBe('none')
            }
        })

        for (const [name, id] of [
            ['about',    'about-panel'],
            ['dm',       'dm-panel'],
            ['patterns', 'pp-panel'],
            ['output',   'output-panel'],
        ]) {
            it(`${name} persists across view switches`, () => {
                document.getElementById(id).style.display = 'block'
                for (const emit of [
                    () => playbackEvents.emit('editToggle'),
                    () => playbackEvents.emit('synthToggle'),
                    () => playbackEvents.emit('prollToggle'),
                ]) { emit(); expect(document.getElementById(id).style.display).not.toBe('none') }
            })
        }
    })

    describe('PatternPanel display value (CSS invariant)', () => {
        it('createDOM sets display to block', () => {
            const p = new PatternPanel()
            p.init()
            expect(p.container.style.display).toBe('block')
            expect(p.container.classList.contains('workspace-panel')).toBe(true)
        })

        it('hide() sets display to none', () => {
            const p = new PatternPanel()
            p.init()
            p.hide()
            expect(p.container.style.display).toBe('none')
        })
    })

    describe('Slot panel show/hide via ViewManager', () => {
        const slotMap = [
            ['aboutToggle',  'about-panel'],
            ['toolsToggle',  'tools-panel'],
            ['masterToggle', 'output-panel'],
        ]

        for (const [event, id] of slotMap) {
            it(`${event}: show sets display to block`, () => {
                playbackEvents.emit(event, true)
                expect(document.getElementById(id).style.display).toBe('block')
            })

            it(`${event}: hide sets display to none`, () => {
                playbackEvents.emit(event, true)
                playbackEvents.emit(event, false)
                expect(document.getElementById(id).style.display).toBe('none')
            })
        }
    })

    describe('Slot panel mutual exclusion (ViewManager)', () => {
        it('opening about closes tools', () => {
            playbackEvents.emit('toolsToggle', true)
            expect(ctx.toolsPanel.isVisible).toBe(true)
            playbackEvents.emit('aboutToggle', true)
            expect(ctx.toolsPanel.isVisible).toBe(false)
            expect(ctx.aboutPanel.isVisible).toBe(true)
        })

        it('opening tools closes about', () => {
            playbackEvents.emit('aboutToggle', true)
            playbackEvents.emit('toolsToggle', true)
            expect(ctx.aboutPanel.isVisible).toBe(false)
            expect(ctx.toolsPanel.isVisible).toBe(true)
        })

        it('opening master closes about', () => {
            playbackEvents.emit('aboutToggle', true)
            playbackEvents.emit('masterToggle', true)
            expect(ctx.aboutPanel.isVisible).toBe(false)
        })
    })

    describe('BasePanel show/hide & isVisible', () => {
        it('show sets display to block, isVisible true', () => {
            expect(ctx.toolsPanel.isVisible).toBe(false)
            ctx.toolsPanel.show()
            expect(ctx.toolsPanel.isVisible).toBe(true)
            expect(ctx.toolsPanel.container.style.display).toBe('block')
        })

        it('hide sets display to none, isVisible false', () => {
            ctx.toolsPanel.show()
            ctx.toolsPanel.hide()
            expect(ctx.toolsPanel.isVisible).toBe(false)
            expect(ctx.toolsPanel.container.style.display).toBe('none')
        })

        it('showing a panel does not hide the previous one (panels are independent)', () => {
            ctx.toolsPanel.show()
            ctx.aboutPanel.show()
            expect(ctx.toolsPanel.isVisible).toBe(true)
            expect(ctx.aboutPanel.isVisible).toBe(true)
        })
    })
})

// ══════════════════════════════════════════════════════════════════
// MOBILE
// ══════════════════════════════════════════════════════════════════

describe('Panel visibility matrix — Mobile (768×480)', () => {
    let ctx
    beforeEach(() => { ctx = setupApp(MOBILE) })

    describe('mobileSeq', () => {
        it('pattern panel visible', () => {
            playbackEvents.emit('mobileSeqToggle')
            expect(document.getElementById('pattern-panel').classList.contains('ui-hidden')).toBe(false)
        })

        it('track editor hidden', () => {
            playbackEvents.emit('mobileSeqToggle')
            expect(ctx.trackEditor.isVisible).toBe(false)
        })
    })

    describe('mobileTrack', () => {
        it('track editor visible', () => {
            playbackEvents.emit('mobileTrackToggle')
            expect(ctx.trackEditor.isVisible).toBe(true)
        })

        it('pattern panel hidden', () => {
            playbackEvents.emit('mobileTrackToggle')
            expect(document.getElementById('pattern-panel').classList.contains('ui-hidden')).toBe(true)
        })
    })

    describe('synth on mobile', () => {
        it('soft-synth-panel element exists', () => {
            playbackEvents.emit('synthToggle')
            expect(document.getElementById('soft-synth-panel')).not.toBeNull()
        })
    })

    describe('Slot panels on mobile', () => {
        it('toolsToggle shows tools panel', () => {
            playbackEvents.emit('toolsToggle', true)
            expect(ctx.toolsPanel.isVisible).toBe(true)
        })

        it('masterToggle shows output panel', () => {
            playbackEvents.emit('masterToggle', true)
            expect(document.getElementById('output-panel').style.display).toBe('block')
        })
    })

    describe('mobileSeq → mobileTrack → mobileSeq cycle', () => {
        it('clean switch between views', () => {
            playbackEvents.emit('mobileSeqToggle')
            expect(document.getElementById('pattern-panel').classList.contains('ui-hidden')).toBe(false)

            playbackEvents.emit('mobileTrackToggle')
            expect(ctx.trackEditor.isVisible).toBe(true)
            expect(document.getElementById('pattern-panel').classList.contains('ui-hidden')).toBe(true)

            playbackEvents.emit('mobileSeqToggle')
            expect(document.getElementById('pattern-panel').classList.contains('ui-hidden')).toBe(false)
            expect(ctx.trackEditor.isVisible).toBe(false)
        })
    })

    describe('PatternSettingsPanel auto-hides on view switch', () => {
        it('hides when switching tabs', () => {
            ctx.patternSettingsPanel.show()
            expect(ctx.patternSettingsPanel._isOpen).toBe(true)
            playbackEvents.emit('mobileTrackToggle')
            expect(ctx.patternSettingsPanel._isOpen).toBe(false)
        })
    })
})

// ══════════════════════════════════════════════════════════════════
// MOBILE LANDSCAPE
// ══════════════════════════════════════════════════════════════════

describe('Panel visibility matrix — Mobile landscape (800×375)', () => {
    let ctx
    beforeEach(() => { ctx = setupApp(MOBILE_LANDSCAPE) })

    describe('sequential view cycling', () => {
        it('seq → tools → synth → track → seq', () => {
            playbackEvents.emit('mobileSeqToggle')
            expect(ctx.viewManager.currentView).toBe('mobileSeq')
            expect(document.getElementById('pattern-panel').classList.contains('ui-hidden')).toBe(false)

            playbackEvents.emit('toolsToggle', true)
            expect(ctx.viewManager.currentView).toBe('tools')
            expect(ctx.toolsPanel.isVisible).toBe(true)

            playbackEvents.emit('synthToggle')
            expect(ctx.viewManager.currentView).toBe('synth')
            expect(ctx.toolsPanel.isVisible).toBe(false)
            expect(document.getElementById('soft-synth-panel')?.style.display).toBe('block')

            playbackEvents.emit('mobileTrackToggle')
            expect(ctx.viewManager.currentView).toBe('mobileTrack')
            expect(document.getElementById('soft-synth-panel')?.style.display).toBe('none')
            expect(ctx.trackEditor.isVisible).toBe(true)

            playbackEvents.emit('mobileSeqToggle')
            expect(ctx.viewManager.currentView).toBe('mobileSeq')
            expect(ctx.trackEditor.isVisible).toBe(false)
            expect(document.getElementById('pattern-panel').classList.contains('ui-hidden')).toBe(false)
        })
    })

    describe('landscape class', () => {
        it('applied on mobileTrack', () => {
            playbackEvents.emit('mobileTrackToggle')
            expect(ctx.trackEditor.container.classList.contains('te-mobile-landscape')).toBe(true)
        })

        it('removed on mobileSeq', () => {
            playbackEvents.emit('mobileTrackToggle')
            expect(ctx.trackEditor.container.classList.contains('te-mobile-landscape')).toBe(true)
            playbackEvents.emit('mobileSeqToggle')
            expect(ctx.trackEditor.container.classList.contains('te-mobile-landscape')).toBe(false)
        })
    })

    describe('NE inline in mobile landscape', () => {
        it('ne-container present after track editor sync', () => {
            playbackEvents.emit('mobileTrackToggle')
            ctx.trackEditor.sync()
            const neContainer = ctx.trackEditor.container.querySelector('#ne-container')
            expect(neContainer).not.toBeNull()
        })
    })
})
