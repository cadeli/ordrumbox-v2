import { playbackEvents } from '../state/playback_events.js'
import { bindCloseButton, bindAccordionToggles, buildAccordionGroup } from './components/panel_helpers.js'
import BasePanel from './base_panel.js'

const APP_VERSION = '2.0.0'
const APP_NAME = 'OrDrumbox'
const APP_DESCRIPTION = 'Free online drum machine & step sequencer'
const APP_LICENSE = 'GPL-3.0-only'
const APP_REPO = 'https://github.com/cadeli/ordrumbox-v2'
const APP_WEBSITE = 'https://www.ordrumbox.com'

export default class AboutPanel extends BasePanel {
    constructor() {
        super('about-panel')
        this._deferredPrompt = null
        this._installBtn = null
    }

    init() {
        super.init()
        this._registerInstallPrompt()
    }

    _registerInstallPrompt() {
        window.addEventListener('beforeinstallprompt', (e) => {
            e.preventDefault()
            this._deferredPrompt = e
            if (this._installBtn) {
                this._installBtn.style.display = ''
            }
        })
        window.addEventListener('appinstalled', () => {
            this._deferredPrompt = null
            if (this._installBtn) {
                this._installBtn.style.display = 'none'
            }
        })
    }

    createDOM() {
        super.createDOM()
        this.container.innerHTML = `
            <div class="ne-header">
                <span class="ne-track">About</span>
                <button class="ne-close">&times;</button>
            </div>
            <div class="ne-body">
                ${buildAccordionGroup('info', 'Application', 'Info', true, `
                    <div class="ne-row no-cursor">
                        <label>Name</label>
                        <span class="ne-val">${APP_NAME}</span>
                    </div>
                    <div class="ne-row no-cursor">
                        <label>Version</label>
                        <span class="ne-val">${APP_VERSION}</span>
                    </div>
                    <div class="ne-row no-cursor">
                        <label>License</label>
                        <span class="ne-val">${APP_LICENSE}</span>
                    </div>
                `, { extraAttrs: 'data-about-section="info"' })}
                ${buildAccordionGroup('pwa', 'Progressive Web App', 'PWA', true, `
                    <div class="ne-row" id="about-pwa-install-row" style="display:none">
                        <label>Install</label>
                        <button class="ne-btn" id="about-pwa-install">Install App</button>
                    </div>
                    <div class="ne-row no-cursor">
                        <label>Website</label>
                        <a href="${APP_WEBSITE}" target="_blank" rel="noopener" class="ne-val">${APP_WEBSITE}</a>
                    </div>
                    <div class="ne-row no-cursor">
                        <label>Source</label>
                        <a href="${APP_REPO}" target="_blank" rel="noopener" class="ne-val">${APP_REPO}</a>
                    </div>
                `, { extraAttrs: 'data-about-section="pwa"' })}
            </div>
        `

        bindCloseButton(this.container, () => this.hide())

        this._installBtn = this.container.querySelector('#about-pwa-install')
        this._installBtn?.addEventListener('click', () => this._installPwa())

        const groupMap = { info: 0, pwa: 1 }
        bindAccordionToggles(this.container, (key) => {
            const groups = this.container.querySelectorAll('.ne-body > .ne-group')
            return groups[groupMap[key]]
        })
    }

    _installPwa() {
        if (!this._deferredPrompt) return
        this._deferredPrompt.prompt()
        this._deferredPrompt.userChoice.finally(() => {
            this._deferredPrompt = null
            if (this._installBtn) this._installBtn.style.display = 'none'
        })
    }

    _detectPwaStatus() {
        const installRow = this.container.querySelector('#about-pwa-install-row')

        if (installRow && this._deferredPrompt) {
            installRow.style.display = ''
        } else if (installRow) {
            installRow.style.display = 'none'
        }
    }

    subscribe() {
        playbackEvents.onAboutToggle.push((show) => {
            if (show) this.show()
            else this.hide()
        })
        playbackEvents.onToolsToggle.push(() => this.hide())
        playbackEvents.onOutputToggle.push(() => this.hide())
        playbackEvents.onTrackSelect.push(() => this.hide())
        playbackEvents.onNoteSelect.push(() => this.hide())
    }

    show() {
        super.show(['te-panel', 'ne-panel', 'tools-panel', 'output-panel', 'soft-synth-panel'])
        document.getElementById('pattern-panel')?.classList.remove('ui-hidden')
        this._detectPwaStatus()
    }

    reposition() {
        if (window.innerWidth > 768 && window.innerHeight > 480) {
            super.reposition()
        }
    }
}
