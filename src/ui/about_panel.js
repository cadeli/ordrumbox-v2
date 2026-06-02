import { playbackEvents } from '../state/playback_events.js'
import { bindCloseButton, injectUiCss } from './panel_helpers.js'

const APP_VERSION = '2.0.0'
const APP_NAME = 'OrDrumbox'
const APP_DESCRIPTION = 'Free online drum machine & step sequencer'
const APP_LICENSE = 'GPL-3.0-only'
const APP_REPO = 'https://github.com/cadeli/ordrumbox-v2'
const APP_WEBSITE = 'https://www.ordrumbox.com'

export default class AboutPanel {
    constructor() {
        this.container = null
        this._deferredPrompt = null
        this._installBtn = null
    }

    init() {
        injectUiCss()
        this.createDOM()
        this.subscribe()
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
        this.container = document.createElement('div')
        this.container.id = 'about-panel'
        this.container.style.display = 'none'

        this.container.innerHTML = `
            <div class="ne-header">
                <span class="ne-track">About</span>
                <div class="ne-toggles">
                    <button class="ne-toggle active" data-about-toggle="info">Info</button>
                    <button class="ne-toggle active" data-about-toggle="pwa">PWA</button>
                </div>
                <button class="ne-close">&times;</button>
            </div>
            <div class="ne-body">
                <div class="ne-group" data-about-section="info">
                    <div class="ne-group-label">Application</div>
                    <div class="ne-grid">
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
                        <div class="ne-row no-cursor">
                            <label>Stack</label>
                            <span class="ne-val">Vite, Web Audio, Vitest</span>
                        </div>
                    </div>
                </div>
                <div class="ne-group" data-about-section="pwa">
                    <div class="ne-group-label">Progressive Web App</div>
                    <div class="ne-grid">
                        <div class="ne-row no-cursor">
                            <label>Status</label>
                            <span class="ne-val" id="about-pwa-status">Checking...</span>
                        </div>
                        <div class="ne-row no-cursor">
                            <label>Manifest</label>
                            <span class="ne-val" id="about-pwa-manifest">-</span>
                        </div>
                        <div class="ne-row no-cursor">
                            <label>Display</label>
                            <span class="ne-val" id="about-pwa-display">-</span>
                        </div>
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
                </div>
            </div>
        `

        document.body.appendChild(this.container)

        bindCloseButton(this.container, () => this.hide())

        this._installBtn = this.container.querySelector('#about-pwa-install')
        this._installBtn?.addEventListener('click', () => this._installPwa())

        const groupMap = { info: 0, pwa: 1 }
        this.container.querySelectorAll('.ne-toggle[data-about-toggle]').forEach(btn => {
            btn.addEventListener('click', () => {
                btn.classList.toggle('active')
                const groups = this.container.querySelectorAll('.ne-body > .ne-group')
                const group = groups[groupMap[btn.dataset.aboutToggle]]
                if (group) group.style.display = btn.classList.contains('active') ? '' : 'none'
            })
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
        const isStandalone = window.matchMedia?.('(display-mode: standalone)').matches
            || window.navigator.standalone === true
        const statusEl = this.container.querySelector('#about-pwa-status')
        const manifestEl = this.container.querySelector('#about-pwa-manifest')
        const displayEl = this.container.querySelector('#about-pwa-display')
        const installRow = this.container.querySelector('#about-pwa-install-row')

        if (statusEl) statusEl.textContent = isStandalone ? 'Installed' : 'Installable'
        if (displayEl) displayEl.textContent = isStandalone ? 'Standalone' : 'Browser'

        const link = document.querySelector('link[rel="manifest"]')
        if (manifestEl) manifestEl.textContent = link ? link.getAttribute('href') : 'Missing'

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
    }

    show() {
        this.container.style.display = 'block'
        this._detectPwaStatus()
    }

    hide() {
        this.container.style.display = 'none'
    }
}
