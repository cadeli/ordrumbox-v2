/**
 * @vitest-environment jsdom
 *
 * Comprehensive mobile CSS & layout tests.
 * Reads styles.css directly and parses rules to verify all mobile responsive
 * contracts: panel positioning, toolbar elements, tab bar, settings panel,
 * desktop-only hiding, and desktop media query guards.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isMobileViewport } from '../src/core/constants.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const cssPath = resolve(__dirname, '../src/ui/styles.css')
const css = readFileSync(cssPath, 'utf-8')

function extractMediaBlock(pattern) {
    const re = new RegExp(pattern + '\\s*\\{([\\s\\S]*?)\\n\\}', 'm')
    const m = css.match(re)
    return m ? m[1] : ''
}

function escapeRegex(s) {
    return s.replace(/[-[\]/{}()*+?.,\\^$|#]/g, '\\$&')
}

function hasRule(block, selector, prop, value) {
    const escapedSel = escapeRegex(selector)
    const escapedVal = escapeRegex(value)
    const re = new RegExp(`${escapedSel}\\s*\\{[^}]*${prop}\\s*:\\s*${escapedVal}[^}]*\\}`, 's')
    if (re.test(block)) return true
    // Also match combined selectors: "#a, #b, #c { ... }"
    const selParts = selector.split(',').map(s => s.trim())
    for (const part of selParts) {
        const ep = escapeRegex(part)
        const re2 = new RegExp(`${ep}\\s*\\{[^}]*${prop}\\s*:\\s*${escapedVal}[^}]*\\}`, 's')
        if (re2.test(block)) return true
    }
    return false
}

/** Check if any combined rule block includes the given selector and has the prop/value */
function hasCombinedRule(block, selector, prop, value) {
    const escapedVal = escapeRegex(value)
    const ruleRe = /([^{]+)\s*\{([^}]*)\}/g
    let m
    while ((m = ruleRe.exec(block)) !== null) {
        // Strip CSS comments from selector text
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
    return hasRule(css, selector, prop, value)
}

const MOBILE_MEDIA = extractMediaBlock('@media\\s*\\(max-width:\\s*768px\\),\\s*\\(max-height:\\s*480px\\)')
const DESKTOP_MEDIA = extractMediaBlock('@media\\s*\\(min-width:\\s*769px\\)\\s*and\\s*\\(min-height:\\s*481px\\)')

// Panels that must get mobile full-width treatment
const MOBILE_PANELS = [
    '#te-panel',
    '#tools-panel',
    '#about-panel',
    '#output-panel',
    '#dm-panel',
]

// Workspace panels now use the .workspace-panel class for mobile overrides
const WORKSPACE_PANELS = [
    '#pattern-panel',
    '#soft-synth-panel',
    '#piano-roll-panel',
]

describe('Mobile CSS: Media query existence', () => {
    it('has @media (max-width: 768px), (max-height: 480px) block', () => {
        expect(MOBILE_MEDIA).not.toBe('')
    })

    it('has @media (min-width: 769px) and (min-height: 481px) desktop guard', () => {
        expect(DESKTOP_MEDIA).not.toBe('')
    })
})

describe('Mobile CSS: Toolbar overrides', () => {
    it('hides .tb-hide-mobile with display: none !important', () => {
        expect(hasRule(MOBILE_MEDIA, '#tb .tb-hide-mobile', 'display', 'none')).toBe(true)
    })

    it('hides .tb-brand', () => {
        expect(hasRule(MOBILE_MEDIA, '#tb .tb-brand', 'display', 'none')).toBe(true)
    })

    it('sets toolbar height: auto', () => {
        expect(hasRule(MOBILE_MEDIA, '#tb', 'height', 'auto')).toBe(true)
    })

    it('sets toolbar min-height: 48px', () => {
        expect(hasRule(MOBILE_MEDIA, '#tb', 'min-height', '48px')).toBe(true)
    })

    it('sets toolbar padding: 4px', () => {
        expect(hasRule(MOBILE_MEDIA, '#tb', 'padding', '4px')).toBe(true)
    })

    it('sets toolbar gap: 4px', () => {
        expect(hasRule(MOBILE_MEDIA, '#tb', 'gap', '4px')).toBe(true)
    })

    it('shows .tb-pattern-name-mobile with display: block', () => {
        expect(hasRule(MOBILE_MEDIA, '#tb .tb-pattern-name-mobile', 'display', 'block')).toBe(true)
    })

    it('gives .tb-pattern-name-mobile flex: 1', () => {
        expect(hasRule(MOBILE_MEDIA, '#tb .tb-pattern-name-mobile', 'flex', '1')).toBe(true)
    })

    it('hides .tb-settings-btn on mobile', () => {
        expect(hasRule(MOBILE_MEDIA, '#tb .tb-settings-btn', 'display', 'none')).toBe(true)
    })

    it('hides .tb-view-row (desktop view buttons)', () => {
        expect(hasRule(MOBILE_MEDIA, '#tb .tb-view-row', 'display', 'none')).toBe(true)
    })
})

describe('Mobile CSS: Desktop base hides mobile-only elements', () => {
    it('.tb-pattern-name-mobile is display: none in desktop base', () => {
        expect(hasRuleAnywhere('#tb .tb-pattern-name-mobile', 'display', 'none')).toBe(true)
    })

    it('.tb-settings-btn is display: none in desktop base', () => {
        expect(hasRuleAnywhere('#tb .tb-settings-btn', 'display', 'none')).toBe(true)
    })
})

describe('Mobile CSS: Panel full-width positioning', () => {
    for (const sel of MOBILE_PANELS) {
        it(`${sel}: top: var(--tb-h, 48px), left: 0, width: 100%, bottom: 60px`, () => {
            expect(hasCombinedRule(MOBILE_MEDIA, sel, 'top', 'var(--tb-h, 48px) !important')).toBe(true)
            expect(hasCombinedRule(MOBILE_MEDIA, sel, 'left', '0 !important')).toBe(true)
            expect(hasCombinedRule(MOBILE_MEDIA, sel, 'width', '100% !important')).toBe(true)
            expect(hasCombinedRule(MOBILE_MEDIA, sel, 'bottom', '60px !important')).toBe(true)
        })
    }

    it('.workspace-panel: bottom: 60px, overflow-y: auto', () => {
        expect(hasRule(MOBILE_MEDIA, '.workspace-panel', 'bottom', '60px')).toBe(true)
        expect(hasRule(MOBILE_MEDIA, '.workspace-panel', 'overflow-y', 'auto')).toBe(true)
    })

    it('#te-panel.pp-split: border-left: none', () => {
        expect(hasRule(MOBILE_MEDIA, '#te-panel.pp-split', 'border-left', 'none !important')).toBe(true)
    })
})

describe('Mobile CSS: Pattern settings panel', () => {
    it('#pattern-settings-panel: position fixed, top var(--tb-h, 48px)', () => {
        expect(hasRule(MOBILE_MEDIA, '#pattern-settings-panel', 'position', 'fixed')).toBe(true)
        expect(hasRule(MOBILE_MEDIA, '#pattern-settings-panel', 'top', 'var(--tb-h, 48px)')).toBe(true)
    })

    it('#pattern-settings-panel: left: 0, right: 0, bottom: 60px', () => {
        expect(hasRule(MOBILE_MEDIA, '#pattern-settings-panel', 'left', '0')).toBe(true)
        expect(hasRule(MOBILE_MEDIA, '#pattern-settings-panel', 'right', '0')).toBe(true)
        expect(hasRule(MOBILE_MEDIA, '#pattern-settings-panel', 'bottom', '60px')).toBe(true)
    })

    it('#pattern-settings-panel: display: none (closed by default)', () => {
        expect(hasRule(MOBILE_MEDIA, '#pattern-settings-panel', 'display', 'none')).toBe(true)
    })

    it('#pattern-settings-panel.open: display: block', () => {
        expect(hasRule(MOBILE_MEDIA, '#pattern-settings-panel.open', 'display', 'block')).toBe(true)
    })

    it('.ps-row: display flex with gap 8px', () => {
        expect(hasRule(MOBILE_MEDIA, '#pattern-settings-panel .ps-row', 'display', 'flex')).toBe(true)
        expect(hasRule(MOBILE_MEDIA, '#pattern-settings-panel .ps-row', 'gap', '8px')).toBe(true)
    })

    it('.ps-close-btn: absolute positioned top 8px right 8px', () => {
        expect(hasRule(MOBILE_MEDIA, '#pattern-settings-panel .ps-close-btn', 'position', 'absolute')).toBe(true)
        expect(hasRule(MOBILE_MEDIA, '#pattern-settings-panel .ps-close-btn', 'top', '8px')).toBe(true)
        expect(hasRule(MOBILE_MEDIA, '#pattern-settings-panel .ps-close-btn', 'right', '8px')).toBe(true)
    })

    it('keeps select controls fluid without making action buttons full width', () => {
        expect(hasRule(MOBILE_MEDIA, '#pattern-settings-panel .ps-row > select', 'width', '100%')).toBe(true)
        expect(hasRule(MOBILE_MEDIA, '#pattern-settings-panel .ps-gen-controls .ps-btn', 'width', 'auto')).toBe(true)
    })

    it('lays out page and generation actions as compact control groups', () => {
        expect(hasRule(MOBILE_MEDIA, '#pattern-settings-panel .ps-page-controls', 'display', 'grid')).toBe(true)
        expect(hasRule(MOBILE_MEDIA, '#pattern-settings-panel .ps-gen-controls', 'display', 'flex')).toBe(true)
    })
})

describe('Tools panel action sizing', () => {
    it('uses compact intrinsic-width actions rather than panel-wide buttons', () => {
        expect(hasRuleAnywhere('#tools-panel .ne-btn', 'width', 'auto')).toBe(true)
        expect(hasRuleAnywhere('#tools-panel .ne-btn', 'min-width', '140px')).toBe(true)
    })
})

describe('Mobile CSS: App content bottom padding', () => {
    it('#app-content: padding-bottom: 60px for tab bar clearance', () => {
        expect(hasRule(MOBILE_MEDIA, '#app-content', 'padding-bottom', '60px')).toBe(true)
    })
})

describe('Mobile CSS: Tab bar base styles', () => {
    it('#mobile-tab-bar: position fixed, bottom 0', () => {
        expect(hasRuleAnywhere('#mobile-tab-bar', 'position', 'fixed')).toBe(true)
        expect(hasRuleAnywhere('#mobile-tab-bar', 'bottom', '0')).toBe(true)
    })

    it('#mobile-tab-bar: left 0, right 0, height 60px', () => {
        expect(hasRuleAnywhere('#mobile-tab-bar', 'left', '0')).toBe(true)
        expect(hasRuleAnywhere('#mobile-tab-bar', 'right', '0')).toBe(true)
        expect(hasRuleAnywhere('#mobile-tab-bar', 'height', '60px')).toBe(true)
    })

    it('#mobile-tab-bar: display flex, justify-content: space-around', () => {
        expect(hasRuleAnywhere('#mobile-tab-bar', 'display', 'flex')).toBe(true)
        expect(hasRuleAnywhere('#mobile-tab-bar', 'justify-content', 'space-around')).toBe(true)
    })

    it('.mtb-btn: flex: 1', () => {
        expect(hasRuleAnywhere('#mobile-tab-bar .mtb-btn', 'flex', '1')).toBe(true)
    })

    it('.mtb-btn.active: color accent', () => {
        expect(hasRuleAnywhere('#mobile-tab-bar .mtb-btn.active', 'color', 'var(--accent)')).toBe(true)
    })

    it('.mtb-btn: touch-action manipulation', () => {
        expect(hasRuleAnywhere('#mobile-tab-bar .mtb-btn', 'touch-action', 'manipulation')).toBe(true)
    })
})

describe('Mobile CSS: Desktop guard hides mobile elements', () => {
    it('#mobile-tab-bar: display: none on desktop', () => {
        expect(hasRule(DESKTOP_MEDIA, '#mobile-tab-bar', 'display', 'none')).toBe(true)
    })

    it('#pattern-settings-panel: display: none on desktop', () => {
        expect(hasRule(DESKTOP_MEDIA, '#pattern-settings-panel', 'display', 'none')).toBe(true)
    })
})

describe('Mobile CSS: pp-container full width', () => {
    it('.pp-container: width 100%, box-sizing border-box', () => {
        expect(hasRule(MOBILE_MEDIA, '.pp-container', 'width', '100%')).toBe(true)
        expect(hasRule(MOBILE_MEDIA, '.pp-container', 'box-sizing', 'border-box')).toBe(true)
    })
})

describe('Mobile CSS: Track editor + note editor 3-column landscape layout', () => {
    it('#te-panel.te-mobile-landscape: CSS Grid layout', () => {
        expect(hasRuleAnywhere('#te-panel.te-mobile-landscape', 'display', 'grid')).toBe(true)
    })

    it('grid-template-columns defines 3-column layout', () => {
        const re = /#te-panel\.te-mobile-landscape\s*\{[^}]*grid-template-columns:\s*170px\s+1fr\s+1fr/s
        expect(re.test(css)).toBe(true)
    })

    it('.track-editor uses display:contents to promote children', () => {
        expect(hasRuleAnywhere('#te-panel.te-mobile-landscape .track-editor', 'display', 'contents')).toBe(true)
    })

    it('.ne-tab-bar is assigned to grid area tabs', () => {
        expect(hasRuleAnywhere('#te-panel.te-mobile-landscape .ne-tab-bar', 'grid-area', 'tabs')).toBe(true)
    })

    it('.te-scroll is assigned to grid area panels', () => {
        expect(hasRuleAnywhere('#te-panel.te-mobile-landscape .te-scroll', 'grid-area', 'panels')).toBe(true)
    })

    it('#ne-container is assigned to grid area notes in landscape', () => {
        expect(hasRuleAnywhere('#te-panel.te-mobile-landscape #ne-container', 'grid-area', 'notes')).toBe(true)
    })

    it('visible tab panel gets column-count: 2', () => {
        expect(hasRuleAnywhere('#te-panel.te-mobile-landscape .ne-tab-panel:not(.ne-tab-panel-hidden)', 'column-count', '2')).toBe(true)
    })

    it('.ne-row gets break-inside: avoid in landscape', () => {
        expect(hasRuleAnywhere('#te-panel.te-mobile-landscape .ne-row', 'break-inside', 'avoid')).toBe(true)
    })
})

describe('Mobile CSS: Synth modules fully visible', () => {
    it('.ss-group: uniform equal height via flexbox, no internal scroll (base styles)', () => {
        const re = /#soft-synth-panel\s+\.ss-body\s*\{[^}]*align-items:\s*stretch[^}]*/s
        expect(re.test(css)).toBe(true)
        const reNoScroll = /#soft-synth-panel\s+\.ss-group\s*\{[^}]*/s
        const match = reNoScroll.exec(css)
        expect(match).not.toBeNull()
        expect(match[0]).not.toContain('overflow-y: auto')
    })
})

describe('isMobileViewport() function', () => {
    beforeEach(() => {
        // Reset to desktop defaults
        global.window.innerWidth = 1200
        global.window.innerHeight = 800
    })

    it('returns true when width <= 768', () => {
        global.window.innerWidth = 768
        global.window.innerHeight = 800
        expect(isMobileViewport()).toBe(true)
    })

    it('returns true when height <= 480', () => {
        global.window.innerWidth = 1200
        global.window.innerHeight = 480
        expect(isMobileViewport()).toBe(true)
    })

    it('returns true when both are at breakpoint', () => {
        global.window.innerWidth = 768
        global.window.innerHeight = 480
        expect(isMobileViewport()).toBe(true)
    })

    it('returns false on large desktop', () => {
        global.window.innerWidth = 1920
        global.window.innerHeight = 1080
        expect(isMobileViewport()).toBe(false)
    })

    it('returns true for a typical phone portrait (375x667)', () => {
        global.window.innerWidth = 375
        global.window.innerHeight = 667
        expect(isMobileViewport()).toBe(true)
    })

    it('returns true for a typical phone landscape (667x375)', () => {
        global.window.innerWidth = 667
        global.window.innerHeight = 375
        expect(isMobileViewport()).toBe(true)
    })

    it('returns true for a tablet in portrait (768x1024)', () => {
        global.window.innerWidth = 768
        global.window.innerHeight = 1024
        expect(isMobileViewport()).toBe(true)
    })

    it('returns false for a tablet in landscape (1024x768)', () => {
        global.window.innerWidth = 1024
        global.window.innerHeight = 768
        expect(isMobileViewport()).toBe(false)
    })
})

describe('Mobile CSS: Complete panel coverage check', () => {
    it('all panels in MOBILE_PANELS array have mobile overrides in CSS', () => {
        for (const sel of MOBILE_PANELS) {
            const found = hasCombinedRule(MOBILE_MEDIA, sel, 'width', '100% !important')
            expect(found).toBe(true)
        }
    })

    it('workspace panels have .workspace-panel class rule in mobile CSS', () => {
        expect(hasRule(MOBILE_MEDIA, '.workspace-panel', 'bottom', '60px')).toBe(true)
        expect(hasRule(MOBILE_MEDIA, '.workspace-panel', 'overflow-y', 'auto')).toBe(true)
    })

    it('no unexpected extra panels missing from mobile overrides', () => {
        const allPanelsWithWidth = [...MOBILE_MEDIA.matchAll(/#([\w-]+(?:-[\w-]+)*)\s*\{/g)]
            .map(m => '#' + m[1])
            .filter(sel => {
                const re = new RegExp(`${escapeRegex(sel)}\\s*\\{[^}]*width:\\s*100%`, 's')
                return re.test(MOBILE_MEDIA)
            })
        for (const panel of allPanelsWithWidth) {
            expect(MOBILE_PANELS).toContain(panel)
        }
    })
})
