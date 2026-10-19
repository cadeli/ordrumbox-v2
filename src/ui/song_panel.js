import { appState } from '../state/app_state.js'
import { playbackEvents } from '../state/event_bus.js'
import { clamp } from '../core/numbers.js'
import BasePanel from './base_panel.js'
import { EVENTS } from '../core/events.js'
import ArrangementSection from './song_panel/arrangement_section.js'
import ContextMenu from './components/context_menu.js'

import ListSection from './song_panel/list_section.js'
import ActionsSection from './song_panel/actions_section.js'

export default class SongPanel extends BasePanel {
    #songName = 'Untitled'
    #listEl
    #listMenu = new ContextMenu()
    #songNameEl
    #songDateEl
    #songDescEl
    #arrangementSelect
    #arrangement
    #list
    #actions

    constructor() {
        super('song-panel')
    }

    get songName() {
        return this.#songName
    }
    set songName(v) {
        this.#songName = v
    }
    get listEl() {
        return this.#listEl
    }
    get songNameEl() {
        return this.#songNameEl
    }
    get songDateEl() {
        return this.#songDateEl
    }
    get songDescEl() {
        return this.#songDescEl
    }
    get arrangementSelect() {
        return this.#arrangementSelect
    }
    get arrangement() {
        return this.#arrangement
    }
    get listMenu() {
        return this.#listMenu
    }

    createDOM() {
        super.createDOM()
        this.container.classList.add('workspace-panel')
        this.container.style.display = 'none'

        this.container.innerHTML = `
            <div class="ne-header">
                <span class="ne-track">Song</span>
            </div>
            <div class="sg-body">
                <div class="sg-list" id="sg-list"></div>
                <div class="sg-right">
                    <div class="sa-root" id="sa-root">
                        <div class="sa-head">
                            <span class="sa-title" id="sa-title">Arrangement</span>
                            <span class="sa-meta" id="sa-meta"></span>
                        </div>
                        <div class="sa-list" id="sa-list"></div>
                    </div>
                    <div class="sg-actions-col" id="sg-actions-col">
                        <div class="sg-info-rows">
                            <div class="sg-song-row">
                                <span class="sg-song-label">Song</span>
                                <span class="sg-song-name" id="sg-song-name" title="Double-click to rename">Untitled</span>
                            </div>
                            <div class="sg-song-row">
                                <span class="sg-song-label">Date</span>
                                <span class="sg-song-date" id="sg-song-date"></span>
                            </div>
                        </div>
                        <div class="sg-song-desc" id="sg-song-desc" contenteditable="true" spellcheck="false" title="Double-click to edit description"></div>
                        <div class="sg-song-row">
                            <span class="sg-song-label">Arrangement</span>
                            <select class="sg-arrangement-select" id="sg-arrangement-select" aria-label="Arrangement" title="Choose the arrangement shown in the grid"></select>
                        </div>
                        <div class="sg-btn-group">
                            <button class="ne-btn" id="sg-save" title="Save song to IndexedDB">Save</button>
                            <button class="ne-btn" id="sg-load" title="Load song from IndexedDB">Load</button>
                            <button class="ne-btn" id="sg-export" title="Export song as JSON file">Export</button>
                            <button class="ne-btn" id="sg-import" title="Import song from JSON file">Import</button>
                        </div>
                    </div>
                </div>
            </div>
        `

        this.#listEl = this.container.querySelector('#sg-list')
        this.#songNameEl = this.container.querySelector('#sg-song-name')
        this.#songDateEl = this.container.querySelector('#sg-song-date')
        this.#songDescEl = this.container.querySelector('#sg-song-desc')
        this.#arrangementSelect = this.container.querySelector('#sg-arrangement-select')

        this.#arrangement = new ArrangementSection(
            this,
            this.container.querySelector('#sa-root'),
            this.container.querySelector('#sa-title'),
            this.container.querySelector('#sa-list'),
        )

        this.#list = new ListSection(this, this.#listEl)
        this.#actions = new ActionsSection(this)

        this.listen(this.#listEl, 'contextmenu', (/** @type {MouseEvent} */ e) => this.#actions.onListContextMenu(e))

        this.listen(this.#songDescEl, 'blur', () => {
            appState.songInfos.description = this.#songDescEl.textContent.trim()
        })
        this.listen(this.#songDescEl, 'keydown', (/** @type {KeyboardEvent} */ e) => {
            if (e.key === 'Enter') {
                e.preventDefault()
                this.#songDescEl.blur()
            }
        })

        this.listen(this.#songNameEl, 'dblclick', () => this.#actions.renameSong())

        this.listen(this.container.querySelector('#sg-save'), 'click', () => this.#actions.saveSong())
        this.listen(this.container.querySelector('#sg-load'), 'click', () => this.#actions.loadSong())
        this.listen(this.container.querySelector('#sg-export'), 'click', () => this.#actions.exportSong())
        this.listen(this.container.querySelector('#sg-import'), 'click', () => this.#actions.importSong())
        this.listen(this.#arrangementSelect, 'change', () => this.#actions.onArrangementChange())
    }

    show() {
        this.container.style.display = 'flex'
        this.sync()
    }

    onDestroy() {
        this.#listMenu.hide()
        this.#arrangement?.dispose()
    }

    subscribe() {
        this.sub(playbackEvents, EVENTS.PATTERN_STRUCTURE_CHANGE, () => {
            if (this.isVisible) this.sync()
        })
        this.sub(playbackEvents, EVENTS.DRUMKIT_CHANGE, () => {
            if (this.isVisible) this.sync()
        })
    }

    sync() {
        if (appState.songInfos?.name) this.#songName = appState.songInfos.name
        this.#songNameEl.textContent = this.#songName
        this.#songDateEl.textContent = appState.songInfos?.date ?? ''
        const desc = appState.songInfos?.description ?? ''
        if (this.#songDescEl.textContent.trim() !== desc) {
            this.#songDescEl.textContent = desc
        }
        this.#syncArrangementSelect()
        this.#list.renderList()
        this.#arrangement?.sync()
    }

    #syncArrangementSelect() {
        const select = this.#arrangementSelect
        const songs = appState.songs ?? []
        select.innerHTML = ''
        if (!songs.length) {
            const option = document.createElement('option')
            option.value = ''
            option.textContent = 'No arrangement'
            select.appendChild(option)
            select.disabled = true
            return
        }
        select.disabled = false
        songs.forEach((song, i) => {
            const option = document.createElement('option')
            option.value = String(i)
            option.textContent = song?.name ?? `Arrangement ${i + 1}`
            select.appendChild(option)
        })
        const selected = clamp(appState.selectedSongIdx ?? 0, 0, songs.length - 1)
        select.value = String(selected)
    }
}
