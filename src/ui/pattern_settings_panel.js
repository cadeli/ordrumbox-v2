import { appState } from '../state/app_state.js'
import { soundRegistry } from '../state/sound_registry.js'
import { serviceRegistry } from '../state/service_registry.js'
import { playbackEvents } from '../state/playback_events.js'
import Utils from '../core/utils.js'
import { recalcLoopDerived } from '../model/track_schema.js'
import { MAX_BEATS } from '../core/constants.js'
import { prevPage, nextPage } from '../core/page_nav.js'
import { showToast } from '../core/notify.js'
import { EVENTS } from '../core/events.js'

export default class PatternSettingsPanel {
    #isOpen
    #prevPageBtn
    #nextPageBtn
    #pageLabel
    #beatsSelect
    #drumkitSelect
    #patternSelect
    #drumBtn
    #bassBtn
    #chordsBtn

    get _isOpen() {
        return this.#isOpen
    }
    get _beatsSelect() {
        return this.#beatsSelect
    }
    get _drumkitSelect() {
        return this.#drumkitSelect
    }
    get _patternSelect() {
        return this.#patternSelect
    }
    get _drumBtn() {
        return this.#drumBtn
    }
    get _bassBtn() {
        return this.#bassBtn
    }
    get _chordsBtn() {
        return this.#chordsBtn
    }
    get _pageLabel() {
        return this.#pageLabel
    }
    get _prevPageBtn() {
        return this.#prevPageBtn
    }
    get _nextPageBtn() {
        return this.#nextPageBtn
    }

    constructor() {
        this.container = null
        this.#isOpen = false
    }

    init() {
        this.#createDOM()
        this.#bindEvents()
        this.#subscribeEvents()
    }

    #createDOM() {
        this.container = document.createElement('div')
        this.container.id = 'pattern-settings-panel'

        const content = document.createElement('div')
        content.className = 'ps-content'

        const closeBtn = document.createElement('button')
        closeBtn.textContent = '×'
        closeBtn.className = 'ps-close-btn'
        closeBtn.title = 'Close'

        /* Page row */
        const pageRow = document.createElement('div')
        pageRow.className = 'ps-row'
        pageRow.innerHTML = `
            <label class="ps-label">Page</label>
            <div class="ps-control ps-page-controls">
                <button class="ps-btn ps-prev-page">◀</button>
                <span class="ps-page-label">P1</span>
                <button class="ps-btn ps-next-page">▶</button>
            </div>
        `

        /* Beats row */
        const beatsRow = document.createElement('div')
        beatsRow.className = 'ps-row'
        beatsRow.innerHTML = `
            <label class="ps-label">Beats</label>
            <select class="ps-beats-select">
                ${Array.from({ length: MAX_BEATS }, (_, i) => `<option value="${i + 1}">${i + 1}</option>`).join('')}
            </select>
        `

        /* Drumkit row */
        const kitRow = document.createElement('div')
        kitRow.className = 'ps-row'
        kitRow.innerHTML = `
            <label class="ps-label">Drumkit</label>
            <select class="ps-drumkit-select"></select>
        `

        /* Pattern row */
        const patternRow = document.createElement('div')
        patternRow.className = 'ps-row'
        patternRow.innerHTML = `
            <label class="ps-label">Pattern</label>
            <select class="ps-pattern-select"></select>
        `

        /* Generation row */
        const genRow = document.createElement('div')
        genRow.className = 'ps-row'
        genRow.innerHTML = `
            <label class="ps-label">Generation</label>
            <div class="ps-control ps-gen-controls">
                <button class="ps-btn ps-gen-drum">↻ Drum</button>
                <button class="ps-btn ps-gen-bass">↻ Bass</button>
                <button class="ps-btn ps-gen-chords">↻ Chords</button>
            </div>
        `

        content.appendChild(pageRow)
        content.appendChild(beatsRow)
        content.appendChild(kitRow)
        content.appendChild(patternRow)
        content.appendChild(genRow)

        this.container.appendChild(content)
        this.container.appendChild(closeBtn)
        document.body.appendChild(this.container)

        /* Store refs */
        this.#prevPageBtn = this.container.querySelector('.ps-prev-page')
        this.#nextPageBtn = this.container.querySelector('.ps-next-page')
        this.#pageLabel = this.container.querySelector('.ps-page-label')
        this.#beatsSelect = this.container.querySelector('.ps-beats-select')
        this.#drumkitSelect = this.container.querySelector('.ps-drumkit-select')
        this.#patternSelect = this.container.querySelector('.ps-pattern-select')
        this.#drumBtn = this.container.querySelector('.ps-gen-drum')
        this.#bassBtn = this.container.querySelector('.ps-gen-bass')
        this.#chordsBtn = this.container.querySelector('.ps-gen-chords')

        /* Close button */
        closeBtn.addEventListener('click', () => this.hide())
    }

    #bindEvents() {
        this.#bindPageControls()
        this.#bindBeatsSelect()
        this.#bindDrumkitSelect()
        this.#bindPatternSelect()
        this.#bindGenerationButtons()
    }

    #bindPageControls() {
        this.#prevPageBtn.addEventListener('click', () => prevPage())
        this.#nextPageBtn.addEventListener('click', () => nextPage())
    }

    #bindBeatsSelect() {
        this.#beatsSelect.addEventListener('change', () => this.#onBeatsChange())
    }

    #onBeatsChange() {
        const val = parseInt(this.#beatsSelect.value, 10)
        if (isNaN(val)) return
        const pattern = appState.patterns[appState.selectedPatternNum]
        if (!pattern) return
        pattern.nbBeats = val
        Utils.getTracksArray(pattern).forEach((track) => {
            track.nbBeats = val
            const maxSteps = val * (track.stepsPerBeat ?? 4)
            if (track.loopAtStep > maxSteps) {
                track.loopAtStep = maxSteps
                recalcLoopDerived(track)
            }
        })
        serviceRegistry.cmd.resetPage()
        playbackEvents.batch(() => {
            playbackEvents.emit(EVENTS.PATTERN_META_CHANGE)
            playbackEvents.emit(EVENTS.PATTERN_CHANGE)
        })
    }

    #bindDrumkitSelect() {
        this.#drumkitSelect.addEventListener('change', () => this.#onDrumkitChange())
    }

    #onDrumkitChange() {
        const num = parseInt(this.#drumkitSelect.value, 10)
        if (!isNaN(num)) {
            serviceRegistry.cmd.setSelectedDrumkitNum(num)
        }
    }

    #bindPatternSelect() {
        this.#patternSelect.addEventListener('change', () => this.#onPatternChange())
    }

    #onPatternChange() {
        const num = parseInt(this.#patternSelect.value, 10)
        if (!isNaN(num)) {
            serviceRegistry.cmd.setSelectedPatternNum(num)
            serviceRegistry.cmd.resetPage()
            playbackEvents.batch(() => {
                playbackEvents.emit(EVENTS.PATTERN_STRUCTURE_CHANGE)
                playbackEvents.emit(EVENTS.PATTERN_CHANGE)
            })
        }
    }

    // ── Generation buttons ───────────────────────────────────────────
    // Drum toggles auto-gen on several existing percussion track types at
    // once and never creates a track. Bass/Chords each drive a single
    // melodic track type and create it on first use — that shared shape
    // lives in _toggleMelodicAutoGen().

    #bindGenerationButtons() {
        this.#drumBtn.addEventListener('click', () => this.#onDrumClick())
        this.#bassBtn.addEventListener('click', () =>
            this.#toggleMelodicAutoGen('BASS', { synthSoundKey: 'BASS1', defaultVariant: 'basic' }),
        )
        this.#chordsBtn.addEventListener('click', () =>
            this.#toggleMelodicAutoGen('PIANO', { synthSoundKey: 'PIANO', defaultVariant: 'chordStab' }),
        )
    }

    async #onDrumClick() {
        const pattern = appState.patterns[appState.selectedPatternNum]
        if (!pattern) return
        const drumTypes = new Set(['KICK', 'SNARE', 'HAT', 'CLAP', 'COWBELL', 'PERC'])
        const hasDrumAuto = (pattern.tracks ?? []).some((t) => t.auto && drumTypes.has(Utils.detectTrackType(t.name)))
        if (hasDrumAuto) {
            for (const track of pattern.tracks) {
                if (drumTypes.has(Utils.detectTrackType(track.name))) track.auto = false
            }
        } else {
            const { getAutoGenerateService } = await import('../state/service_loader.js')
            const autoGen = await getAutoGenerateService()
            serviceRegistry.cmd.beginGenerationUndo(pattern)
            try {
                await autoGen.generatePattern()
                if (pattern.tracks) {
                    pattern.tracks = Utils.filterEmptyMelodicTracks(pattern.tracks)
                }
                for (const track of pattern.tracks) {
                    if (drumTypes.has(Utils.detectTrackType(track.name))) track.auto = true
                }
                serviceRegistry.cmd.commitGenerationUndo()
            } catch (err) {
                serviceRegistry.cmd.cancelGenerationUndo?.()
                showToast('Auto-generation failed: ' + err.message, 'error')
            }
        }
        playbackEvents.batch(() => {
            playbackEvents.emit(EVENTS.NOTE_CHANGE)
            playbackEvents.emit(EVENTS.PATTERN_CHANGE)
        })
    }

    // Shared toggle for single-track melodic auto-generation (Bass, Chords):
    // turns auto off if already active, otherwise creates the track (if
    // missing) from the current genre's structure and turns auto on.
    async #toggleMelodicAutoGen(trackType, { synthSoundKey, defaultVariant }) {
        const pattern = appState.patterns[appState.selectedPatternNum]
        if (!pattern) return
        const hasAuto = (pattern.tracks ?? []).some((t) => t.auto && Utils.detectTrackType(t.name) === trackType)
        if (hasAuto) {
            for (const track of pattern.tracks) {
                if (Utils.detectTrackType(track.name) === trackType) track.auto = false
            }
        } else {
            let track = pattern.tracks?.find((t) => Utils.detectTrackType(t.name) === trackType)
            const { getAutoGenerateService } = await import('../state/service_loader.js')
            const autoGen = await getAutoGenerateService()
            serviceRegistry.cmd.beginGenerationUndo(pattern)
            try {
                if (!track) {
                    if (!pattern._autoGenGenre) pattern._autoGenGenre = autoGen.structureGen.getRandomGenre()
                    const genre = pattern._autoGenGenre
                    const firstElement = autoGen.structureGen.getElement(0)
                    const harmony = autoGen.structureGen.resolveHarmony(
                        genre,
                        firstElement.name,
                        firstElement.loopInElement,
                    )
                    const structure = autoGen.structureGen.generateStructure(genre)
                    const variant = structure[trackType] ?? defaultVariant
                    track = serviceRegistry.cmd.addTrack(pattern, trackType)
                    track.useSoftSynth = true
                    track.useAutoAssignSound = false
                    track.synthSoundKey = synthSoundKey
                    track.velocity = 0.8
                    await autoGen.generateTrack(track, variant, 1, pattern, harmony)
                    serviceRegistry.patterns.applyFlatNotes(pattern)
                }
                track.auto = true
                serviceRegistry.cmd.commitGenerationUndo()
            } catch (err) {
                serviceRegistry.cmd.cancelGenerationUndo?.()
                showToast('Auto-generation failed: ' + err.message, 'error')
            }
        }
        playbackEvents.batch(() => {
            playbackEvents.emit(EVENTS.NOTE_CHANGE)
            playbackEvents.emit(EVENTS.PATTERN_CHANGE)
        })
    }

    #subscribeEvents() {
        playbackEvents.on(EVENTS.PATTERN_META_CHANGE, () => this.sync())
        playbackEvents.on(EVENTS.PATTERN_STRUCTURE_CHANGE, () => this.sync())
        playbackEvents.on(EVENTS.DRUMKIT_CHANGE, () => this.syncDrumkits())
        playbackEvents.on(EVENTS.PATTERN_SETTINGS_TOGGLE, (show) => {
            if (show) this.show()
            else this.hide()
        })
    }

    sync() {
        const pattern = appState.patterns[appState.selectedPatternNum]
        if (!pattern) return

        this.#beatsSelect.value = pattern.nbBeats ?? 4

        const stepsPerBeat = Utils.getTracksArray(pattern)[0]?.stepsPerBeat ?? 4 // we use only track 0 for the polyrhythms
        const totalSteps = (pattern.nbBeats ?? 4) * stepsPerBeat
        const maxPage = Math.ceil(totalSteps / 16) - 1
        this.#pageLabel.textContent = `${appState.currentPage + 1}/${maxPage + 1}`
        this.#prevPageBtn.disabled = appState.currentPage === 0
        this.#nextPageBtn.disabled = appState.currentPage >= maxPage
    }

    syncDrumkits() {
        this.#drumkitSelect.innerHTML = ''
        soundRegistry.drumkitList.forEach((kit, i) => {
            const opt = document.createElement('option')
            opt.value = i
            opt.textContent = kit.name ?? `Kit ${i}`
            this.#drumkitSelect.appendChild(opt)
        })
        if (this.#drumkitSelect.options.length > 0) {
            const idx = Math.min(appState.selectedDrumkitNum, this.#drumkitSelect.options.length - 1)
            this.#drumkitSelect.selectedIndex = idx
        }

        this.#patternSelect.innerHTML = ''
        appState.patterns.forEach((pat, i) => {
            const opt = document.createElement('option')
            opt.value = i
            opt.textContent = pat.name ?? `Pattern ${i}`
            this.#patternSelect.appendChild(opt)
            if (i === appState.selectedPatternNum) opt.selected = true
        })
    }

    show() {
        this.#isOpen = true
        this.container.classList.add('open')
        this.sync()
        this.syncDrumkits()
    }

    hide() {
        this.#isOpen = false
        this.container.classList.remove('open')
    }
}
