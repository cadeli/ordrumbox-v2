import { playbackEvents } from '../state/playback_events.js'
import { APP_VERSION } from '../core/constants.js'
import { bindCloseButton, bindTabToggles } from './components/panel_helpers.js'
import BasePanel from './base_panel.js'

const APP_NAME = 'OrDrumbox'
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
            </div>
            <div class="ne-tab-bar">
                <button class="ne-tab-btn active" data-ne-tab="info">Info</button>
                <button class="ne-tab-btn" data-ne-tab="pwa">PWA</button>
            </div>
            <div class="ne-tab-panel" data-tab-panel="info">
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
            </div>
            <div class="ne-tab-panel ne-tab-panel-hidden" data-tab-panel="pwa">
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
            </div>
        `

        bindCloseButton(this.container, () => playbackEvents.emit("aboutToggle", false))
        bindTabToggles(this.container)

        this._installBtn = this.container.querySelector('#about-pwa-install')
        this._installBtn?.addEventListener('click', () => this._installPwa())
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

    subscribe() {}

    show() {
        super.show()
        this._detectPwaStatus()
    }
}
