// src/ui/song_panel/actions_section.js
// Song-level actions: save, load, export, import, rename, arrangement change.

import { appState } from '../../state/app_state.js'
import { serviceRegistry } from '../../state/service_registry.js'
import { showToast } from '../../core/notify.js'
import { downloadJson } from '../components/ui_utils.js'
import songService from '../../logic/services/song_service.js'
import { songMeasureAtTick } from '../../logic/song_playback.js'
import { TICK } from '../../core/constants.js'
import { emitStructureChanged } from '../../state/event_bus.js'

export default class ActionsSection {
    #editor

    /** @param {import('../song_panel.js').default} editor */
    constructor(editor) {
        this.#editor = editor
    }

    get songName() {
        return this.#editor.songName
    }
    set songName(v) {
        this.#editor.songName = v
    }

    onArrangementChange() {
        const editor = this.#editor
        const value = editor.arrangementSelect.value
        if (value === '') return
        serviceRegistry.cmd.setSelectedSongIdx(Number(value))
        editor.sync()
    }

    renameSong() {
        const editor = this.#editor
        const current = editor.songName
        const input = document.createElement('input')
        input.type = 'text'
        input.className = 'sg-rename-input'
        input.value = current

        editor.songNameEl.replaceWith(input)
        input.focus()
        input.select()

        const commit = () => {
            const val = input.value.trim()
            if (val) editor.songName = val
            appState.songInfos.name = editor.songName
            editor.songNameEl.textContent = editor.songName
            input.replaceWith(editor.songNameEl)
        }

        editor.listen(input, 'blur', commit)
        editor.listen(input, 'keydown', (/** @type {KeyboardEvent} */ e) => {
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

    async saveSong() {
        const editor = this.#editor
        try {
            await songService.save(editor.songName)
            showToast(`Song "${editor.songName}" saved`, 'success')
        } catch (err) {
            showToast('Save failed: ' + err.message, 'error')
        }
    }

    async loadSong() {
        const editor = this.#editor
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
            editor.listen(overlay.querySelector('#sg-load-cancel'), 'click', close)
            editor.listen(overlay, 'click', (e) => {
                if (e.target === overlay) close()
            })

            editor.listen(overlay.querySelector('#sg-load-ok'), 'click', async () => {
                const choice = /** @type {HTMLSelectElement} */ (overlay.querySelector('#sg-load-select')).value
                close()

                const data = await songService.load(choice)
                if (!data) {
                    showToast('Song not found', 'warning')
                    return
                }

                editor.songName = await songService.applyToAppState(data, choice)
                emitStructureChanged()
                editor.sync()
                showToast(`Song "${editor.songName}" loaded`, 'success')
            })
        } catch (err) {
            showToast('Load failed: ' + err.message, 'error')
        }
    }

    exportSong() {
        const editor = this.#editor
        const { data, filename } = songService.exportToFile(editor.songName)
        downloadJson(data, filename)
        showToast(`Song "${editor.songName}" exported`, 'success')
    }

    importSong() {
        const editor = this.#editor
        const input = document.createElement('input')
        input.type = 'file'
        input.accept = '.odbox,.json'
        editor.listen(input, 'change', async () => {
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
                editor.songName = await songService.applyToAppState(data, fallbackName)
                emitStructureChanged()
                editor.sync()
                showToast(`Song "${editor.songName}" imported`, 'success')
            } catch (err) {
                showToast('Load failed: ' + err.message, 'error')
            }
        })
        input.click()
    }

    onListContextMenu(e) {
        const editor = this.#editor
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
        const startMeasure = Math.floor(songMeasureAtTick(song, serviceRegistry.seq?.tick, TICK))

        editor.listMenu.show(
            label,
            [
                {
                    label: `Add at measure ${startMeasure + 1}`,
                    run: () => {
                        serviceRegistry.cmd.addPatternAtMeasure(patternId, startMeasure)
                        showToast(`"${label}" added at measure ${startMeasure + 1}`, 'success')
                        editor.arrangement?.sync()
                    },
                },
            ],
            e.clientX,
            e.clientY,
        )
    }
}
