import { appState } from '../state/app_state.js'
import { playbackEvents } from '../state/playback_events.js'
import { serviceRegistry } from '../state/service_registry.js'
import { showToast } from './toast.js'
import BasePanel from './base_panel.js'
import songService from '../logic/services/song_service.js'

export default class SongPanel extends BasePanel {
    constructor() {
        super('song-panel')
        this._selectedIdx = null
        this._songName = 'Untitled'
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

        this._listEl = this.container.querySelector('#sg-list')
        this._songNameEl = this.container.querySelector('#sg-song-name')
        this._songDateEl = this.container.querySelector('#sg-song-date')
        this._songDescEl = this.container.querySelector('#sg-song-desc')

        this._songDescEl.addEventListener('blur', () => {
            appState.songInfos.description = this._songDescEl.textContent.trim()
        })
        this._songDescEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); this._songDescEl.blur() }
        })

        this.container.querySelector('#sg-rename').addEventListener('click', () => {
            this._renameSelected()
        })

        this.container.querySelector('#sg-delete').addEventListener('click', () => {
            if (this._selectedIdx != null) this._deletePattern(this._selectedIdx)
        })

        this._songNameEl.addEventListener('dblclick', () => this._renameSong())

        this.container.querySelector('#sg-save').addEventListener('click', () => this._saveSong())
        this.container.querySelector('#sg-load').addEventListener('click', () => this._loadSong())
        this.container.querySelector('#sg-export').addEventListener('click', () => this._exportSong())
        this.container.querySelector('#sg-import').addEventListener('click', () => this._importSong())
    }

    subscribe() {
        playbackEvents.on("patternStructureChange", () => { if (this.isVisible) this.sync() })
        playbackEvents.on("drumkitChange", () => { if (this.isVisible) this.sync() })
    }

    sync() {
        this._selectedIdx = appState.selectedPatternNum
        if (appState.songInfos?.name) this._songName = appState.songInfos.name
        this._songNameEl.textContent = this._songName
        this._songDateEl.textContent = appState.songInfos?.date ?? ''
        const desc = appState.songInfos?.description ?? ''
        if (this._songDescEl.textContent.trim() !== desc) {
            this._songDescEl.textContent = desc
        }
        this._renderList()
    }

    _renderList() {
        const patterns = appState.patterns
        if (!patterns.length) {
            this._listEl.innerHTML = '<div class="pp-empty">No patterns</div>'
            return
        }

        this._listEl.innerHTML = ''
        for (let i = 0; i < patterns.length; i++) {
            const pat = patterns[i]
            const isSelected = i === this._selectedIdx

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
                this._startRename(name, i)
            })

            item.appendChild(num)
            item.appendChild(name)
            item.addEventListener('click', () => this._selectPattern(i))
            this._listEl.appendChild(item)
        }
    }

    _startRename(nameEl, idx) {
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
                playbackEvents.emit("patternStructureChange")
                playbackEvents.emit("patternChange")
            }
            this.sync()
        }

        input.addEventListener('blur', commit)
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); input.blur() }
            if (e.key === 'Escape') { input.value = currentName; input.blur() }
        })
    }

    _renameSelected() {
        if (this._selectedIdx == null) return
        const item = this._listEl.querySelector('.sg-selected .sg-name')
        if (item) {
            this._startRename(item, this._selectedIdx)
        }
    }

    _renameSong() {
        const current = this._songName
        const input = document.createElement('input')
        input.type = 'text'
        input.className = 'sg-rename-input'
        input.value = current

        this._songNameEl.replaceWith(input)
        input.focus()
        input.select()

        const commit = () => {
            const val = input.value.trim()
            if (val) this._songName = val
            appState.songInfos.name = this._songName
            this._songNameEl.textContent = this._songName
            input.replaceWith(this._songNameEl)
        }

        input.addEventListener('blur', commit)
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); input.blur() }
            if (e.key === 'Escape') { input.value = current; input.blur() }
        })
    }

    _selectPattern(idx) {
        serviceRegistry.cmd.setSelectedPatternNum(idx)
        appState.currentPage = 0
        playbackEvents.emit("patternStructureChange")
        playbackEvents.emit("patternChange")
        this._selectedIdx = idx
        this._renderList()
    }

    _deletePattern(idx) {
        if (appState.patterns.length <= 1) {
            showToast('Cannot delete the last pattern', 'warning')
            return
        }
        const name = appState.patterns[idx]?.name ?? `Pattern ${idx}`
        if (!confirm(`Delete "${name}"?`)) return

        serviceRegistry.cmd.removePattern(idx)
        this._selectedIdx = appState.selectedPatternNum
        playbackEvents.emit("patternStructureChange")
        playbackEvents.emit("patternChange")
        this.sync()
        showToast(`Deleted "${name}"`, 'success')
    }

    async _saveSong() {
        try {
            await songService.save(this._songName)
            showToast(`Song "${this._songName}" saved`, 'success')
        } catch (err) {
            showToast('Save failed: ' + err.message, 'error')
        }
    }

    async _loadSong() {
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

                this._songName = songService.applyToAppState(data, choice)
                playbackEvents.emit("patternStructureChange")
                playbackEvents.emit("patternChange")
                this.sync()
                showToast(`Song "${this._songName}" loaded`, 'success')
            })
        } catch (err) {
            showToast('Load failed: ' + err.message, 'error')
        }
    }

    _exportSong() {
        songService.exportToFile(this._songName)
        showToast(`Song "${this._songName}" exported`, 'success')
    }

    _importSong() {
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
                this._songName = songService.applyToAppState(data, fallbackName)
                playbackEvents.emit("patternStructureChange")
                playbackEvents.emit("patternChange")
                this.sync()
                showToast(`Song "${this._songName}" imported`, 'success')
            } catch (err) {
                showToast('Import failed: ' + err.message, 'error')
            }
        })
        input.click()
    }
}
