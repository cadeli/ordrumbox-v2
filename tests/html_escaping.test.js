/**
 * @vitest-environment jsdom
 *
 * HTML-injection guard: every innerHTML fragment built from drumkit / sample
 * metadata (user-importable data) must go through escapeHtml. A kit or sample
 * name is arbitrary text from a dropped JSON folder, so an unescaped quote in
 * it would otherwise break out of a title attribute or an <option> value.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { soundRegistry } from '../src/state/sound_registry.js'
import { serviceRegistry } from '../src/state/service_registry.js'
import { escapeHtml, renderOptions } from '../src/ui/components/ui_utils.js'
import SoundSection from '../src/ui/track_editor/sound_section.js'
import DrumkitManager from '../src/ui/drumkit_manager.js'
import MobileTabBar from '../src/ui/mobile_tab_bar.js'

const MALICIOUS = '" onmouseover="window.__pwned=1'
const SOUND_URL = 'kits/evil/pwn.wav'

function hostileKit(extra = {}) {
    return {
        name: `Kit ${MALICIOUS}`,
        instruments: [{ key: 'KICK', url: SOUND_URL, display_name: `Pwn ${MALICIOUS}` }],
        ...extra,
    }
}

function hostileSound() {
    return {
        kitName: `Kit ${MALICIOUS}`,
        url: SOUND_URL,
        key: 'KICK',
        display_name: `Pwn ${MALICIOUS}`,
    }
}

/** Minimal editor stub — only the fields SoundSection.render() reads. */
function makeEditor(track = {}) {
    return {
        track: { name: 'KICK', sampleId: SOUND_URL, useSoftSynth: false, useAutoAssignSound: false, ...track },
        soundRegistry,
        serviceRegistry,
        appState: { selectedDrumkitIdx: 0 },
        synthEditor: { getGeneratedSoundKeys: () => [] },
        esc: escapeHtml,
    }
}

describe('HTML escaping in innerHTML fragments', () => {
    beforeEach(() => {
        soundRegistry.reset()
        serviceRegistry.reset()
        delete globalThis.__pwned
    })

    it('escapeHtml neutralizes attribute break-out', () => {
        const escaped = escapeHtml(MALICIOUS)
        expect(escaped).not.toContain('"')
        expect(escaped).toContain('&quot;')
    })

    it('renderOptions escapes values and labels when asked', () => {
        const html = renderOptions([SOUND_URL], SOUND_URL, { labels: [`Pwn ${MALICIOUS}`], escape: escapeHtml })
        expect(html).toContain('&quot;')
        expect(html).not.toContain('onmouseover="window.__pwned=1"')
    })

    it('track_editor sound tab escapes the sample tooltip and option markup', () => {
        soundRegistry.drumkitList = [hostileKit()]
        soundRegistry.sounds = { [SOUND_URL]: hostileSound() }

        const html = new SoundSection(makeEditor()).render()

        // title="…" attribute built from kitName / url / key
        expect(html).toContain('&quot;')
        expect(html).not.toContain('onmouseover="window.__pwned=1"')
        expect(html).toContain('title="Kit: Kit &quot;')
    })

    it('track_editor sound tab escapes sample labels when the kit has matches', () => {
        soundRegistry.drumkitList = [hostileKit()]
        soundRegistry.sounds = { [SOUND_URL]: hostileSound() }

        const html = new SoundSection(makeEditor()).render()

        // <option> for the matching sample: label is kit/display_name
        expect(html).toContain('Pwn &quot;')
        expect(html).not.toMatch(/onmouseover="window\.__pwned=1"/)
    })

    it('drumkit_manager detail escapes kit names and sample urls', () => {
        soundRegistry.drumkitList = [hostileKit()]
        soundRegistry.sounds = { [SOUND_URL]: hostileSound() }
        serviceRegistry.soundRegistry = soundRegistry

        const dm = new DrumkitManager()
        dm.init()
        dm.selectSound(SOUND_URL)

        const html = dm.container.querySelector('#dm-detail').innerHTML
        expect(html.length).toBeGreaterThan(0)
        expect(html).toContain('&quot;')
        expect(html).not.toContain('onmouseover="window.__pwned=1"')
        dm.destroy()
    })

    it('mobile tab bar builds its labels with textContent (no HTML interpolation)', () => {
        const bar = new MobileTabBar()
        bar.init()
        const btns = bar.container.querySelectorAll('.mtb-btn')
        expect(btns.length).toBeGreaterThan(0)
        expect(btns[0].innerHTML).not.toContain('<span>')
        expect(btns[0].textContent.length).toBeGreaterThan(0)
    })
})
