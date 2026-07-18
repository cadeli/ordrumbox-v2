/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { appState } from '../src/state/app_state.js'
import { playbackEvents } from '../src/state/playback_events.js'
import AboutPanel from '../src/ui/about_panel.js'

describe('AboutPanel (PWA)', () => {
    let aboutPanel

    beforeEach(() => {
        appState.reset()
        document.body.innerHTML = ''
        global.window.innerWidth = 1200
        global.window.innerHeight = 800

        aboutPanel = new AboutPanel()
        aboutPanel.init()
    })

    it('creates the about-panel in document.body (hidden by default)', () => {
        const panel = document.getElementById('about-panel')
        expect(panel).not.toBeNull()
        expect(panel.style.display).toBe('none')
    })

    it('opens when onAboutToggle(true) is fired', () => {
        playbackEvents.dispatchAboutToggle(true)
        const panel = document.getElementById('about-panel')
        expect(panel.style.display).toBe('block')
    })

    it('closes when onAboutToggle(false) is fired', () => {
        playbackEvents.dispatchAboutToggle(true)
        playbackEvents.dispatchAboutToggle(false)
        const panel = document.getElementById('about-panel')
        expect(panel.style.display).toBe('none')
    })

    it('hides when another modal (Tools/Output) is shown', () => {
        playbackEvents.dispatchAboutToggle(true)
        expect(document.getElementById('about-panel').style.display).toBe('block')

        playbackEvents.dispatchToolsToggle(true)
        expect(document.getElementById('about-panel').style.display).toBe('none')

        playbackEvents.dispatchAboutToggle(true)
        expect(document.getElementById('about-panel').style.display).toBe('block')

        playbackEvents.dispatchOutputToggle(true)
        expect(document.getElementById('about-panel').style.display).toBe('none')
    })

    it('hides when the track editor is shown (onTrackSelect)', () => {
        playbackEvents.dispatchAboutToggle(true)
        expect(document.getElementById('about-panel').style.display).toBe('block')

        playbackEvents.dispatchTrackSelect({ track: {}, trackIdx: 0 })
        expect(document.getElementById('about-panel').style.display).toBe('none')
    })

    it('hides when the note editor is shown (onNoteSelect)', () => {
        playbackEvents.dispatchAboutToggle(true)
        expect(document.getElementById('about-panel').style.display).toBe('block')

        playbackEvents.dispatchNoteSelect({ note: {}, track: {} })
        expect(document.getElementById('about-panel').style.display).toBe('none')
    })

    it('hides the other modals (te/ne/tools/output) when it opens', () => {
        for (const id of ['te-panel', 'ne-panel', 'tools-panel', 'output-panel']) {
            const el = document.createElement('div')
            el.id = id
            el.style.display = 'block'
            document.body.appendChild(el)
        }

        playbackEvents.dispatchAboutToggle(true)

        for (const id of ['te-panel', 'ne-panel', 'tools-panel', 'output-panel']) {
            expect(document.getElementById(id).style.display).toBe('none')
        }
        expect(document.getElementById('about-panel').style.display).toBe('block')
    })

    it('renders app info (name, version, license)', () => {
        playbackEvents.dispatchAboutToggle(true)
        const html = document.getElementById('about-panel').innerHTML
        expect(html).toContain('OrDrumbox')
        expect(html).toContain('2.0.0')
        expect(html).toContain('GPL-3.0-only')
        expect(html).not.toContain('Vite')
    })

    it('renders the PWA section with install button (hidden by default)', () => {
        playbackEvents.dispatchAboutToggle(true)
        const installRow = document.getElementById('about-panel').querySelector('#about-pwa-install-row')
        expect(installRow).not.toBeNull()
        expect(installRow.style.display).toBe('none')
    })

    it('renders external links to website and source', () => {
        playbackEvents.dispatchAboutToggle(true)
        const html = document.getElementById('about-panel').innerHTML
        expect(html).toContain('https://www.ordrumbox.com')
        expect(html).toContain('github.com/cadeli/ordrumbox-v2')
    })

    it('has Info and PWA sub-panel toggles', () => {
        const toggles = document.querySelectorAll('#about-panel [data-toggle]')
        const keys = Array.from(toggles).map(b => b.dataset.toggle)
        expect(keys).toEqual(['info', 'pwa'])
    })

    it('closes the panel when the close button is clicked', () => {
        playbackEvents.dispatchAboutToggle(true)
        const panel = document.getElementById('about-panel')
        panel.querySelector('.ne-close').click()
        expect(panel.style.display).toBe('none')
    })
})
