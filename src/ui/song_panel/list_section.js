// src/ui/song_panel/list_section.js
// Pattern library list rendering, selection and inline rename.

import { appState } from '../../state/app_state.js'
import { serviceRegistry } from '../../state/service_registry.js'
import { emitStructureChanged } from '../../state/event_bus.js'

export default class ListSection {
    #editor
    #listEl

    /** @param {import('../song_panel.js').default} editor @param {HTMLElement} listEl */
    constructor(editor, listEl) {
        this.#editor = editor
        this.#listEl = listEl
    }

    get listEl() {
        return this.#listEl
    }

    renderList() {
        const patterns = appState.patterns
        if (!patterns.length) {
            this.#listEl.innerHTML = '<div class="pp-empty">No patterns</div>'
            return
        }

        this.#listEl.innerHTML = ''
        for (let i = 0; i < patterns.length; i++) {
            const pat = patterns[i]
            const isSelected = i === appState.selectedPatternIdx

            const item = document.createElement('div')
            item.className = 'sg-item' + (isSelected ? ' sg-selected' : '')
            if (pat.id) item.dataset.pattern = pat.id

            const num = document.createElement('span')
            num.className = 'sg-num'
            num.textContent = `${i + 1}.`

            const name = document.createElement('span')
            name.className = 'sg-name'
            name.textContent = pat.name ?? `Pattern ${i}`
            name.title = 'Double-click to rename'

            this.#editor.listen(name, 'dblclick', (e) => {
                e.stopPropagation()
                this.startRename(name, i)
            })

            item.appendChild(num)
            item.appendChild(name)
            this.#editor.listen(item, 'click', () => this.selectPattern(i))
            this.#listEl.appendChild(item)
        }
    }

    /** @param {number} idx */
    selectPattern(idx) {
        serviceRegistry.cmd.setSelectedPatternIdx(idx)
        serviceRegistry.cmd.resetPage()
        emitStructureChanged()
        this.renderList()
    }

    /** @param {HTMLElement} nameEl @param {number} idx */
    startRename(nameEl, idx) {
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
                emitStructureChanged()
            }
            this.#editor.sync()
        }

        this.#editor.listen(input, 'blur', commit)
        this.#editor.listen(input, 'keydown', (/** @type {KeyboardEvent} */ e) => {
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
}
