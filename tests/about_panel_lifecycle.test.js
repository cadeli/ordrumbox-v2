/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import AboutPanel from '../src/ui/about_panel.js'

describe('AboutPanel lifecycle', () => {
    let panel

    beforeEach(() => {
        document.body.innerHTML = ''
        panel = new AboutPanel()
        panel.init()
    })

    afterEach(() => {
        panel.destroy()
    })

    function installButton() {
        return document.getElementById('about-pwa-install')
    }

    it('unhides the install button when beforeinstallprompt fires', () => {
        const btn = installButton()
        expect(btn).not.toBeNull()
        btn.style.display = 'none'

        window.dispatchEvent(new Event('beforeinstallprompt'))

        expect(btn.style.display).toBe('')
    })

    it('releases the window listeners on destroy()', () => {
        const btn = installButton()
        panel.destroy()

        btn.style.display = 'none'
        window.dispatchEvent(new Event('beforeinstallprompt'))

        expect(btn.style.display).toBe('none')
        expect(installButton()).toBeNull()
    })

    it('binds the install prompt again after destroy() then init()', () => {
        panel.destroy()
        panel.init()

        const btn = installButton()
        expect(btn).not.toBeNull()
        btn.style.display = 'none'

        window.dispatchEvent(new Event('beforeinstallprompt'))

        expect(btn.style.display).toBe('')
    })
})
