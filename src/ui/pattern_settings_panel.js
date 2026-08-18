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
        this._prevPageBtn.addEventListener('click', () => {
            if (appState.currentPage > 0) {
                appState.currentPage--
                playbackEvents.dispatchPatternChange()
            }
        })

        this._nextPageBtn.addEventListener('click', () => {
            const pattern = appState.patterns[appState.selectedPatternNum]
            if (!pattern) return
            const stepsPerBeat = Utils.getTracksArray(pattern)[0]?.stepsPerBeat ?? 4
            const totalSteps = (pattern.nbBeats ?? 4) * stepsPerBeat
            const maxPage = Math.ceil(totalSteps / 16) - 1
            if (appState.currentPage < maxPage) {
                appState.currentPage++
                playbackEvents.dispatchPatternChange()
            }
        })

        this._beatsSelect.addEventListener('change', () => {
            const val = parseInt(this._beatsSelect.value, 10)
            if (isNaN(val)) return
            const pattern = appState.patterns[appState.selectedPatternNum]
            if (!pattern) return
            const oldStepsPerBeat = Utils.getTracksArray(pattern)[0]?.stepsPerBeat ?? 4
            const oldBeats = (pattern.nbBeats ?? 4) * oldStepsPerBeat
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
            playbackEvents.dispatchPatternChange()
        })

        this._drumkitSelect.addEventListener('change', () => {
            const num = parseInt(this._drumkitSelect.value, 10)
            if (!isNaN(num)) {
                serviceRegistry.cmd.setSelectedDrumkitNum(num)
            }
        })

        this._patternSelect.addEventListener('change', () => {
            const num = parseInt(this._patternSelect.value, 10)
            if (!isNaN(num)) {
                serviceRegistry.cmd.setSelectedPatternNum(num)
                appState.currentPage = 0
                playbackEvents.dispatchPatternChange()
            }
        })

        this._drumBtn.addEventListener('click', async () => {
            const pattern = appState.patterns[appState.selectedPatternNum]
            if (!pattern) return
            const drumTypes = new Set(['KICK', 'SNARE', 'HAT', 'CLAP', 'COWBELL', 'PERC'])
            const hasDrumAuto = (pattern.tracks ?? []).some(t => t.auto && drumTypes.has(Utils.detectTrackType(t.name)))
            if (hasDrumAuto) {
                for (const track of pattern.tracks) {
                    if (drumTypes.has(Utils.detectTrackType(track.name))) track.auto = false
                }
            } else {
                const { getAutoGenerateService } = await import('../state/service_registry.js')
                const autoGen = await getAutoGenerateService()
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
            }
            playbackEvents.dispatchPatternChange()
        })

        this._bassBtn.addEventListener('click', async () => {
            const pattern = appState.patterns[appState.selectedPatternNum]
            if (!pattern) return
            const hasBassAuto = (pattern.tracks ?? []).some(t => t.auto && Utils.detectTrackType(t.name) === 'BASS')
            if (hasBassAuto) {
                for (const track of pattern.tracks) {
                    if (Utils.detectTrackType(track.name) === 'BASS') track.auto = false
                }
            } else {
                let bassTrack = pattern.tracks?.find(t => Utils.detectTrackType(t.name) === 'BASS')
                const { getAutoGenerateService } = await import('../state/service_registry.js')
                const autoGen = await getAutoGenerateService()
                if (!bassTrack) {
                    if (!pattern._autoGenGenre) pattern._autoGenGenre = autoGen.structureGen.getRandomGenre()
                    const genre = pattern._autoGenGenre
                    const firstElement = autoGen.structureGen.getElement(0)
                    const harmony = autoGen.structureGen.resolveHarmony(genre, firstElement.name, firstElement.loopInElement)
                    const structure = autoGen.structureGen.generateStructure(genre)
                    const bassVariant = structure.BASS ?? 'basic'
                    bassTrack = serviceRegistry.cmd.addTrack(pattern, 'BASS')
                    bassTrack.useSoftSynth = true
                    bassTrack.useAutoAssignSound = false
                    bassTrack.synthSoundKey = 'BASS1'
                    bassTrack.velocity = 0.8
                    await autoGen.generateTrack(bassTrack, bassVariant, 1, pattern, harmony)
                    serviceRegistry.patterns.computeFlatNotesFromPattern(pattern)
                }
                bassTrack.auto = true
            }
            playbackEvents.dispatchPatternChange()
        })

        this._chordsBtn.addEventListener('click', async () => {
            const pattern = appState.patterns[appState.selectedPatternNum]
            if (!pattern) return
            const hasPianoAuto = (pattern.tracks ?? []).some(t => t.auto && Utils.detectTrackType(t.name) === 'PIANO')
            if (hasPianoAuto) {
                for (const track of pattern.tracks) {
                    if (Utils.detectTrackType(track.name) === 'PIANO') track.auto = false
                }
            } else {
                let pianoTrack = pattern.tracks?.find(t => Utils.detectTrackType(t.name) === 'PIANO')
                const { getAutoGenerateService } = await import('../state/service_registry.js')
                const autoGen = await getAutoGenerateService()
                if (!pianoTrack) {
                    if (!pattern._autoGenGenre) pattern._autoGenGenre = autoGen.structureGen.getRandomGenre()
                    const genre = pattern._autoGenGenre
                    const firstElement = autoGen.structureGen.getElement(0)
                    const harmony = autoGen.structureGen.resolveHarmony(genre, firstElement.name, firstElement.loopInElement)
                    const structure = autoGen.structureGen.generateStructure(genre)
                    const pianoVariant = structure.PIANO ?? 'chordStab'
                    pianoTrack = serviceRegistry.cmd.addTrack(pattern, 'PIANO')
                    pianoTrack.useSoftSynth = true
                    pianoTrack.useAutoAssignSound = false
                    pianoTrack.synthSoundKey = 'PIANO'
                    pianoTrack.velocity = 0.8
                    await autoGen.generateTrack(pianoTrack, pianoVariant, 1, pattern, harmony)
                    serviceRegistry.patterns.computeFlatNotesFromPattern(pattern)
                }
                pianoTrack.auto = true
            }
            playbackEvents.dispatchPatternChange()
        })
    }

    _subscribeEvents() {
        playbackEvents.onPatternChange.push(() => this.sync())
        playbackEvents.onDrumkitChange.push(() => this.syncDrumkits())
        playbackEvents.onPatternSettingsToggle.push((show) => {
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
