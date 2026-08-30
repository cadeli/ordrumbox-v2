// src/ui/toolbar/pattern_nav.js
// Pattern navigation: pattern select, page nav, drumkit select.

import { appState } from '../../state/app_state.js'
import { soundRegistry } from '../../state/sound_registry.js'
import { serviceRegistry } from '../../state/service_registry.js'
import { playbackEvents } from '../../state/playback_events.js'
import { recalcLoopDerived } from '../../model/track_schema.js'
import Utils from '../../core/utils.js'

export default class PatternNav {
    /** @param {import('../toolbar.js').default} toolbar */
    constructor(toolbar) { this._tb = toolbar }

    createDOM() {
        const tb = this._tb

        // ── Pattern select ──────────────────────────────────────
        const patWrap = document.createElement('div')
        patWrap.className = 'tb-group'
        const patLabel = document.createElement('span')
        patLabel.className = 'tb-label'
        patLabel.textContent = 'Pattern'
        patLabel.title = 'Click to open Patterns Manager'
        patLabel.style.cursor = 'pointer'
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
        const tb = this._tb

        tb.patternSelect.addEventListener('change', () => {
            const num = parseInt(tb.patternSelect.value, 10)
            if (!isNaN(num)) {
                serviceRegistry.cmd.setSelectedPatternNum(num)
                appState.currentPage = 0
                playbackEvents.emit('patternMetaChange')
            }
        })

        tb.drumkitSelect.addEventListener('change', () => {
            const num = parseInt(tb.drumkitSelect.value, 10)
            if (!isNaN(num)) {
                serviceRegistry.cmd.setSelectedDrumkitNum(num)
            }
        })

        tb.kitLabel.addEventListener('click', () => {
            playbackEvents.emit('drumkitManagerToggle', true)
        })

        tb.patLabel.addEventListener('click', () => {
            playbackEvents.emit('songToggle', true)
        })

        tb.prevPageBtn.addEventListener('click', () => {
            if (appState.currentPage > 0) {
                appState.currentPage--
                playbackEvents.batch(() => {
                    playbackEvents.emit('patternMetaChange')
                    playbackEvents.emit('patternChange')
                })
            }
        })

        tb.nextPageBtn.addEventListener('click', () => {
            const pattern = appState.patterns[appState.selectedPatternNum]
            if (!pattern) return
            const stepsPerBeat = Utils.getTracksArray(pattern)[0]?.stepsPerBeat ?? 4
            const totalSteps = (pattern.nbBeats ?? 4) * stepsPerBeat
            const maxPage = Math.ceil(totalSteps / 16) - 1
            if (appState.currentPage < maxPage) {
                appState.currentPage++
                playbackEvents.batch(() => {
                    playbackEvents.emit('patternMetaChange')
                    playbackEvents.emit('patternChange')
                })
            }
        })
    }

    rebuildPatternSelect() {
        const tb = this._tb
        tb.patternSelect.innerHTML = ''
        appState.patterns.forEach((pat, i) => {
            const opt = document.createElement('option')
            opt.value = i
            opt.textContent = pat.name ?? `Pattern ${i}`
            tb.patternSelect.appendChild(opt)
        })
        if (tb.patternSelect.options.length > 0) {
            const idx = Math.min(appState.selectedPatternNum, tb.patternSelect.options.length - 1)
            tb.patternSelect.selectedIndex = idx
        }
    }

    rebuildDrumkitSelect() {
        const tb = this._tb
        tb.drumkitSelect.innerHTML = ''
        soundRegistry.drumkitList.forEach((kit, i) => {
            const opt = document.createElement('option')
            opt.value = i
            opt.textContent = kit.name ?? `Kit ${i}`
            tb.drumkitSelect.appendChild(opt)
        })
        if (tb.drumkitSelect.options.length > 0) {
            const idx = Math.min(appState.selectedDrumkitNum, tb.drumkitSelect.options.length - 1)
            tb.drumkitSelect.selectedIndex = idx
        }
    }
}
