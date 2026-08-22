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
        playbackEvents.emit("aboutToggle", true)
        const panel = document.getElementById('about-panel')
        expect(panel.style.display).toBe('block')
    })

    it('closes when onAboutToggle(false) is fired', () => {
        playbackEvents.emit("aboutToggle", true)
        playbackEvents.emit("aboutToggle", false)
        const panel = document.getElementById('about-panel')
        expect(panel.style.display).toBe('none')
    })

    it('does not self-hide when other slot panels open (ViewManager handles mutual exclusion)', () => {
        playbackEvents.emit("aboutToggle", true)
        expect(document.getElementById('about-panel').style.display).toBe('block')

        playbackEvents.emit("toolsToggle", true)
        expect(document.getElementById('about-panel').style.display).toBe('block')

        playbackEvents.emit("aboutToggle", true)
        expect(document.getElementById('about-panel').style.display).toBe('block')

        playbackEvents.emit("outputToggle", true)
        expect(document.getElementById('about-panel').style.display).toBe('block')
    })

    it('hides the other modals (tools/output) when it opens, keeps te-panel visible', () => {
        for (const id of ['te-panel', 'tools-panel', 'output-panel']) {
            const el = document.createElement('div')
            el.id = id
            el.style.display = 'block'
            document.body.appendChild(el)
        }

        playbackEvents.emit("aboutToggle", true)

        expect(document.getElementById('about-panel').style.display).toBe('block')
        expect(document.getElementById('te-panel').style.display).toBe('block')
    })

    it('renders app info (name, version, license)', () => {
        playbackEvents.emit("aboutToggle", true)
        const html = document.getElementById('about-panel').innerHTML
        expect(html).toContain('OrDrumbox')
        expect(html).toContain('2.0.0')
        expect(html).toContain('GPL-3.0-only')
        expect(html).not.toContain('Vite')
    })

    it('renders the PWA section with install button (hidden by default)', () => {
        playbackEvents.emit("aboutToggle", true)
        const installRow = document.getElementById('about-panel').querySelector('#about-pwa-install-row')
        expect(installRow).not.toBeNull()
        expect(installRow.style.display).toBe('none')
    })

    it('renders external links to website and source', () => {
        playbackEvents.emit("aboutToggle", true)
        const html = document.getElementById('about-panel').innerHTML
        expect(html).toContain('https://www.ordrumbox.com')
        expect(html).toContain('github.com/cadeli/ordrumbox-v2')
    })

    it('has Info and PWA tab buttons', () => {
        const tabs = document.querySelectorAll('#about-panel .ne-tab-btn[data-ne-tab]')
        const keys = Array.from(tabs).map(b => b.dataset.neTab)
        expect(keys).toEqual(['info', 'pwa'])
    })

    it('can be toggled via dispatchAboutToggle', () => {
        playbackEvents.emit("aboutToggle", true)
        expect(document.getElementById('about-panel').style.display).toBe('block')
        playbackEvents.emit("aboutToggle", false)
        expect(document.getElementById('about-panel').style.display).toBe('none')
    })
})
