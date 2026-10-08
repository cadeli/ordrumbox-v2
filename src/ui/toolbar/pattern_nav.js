// src/ui/toolbar/pattern_nav.js
// Pattern navigation: pattern select, page nav, drumkit select.

import { playbackEvents } from '../../state/event_bus.js'
import { prevPage, nextPage } from '../page_nav.js'
import { EVENTS } from '../../core/events.js'
import { Lifecycle } from '../../core/lifecycle.js'
import {
    rebuildPatternSelect,
    rebuildDrumkitSelect,
    onPatternSelectChange,
    onDrumkitSelectChange,
} from '../select_lists.js'

export default class PatternNav {
    /** Owns every listener bound through #life — released by destroy(). */
    #life = new Lifecycle()
    /** @type {HTMLSelectElement} */
    #patternSelect
    /** @type {HTMLSelectElement} */
    #drumkitSelect
    /** @type {HTMLButtonElement} */
    #prevPageBtn
    /** @type {HTMLButtonElement} */
    #nextPageBtn
    /** @type {HTMLSpanElement} */
    #pageLabel
    /** @type {HTMLSpanElement} */
    #patLabel
    /** @type {HTMLSpanElement} */
    #kitLabel

    get patternSelect() {
        return this.#patternSelect
    }

    get drumkitSelect() {
        return this.#drumkitSelect
    }

    get prevPageBtn() {
        return this.#prevPageBtn
    }

    get nextPageBtn() {
        return this.#nextPageBtn
    }

    get pageLabel() {
        return this.#pageLabel
    }

    get patLabel() {
        return this.#patLabel
    }

    get kitLabel() {
        return this.#kitLabel
    }

    /** Releases every DOM listener bound through listen(). */
    destroy() {
        this.#life.destroy()
    }

    createDOM() {
        // ── Pattern select ──────────────────────────────────────
        const patWrap = document.createElement('div')
        patWrap.className = 'tb-group'
        this.#patLabel = document.createElement('span')
        this.#patLabel.className = 'tb-label'
        this.#patLabel.textContent = 'Pattern'
        this.#patLabel.title = 'Current pattern'
        this.#patternSelect = document.createElement('select')
        patWrap.appendChild(this.#patLabel)
        patWrap.appendChild(this.#patternSelect)

        // ── Page navigation ─────────────────────────────────────
        const pageWrap = document.createElement('div')
        pageWrap.className = 'tb-group tb-page-group'
        const pageLabelTop = document.createElement('span')
        pageLabelTop.className = 'tb-label'
        pageLabelTop.textContent = 'Page'
        this.#prevPageBtn = document.createElement('button')
        this.#prevPageBtn.className = 'tb-prev-page'
        this.#prevPageBtn.textContent = '◀'
        this.#prevPageBtn.title = 'Previous Page'
        this.#pageLabel = document.createElement('span')
        this.#pageLabel.className = 'tb-page-label'
        this.#pageLabel.textContent = 'P1'
        this.#nextPageBtn = document.createElement('button')
        this.#nextPageBtn.className = 'tb-next-page'
        this.#nextPageBtn.textContent = '▶'
        this.#nextPageBtn.title = 'Next Page'
        pageWrap.appendChild(pageLabelTop)
        const pageRow = document.createElement('div')
        pageRow.className = 'tb-page-row'
        pageRow.appendChild(this.#prevPageBtn)
        pageRow.appendChild(this.#pageLabel)
        pageRow.appendChild(this.#nextPageBtn)
        pageWrap.appendChild(pageRow)

        // ── Drumkit select ──────────────────────────────────────
        const kitWrap = document.createElement('div')
        kitWrap.className = 'tb-group'
        this.#kitLabel = document.createElement('span')
        this.#kitLabel.className = 'tb-label'
        this.#kitLabel.textContent = 'Drumkit'
        this.#kitLabel.title = 'Click to open Drumkit Manager'
        this.#kitLabel.style.cursor = 'pointer'
        this.#drumkitSelect = document.createElement('select')
        kitWrap.appendChild(this.#kitLabel)
        kitWrap.appendChild(this.#drumkitSelect)

        return { patWrap, pageWrap, kitWrap }
    }

    /**
     * Renders the page position and refills both selects from the model.
     * @param {{pageLabel: string, atFirstPage: boolean, atLastPage: boolean}} data
     */
    sync(data) {
        this.#pageLabel.textContent = data.pageLabel
        this.#nextPageBtn.disabled = data.atLastPage
        this.#prevPageBtn.disabled = data.atFirstPage

        rebuildPatternSelect(this.#patternSelect)
        rebuildDrumkitSelect(this.#drumkitSelect)
    }

    bindEvents() {
        // Fresh signal if this is a re-init cycle after destroy().
        this.#life.reset()

        this.#life.listen(this.#patternSelect, 'change', () =>
            onPatternSelectChange(this.#patternSelect),
        )

        this.#life.listen(this.#drumkitSelect, 'change', () =>
            onDrumkitSelectChange(this.#drumkitSelect),
        )

        this.#life.listen(this.#kitLabel, 'click', () => {
            playbackEvents.emit(EVENTS.DRUMKIT_MANAGER_TOGGLE, true)
        })

        this.#life.listen(this.#prevPageBtn, 'click', () => prevPage())
        this.#life.listen(this.#nextPageBtn, 'click', () => nextPage())
    }
}
