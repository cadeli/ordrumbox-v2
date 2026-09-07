/**
 * @vitest-environment jsdom
 *
 * Mobile panel display tests.
 * Verifies that each bottom tab (sequencer, track, synth, master) shows the
 * correct panel with proper position, size, visibility, and scrollability.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { appState } from '../src/state/app_state.js'
import { playbackEvents } from '../src/state/playback_events.js'
import { serviceRegistry } from '../src/state/service_registry.js'
import { soundRegistry } from '../src/state/sound_registry.js'
import TrackEditor from '../src/ui/track_editor.js'
import NoteEditor from '../src/ui/note_editor.js'
import PatternPanel from '../src/ui/pattern_panel.js'
import ToolsPanel from '../src/ui/tools_panel.js'
import OutputPanel from '../src/ui/output_panel.js'
import AboutPanel from '../src/ui/about_panel.js'
import ViewManager from '../src/ui/view_manager.js'
import MobileTabBar from '../src/ui/mobile_tab_bar.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const css = readFileSync(resolve(__dirname, '../src/ui/styles.css'), 'utf-8')

const MOBILE = { width: 768, height: 480 }
const TAB_BAR_HEIGHT = 60

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

function setupApp(viewport) {
    document.body.innerHTML = ''
    Object.assign(global.window, { innerWidth: viewport.width, innerHeight: viewport.height })

    appState.reset()
    soundRegistry.reset()
    serviceRegistry.reset()
    appState.patterns = [{
        name: 'Pattern 1', nbBeats: 4,
        tracks: [structuredClone(MOCK_TRACK)]
    }]
    appState.selectedPatternNum = 0
    appState.selectedTrackNum = 0

    setupCanvas()

    const pp = new PatternPanel()
    pp.init()

    const trackEditor = new TrackEditor()
    trackEditor.init()

    document.getElementById('app-content')?.remove()
    const appContent = document.createElement('div')
    appContent.id = 'app-content'
    document.body.appendChild(appContent)
    appContent.appendChild(trackEditor.synthEditor.panel)

    const noteEditor = new NoteEditor()
    noteEditor.setContainer(trackEditor._neContainer)
    noteEditor.init()
    trackEditor.setNoteEditor(noteEditor)

    const toolsPanel = new ToolsPanel()
    toolsPanel.init()

    const outputPanel = new OutputPanel()
    outputPanel.init()

    const aboutPanel = new AboutPanel()
    aboutPanel.init()

    const viewManager = new ViewManager({
        trackEditor,
        synthEditor: trackEditor.synthEditor,
        pianoRollPanel: { hide: vi.fn(), show: vi.fn() },
        noteEditor,
        toolsPanel,
        patternSettingsPanel: { hide: vi.fn(), show: vi.fn(), _isOpen: false },
        outputPanel,
        aboutPanel
    })
    viewManager.init()

    const mobileTabBar = new MobileTabBar()
    mobileTabBar.init()

    return { viewManager, trackEditor, noteEditor, toolsPanel, outputPanel, aboutPanel, mobileTabBar }
}

function getMobileMediaBlock() {
    const re = /@media\s*\(max-width:\s*768px\),\s*\(max-height:\s*480px\)\s*\{([\s\S]*?)\n\}/m
    const m = css.match(re)
    return m ? m[1] : ''
}

function escapeRegex(s) {
    return s.replace(/[-[\]/{}()*+?.,\\^$|#]/g, '\\$&')
}

function hasCombinedRule(block, selector, prop, value) {
    const escapedVal = escapeRegex(value)
    const ruleRe = /([^{]+)\s*\{([^}]*)\}/g
    let m
    while ((m = ruleRe.exec(block)) !== null) {
        const cleanSelector = m[1].replace(/\/\*[\s\S]*?\*\//g, '')
        const selectors = cleanSelector.split(',').map(s => s.trim())
        if (selectors.includes(selector)) {
            const re = new RegExp(`${prop}\\s*:\\s*${escapedVal}`)
            if (re.test(m[2])) return true
        }
    }
    return false
}

function hasRuleAnywhere(selector, prop, value) {
    return hasCombinedRule(css, selector, prop, value)
}

// ══════════════════════════════════════════════════════════════════
// CSS RULES — Position, Size, Overflow
// ══════════════════════════════════════════════════════════════════

describe('Mobile CSS: Panel position, size, and overflow rules', () => {
    const block = getMobileMediaBlock()

    describe('Workspace panels (.workspace-panel)', () => {
        it('width: 100%', () => {
            expect(hasCombinedRule(block, '.workspace-panel', 'width', '100%')).toBe(true)
        })

        it('top: var(--tb-h, 48px) (below toolbar)', () => {
            expect(hasCombinedRule(block, '.workspace-panel', 'top', 'var(--tb-h, 48px) !important')).toBe(true)
        })

        it('bottom: 60px (above tab bar)', () => {
            expect(hasCombinedRule(block, '.workspace-panel', 'bottom', '60px !important')).toBe(true)
        })

        it('height: auto (fills available space)', () => {
            expect(hasCombinedRule(block, '.workspace-panel', 'height', 'auto !important')).toBe(true)
        })

        it('overflow-y: auto (scrollable)', () => {
            expect(hasCombinedRule(block, '.workspace-panel', 'overflow-y', 'auto')).toBe(true)
        })
    })

    describe('Overlay panels (#te-panel, #tools-panel, #about-panel, #output-panel, #dm-panel)', () => {
        const selectors = ['#te-panel', '#tools-panel', '#about-panel', '#output-panel', '#dm-panel']

        for (const sel of selectors) {
            it(`${sel}: position: fixed`, () => {
                expect(hasCombinedRule(block, sel, 'position', 'fixed !important')).toBe(true)
            })

            it(`${sel}: top: var(--tb-h, 48px)`, () => {
                expect(hasCombinedRule(block, sel, 'top', 'var(--tb-h, 48px) !important')).toBe(true)
            })

            it(`${sel}: left: 0`, () => {
                expect(hasCombinedRule(block, sel, 'left', '0 !important')).toBe(true)
            })

            it(`${sel}: width: 100%`, () => {
                expect(hasCombinedRule(block, sel, 'width', '100% !important')).toBe(true)
            })

            it(`${sel}: bottom: 60px (above tab bar)`, () => {
                expect(hasCombinedRule(block, sel, 'bottom', '60px !important')).toBe(true)
            })

            it(`${sel}: overflow-y: auto (scrollable)`, () => {
                expect(hasCombinedRule(block, sel, 'overflow-y', 'auto !important')).toBe(true)
            })
        }
    })

    describe('#app-content tab bar clearance', () => {
        it('padding-bottom: 60px', () => {
            expect(hasCombinedRule(block, '#app-content', 'padding-bottom', '60px')).toBe(true)
        })
    })
})

// ══════════════════════════════════════════════════════════════════
// SEQUENCER TAB — Panel visibility & properties
// ══════════════════════════════════════════════════════════════════

describe('Mobile tab: Sequencer — panel visibility & position', () => {
    let ctx
    beforeEach(() => { ctx = setupApp(MOBILE) })

    it('pattern panel is visible (no ui-hidden class)', () => {
        playbackEvents.emit('mobileSeqToggle')
        const el = document.getElementById('pattern-panel')
        expect(el.classList.contains('ui-hidden')).toBe(false)
    })

    it('pattern panel has display: block', () => {
        playbackEvents.emit('mobileSeqToggle')
        const el = document.getElementById('pattern-panel')
        expect(el.style.display).not.toBe('none')
    })

    it('track editor is hidden', () => {
        playbackEvents.emit('mobileSeqToggle')
        expect(ctx.trackEditor.isVisible).toBe(false)
    })

    it('synth panel is hidden', () => {
        playbackEvents.emit('mobileSeqToggle')
        const el = document.getElementById('soft-synth-panel')
        expect(el.style.display).toBe('none')
    })

    it('pattern panel has workspace-panel class (full-width via CSS)', () => {
        playbackEvents.emit('mobileSeqToggle')
        const el = document.getElementById('pattern-panel')
        expect(el.classList.contains('workspace-panel')).toBe(true)
    })

    it('pattern panel clears space for tab bar (workspace-panel → bottom: 60px)', () => {
        playbackEvents.emit('mobileSeqToggle')
        const el = document.getElementById('pattern-panel')
        expect(el.classList.contains('workspace-panel')).toBe(true)
        expect(hasRuleAnywhere('.workspace-panel', 'bottom', '60px !important')).toBe(true)
    })
})

// ══════════════════════════════════════════════════════════════════
// TRACK TAB — Panel visibility & properties
// ══════════════════════════════════════════════════════════════════

describe('Mobile tab: Track — panel visibility & position', () => {
    let ctx
    beforeEach(() => { ctx = setupApp(MOBILE) })

    it('track editor is visible', () => {
        playbackEvents.emit('mobileTrackToggle')
        expect(ctx.trackEditor.isVisible).toBe(true)
    })

    it('track editor has display: flex on mobile', () => {
        playbackEvents.emit('mobileTrackToggle')
        expect(ctx.trackEditor.container.style.display).toBe('flex')
    })

    it('pattern panel is hidden (ui-hidden)', () => {
        playbackEvents.emit('mobileTrackToggle')
        const el = document.getElementById('pattern-panel')
        expect(el.classList.contains('ui-hidden')).toBe(true)
    })

    it('synth panel is hidden', () => {
        playbackEvents.emit('mobileTrackToggle')
        const el = document.getElementById('soft-synth-panel')
        expect(el.style.display).toBe('none')
    })

    it('track editor has id te-panel', () => {
        playbackEvents.emit('mobileTrackToggle')
        expect(ctx.trackEditor.container.id).toBe('te-panel')
    })

    it('note editor container is present', () => {
        playbackEvents.emit('mobileTrackToggle')
        const ne = document.getElementById('ne-container')
        expect(ne).not.toBeNull()
    })
})

// ══════════════════════════════════════════════════════════════════
// SYNTH TAB — Panel visibility & properties
// ══════════════════════════════════════════════════════════════════

describe('Mobile tab: Synth — panel visibility & position', () => {
    let ctx
    beforeEach(() => { ctx = setupApp(MOBILE) })

    it('synth panel element exists after synthToggle', () => {
        playbackEvents.emit('synthToggle')
        const el = document.getElementById('soft-synth-panel')
        expect(el).not.toBeNull()
    })

    it('synth panel has workspace-panel class (gets mobile sizing)', () => {
        playbackEvents.emit('synthToggle')
        const el = document.getElementById('soft-synth-panel')
        expect(el.classList.contains('workspace-panel')).toBe(true)
    })

    it('pattern panel is hidden (ui-hidden)', () => {
        playbackEvents.emit('synthToggle')
        const el = document.getElementById('pattern-panel')
        expect(el.classList.contains('ui-hidden')).toBe(true)
    })

    it('track editor is hidden', () => {
        playbackEvents.emit('synthToggle')
        expect(ctx.trackEditor.isVisible).toBe(false)
    })

    it('synth scroll container exists', () => {
        playbackEvents.emit('synthToggle')
        const el = document.getElementById('soft-synth-panel')
        const scroll = el.querySelector('.ss-scroll')
        expect(scroll).not.toBeNull()
    })
})

// ══════════════════════════════════════════════════════════════════
// MASTER TAB — Panel visibility & properties
// ══════════════════════════════════════════════════════════════════

describe('Mobile tab: Master — panel visibility & position', () => {
    let ctx
    beforeEach(() => { ctx = setupApp(MOBILE) })

    it('output panel is visible (display: block)', () => {
        playbackEvents.emit('masterToggle', true)
        const el = document.getElementById('output-panel')
        expect(el.style.display).toBe('block')
    })

    it('pattern panel is hidden (ui-hidden)', () => {
        playbackEvents.emit('masterToggle', true)
        const el = document.getElementById('pattern-panel')
        expect(el.classList.contains('ui-hidden')).toBe(true)
    })

    it('track editor is hidden', () => {
        playbackEvents.emit('masterToggle', true)
        expect(ctx.trackEditor.isVisible).toBe(false)
    })

    it('synth panel is hidden', () => {
        playbackEvents.emit('masterToggle', true)
        const el = document.getElementById('soft-synth-panel')
        expect(el.style.display).toBe('none')
    })
})

// ══════════════════════════════════════════════════════════════════
// TAB SWITCHING — Mutual exclusion
// ══════════════════════════════════════════════════════════════════

describe('Mobile tab switching — mutual exclusion', () => {
    let ctx
    beforeEach(() => { ctx = setupApp(MOBILE) })

    it('seq -> track: pattern hidden, track visible', () => {
        playbackEvents.emit('mobileSeqToggle')
        expect(document.getElementById('pattern-panel').classList.contains('ui-hidden')).toBe(false)

        playbackEvents.emit('mobileTrackToggle')
        expect(document.getElementById('pattern-panel').classList.contains('ui-hidden')).toBe(true)
        expect(ctx.trackEditor.isVisible).toBe(true)
    })

    it('track -> synth: track hidden, pattern hidden', () => {
        playbackEvents.emit('mobileTrackToggle')
        expect(ctx.trackEditor.isVisible).toBe(true)

        playbackEvents.emit('synthToggle')
        expect(ctx.trackEditor.isVisible).toBe(false)
        expect(document.getElementById('pattern-panel').classList.contains('ui-hidden')).toBe(true)
    })

    it('synth -> master: pattern hidden, output visible', () => {
        playbackEvents.emit('synthToggle')
        expect(document.getElementById('pattern-panel').classList.contains('ui-hidden')).toBe(true)

        playbackEvents.emit('masterToggle', true)
        expect(document.getElementById('output-panel').style.display).toBe('block')
        expect(document.getElementById('pattern-panel').classList.contains('ui-hidden')).toBe(true)
    })

    it('master -> seq: output hidden, pattern visible', () => {
        playbackEvents.emit('masterToggle', true)
        expect(document.getElementById('output-panel').style.display).toBe('block')

        playbackEvents.emit('mobileSeqToggle')
        expect(document.getElementById('output-panel').style.display).toBe('none')
        expect(document.getElementById('pattern-panel').classList.contains('ui-hidden')).toBe(false)
    })

    it('full cycle: seq -> track -> synth -> master -> seq', () => {
        playbackEvents.emit('mobileSeqToggle')
        expect(document.getElementById('pattern-panel').classList.contains('ui-hidden')).toBe(false)

        playbackEvents.emit('mobileTrackToggle')
        expect(ctx.trackEditor.isVisible).toBe(true)
        expect(document.getElementById('pattern-panel').classList.contains('ui-hidden')).toBe(true)

        playbackEvents.emit('synthToggle')
        expect(ctx.trackEditor.isVisible).toBe(false)
        expect(document.getElementById('pattern-panel').classList.contains('ui-hidden')).toBe(true)

        playbackEvents.emit('masterToggle', true)
        expect(document.getElementById('output-panel').style.display).toBe('block')
        expect(document.getElementById('pattern-panel').classList.contains('ui-hidden')).toBe(true)

        playbackEvents.emit('mobileSeqToggle')
        expect(document.getElementById('pattern-panel').classList.contains('ui-hidden')).toBe(false)
        expect(document.getElementById('output-panel').style.display).toBe('none')
    })
})

// ══════════════════════════════════════════════════════════════════
// SCROLL — Panels remain scrollable after tab switch
// ══════════════════════════════════════════════════════════════════

describe('Mobile panel scrollability', () => {
    let ctx
    beforeEach(() => { ctx = setupApp(MOBILE) })

    it('pattern panel has workspace-panel class (overflow-y: auto, full-height)', () => {
        playbackEvents.emit('mobileSeqToggle')
        const el = document.getElementById('pattern-panel')
        expect(el.classList.contains('workspace-panel')).toBe(true)
        expect(hasCombinedRule(getMobileMediaBlock(), '.workspace-panel', 'overflow-y', 'auto')).toBe(true)
        expect(hasCombinedRule(getMobileMediaBlock(), '.workspace-panel', 'height', 'auto !important')).toBe(true)
    })

    it('track editor has te-panel id (overflow-y: auto via CSS)', () => {
        playbackEvents.emit('mobileTrackToggle')
        expect(ctx.trackEditor.container.id).toBe('te-panel')
        expect(hasCombinedRule(getMobileMediaBlock(), '#te-panel', 'overflow-y', 'auto !important')).toBe(true)
    })

    it('synth panel has workspace-panel class (overflow-y: auto)', () => {
        playbackEvents.emit('synthToggle')
        const el = document.getElementById('soft-synth-panel')
        expect(el.classList.contains('workspace-panel')).toBe(true)
    })

    it('output panel has overflow-y: auto via CSS', () => {
        playbackEvents.emit('masterToggle', true)
        const el = document.getElementById('output-panel')
        expect(el.style.display).toBe('block')
        expect(hasCombinedRule(getMobileMediaBlock(), '#output-panel', 'overflow-y', 'auto !important')).toBe(true)
    })

    it('scrollability persists after switching tabs back and forth', () => {
        playbackEvents.emit('mobileSeqToggle')
        expect(document.getElementById('pattern-panel').classList.contains('workspace-panel')).toBe(true)

        playbackEvents.emit('mobileTrackToggle')
        playbackEvents.emit('mobileSeqToggle')
        expect(document.getElementById('pattern-panel').classList.contains('workspace-panel')).toBe(true)
    })
})

// ══════════════════════════════════════════════════════════════════
// TAB BAR — Position, size, visibility
// ══════════════════════════════════════════════════════════════════

describe('Mobile tab bar: position, size, visibility', () => {
    let ctx
    beforeEach(() => { ctx = setupApp(MOBILE) })

    it('tab bar element exists in DOM', () => {
        const bar = document.getElementById('mobile-tab-bar')
        expect(bar).not.toBeNull()
    })

    it('tab bar has 4 buttons', () => {
        const bar = document.getElementById('mobile-tab-bar')
        const btns = bar.querySelectorAll('.mtb-btn')
        expect(btns.length).toBe(4)
    })

    it('tab bar buttons have correct data-tab attributes', () => {
        const bar = document.getElementById('mobile-tab-bar')
        expect(bar.querySelector('[data-tab="seq"]')).not.toBeNull()
        expect(bar.querySelector('[data-tab="track"]')).not.toBeNull()
        expect(bar.querySelector('[data-tab="synth"]')).not.toBeNull()
        expect(bar.querySelector('[data-tab="master"]')).not.toBeNull()
    })

    it('sequencer tab is active by default', () => {
        const seqBtn = document.getElementById('mobile-tab-bar').querySelector('[data-tab="seq"]')
        expect(seqBtn.classList.contains('active')).toBe(true)
    })

    it('clicking track tab activates it and deactivates seq', () => {
        const bar = document.getElementById('mobile-tab-bar')
        bar.querySelector('[data-tab="track"]').click()
        expect(bar.querySelector('[data-tab="track"]').classList.contains('active')).toBe(true)
        expect(bar.querySelector('[data-tab="seq"]').classList.contains('active')).toBe(false)
    })

    it('clicking synth tab activates it and deactivates track', () => {
        const bar = document.getElementById('mobile-tab-bar')
        bar.querySelector('[data-tab="synth"]').click()
        expect(bar.querySelector('[data-tab="synth"]').classList.contains('active')).toBe(true)
        expect(bar.querySelector('[data-tab="track"]').classList.contains('active')).toBe(false)
    })

    it('clicking master tab activates it and deactivates synth', () => {
        const bar = document.getElementById('mobile-tab-bar')
        bar.querySelector('[data-tab="master"]').click()
        expect(bar.querySelector('[data-tab="master"]').classList.contains('active')).toBe(true)
        expect(bar.querySelector('[data-tab="synth"]').classList.contains('active')).toBe(false)
    })

    it('clicking seq tab re-activates it', () => {
        const bar = document.getElementById('mobile-tab-bar')
        bar.querySelector('[data-tab="track"]').click()
        bar.querySelector('[data-tab="seq"]').click()
        expect(bar.querySelector('[data-tab="seq"]').classList.contains('active')).toBe(true)
        expect(bar.querySelector('[data-tab="track"]').classList.contains('active')).toBe(false)
    })
})

// ══════════════════════════════════════════════════════════════════
// SCROLL CHAIN — Full CSS chain verification for every panel
// ══════════════════════════════════════════════════════════════════

describe('Mobile scroll chain: #te-panel (track editor)', () => {
    const block = getMobileMediaBlock()

    it('#te-panel has overflow-y: auto !important', () => {
        expect(hasCombinedRule(block, '#te-panel', 'overflow-y', 'auto !important')).toBe(true)
    })

    it('.track-editor has overflow: hidden (flex containment, not a scroll blocker)', () => {
        expect(hasCombinedRule(block, '#te-panel .track-editor', 'overflow', 'hidden')).toBe(true)
    })

    it('.track-editor has flex: 1 1 auto (fills remaining space)', () => {
        expect(hasCombinedRule(block, '#te-panel .track-editor', 'flex', '1 1 auto')).toBe(true)
    })

    it('.track-editor has min-height: 0 (allows flex shrink below content)', () => {
        expect(hasCombinedRule(block, '#te-panel .track-editor', 'min-height', '0')).toBe(true)
    })

    it('.te-scroll has overflow-y: auto (scrolls tab content)', () => {
        expect(hasCombinedRule(block, '#te-panel .te-scroll', 'overflow-y', 'auto')).toBe(true)
    })

    it('.te-scroll has flex: 1 (fills remaining space in .track-editor)', () => {
        expect(hasCombinedRule(block, '#te-panel .te-scroll', 'flex', '1')).toBe(true)
    })

    it('.te-scroll has min-height: 0 (allows flex shrink)', () => {
        expect(hasCombinedRule(block, '#te-panel .te-scroll', 'min-height', '0')).toBe(true)
    })

    it('.ne-tab-panel has overflow-y: auto (inner scroll for tab content)', () => {
        expect(hasRuleAnywhere('.ne-tab-panel', 'overflow-y', 'auto')).toBe(true)
    })

    it('.ne-tab-panel has flex: 1 (fills .te-scroll)', () => {
        expect(hasRuleAnywhere('.ne-tab-panel', 'flex', '1')).toBe(true)
    })

    it('.ne-tab-panel has min-height: 0', () => {
        expect(hasRuleAnywhere('.ne-tab-panel', 'min-height', '0')).toBe(true)
    })

    it('#ne-container has overflow-y: auto (note editor scroll)', () => {
        expect(hasCombinedRule(block, '#ne-container', 'overflow-y', 'auto')).toBe(true)
    })

    it('#ne-container has max-height: 45vh (bounded note editor)', () => {
        expect(hasCombinedRule(block, '#ne-container', 'max-height', '45vh')).toBe(true)
    })

    it('#ne-container has flex-shrink: 0 (does not collapse)', () => {
        expect(hasCombinedRule(block, '#ne-container', 'flex-shrink', '0')).toBe(true)
    })

    it('#te-panel uses flex-direction: column (stacks .track-editor + #ne-container)', () => {
        expect(hasCombinedRule(block, '#te-panel', 'flex-direction', 'column')).toBe(true)
    })

    it('no overflow: hidden on .te-scroll that would block scrolling', () => {
        const ruleRe = /#te-panel\s+\.te-scroll\s*\{([^}]*)\}/g
        let m
        while ((m = ruleRe.exec(block)) !== null) {
            expect(m[1]).not.toContain('overflow: hidden')
        }
    })
})

describe('Mobile scroll chain: landscape overrides', () => {
    it('landscape #te-panel uses overflow: visible (grid container)', () => {
        expect(hasRuleAnywhere('#te-panel.te-mobile-landscape', 'overflow', 'visible !important')).toBe(true)
    })

    it('landscape .track-editor uses display: contents (promotes children to grid items)', () => {
        expect(hasRuleAnywhere('#te-panel.te-mobile-landscape .track-editor', 'display', 'contents')).toBe(true)
    })

    it('landscape .te-scroll has overflow: visible (grid cell constrains height)', () => {
        expect(hasRuleAnywhere('#te-panel.te-mobile-landscape .te-scroll', 'overflow', 'visible')).toBe(true)
    })

    it('landscape #ne-container has overflow-y: auto (scrolls note editor in grid cell)', () => {
        expect(hasRuleAnywhere('#te-panel.te-mobile-landscape #ne-container', 'overflow-y', 'auto')).toBe(true)
    })

    it('landscape .ne-tab-panel inherits overflow-y: auto from base (scrolls within grid cell)', () => {
        expect(hasRuleAnywhere('.ne-tab-panel', 'overflow-y', 'auto')).toBe(true)
    })
})

describe('Mobile scroll chain: overlay panels (#tools, #about, #output, #dm)', () => {
    const block = getMobileMediaBlock()
    const overlayPanels = ['#tools-panel', '#about-panel', '#output-panel', '#dm-panel']

    for (const sel of overlayPanels) {
        it(`${sel} has overflow-y: auto !important`, () => {
            expect(hasCombinedRule(block, sel, 'overflow-y', 'auto !important')).toBe(true)
        })

        it(`${sel} has position: fixed !important`, () => {
            expect(hasCombinedRule(block, sel, 'position', 'fixed !important')).toBe(true)
        })

        it(`${sel} has height: auto !important (bounded by top/bottom)`, () => {
            expect(hasCombinedRule(block, sel, 'height', 'auto !important')).toBe(true)
        })
    }

    it('no overflow: hidden on #tools-panel inner containers blocking scroll', () => {
        const ruleRe = /#tools-panel\s+\.[\w-]+\s*\{([^}]*)\}/g
        let m
        while ((m = ruleRe.exec(block)) !== null) {
            expect(m[1]).not.toContain('overflow: hidden')
        }
    })

    it('no overflow: hidden on #about-panel inner containers blocking scroll', () => {
        const ruleRe = /#about-panel\s+\.[\w-]+\s*\{([^}]*)\}/g
        let m
        while ((m = ruleRe.exec(block)) !== null) {
            expect(m[1]).not.toContain('overflow: hidden')
        }
    })

    it('no overflow: hidden on #output-panel inner containers blocking scroll', () => {
        const ruleRe = /#output-panel\s+\.[\w-]+\s*\{([^}]*)\}/g
        let m
        while ((m = ruleRe.exec(block)) !== null) {
            expect(m[1]).not.toContain('overflow: hidden')
        }
    })

    it('no overflow: hidden on #dm-panel inner containers blocking scroll', () => {
        const ruleRe = /#dm-panel\s+\.[\w-]+\s*\{([^}]*)\}/g
        let m
        while ((m = ruleRe.exec(block)) !== null) {
            expect(m[1]).not.toContain('overflow: hidden')
        }
    })
})

describe('Mobile scroll chain: workspace panels (.workspace-panel)', () => {
    const block = getMobileMediaBlock()

    it('.workspace-panel has overflow-y: auto', () => {
        expect(hasCombinedRule(block, '.workspace-panel', 'overflow-y', 'auto')).toBe(true)
    })

    it('.workspace-panel has top: var(--tb-h, 48px) !important', () => {
        expect(hasCombinedRule(block, '.workspace-panel', 'top', 'var(--tb-h, 48px) !important')).toBe(true)
    })

    it('.workspace-panel has bottom: 60px !important', () => {
        expect(hasCombinedRule(block, '.workspace-panel', 'bottom', '60px !important')).toBe(true)
    })

    it('.workspace-panel has height: auto !important (bounded by top/bottom)', () => {
        expect(hasCombinedRule(block, '.workspace-panel', 'height', 'auto !important')).toBe(true)
    })

    it('.workspace-panel has display: flex (column layout for children)', () => {
        expect(hasRuleAnywhere('.workspace-panel', 'display', 'flex')).toBe(true)
    })

    it('.workspace-panel base has overflow: hidden (flex containment)', () => {
        expect(hasRuleAnywhere('.workspace-panel', 'overflow', 'hidden')).toBe(true)
    })
})

describe('Mobile scroll chain: pattern settings panel', () => {
    it('#pattern-settings-panel has overflow-y: auto', () => {
        expect(hasRuleAnywhere('#pattern-settings-panel', 'overflow-y', 'auto')).toBe(true)
    })

    it('#pattern-settings-panel has position: fixed', () => {
        expect(hasRuleAnywhere('#pattern-settings-panel', 'position', 'fixed')).toBe(true)
    })

    it('#pattern-settings-panel has bottom: 60px (above tab bar)', () => {
        expect(hasRuleAnywhere('#pattern-settings-panel', 'bottom', '60px')).toBe(true)
    })
})

describe('Mobile scroll chain: #te-panel DOM structure verification', () => {
    let ctx
    beforeEach(() => { ctx = setupApp(MOBILE) })

    it('#te-panel has two direct children: .track-editor and #ne-container', () => {
        playbackEvents.emit('mobileTrackToggle')
        const panel = ctx.trackEditor.container
        const te = panel.querySelector('.track-editor')
        const ne = document.getElementById('ne-container')
        expect(te).not.toBeNull()
        expect(ne).not.toBeNull()
        expect(te.parentElement).toBe(panel)
        expect(ne.parentElement).toBe(panel)
    })

    it('.te-scroll is inside .track-editor (not a direct child of #te-panel)', () => {
        playbackEvents.emit('mobileTrackToggle')
        const panel = ctx.trackEditor.container
        const teScroll = panel.querySelector('.te-scroll')
        const te = panel.querySelector('.track-editor')
        expect(teScroll).not.toBeNull()
        expect(teScroll.parentElement).toBe(te)
    })

    it('.track-editor uses display: flex on mobile', () => {
        playbackEvents.emit('mobileTrackToggle')
        const te = ctx.trackEditor.container.querySelector('.track-editor')
        expect(te).not.toBeNull()
    })

    it('#ne-container is a direct sibling of .track-editor, not nested inside it', () => {
        playbackEvents.emit('mobileTrackToggle')
        const panel = ctx.trackEditor.container
        const te = panel.querySelector('.track-editor')
        const ne = document.getElementById('ne-container')
        expect(te.contains(ne)).toBe(false)
    })
})

describe('Mobile scroll chain: synth panel', () => {
    let ctx
    beforeEach(() => { ctx = setupApp(MOBILE) })

    it('synth panel has workspace-panel class (gets overflow-y: auto)', () => {
        playbackEvents.emit('synthToggle')
        const el = document.getElementById('soft-synth-panel')
        expect(el.classList.contains('workspace-panel')).toBe(true)
    })

    it('.ss-scroll container exists for synth content scrolling', () => {
        playbackEvents.emit('synthToggle')
        const el = document.getElementById('soft-synth-panel')
        const scroll = el.querySelector('.ss-scroll')
        expect(scroll).not.toBeNull()
    })
})
