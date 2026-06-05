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
        playbackEvents.onAboutToggle.forEach(fn => fn(true))
        const panel = document.getElementById('about-panel')
        expect(panel.style.display).toBe('block')
    })

    it('closes when onAboutToggle(false) is fired', () => {
        playbackEvents.onAboutToggle.forEach(fn => fn(true))
        playbackEvents.onAboutToggle.forEach(fn => fn(false))
        const panel = document.getElementById('about-panel')
        expect(panel.style.display).toBe('none')
    })

    it('hides when another modal (Tools/Output) is shown', () => {
        playbackEvents.onAboutToggle.forEach(fn => fn(true))
        expect(document.getElementById('about-panel').style.display).toBe('block')

        playbackEvents.onToolsToggle.forEach(fn => fn(true))
        expect(document.getElementById('about-panel').style.display).toBe('none')

        playbackEvents.onAboutToggle.forEach(fn => fn(true))
        expect(document.getElementById('about-panel').style.display).toBe('block')

        playbackEvents.onOutputToggle.forEach(fn => fn(true))
        expect(document.getElementById('about-panel').style.display).toBe('none')
    })

    it('hides when the track editor is shown (onTrackSelect)', () => {
        playbackEvents.onAboutToggle.forEach(fn => fn(true))
        expect(document.getElementById('about-panel').style.display).toBe('block')

        playbackEvents.onTrackSelect.forEach(fn => fn({ track: {}, trackIdx: 0 }))
        expect(document.getElementById('about-panel').style.display).toBe('none')
    })

    it('hides when the note editor is shown (onNoteSelect)', () => {
        playbackEvents.onAboutToggle.forEach(fn => fn(true))
        expect(document.getElementById('about-panel').style.display).toBe('block')

        playbackEvents.onNoteSelect.forEach(fn => fn({ note: {}, track: {} }))
        expect(document.getElementById('about-panel').style.display).toBe('none')
    })

    it('hides the other modals (te/ne/tools/output) when it opens', () => {
        for (const id of ['te-panel', 'ne-panel', 'tools-panel', 'output-panel']) {
            const el = document.createElement('div')
            el.id = id
            el.style.display = 'block'
            document.body.appendChild(el)
        }

        playbackEvents.onAboutToggle.forEach(fn => fn(true))

        for (const id of ['te-panel', 'ne-panel', 'tools-panel', 'output-panel']) {
            expect(document.getElementById(id).style.display).toBe('none')
        }
        expect(document.getElementById('about-panel').style.display).toBe('block')
    })

    it('renders app info (name, version, license)', () => {
        playbackEvents.onAboutToggle.forEach(fn => fn(true))
        const html = document.getElementById('about-panel').innerHTML
        expect(html).toContain('OrDrumbox')
        expect(html).toContain('2.0.0')
        expect(html).toContain('GPL-3.0-only')
        expect(html).not.toContain('Vite')
    })

    it('renders the PWA section with install button (hidden by default)', () => {
        playbackEvents.onAboutToggle.forEach(fn => fn(true))
        const installRow = document.getElementById('about-panel').querySelector('#about-pwa-install-row')
        expect(installRow).not.toBeNull()
        expect(installRow.style.display).toBe('none')
    })

    it('renders external links to website and source', () => {
        playbackEvents.onAboutToggle.forEach(fn => fn(true))
        const html = document.getElementById('about-panel').innerHTML
        expect(html).toContain('https://www.ordrumbox.com')
        expect(html).toContain('github.com/cadeli/ordrumbox-v2')
    })

    it('has Info and PWA sub-panel toggles', () => {
        const toggles = document.querySelectorAll('#about-panel [data-about-toggle]')
        const keys = Array.from(toggles).map(b => b.dataset.aboutToggle)
        expect(keys).toEqual(['info', 'pwa'])
    })

    it('closes the panel when the close button is clicked', () => {
        playbackEvents.onAboutToggle.forEach(fn => fn(true))
        const panel = document.getElementById('about-panel')
        panel.querySelector('.ne-close').click()
        expect(panel.style.display).toBe('none')
    })
})
