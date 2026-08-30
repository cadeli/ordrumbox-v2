import { appState } from '../state/app_state.js'
import { soundRegistry } from '../state/sound_registry.js'
import { serviceRegistry } from '../state/service_registry.js'
import { playbackEvents } from '../state/playback_events.js'
import Utils from '../core/utils.js'
import { recalcLoopDerived } from '../model/track_schema.js'
import { logger } from '../core/logger.js'

export default class PatternSettingsPanel {
    constructor() {
        this.container = null
        this._isOpen = false
    }

    init() {
        this._createDOM()
        this._bindEvents()
        this._subscribeEvents()
    }

    _createDOM() {
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
                ${Array.from({ length: 16 }, (_, i) => `<option value="${i + 1}">${i + 1}</option>`).join('')}
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
        this._prevPageBtn = this.container.querySelector('.ps-prev-page')
        this._nextPageBtn = this.container.querySelector('.ps-next-page')
        this._pageLabel = this.container.querySelector('.ps-page-label')
        this._beatsSelect = this.container.querySelector('.ps-beats-select')
        this._drumkitSelect = this.container.querySelector('.ps-drumkit-select')
        this._patternSelect = this.container.querySelector('.ps-pattern-select')
        this._drumBtn = this.container.querySelector('.ps-gen-drum')
        this._bassBtn = this.container.querySelector('.ps-gen-bass')
        this._chordsBtn = this.container.querySelector('.ps-gen-chords')

        /* Close button */
        closeBtn.addEventListener('click', () => this.hide())
    }

    _bindEvents() {
        this._bindPageControls()
        this._bindBeatsSelect()
        this._bindDrumkitSelect()
        this._bindPatternSelect()
        this._bindGenerationButtons()
    }

    _bindPageControls() {
        this._prevPageBtn.addEventListener('click', () => this._onPrevPage())
        this._nextPageBtn.addEventListener('click', () => this._onNextPage())
    }

    _onPrevPage() {
        if (appState.currentPage > 0) {
            appState.currentPage--
            playbackEvents.batch(() => {
                playbackEvents.emit("patternMetaChange")
                playbackEvents.emit("patternChange")
            })
        }
    }

    _onNextPage() {
        const pattern = appState.patterns[appState.selectedPatternNum]
        if (!pattern) return
        const stepsPerBeat = Utils.getTracksArray(pattern)[0]?.stepsPerBeat ?? 4
        const totalSteps = (pattern.nbBeats ?? 4) * stepsPerBeat
        const maxPage = Math.ceil(totalSteps / 16) - 1
        if (appState.currentPage < maxPage) {
            appState.currentPage++
            playbackEvents.batch(() => {
                playbackEvents.emit("patternMetaChange")
                playbackEvents.emit("patternChange")
            })
        }
    }

    _bindBeatsSelect() {
        this._beatsSelect.addEventListener('change', () => this._onBeatsChange())
    }

    _onBeatsChange() {
        const val = parseInt(this._beatsSelect.value, 10)
        if (isNaN(val)) return
        const pattern = appState.patterns[appState.selectedPatternNum]
        if (!pattern) return
        pattern.nbBeats = val
        Utils.getTracksArray(pattern).forEach(track => {
            track.nbBeats = val
            const maxSteps = val * (track.stepsPerBeat ?? 4)
            if (track.loopAtStep > maxSteps) {
                track.loopAtStep = maxSteps
                recalcLoopDerived(track)
            }
        })
        appState.currentPage = 0
        playbackEvents.batch(() => {
            playbackEvents.emit("patternMetaChange")
            playbackEvents.emit("patternChange")
        })
    }

    _bindDrumkitSelect() {
        this._drumkitSelect.addEventListener('change', () => this._onDrumkitChange())
    }

    _onDrumkitChange() {
        const num = parseInt(this._drumkitSelect.value, 10)
        if (!isNaN(num)) {
            serviceRegistry.cmd.setSelectedDrumkitNum(num)
        }
    }

    _bindPatternSelect() {
        this._patternSelect.addEventListener('change', () => this._onPatternChange())
    }

    _onPatternChange() {
        const num = parseInt(this._patternSelect.value, 10)
        if (!isNaN(num)) {
            serviceRegistry.cmd.setSelectedPatternNum(num)
            appState.currentPage = 0
            playbackEvents.batch(() => {
                playbackEvents.emit("patternStructureChange")
                playbackEvents.emit("patternChange")
            })
        }
    }

    // ── Generation buttons ───────────────────────────────────────────
    // Drum toggles auto-gen on several existing percussion track types at
    // once and never creates a track. Bass/Chords each drive a single
    // melodic track type and create it on first use — that shared shape
    // lives in _toggleMelodicAutoGen().

    _bindGenerationButtons() {
        this._drumBtn.addEventListener('click', () => this._onDrumClick())
        this._bassBtn.addEventListener('click', () => this._toggleMelodicAutoGen('BASS', { synthSoundKey: 'BASS1', defaultVariant: 'basic' }))
        this._chordsBtn.addEventListener('click', () => this._toggleMelodicAutoGen('PIANO', { synthSoundKey: 'PIANO', defaultVariant: 'chordStab' }))
    }

    async _onDrumClick() {
        const pattern = appState.patterns[appState.selectedPatternNum]
        if (!pattern) return
        const drumTypes = new Set(['KICK', 'SNARE', 'HAT', 'CLAP', 'COWBELL', 'PERC'])
        const hasDrumAuto = (pattern.tracks ?? []).some(t => t.auto && drumTypes.has(Utils.detectTrackType(t.name)))
        if (hasDrumAuto) {
            for (const track of pattern.tracks) {
                if (drumTypes.has(Utils.detectTrackType(track.name))) track.auto = false
            }
        } else {
            const { getAutoGenerateService } = await import('../state/service_loader.js')
            const autoGen = await getAutoGenerateService()
            serviceRegistry.cmd.beginGenerationUndo(pattern)
            await autoGen.generatePattern()
            if (pattern.tracks) {
                pattern.tracks = pattern.tracks.filter(t => {
                    const type = Utils.detectTrackType(t.name)
                    const isMelodic = type === 'BASS' || type === 'PIANO' || type === 'ORGAN'
                    return !isMelodic || (t.notes && t.notes.length > 0)
                })
            }
            for (const track of pattern.tracks) {
                if (drumTypes.has(Utils.detectTrackType(track.name))) track.auto = true
            }
            serviceRegistry.cmd.commitGenerationUndo()
        }
        playbackEvents.batch(() => {
            playbackEvents.emit("noteChange")
            playbackEvents.emit("patternChange")
        })
    }

    // Shared toggle for single-track melodic auto-generation (Bass, Chords):
    // turns auto off if already active, otherwise creates the track (if
    // missing) from the current genre's structure and turns auto on.
    async _toggleMelodicAutoGen(trackType, { synthSoundKey, defaultVariant }) {
        const pattern = appState.patterns[appState.selectedPatternNum]
        if (!pattern) return
        const hasAuto = (pattern.tracks ?? []).some(t => t.auto && Utils.detectTrackType(t.name) === trackType)
        if (hasAuto) {
            for (const track of pattern.tracks) {
                if (Utils.detectTrackType(track.name) === trackType) track.auto = false
            }
        } else {
            let track = pattern.tracks?.find(t => Utils.detectTrackType(t.name) === trackType)
            const { getAutoGenerateService } = await import('../state/service_loader.js')
            const autoGen = await getAutoGenerateService()
            serviceRegistry.cmd.beginGenerationUndo(pattern)
            if (!track) {
                if (!pattern._autoGenGenre) pattern._autoGenGenre = autoGen.structureGen.getRandomGenre()
                const genre = pattern._autoGenGenre
                const firstElement = autoGen.structureGen.getElement(0)
                const harmony = autoGen.structureGen.resolveHarmony(genre, firstElement.name, firstElement.loopInElement)
                const structure = autoGen.structureGen.generateStructure(genre)
                const variant = structure[trackType] ?? defaultVariant
                track = serviceRegistry.cmd.addTrack(pattern, trackType)
                track.useSoftSynth = true
                track.useAutoAssignSound = false
                track.synthSoundKey = synthSoundKey
                track.velocity = 0.8
                await autoGen.generateTrack(track, variant, 1, pattern, harmony)
                serviceRegistry.patterns.computeFlatNotesFromPattern(pattern)
            }
            track.auto = true
            serviceRegistry.cmd.commitGenerationUndo()
        }
        playbackEvents.batch(() => {
            playbackEvents.emit("noteChange")
            playbackEvents.emit("patternChange")
        })
    }

    _subscribeEvents() {
        playbackEvents.on("patternMetaChange", () => this.sync())
        playbackEvents.on("patternStructureChange", () => this.sync())
        playbackEvents.on("drumkitChange", () => this.syncDrumkits())
        playbackEvents.on("patternSettingsToggle", (show) => {
            if (show) this.show()
            else this.hide()
        })
    }

    sync() {
        const pattern = appState.patterns[appState.selectedPatternNum]
        if (!pattern) return

        this._beatsSelect.value = pattern.nbBeats ?? 4

        const stepsPerBeat = Utils.getTracksArray(pattern)[0]?.stepsPerBeat ?? 4
        const totalSteps = (pattern.nbBeats ?? 4) * stepsPerBeat
        const maxPage = Math.ceil(totalSteps / 16) - 1
        this._pageLabel.textContent = `${appState.currentPage + 1}/${maxPage + 1}`
        this._prevPageBtn.disabled = appState.currentPage === 0
        this._nextPageBtn.disabled = appState.currentPage >= maxPage
    }

    syncDrumkits() {
        this._drumkitSelect.innerHTML = ''
        soundRegistry.drumkitList.forEach((kit, i) => {
            const opt = document.createElement('option')
            opt.value = i
            opt.textContent = kit.name ?? `Kit ${i}`
            this._drumkitSelect.appendChild(opt)
        })
        if (this._drumkitSelect.options.length > 0) {
            const idx = Math.min(appState.selectedDrumkitNum, this._drumkitSelect.options.length - 1)
            this._drumkitSelect.selectedIndex = idx
        }

        this._patternSelect.innerHTML = ''
        appState.patterns.forEach((pat, i) => {
            const opt = document.createElement('option')
            opt.value = i
            opt.textContent = pat.name ?? `Pattern ${i}`
            this._patternSelect.appendChild(opt)
            if (i === appState.selectedPatternNum) opt.selected = true
        })
    }

    show() {
        this._isOpen = true
        this.container.classList.add('open')
        this.sync()
        this.syncDrumkits()
    }

    hide() {
        this._isOpen = false
        this.container.classList.remove('open')
    }
}