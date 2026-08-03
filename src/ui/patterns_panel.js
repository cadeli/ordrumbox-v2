import { appState } from '../state/app_state.js'
import { playbackEvents } from '../state/playback_events.js'
import { serviceRegistry } from '../state/service_registry.js'
import { showToast } from './toast.js'
import { bindCloseButton } from './components/panel_helpers.js'
import BasePanel from './base_panel.js'
import { idbGet, idbPut, idbKeys, idbDelete } from '../core/idb.js'

const SONGS_STORE = 'songs'
const SONG_VERSION = 1

export default class PatternsPanel extends BasePanel {
    constructor() {
        super('pp-panel')
        this._selectedIdx = null
        this._songName = 'Untitled'
    }

    createDOM() {
        super.createDOM()

        this.container.innerHTML = `
            <div class="ne-header">
                <span class="ne-track">Patterns</span>
                <button class="ne-close">&times;</button>
            </div>
            <div class="pp-body">
                <div class="pp-list" id="pp-list"></div>
                <div class="pp-actions-col" id="pp-actions-col">
                    <div class="pp-song-row">
                        <span class="pp-song-label">Song:</span>
                        <span class="pp-song-name" id="pp-song-name" title="Double-click to rename">Untitled</span>
                    </div>
                    <div class="pp-btn-group">
                        <button class="ne-btn" id="pp-add" title="Add a new empty pattern">+ Pattern</button>
                        <button class="ne-btn" id="pp-rename" title="Rename selected pattern">Rename</button>
                        <button class="ne-btn pp-danger" id="pp-delete" title="Delete selected pattern">Delete</button>
                    </div>
                    <div class="pp-btn-group">
                        <button class="ne-btn" id="pp-save" title="Save song to IndexedDB">Save Song</button>
                        <button class="ne-btn" id="pp-load" title="Load song from IndexedDB">Load Song</button>
                    </div>
                </div>
            </div>
        `

        this._listEl = this.container.querySelector('#pp-list')
        this._songNameEl = this.container.querySelector('#pp-song-name')

        bindCloseButton(this.container, () => this.hide())

        this.container.querySelector('#pp-add').addEventListener('click', () => {
            const newIdx = appState.patterns.length
            serviceRegistry.mfCmd.addPattern()
            serviceRegistry.mfCmd.setSelectedPatternNum(newIdx)
            appState.currentPage = 0
            playbackEvents.dispatchPatternChange()
            this._selectedIdx = newIdx
            this.sync()
            showToast('Pattern added', 'success')
        })

        this.container.querySelector('#pp-rename').addEventListener('click', () => {
            this._renameSelected()
        })

        this.container.querySelector('#pp-delete').addEventListener('click', () => {
            if (this._selectedIdx != null) this._deletePattern(this._selectedIdx)
        })

        this._songNameEl.addEventListener('dblclick', () => this._renameSong())

        this.container.querySelector('#pp-save').addEventListener('click', () => this._saveSong())
        this.container.querySelector('#pp-load').addEventListener('click', () => this._loadSong())
    }

    subscribe() {
        playbackEvents.onPatternsToggle.push((show) => {
            if (show) this.show(); else this.hide()
        })
        playbackEvents.onToolsToggle.push(() => this.hide())
        playbackEvents.onOutputToggle.push(() => this.hide())
        playbackEvents.onAboutToggle.push(() => this.hide())
        playbackEvents.onDrumkitManagerToggle.push(() => this.hide())
        playbackEvents.onPatternChange.push(() => { if (this.isVisible) this.sync() })
    }

    show() {
        super.show()
    }

    sync() {
        this._selectedIdx = appState.selectedPatternNum
        this._songNameEl.textContent = this._songName
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
            item.className = 'pp-item' + (isSelected ? ' pp-selected' : '')

            const num = document.createElement('span')
            num.className = 'pp-num'
            num.textContent = `${i + 1}.`

            const name = document.createElement('span')
            name.className = 'pp-name'
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
        input.className = 'pp-rename-input'
        input.value = currentName

        nameEl.replaceWith(input)
        input.focus()
        input.select()

        const commit = () => {
            const newName = input.value.trim()
            if (newName && newName !== currentName) {
                serviceRegistry.mfCmd.renamePattern(idx, newName)
                playbackEvents.dispatchPatternChange()
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
        const item = this._listEl.querySelector('.pp-selected .pp-name')
        if (item) {
            this._startRename(item, this._selectedIdx)
        }
    }

    _renameSong() {
        const current = this._songName
        const input = document.createElement('input')
        input.type = 'text'
        input.className = 'pp-rename-input'
        input.value = current

        this._songNameEl.replaceWith(input)
        input.focus()
        input.select()

        const commit = () => {
            const val = input.value.trim()
            if (val) this._songName = val
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
        serviceRegistry.mfCmd.setSelectedPatternNum(idx)
        appState.currentPage = 0
        playbackEvents.dispatchPatternChange()
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

        serviceRegistry.mfCmd.removePattern(idx)
        this._selectedIdx = appState.selectedPatternNum
        playbackEvents.dispatchPatternChange()
        this.sync()
        showToast(`Deleted "${name}"`, 'success')
    }

    async _saveSong() {
        const data = {
            version: SONG_VERSION,
            name: this._songName,
            patterns: JSON.parse(JSON.stringify(appState.patterns)),
            selectedPatternNum: appState.selectedPatternNum,
            savedAt: Date.now()
        }
        try {
            await idbPut(SONGS_STORE, this._songName, data)
            showToast(`Song "${this._songName}" saved`, 'success')
        } catch (err) {
            showToast('Save failed: ' + err.message, 'error')
        }
    }

    async _loadSong() {
        try {
            const keys = await idbKeys(SONGS_STORE)
            if (!keys.length) {
                showToast('No saved songs found', 'warning')
                return
            }
            const choice = prompt(
                'Load which song?\n\nSaved songs:\n' +
                keys.map((k, i) => `${i + 1}. ${k}`).join('\n') +
                '\n\nEnter the song name:'
            )
            if (!choice) return

            const data = await idbGet(SONGS_STORE, choice.trim())
            if (!data?.patterns) {
                showToast('Song not found', 'warning')
                return
            }

            appState.patterns.length = 0
            for (const pat of data.patterns) {
                appState.patterns.push(pat)
            }
            this._songName = data.name ?? choice.trim()
            serviceRegistry.mfCmd.setSelectedPatternNum(data.selectedPatternNum ?? 0)
            appState.currentPage = 0
            playbackEvents.dispatchPatternChange()
            this.sync()
            showToast(`Song "${this._songName}" loaded`, 'success')
        } catch (err) {
            showToast('Load failed: ' + err.message, 'error')
        }
    }
}
