import { appState } from '../state/app_state.js'
import { playbackEvents } from '../state/playback_events.js'
import { serviceRegistry } from '../state/service_registry.js'
import { showToast } from './toast.js'
import BasePanel from './base_panel.js'
import songService from '../logic/services/song_service.js'

export default class SongPanel extends BasePanel {
    #selectedIdx = null
    #songName = 'Untitled'
    #listEl
    #songNameEl
    #songDateEl
    #songDescEl

    constructor() {
        super('song-panel')
    }

    createDOM() {
        super.createDOM()

        this.container.innerHTML = `
            <div class="ne-header">
                <span class="ne-track">Song</span>
            </div>
            <div class="sg-body">
                <div class="sg-list" id="sg-list"></div>
                <div class="sg-actions-col" id="sg-actions-col">
                    <div class="sg-song-row">
                        <span class="sg-song-label">Song:</span>
                        <span class="sg-song-name" id="sg-song-name" title="Double-click to rename">Untitled</span>
                    </div>
                    <div class="sg-song-row">
                        <span class="sg-song-label">Date:</span>
                        <span class="sg-song-date" id="sg-song-date"></span>
                    </div>
                    <div class="sg-song-desc" id="sg-song-desc" contenteditable="true" spellcheck="false" title="Double-click to edit description"></div>
                    <div class="sg-btn-group">
                        <button class="ne-btn" id="sg-rename" title="Rename selected pattern">Rename</button>
                        <button class="ne-btn sg-danger" id="sg-delete" title="Delete selected pattern">Delete</button>
                    </div>
                    <div class="sg-btn-group">
                        <button class="ne-btn" id="sg-save" title="Save song to IndexedDB">Save Song</button>
                        <button class="ne-btn" id="sg-load" title="Load song from IndexedDB">Load Song</button>
                    </div>
                    <div class="sg-btn-group">
                        <button class="ne-btn" id="sg-export" title="Export song as JSON file">Export Song</button>
                        <button class="ne-btn" id="sg-import" title="Import song from JSON file">Import Song</button>
                    </div>
                </div>
            </div>
        `

        this.#listEl = this.container.querySelector('#sg-list')
        this.#songNameEl = this.container.querySelector('#sg-song-name')
        this.#songDateEl = this.container.querySelector('#sg-song-date')
        this.#songDescEl = this.container.querySelector('#sg-song-desc')

        this.#songDescEl.addEventListener('blur', () => {
            appState.songInfos.description = this.#songDescEl.textContent.trim()
        })
        this.#songDescEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); this.#songDescEl.blur() }
        })

        this.container.querySelector('#sg-rename').addEventListener('click', () => {
            this.#renameSelected()
        })

        this.container.querySelector('#sg-delete').addEventListener('click', () => {
            if (this.#selectedIdx != null) this.#deletePattern(this.#selectedIdx)
        })

        this.#songNameEl.addEventListener('dblclick', () => this.#renameSong())

        this.container.querySelector('#sg-save').addEventListener('click', () => this.#saveSong())
        this.container.querySelector('#sg-load').addEventListener('click', () => this.#loadSong())
        this.container.querySelector('#sg-export').addEventListener('click', () => this.#exportSong())
        this.container.querySelector('#sg-import').addEventListener('click', () => this.#importSong())
    }

    subscribe() {
        playbackEvents.on("patternStructureChange", () => { if (this.isVisible) this.sync() })
        playbackEvents.on("drumkitChange", () => { if (this.isVisible) this.sync() })
    }

    sync() {
        this.#selectedIdx = appState.selectedPatternNum
        if (appState.songInfos?.name) this.#songName = appState.songInfos.name
        this.#songNameEl.textContent = this.#songName
        this.#songDateEl.textContent = appState.songInfos?.date ?? ''
        const desc = appState.songInfos?.description ?? ''
        if (this.#songDescEl.textContent.trim() !== desc) {
            this.#songDescEl.textContent = desc
        }
        this.#renderList()
    }

    #renderList() {
        const patterns = appState.patterns
        if (!patterns.length) {
            this.#listEl.innerHTML = '<div class="pp-empty">No patterns</div>'
            return
        }

        this.#listEl.innerHTML = ''
        for (let i = 0; i < patterns.length; i++) {
            const pat = patterns[i]
            const isSelected = i === this.#selectedIdx

            const item = document.createElement('div')
            item.className = 'sg-item' + (isSelected ? ' sg-selected' : '')

            const num = document.createElement('span')
            num.className = 'sg-num'
            num.textContent = `${i + 1}.`

            const name = document.createElement('span')
            name.className = 'sg-name'
            name.textContent = pat.name ?? `Pattern ${i}`
            name.title = 'Double-click to rename'

            name.addEventListener('dblclick', (e) => {
                e.stopPropagation()
                this.#startRename(name, i)
            })

            item.appendChild(num)
            item.appendChild(name)
            item.addEventListener('click', () => this.#selectPattern(i))
            this.#listEl.appendChild(item)
        }
    }

    #startRename(nameEl, idx) {
        const pat = appState.patterns[idx]
        const currentName = pat.name ?? `Pattern ${idx}`

        const input = document.createElement('input')
        input.type = 'text'
        input.className = 'sg-rename-input'
        input.value = currentName

        nameEl.replaceWith(input)
        input.focus()
        input.select()

        const commit = () => {
            const newName = input.value.trim()
            if (newName && newName !== currentName) {
                serviceRegistry.cmd.renamePattern(idx, newName)
                playbackEvents.batch(() => {
                    playbackEvents.emit("patternStructureChange")
                    playbackEvents.emit("patternChange")
                })
            }
            this.sync()
        }

        input.addEventListener('blur', commit)
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); input.blur() }
            if (e.key === 'Escape') { input.value = currentName; input.blur() }
        })
    }

    #renameSelected() {
        if (this.#selectedIdx == null) return
        const item = this.#listEl.querySelector('.sg-selected .sg-name')
        if (item) {
            this.#startRename(item, this.#selectedIdx)
        }
    }

    #renameSong() {
        const current = this.#songName
        const input = document.createElement('input')
        input.type = 'text'
        input.className = 'sg-rename-input'
        input.value = current

        this.#songNameEl.replaceWith(input)
        input.focus()
        input.select()

        const commit = () => {
            const val = input.value.trim()
            if (val) this.#songName = val
            appState.songInfos.name = this.#songName
            this.#songNameEl.textContent = this.#songName
            input.replaceWith(this.#songNameEl)
        }

        input.addEventListener('blur', commit)
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); input.blur() }
            if (e.key === 'Escape') { input.value = current; input.blur() }
        })
    }

    #selectPattern(idx) {
        serviceRegistry.cmd.setSelectedPatternNum(idx)
        appState.currentPage = 0
        playbackEvents.batch(() => {
            playbackEvents.emit("patternStructureChange")
            playbackEvents.emit("patternChange")
        })
        this.#selectedIdx = idx
        this.#renderList()
    }

    #deletePattern(idx) {
        if (appState.patterns.length <= 1) {
            showToast('Cannot delete the last pattern', 'warning')
            return
        }
        const name = appState.patterns[idx]?.name ?? `Pattern ${idx}`
        if (!confirm(`Delete "${name}"?`)) return

        serviceRegistry.cmd.removePattern(idx)
        this.#selectedIdx = appState.selectedPatternNum
        playbackEvents.batch(() => {
            playbackEvents.emit("patternStructureChange")
            playbackEvents.emit("patternChange")
        })
        this.sync()
        showToast(`Deleted "${name}"`, 'success')
    }

    async #saveSong() {
        try {
            await songService.save(this.#songName)
            showToast(`Song "${this.#songName}" saved`, 'success')
        } catch (err) {
            showToast('Save failed: ' + err.message, 'error')
        }
    }

    async #loadSong() {
        try {
            const keys = await songService.listKeys()
            if (!keys.length) {
                showToast('No saved songs found', 'warning')
                return
            }

            const overlay = document.createElement('div')
            overlay.className = 'sg-modal-overlay'
            overlay.innerHTML = `
                <div class="sg-modal">
                    <div class="sg-modal-title">Load Song</div>
                    <select class="sg-modal-select" id="sg-load-select">
                        ${keys.map(k => `<option value="${k}">${k}</option>`).join('')}
                    </select>
                    <div class="sg-modal-actions">
                        <button class="ne-btn" id="sg-load-ok">Load</button>
                        <button class="ne-btn" id="sg-load-cancel">Cancel</button>
                    </div>
                </div>
            `
            document.body.appendChild(overlay)

            const close = () => overlay.remove()
            overlay.querySelector('#sg-load-cancel').addEventListener('click', close)
            overlay.addEventListener('click', (e) => { if (e.target === overlay) close() })

            overlay.querySelector('#sg-load-ok').addEventListener('click', async () => {
                const choice = overlay.querySelector('#sg-load-select').value
                close()

                const data = await songService.load(choice)
                if (!data) {
                    showToast('Song not found', 'warning')
                    return
                }

                this.#songName = songService.applyToAppState(data, choice)
                playbackEvents.batch(() => {
                    playbackEvents.emit("patternStructureChange")
                    playbackEvents.emit("patternChange")
                })
                this.sync()
                showToast(`Song "${this.#songName}" loaded`, 'success')
            })
        } catch (err) {
            showToast('Load failed: ' + err.message, 'error')
        }
    }

    #exportSong() {
        songService.exportToFile(this.#songName)
        showToast(`Song "${this.#songName}" exported`, 'success')
    }

    #importSong() {
        const input = document.createElement('input')
        input.type = 'file'
        input.accept = '.odbox,.json'
        input.addEventListener('change', async () => {
            const file = input.files?.[0]
            if (!file) return

            try {
                const text = await file.text()
                const data = songService.parseImportedFile(text)
                if (!data) {
                    showToast('Invalid song file', 'error')
                    return
                }

                const fallbackName = file.name.replace(/\.\w+$/, '')
                this.#songName = songService.applyToAppState(data, fallbackName)
                playbackEvents.batch(() => {
                    playbackEvents.emit("patternStructureChange")
                    playbackEvents.emit("patternChange")
                })
                this.sync()
                showToast(`Song "${this.#songName}" imported`, 'success')
            } catch (err) {
                showToast('Import failed: ' + err.message, 'error')
            }
        })
        input.click()
    }
}
