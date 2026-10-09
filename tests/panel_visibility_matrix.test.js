/**
 * @vitest-environment jsdom
 *
 * Comprehensive panel visibility & positioning matrix.
 * Tests every panel across all view modes (desktop + mobile),
 * simulating the exact event dispatches a user would trigger.
 *
 * Replaces: panel_always_visible, panel_display, panel_positioning,
 *           ui_modal_flow, mobile_landscape_flow, roundtrip3 display tests,
 *           and duplicate display assertions in synth_editor_display.
 *
 * ── Desktop layout (1200×800) ──────────────────────────────────────
 *   Top-left     : 75% × 450px @ top:64  — pattern / piano-roll / synth
 *   Right-top    : 25% × 450px @ top:64  — track editor
 *   Right-bottom : 25% × 300px @ top:518 — note editor (inline in TE)
 *   Bottom-slot  : 75% × 300px @ top:≥518 — about / output / dm / pp / tools
 *
 * ── Mobile layout (768×480) ────────────────────────────────────────
 *   Pattern panel: full width, below toolbar
 *   Track editor : full width, replaces pattern panel
 *   Slot panels  : full width, replaces pattern panel
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { appState } from '../src/state/app_state.js'
import { playbackEvents } from '../src/state/event_bus.js'
import { serviceRegistry } from '../src/state/service_registry.js'
import { soundRegistry } from '../src/state/sound_registry.js'
import TrackEditor from '../src/ui/track_editor.js'
import NoteEditor from '../src/ui/note_editor.js'
import ToolsPanel from '../src/ui/tools_panel.js'
import OutputPanel from '../src/ui/output_panel.js'
import AboutPanel from '../src/ui/about_panel.js'
import SongPanel from '../src/ui/song_panel.js'
import DrumkitManager from '../src/ui/drumkit_manager.js'
import PatternPanel from '../src/ui/pattern_panel.js'
import PatternSettingsPanel from '../src/ui/pattern_settings_panel.js'
import ViewManager from '../src/ui/view_manager.js'
import { EVENTS } from '../src/core/events.js'

const DESKTOP = { width: 1200, height: 800 }
const MOBILE = { width: 768, height: 480 }
const MOBILE_LANDSCAPE = { width: 800, height: 375 }

const TOOLBAR_H = 64
const MAIN_H = 450

const MOCK_TRACK = {
    name: 'KICK',
    notes: [{ beat: 0, beatStep: 0, pitch: 0, velocity: 0.8 }],
    beatCount: 4,
    stepsPerBeat: 4,
    loopAtStep: 16,
    mute: false,
    solo: false,
    useAutoAssignSound: true,
    velocity: 0.8,
    pan: 0,
    pitch: 0,
    filterCutoff: 12000,
    filterResonance: 1,
    filterType: 'lowpass',
    filterLfo: 0,
    filterEnvelopeAmount: 0,
    pitchLfo: 0,
    volumeLfo: 0,
    panLfo: 0,
    filterLfoValue: 0,
    pitchEnv: 0,
    delaySend: 0,
    reverbSend: 0,
    saturationDrive: 0,
    delayActive: false,
    reverbActive: false,
    saturationActive: false,
    swingAmount: 0,
    swingMode: 'off',
    synthSoundKey: 'BASS1',
}
const SECOND_TRACK = { ...structuredClone(MOCK_TRACK), name: 'SNARE' }

function setupCanvas() {
    HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
        fillRect: vi.fn(),
        clearRect: vi.fn(),
        getImageData: vi.fn(),
        putImageData: vi.fn(),
        createImageData: vi.fn(),
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
        rotate: vi.fn(),
        arc: vi.fn(),
        fill: vi.fn(),
        measureText: vi.fn().mockReturnValue({ width: 0 }),
        transform: vi.fn(),
        rect: vi.fn(),
        clip: vi.fn(),
        setLineDash: vi.fn(),
    })
}

function mockAnchor(el, top, height) {
    Object.defineProperty(el, 'offsetTop', { value: top, configurable: true })
    Object.defineProperty(el, 'offsetHeight', { value: height, configurable: true })
}

const liveApps = []

// ViewManager is not a BasePanel: only this releases its bus subscriptions.
afterEach(() => {
    liveApps.splice(0).forEach((app) => app.viewManager.destroy())
})

function setupApp(viewport) {
    document.body.innerHTML = ''
    Object.assign(global.window, { innerWidth: viewport.width, innerHeight: viewport.height })

    appState.reset()
    soundRegistry.reset()
    serviceRegistry.reset()
    appState.patterns = [
        {
            name: 'Pattern 1',
            beatCount: 4,
            tracks: [structuredClone(MOCK_TRACK), SECOND_TRACK],
        },
    ]
    appState.selectedPatternIdx = 0
    appState.selectedTrackIdx = 0

    global.fetch = vi.fn().mockResolvedValue({
        json: () => Promise.resolve({ major: { scaleSteps: [0, 2, 4, 5, 7, 9, 11] } }),
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
        closePanelAndCommit: () => {
            document.getElementById('soft-synth-panel').style.display = 'none'
        },
        showPanel: () => {
            document.getElementById('soft-synth-panel').style.display = 'block'
        },
        ensureGeneratedSoundsLoaded: async () => {},
        reset: () => {},
    }

    const mockPianoRollPanel = {
        hide: () => {
            document.getElementById('piano-roll-panel').style.display = 'none'
        },
        show: () => {
            document.getElementById('piano-roll-panel').style.display = 'block'
        },
    }

    const trackEditor = new TrackEditor()
    trackEditor.synthEditor = mockSynthEditor
    trackEditor.init()

    const noteEditor = new NoteEditor()
    noteEditor.setContainer(trackEditor.neContainer)
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

    const songPanel = new SongPanel()
    songPanel.init()

    const drumkitManager = new DrumkitManager()
    drumkitManager.init()

    const viewManager = new ViewManager({
        trackEditor,
        synthEditor: mockSynthEditor,
        pianoRollPanel: mockPianoRollPanel,
        noteEditor,
        toolsPanel,
        patternSettingsPanel,
        outputPanel,
        drumkitManager,
        songPanel,
        aboutPanel,
    })
    viewManager.init()

    mockAnchor(pp, TOOLBAR_H, MAIN_H)
    mockAnchor(document.getElementById('piano-roll-panel'), TOOLBAR_H, MAIN_H)
    mockAnchor(document.getElementById('soft-synth-panel'), TOOLBAR_H, MAIN_H)

    const app = {
        viewManager,
        trackEditor,
        noteEditor,
        toolsPanel,
        outputPanel,
        aboutPanel,
        songPanel,
        drumkitManager,
        patternSettingsPanel,
    }
    liveApps.push(app)
    return app
}

// ══════════════════════════════════════════════════════════════════
// DESKTOP
// ══════════════════════════════════════════════════════════════════

describe('Panel visibility matrix — Desktop (1200×800)', () => {
    let ctx
    beforeEach(() => {
        ctx = setupApp(DESKTOP)
    })

    describe('Workspace panels → top-left slot', () => {
        it('edit: pattern visible, synth/piano-roll hidden', () => {
            playbackEvents.emit(EVENTS.EDIT_TOGGLE)
            expect(document.getElementById('pattern-panel').style.display).not.toBe('none')
            expect(document.getElementById('soft-synth-panel').style.display).toBe('none')
            expect(document.getElementById('piano-roll-panel').style.display).toBe('none')
        })

        it('proll: piano-roll visible, pattern/synth hidden', () => {
            playbackEvents.emit(EVENTS.PROLL_TOGGLE)
            expect(document.getElementById('piano-roll-panel').style.display).toBe('block')
            expect(document.getElementById('pattern-panel').classList.contains('ui-hidden')).toBe(true)
            expect(document.getElementById('soft-synth-panel').style.display).toBe('none')
        })

        it('synth: synth visible, pattern/piano-roll hidden', () => {
            playbackEvents.emit(EVENTS.SYNTH_TOGGLE)
            expect(document.getElementById('soft-synth-panel').style.display).toBe('block')
            expect(document.getElementById('pattern-panel').classList.contains('ui-hidden')).toBe(true)
            expect(document.getElementById('piano-roll-panel').style.display).toBe('none')
        })

        it('pattern visible regardless of slot panels', () => {
            playbackEvents.emit(EVENTS.EDIT_TOGGLE)
            for (const id of ['about-panel', 'dm-panel', 'output-panel']) {
                document.getElementById(id).style.display = 'block'
            }
            expect(document.getElementById('pattern-panel').style.display).not.toBe('none')
        })

        it('piano-roll visible regardless of slot panels', () => {
            playbackEvents.emit(EVENTS.PROLL_TOGGLE)
            document.getElementById('about-panel').style.display = 'block'
            expect(document.getElementById('piano-roll-panel').style.display).toBe('block')
        })

        it('synth visible regardless of tools panel', () => {
            playbackEvents.emit(EVENTS.SYNTH_TOGGLE)
            playbackEvents.emit(EVENTS.TOOLS_TOGGLE, true)
            expect(document.getElementById('soft-synth-panel').style.display).toBe('block')
        })
    })

    describe('Track editor → right-top slot', () => {
        for (const [name, emit] of [
            ['edit', () => playbackEvents.emit(EVENTS.EDIT_TOGGLE)],
            ['proll', () => playbackEvents.emit(EVENTS.PROLL_TOGGLE)],
            ['synth', () => playbackEvents.emit(EVENTS.SYNTH_TOGGLE)],
            ['tools', () => playbackEvents.emit(EVENTS.TOOLS_TOGGLE, true)],
        ]) {
            it(`TE visible in ${name}`, () => {
                emit()
                expect(ctx.trackEditor.isVisible).toBe(true)
            })
        }

        it('TE visible with multiple slot panels', () => {
            playbackEvents.emit(EVENTS.SYNTH_TOGGLE)
            for (const id of ['about-panel', 'dm-panel', 'output-panel']) {
                document.getElementById(id).style.display = 'block'
            }
            expect(ctx.trackEditor.isVisible).toBe(true)
        })

        it('TE display is block', () => {
            playbackEvents.emit(EVENTS.EDIT_TOGGLE)
            expect(ctx.trackEditor.container.style.display).toBe('block')
        })
    })

    describe('Note editor → inline in TE', () => {
        for (const [name, emit] of [
            ['edit', () => playbackEvents.emit(EVENTS.EDIT_TOGGLE)],
            ['proll', () => playbackEvents.emit(EVENTS.PROLL_TOGGLE)],
            ['synth', () => playbackEvents.emit(EVENTS.SYNTH_TOGGLE)],
            ['tools', () => playbackEvents.emit(EVENTS.TOOLS_TOGGLE, true)],
        ]) {
            it(`NE inline in ${name}`, () => {
                emit()
                const ne = document.getElementById('ne-container')
                expect(ne).not.toBeNull()
                expect(ne.style.display).not.toBe('none')
            })
        }
    })

    describe('Panel persistence across view cycles', () => {
        it('TE visible across full cycle', () => {
            for (const emit of [
                () => playbackEvents.emit(EVENTS.EDIT_TOGGLE),
                () => playbackEvents.emit(EVENTS.SYNTH_TOGGLE),
                () => playbackEvents.emit(EVENTS.PROLL_TOGGLE),
                () => playbackEvents.emit(EVENTS.TOOLS_TOGGLE, true),
                () => playbackEvents.emit(EVENTS.EDIT_TOGGLE),
            ]) {
                emit()
                expect(ctx.trackEditor.isVisible).toBe(true)
            }
        })

        it('NE inline visible across full cycle', () => {
            for (const emit of [
                () => playbackEvents.emit(EVENTS.EDIT_TOGGLE),
                () => playbackEvents.emit(EVENTS.SYNTH_TOGGLE),
                () => playbackEvents.emit(EVENTS.PROLL_TOGGLE),
                () => playbackEvents.emit(EVENTS.TOOLS_TOGGLE, true),
                () => playbackEvents.emit(EVENTS.EDIT_TOGGLE),
            ]) {
                emit()
                const ne = document.getElementById('ne-container')
                expect(ne).not.toBeNull()
                expect(ne.style.display).not.toBe('none')
            }
        })

        // 'song' is deliberately absent: it became a view, so it is hidden when
        // another view is entered, exactly like proll and the synth editor.
        for (const [name, id] of [
            ['about', 'about-panel'],
            ['dm', 'dm-panel'],
            ['output', 'output-panel'],
        ]) {
            it(`${name} persists across view switches`, () => {
                document.getElementById(id).style.display = 'block'
                for (const emit of [
                    () => playbackEvents.emit(EVENTS.EDIT_TOGGLE),
                    () => playbackEvents.emit(EVENTS.SYNTH_TOGGLE),
                    () => playbackEvents.emit(EVENTS.PROLL_TOGGLE),
                ]) {
                    emit()
                    expect(document.getElementById(id).style.display).not.toBe('none')
                }
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
            [EVENTS.ABOUT_TOGGLE, 'about-panel'],
            [EVENTS.TOOLS_TOGGLE, 'tools-panel'],
            [EVENTS.MASTER_TOGGLE, 'output-panel'],
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
            playbackEvents.emit(EVENTS.TOOLS_TOGGLE, true)
            expect(ctx.toolsPanel.isVisible).toBe(true)
            playbackEvents.emit(EVENTS.ABOUT_TOGGLE, true)
            expect(ctx.toolsPanel.isVisible).toBe(false)
            expect(ctx.aboutPanel.isVisible).toBe(true)
        })

        it('opening tools closes about', () => {
            playbackEvents.emit(EVENTS.ABOUT_TOGGLE, true)
            playbackEvents.emit(EVENTS.TOOLS_TOGGLE, true)
            expect(ctx.aboutPanel.isVisible).toBe(false)
            expect(ctx.toolsPanel.isVisible).toBe(true)
        })

        it('opening master closes about', () => {
            playbackEvents.emit(EVENTS.ABOUT_TOGGLE, true)
            playbackEvents.emit(EVENTS.MASTER_TOGGLE, true)
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

    describe('ViewManager destroy()', () => {
        it('stops switching views once destroyed', () => {
            playbackEvents.emit(EVENTS.EDIT_TOGGLE)
            expect(ctx.viewManager.currentView).toBe('edit')

            ctx.viewManager.destroy()

            playbackEvents.emit(EVENTS.SYNTH_TOGGLE)
            expect(ctx.viewManager.currentView).toBe('edit')
        })
    })
})

// ══════════════════════════════════════════════════════════════════
// MOBILE
// ══════════════════════════════════════════════════════════════════

describe('Panel visibility matrix — Mobile (768×480)', () => {
    let ctx
    beforeEach(() => {
        ctx = setupApp(MOBILE)
    })

    describe('synth on mobile', () => {
        it('soft-synth-panel element exists', () => {
            playbackEvents.emit(EVENTS.SYNTH_TOGGLE)
            expect(document.getElementById('soft-synth-panel')).not.toBeNull()
        })
    })

    describe('Slot panels on mobile', () => {
        it('toolsToggle shows tools panel', () => {
            playbackEvents.emit(EVENTS.TOOLS_TOGGLE, true)
            expect(ctx.toolsPanel.isVisible).toBe(true)
        })

        it('masterToggle shows output panel', () => {
            playbackEvents.emit(EVENTS.MASTER_TOGGLE, true)
            expect(document.getElementById('output-panel').style.display).toBe('block')
        })
    })

    // One test for the whole mobile cycle, instead of one per step: it asserts
    // the same four visibility facts plus their ordering.
    describe('mobileSeq → mobileTrack → mobileSeq cycle', () => {
        it('clean switch between views', () => {
            playbackEvents.emit(EVENTS.MOBILE_SEQ_TOGGLE)
            expect(document.getElementById('pattern-panel').classList.contains('ui-hidden')).toBe(false)

            playbackEvents.emit(EVENTS.MOBILE_TRACK_TOGGLE)
            expect(ctx.trackEditor.isVisible).toBe(true)
            expect(document.getElementById('pattern-panel').classList.contains('ui-hidden')).toBe(true)

            playbackEvents.emit(EVENTS.MOBILE_SEQ_TOGGLE)
            expect(document.getElementById('pattern-panel').classList.contains('ui-hidden')).toBe(false)
            expect(ctx.trackEditor.isVisible).toBe(false)
        })
    })

    // The song panel moved from the slot-panel registry (opened by the
    // toolbar's Pattern label) to the view registry (the View group's "Song"
    // button). These pin the new behaviour: it is a view, not a slot.
    describe('Song view (was a slot panel)', () => {
        it('is hidden before the view is entered', () => {
            expect(ctx.songPanel.isVisible).toBe(false)
        })

        it('shows on SONG_TOGGLE and reports song as the current view', () => {
            playbackEvents.emit(EVENTS.SONG_TOGGLE)
            expect(ctx.songPanel.isVisible).toBe(true)
            expect(ctx.viewManager.currentView).toBe('song')
        })

        it('hides the pattern panel, like the other workspace views', () => {
            playbackEvents.emit(EVENTS.SONG_TOGGLE)
            expect(document.getElementById('pattern-panel').classList.contains('ui-hidden')).toBe(true)
        })

        it('hides again when another view is entered', () => {
            playbackEvents.emit(EVENTS.SONG_TOGGLE)
            playbackEvents.emit(EVENTS.PROLL_TOGGLE)
            expect(ctx.songPanel.isVisible).toBe(false)
            expect(ctx.viewManager.currentView).toBe('proll')
        })

        it('re-entering song while already in song does not toggle it off', () => {
            playbackEvents.emit(EVENTS.SONG_TOGGLE)
            playbackEvents.emit(EVENTS.SONG_TOGGLE)
            expect(ctx.songPanel.isVisible).toBe(true)
            expect(ctx.viewManager.currentView).toBe('song')
        })

        it('keeps its content: the list and every action button are present', () => {
            playbackEvents.emit(EVENTS.SONG_TOGGLE)
            const panel = document.getElementById('song-panel')
            expect(panel.querySelector('#sg-list')).not.toBeNull()
            for (const id of ['#sg-song-name', '#sg-song-date', '#sg-song-desc']) {
                expect(panel.querySelector(id), id).not.toBeNull()
            }
            for (const id of ['#sg-save', '#sg-load', '#sg-export', '#sg-import']) {
                expect(panel.querySelector(id), id).not.toBeNull()
            }
            // Rename and Delete were dropped as redundant (double-click on a
            // name, and the x in the pattern panel header).
            for (const id of ['#sg-rename', '#sg-delete']) {
                expect(panel.querySelector(id), id).toBeNull()
            }
        })
    })

    describe('PatternSettingsPanel auto-hides on view switch', () => {
        it('hides when switching tabs', () => {
            ctx.patternSettingsPanel.show()
            expect(ctx.patternSettingsPanel.isOpen).toBe(true)
            playbackEvents.emit(EVENTS.MOBILE_TRACK_TOGGLE)
            expect(ctx.patternSettingsPanel.isOpen).toBe(false)
        })
    })
})

// ══════════════════════════════════════════════════════════════════
// MOBILE LANDSCAPE
// ══════════════════════════════════════════════════════════════════

describe('Panel visibility matrix — Mobile landscape (800×375)', () => {
    let ctx
    beforeEach(() => {
        ctx = setupApp(MOBILE_LANDSCAPE)
    })

    describe('sequential view cycling', () => {
        it('seq → tools → synth → track → seq', () => {
            playbackEvents.emit(EVENTS.MOBILE_SEQ_TOGGLE)
            expect(ctx.viewManager.currentView).toBe('mobileSeq')
            expect(document.getElementById('pattern-panel').classList.contains('ui-hidden')).toBe(false)

            playbackEvents.emit(EVENTS.TOOLS_TOGGLE, true)
            expect(ctx.viewManager.currentView).toBe('tools')
            expect(ctx.toolsPanel.isVisible).toBe(true)

            playbackEvents.emit(EVENTS.SYNTH_TOGGLE)
            expect(ctx.viewManager.currentView).toBe('synth')
            expect(ctx.toolsPanel.isVisible).toBe(false)
            expect(document.getElementById('soft-synth-panel')?.style.display).toBe('block')

            playbackEvents.emit(EVENTS.MOBILE_TRACK_TOGGLE)
            expect(ctx.viewManager.currentView).toBe('mobileTrack')
            expect(document.getElementById('soft-synth-panel')?.style.display).toBe('none')
            expect(ctx.trackEditor.isVisible).toBe(true)

            playbackEvents.emit(EVENTS.MOBILE_SEQ_TOGGLE)
            expect(ctx.viewManager.currentView).toBe('mobileSeq')
            expect(ctx.trackEditor.isVisible).toBe(false)
            expect(document.getElementById('pattern-panel').classList.contains('ui-hidden')).toBe(false)
        })
    })

    describe('landscape class', () => {
        it('applied on mobileTrack', () => {
            playbackEvents.emit(EVENTS.MOBILE_TRACK_TOGGLE)
            expect(ctx.trackEditor.container.classList.contains('te-mobile-landscape')).toBe(true)
        })

        it('removed on mobileSeq', () => {
            playbackEvents.emit(EVENTS.MOBILE_TRACK_TOGGLE)
            expect(ctx.trackEditor.container.classList.contains('te-mobile-landscape')).toBe(true)
            playbackEvents.emit(EVENTS.MOBILE_SEQ_TOGGLE)
            expect(ctx.trackEditor.container.classList.contains('te-mobile-landscape')).toBe(false)
        })
    })

    describe('NE inline in mobile landscape', () => {
        it('ne-container present after track editor sync', () => {
            playbackEvents.emit(EVENTS.MOBILE_TRACK_TOGGLE)
            ctx.trackEditor.sync()
            const neContainer = ctx.trackEditor.container.querySelector('#ne-container')
            expect(neContainer).not.toBeNull()
        })
    })
})
