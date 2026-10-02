// @ts-check
import { appState } from '../state/app_state.js'
import { playbackEvents } from '../state/playback_events.js'
import { serviceRegistry } from '../state/service_registry.js'
import { showToast } from '../core/notify.js'
import BasePanel from './base_panel.js'
import songService from '../logic/services/song_service.js'
import { downloadJson } from './components/ui_utils.js'
import { EVENTS } from '../core/events.js'
import ArrangementSection from './song_panel/arrangement_section.js'
import ContextMenu from './components/context_menu.js'
import { barsForPattern } from '../model/song_schema.js'
import { songBarAtTick } from '../logic/song_playback.js'
import { TICK } from '../core/constants.js'

/**
 * Song view: pattern list + song metadata/actions.
 *
 * Was a fixed "slot" panel opened by clicking the toolbar's Pattern label; it
 * is now a regular workspace view (like grid / synth / proll) reached through
 * the View group of the toolbar. Every element below is unchanged — only the
 * container class and the way it is shown moved.
 */
export default class SongPanel extends BasePanel {
    #selectedIdx = null
    #songName = 'Untitled'
    #listEl
    /** Menu of the pattern list, for placing a pattern in the arrangement. */
    #listMenu = new ContextMenu()
    #songNameEl
    #songDateEl
    #songDescEl
    #arrangement

    constructor() {
        super('song-panel')
    }

    createDOM() {
        super.createDOM()
        this.container.classList.add('workspace-panel')
        // Other workspace panels lay out as a flex column; the slot-panel CSS
        // this replaces used position:fixed.
        this.container.style.display = 'none'

        this.container.innerHTML = `
            <div class="ne-header">
                <span class="ne-track">Song</span>
            </div>
            <div class="sg-body">
                <!-- Left column: the pattern library -->
                <div class="sg-list" id="sg-list"></div>
                <!-- Right column: the arrangement over the song metadata -->
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

        this.#arrangement = new ArrangementSection(
            this,
            this.container.querySelector('#sa-root'),
            this.container.querySelector('#sa-title'),
            this.container.querySelector('#sa-list'),
        )

        // Delegated: the list is re-rendered from scratch on every change.
        this.listen(this.#listEl, 'contextmenu', (/** @type {MouseEvent} */ e) => this.#onListContextMenu(e))

        this.listen(this.#songDescEl, 'blur', () => {
            appState.songInfos.description = this.#songDescEl.textContent.trim()
        })
        this.listen(this.#songDescEl, 'keydown', (/** @type {KeyboardEvent} */ e) => {
            if (e.key === 'Enter') {
                e.preventDefault()
                this.#songDescEl.blur()
            }
        })

        this.listen(this.#songNameEl, 'dblclick', () => this.#renameSong())

        this.listen(this.container.querySelector('#sg-save'), 'click', () => this.#saveSong())
        this.listen(this.container.querySelector('#sg-load'), 'click', () => this.#loadSong())
        this.listen(this.container.querySelector('#sg-export'), 'click', () => this.#exportSong())
        this.listen(this.container.querySelector('#sg-import'), 'click', () => this.#importSong())
    }

    /**
     * The song view is a workspace panel, i.e. a flex column so `.sg-body` can
     * take the remaining height. BasePanel.show() hard-codes `display: block`,
     * which overrode .workspace-panel's `display: flex` and let `.sg-body` grow
     * to its content — the panel then clipped the overflow and the pattern list
     * became unreachable below the fold.
     */
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
        this.#selectedIdx = appState.selectedPatternIdx
        if (appState.songInfos?.name) this.#songName = appState.songInfos.name
        this.#songNameEl.textContent = this.#songName
        this.#songDateEl.textContent = appState.songInfos?.date ?? ''
        const desc = appState.songInfos?.description ?? ''
        if (this.#songDescEl.textContent.trim() !== desc) {
            this.#songDescEl.textContent = desc
        }
        this.#renderList()
        this.#arrangement?.sync()
    }

    /**
     * Right-click on the library list: place that pattern in the arrangement at
     * the measure the transport is on.
     *
     * The list holds the whole library, so this is the only way to bring in a
     * pattern the arrangement does not use yet — the grid rows only cover the
     * patterns already placed.
     * @param {MouseEvent} e
     */
    #onListContextMenu(e) {
        const target = e.target instanceof Element ? e.target : null
        const itemEl = /** @type {HTMLElement | null} */ (target?.closest('.sg-item'))
        const patternId = itemEl?.dataset.pattern
        if (!target || !patternId) return
        e.preventDefault()

        const song = appState.songs?.[appState.selectedSongIdx ?? 0]
        if (!song) {
            showToast('No song to add to', 'warning')
            return
        }

        const pattern = appState.patterns?.find((p) => p.id === patternId)
        const label = pattern?.name ?? patternId
        const startBar = Math.floor(songBarAtTick(song, serviceRegistry.seq?.tick, TICK))
        const bars = barsForPattern(pattern)

        this.#listMenu.show(
            label,
            [
                {
                    label: `Add at bar ${startBar + 1}`,
                    run: () => {
                        serviceRegistry.cmd.addSongClip({ pattern: patternId, startBar, bars })
                        showToast(`"${label}" added at bar ${startBar + 1}`, 'success')
                        this.#arrangement?.sync()
                    },
                },
            ],
            e.clientX,
            e.clientY,
        )
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
            // clips reference patterns by stable id, so the menu needs one and
            // the row index is not it
            if (pat.id) item.dataset.pattern = pat.id

            const num = document.createElement('span')
            num.className = 'sg-num'
            num.textContent = `${i + 1}.`

            const name = document.createElement('span')
            name.className = 'sg-name'
            name.textContent = pat.name ?? `Pattern ${i}`
            name.title = 'Double-click to rename'

            this.listen(name, 'dblclick', (e) => {
                e.stopPropagation()
                this.#startRename(name, i)
            })

            item.appendChild(num)
            item.appendChild(name)
            this.listen(item, 'click', () => this.#selectPattern(i))
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
                    playbackEvents.emit(EVENTS.PATTERN_STRUCTURE_CHANGE)
                    playbackEvents.emit(EVENTS.PATTERN_CHANGE)
                })
            }
            this.sync()
        }

        this.listen(input, 'blur', commit)
        this.listen(input, 'keydown', (/** @type {KeyboardEvent} */ e) => {
            if (e.key === 'Enter') {
                e.preventDefault()
                input.blur()
            }
            if (e.key === 'Escape') {
                input.value = currentName
                input.blur()
            }
        })
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

        this.listen(input, 'blur', commit)
        this.listen(input, 'keydown', (/** @type {KeyboardEvent} */ e) => {
            if (e.key === 'Enter') {
                e.preventDefault()
                input.blur()
            }
            if (e.key === 'Escape') {
                input.value = current
                input.blur()
            }
        })
    }

    #selectPattern(idx) {
        serviceRegistry.cmd.setSelectedPatternIdx(idx)
        serviceRegistry.cmd.resetPage()
        playbackEvents.batch(() => {
            playbackEvents.emit(EVENTS.PATTERN_STRUCTURE_CHANGE)
            playbackEvents.emit(EVENTS.PATTERN_CHANGE)
        })
        this.#selectedIdx = idx
        this.#renderList()
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
                        ${keys.map((k) => `<option value="${k}">${k}</option>`).join('')}
                    </select>
                    <div class="sg-modal-actions">
                        <button class="ne-btn" id="sg-load-ok">Load</button>
                        <button class="ne-btn" id="sg-load-cancel">Cancel</button>
                    </div>
                </div>
            `
            document.body.appendChild(overlay)

            const close = () => overlay.remove()
            this.listen(overlay.querySelector('#sg-load-cancel'), 'click', close)
            this.listen(overlay, 'click', (e) => {
                if (e.target === overlay) close()
            })

            this.listen(overlay.querySelector('#sg-load-ok'), 'click', async () => {
                const choice = /** @type {HTMLSelectElement} */ (overlay.querySelector('#sg-load-select')).value
                close()

                const data = await songService.load(choice)
                if (!data) {
                    showToast('Song not found', 'warning')
                    return
                }

                this.#songName = await songService.applyToAppState(data, choice)
                playbackEvents.batch(() => {
                    playbackEvents.emit(EVENTS.PATTERN_STRUCTURE_CHANGE)
                    playbackEvents.emit(EVENTS.PATTERN_CHANGE)
                })
                this.sync()
                showToast(`Song "${this.#songName}" loaded`, 'success')
            })
        } catch (err) {
            showToast('Load failed: ' + err.message, 'error')
        }
    }

    #exportSong() {
        const { data, filename } = songService.exportToFile(this.#songName)
        downloadJson(data, filename)
        showToast(`Song "${this.#songName}" exported`, 'success')
    }

    #importSong() {
        const input = document.createElement('input')
        input.type = 'file'
        input.accept = '.odbox,.json'
        this.listen(input, 'change', async () => {
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
                this.#songName = await songService.applyToAppState(data, fallbackName)
                playbackEvents.batch(() => {
                    playbackEvents.emit(EVENTS.PATTERN_STRUCTURE_CHANGE)
                    playbackEvents.emit(EVENTS.PATTERN_CHANGE)
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
