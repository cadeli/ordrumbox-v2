// src/ui/toolbar/pattern_nav.js
// Pattern navigation: pattern select, page nav, drumkit select.

import { playbackEvents } from '../../state/event_bus.js'
import { prevPage, nextPage } from '../page_nav.js'
import { EVENTS } from '../../core/events.js'
import {
    rebuildPatternSelect,
    rebuildDrumkitSelect,
    onPatternSelectChange,
    onDrumkitSelectChange,
} from '../select_lists.js'

export default class PatternNav {
    #tb

    /** @param {import('../toolbar.js').default} toolbar */
    constructor(toolbar) {
        this.#tb = toolbar
    }

    createDOM() {
        const tb = this.#tb

        // ── Pattern select ──────────────────────────────────────
        const patWrap = document.createElement('div')
        patWrap.className = 'tb-group'
        const patLabel = document.createElement('span')
        patLabel.className = 'tb-label'
        patLabel.textContent = 'Pattern'
        patLabel.title = 'Current pattern'
        tb.patLabel = patLabel
        tb.patternSelect = document.createElement('select')
        patWrap.appendChild(patLabel)
        patWrap.appendChild(tb.patternSelect)

        // ── Page navigation ─────────────────────────────────────
        const pageWrap = document.createElement('div')
        pageWrap.className = 'tb-group tb-page-group'
        const pageLabelTop = document.createElement('span')
        pageLabelTop.className = 'tb-label'
        pageLabelTop.textContent = 'Page'
        tb.prevPageBtn = document.createElement('button')
        tb.prevPageBtn.className = 'tb-prev-page'
        tb.prevPageBtn.textContent = '◀'
        tb.prevPageBtn.title = 'Previous Page'
        tb.pageLabel = document.createElement('span')
        tb.pageLabel.className = 'tb-page-label'
        tb.pageLabel.textContent = 'P1'
        tb.nextPageBtn = document.createElement('button')
        tb.nextPageBtn.className = 'tb-next-page'
        tb.nextPageBtn.textContent = '▶'
        tb.nextPageBtn.title = 'Next Page'
        pageWrap.appendChild(pageLabelTop)
        const pageRow = document.createElement('div')
        pageRow.className = 'tb-page-row'
        pageRow.appendChild(tb.prevPageBtn)
        pageRow.appendChild(tb.pageLabel)
        pageRow.appendChild(tb.nextPageBtn)
        pageWrap.appendChild(pageRow)

        // ── Drumkit select ──────────────────────────────────────
        const kitWrap = document.createElement('div')
        kitWrap.className = 'tb-group'
        const kitLabel = document.createElement('span')
        kitLabel.className = 'tb-label'
        kitLabel.textContent = 'Drumkit'
        kitLabel.title = 'Click to open Drumkit Manager'
        kitLabel.style.cursor = 'pointer'
        tb.kitLabel = kitLabel
        tb.drumkitSelect = document.createElement('select')
        kitWrap.appendChild(kitLabel)
        kitWrap.appendChild(tb.drumkitSelect)

        return { patWrap, pageWrap, kitWrap }
    }

    bindEvents() {
        const tb = this.#tb

        tb.patternSelect.addEventListener('change', () => onPatternSelectChange(tb.patternSelect))

        tb.drumkitSelect.addEventListener('change', () => onDrumkitSelectChange(tb.drumkitSelect))

        tb.kitLabel.addEventListener('click', () => {
            playbackEvents.emit(EVENTS.DRUMKIT_MANAGER_TOGGLE, true)
        })

        tb.prevPageBtn.addEventListener('click', () => prevPage())
        tb.nextPageBtn.addEventListener('click', () => nextPage())
    }

    rebuildPatternSelect() {
        rebuildPatternSelect(this.#tb.patternSelect)
    }

    rebuildDrumkitSelect() {
        rebuildDrumkitSelect(this.#tb.drumkitSelect)
    }
}
