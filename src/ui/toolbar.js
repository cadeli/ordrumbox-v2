import { appState } from '../state/app_state.js'
import { soundRegistry } from '../state/sound_registry.js'
import { serviceRegistry } from '../state/service_registry.js'
import { playbackEvents } from '../state/playback_events.js'
import { effect } from '../core/signals.js'
import {
    isPlaying, currentBpm, currentPattern, currentTracks, trackVersion,
    canPrevPage, canNextPage, canUndo, canRedo, historyStats,
    patternVersion, drumkitList, pageVersion,
} from '../state/signals.js'
import { injectUiCss } from './components/panel_helpers.js'
import { isMobileViewport } from '../core/constants.js'
import { recalcLoopDerived } from '../model/track_schema.js'
import Utils from '../core/utils.js'

export default class Toolbar {
    constructor() {
        this.container = null
        this.startBtn = null
        this.patternSelect = null
        this.drumkitSelect = null
        this.bpmToggle = null
        this.bpmPanel = null
        this.bpmSlider = null
        this.bpmValue = null
        this.prevPageBtn = null
        this.nextPageBtn = null
        this.pageLabel = null
    }

    injectCSS() {
        injectUiCss()
    }

    init() {
        this.injectCSS()
        this.createDOM()
        this.bindEvents()
        this.initSignals()
        this._setupOverflowObserver()
        document.addEventListener('keydown', (e) => this._handleKeyboard(e))
    }

    initSignals() {
        // ── Transport ────────────────────────────────────────────────
        effect(() => {
            const running = isPlaying()
            this.startBtn.textContent = running ? '■' : '▶'
            this.startBtn.classList.toggle('running', running)
        })

        // ── BPM ─────────────────────────────────────────────────────
        effect(() => {
            const bpm = currentBpm()
            this.bpmSlider.value = bpm
            this.bpmValue.textContent = bpm
            this.bpmToggle.textContent = bpm
        })

        // ── Beats ───────────────────────────────────────────────────
        effect(() => {
            const pat = currentPattern()
            this.beatsSelect.value = pat?.nbBeats ?? 4
        })

        // ── Page label + navigation ─────────────────────────────────
        effect(() => {
            pageVersion()
            trackVersion()
            const pat = currentPattern()
            if (pat) {
                const stepsPerBeat = Utils.getTracksArray(pat)[0]?.stepsPerBeat ?? 4
                const totalSteps = (pat.nbBeats ?? 4) * stepsPerBeat
                const maxPage = Math.ceil(totalSteps / 16) - 1
                this.pageLabel.textContent = `${appState.currentPage + 1}/${maxPage + 1}`
                this.nextPageBtn.disabled = appState.currentPage >= maxPage
            } else {
                this.pageLabel.textContent = '1/1'
                this.nextPageBtn.disabled = true
            }
            this.prevPageBtn.disabled = appState.currentPage === 0
        })

        // ── Undo / Redo ─────────────────────────────────────────────
        effect(() => {
            const undo = canUndo()
            this.undoBtn.disabled = !undo
            const stats = historyStats()
            this.undoBtn.title = undo
                ? `Undo (Ctrl+Z) — ${stats.past} actions`
                : 'Undo (Ctrl+Z)'
        })

        effect(() => {
            const redo = canRedo()
            this.redoBtn.disabled = !redo
            const stats = historyStats()
            this.redoBtn.title = redo
                ? `Redo (Ctrl+Y) — ${stats.future} actions`
                : 'Redo (Ctrl+Y)'
        })

        // ── Gen buttons (drum / bass / chords) ──────────────────────
        effect(() => {
            trackVersion()
            const tracks = currentTracks()
            const drumTypes = new Set(['KICK', 'SNARE', 'HAT', 'CLAP', 'COWBELL', 'PERC'])
            this.drumBtn.classList.toggle('active',
                tracks.some(t => t._toolbarAuto && drumTypes.has(Utils.detectTrackType(t.name))))
            this.bassBtn.classList.toggle('active',
                tracks.some(t => t._toolbarAuto && Utils.detectTrackType(t.name) === 'BASS'))
            this.chordsBtn.classList.toggle('active',
                tracks.some(t => t._toolbarAuto && Utils.detectTrackType(t.name) === 'PIANO'))
        })

        // ── Pattern select ──────────────────────────────────────────
        effect(() => {
            patternVersion()
            this._rebuildPatternSelect()
        })

        // ── Drumkit select ──────────────────────────────────────────
        effect(() => {
            drumkitList()
            this._rebuildDrumkitSelect()
        })

        // ── Pattern name mobile ─────────────────────────────────────
        effect(() => {
            const pat = currentPattern()
            if (pat && this.patternNameMobile) {
                this.patternNameMobile.textContent = pat.name ?? `Pattern ${appState.selectedPatternNum + 1}`
            }
        })
    }

    _handleKeyboard(e) {
        if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'z') {
            e.preventDefault()
            serviceRegistry.history?.undo()
        } else if ((e.ctrlKey || e.metaKey) && (e.shiftKey && e.key === 'z' || e.key === 'y')) {
            e.preventDefault()
            serviceRegistry.history?.redo()
        }
    }

    createDOM() {
        this.container = document.createElement('div')
        this.container.id = 'tb'

        const brand = document.createElement('span')
        brand.className = 'tb-brand tb-hide-mobile'
        brand.textContent = 'orDrumbox'

        this.startBtn = document.createElement('button')
        this.startBtn.className = 'tb-start'
        this.startBtn.textContent = '▶'
        this.startBtn.title = 'Start / Stop'

        const bpmWrap = document.createElement('div')
        bpmWrap.className = 'tb-group'

        const bpmLabel = document.createElement('span')
        bpmLabel.className = 'tb-label'
        bpmLabel.textContent = 'BPM'

        this.bpmToggle = document.createElement('button')
        this.bpmToggle.className = 'tb-bpm-toggle'
        this.bpmToggle.textContent = '120'
        bpmWrap.appendChild(bpmLabel)
        bpmWrap.appendChild(this.bpmToggle)

        this.bpmPanel = document.createElement('div')
        this.bpmPanel.className = 'tb-bpm-panel'
        this.bpmSlider = document.createElement('input')
        this.bpmSlider.type = 'range'
        this.bpmSlider.min = 20
        this.bpmSlider.max = 250
        this.bpmSlider.step = 1
        this.bpmValue = document.createElement('span')
        this.bpmValue.className = 'tb-bpm-val'
        this.bpmPanel.appendChild(this.bpmSlider)
        this.bpmPanel.appendChild(this.bpmValue)
        bpmWrap.appendChild(this.bpmPanel)

        const patWrap = document.createElement('div')
        patWrap.className = 'tb-group'
        const patLabel = document.createElement('span')
        patLabel.className = 'tb-label'
        patLabel.textContent = 'Pattern'
        patLabel.title = 'Click to open Patterns Manager'
        patLabel.style.cursor = 'pointer'
        this.patLabel = patLabel
        this.patternSelect = document.createElement('select')

        patWrap.appendChild(patLabel)
        patWrap.appendChild(this.patternSelect)

        const pageWrap = document.createElement('div')
        pageWrap.className = 'tb-group tb-page-group'
        const pageLabelTop = document.createElement('span')
        pageLabelTop.className = 'tb-label'
        pageLabelTop.textContent = 'Page'
        this.prevPageBtn = document.createElement('button')
        this.prevPageBtn.className = 'tb-prev-page'
        this.prevPageBtn.textContent = '◀'
        this.prevPageBtn.title = 'Previous Page'
        this.pageLabel = document.createElement('span')
        this.pageLabel.className = 'tb-page-label'
        this.pageLabel.textContent = 'P1'
        this.nextPageBtn = document.createElement('button')
        this.nextPageBtn.className = 'tb-next-page'
        this.nextPageBtn.textContent = '▶'
        this.nextPageBtn.title = 'Next Page'
        pageWrap.appendChild(pageLabelTop)
        const pageRow = document.createElement('div')
        pageRow.className = 'tb-page-row'
        pageRow.appendChild(this.prevPageBtn)
        pageRow.appendChild(this.pageLabel)
        pageRow.appendChild(this.nextPageBtn)
        pageWrap.appendChild(pageRow)

        const kitWrap = document.createElement('div')
        kitWrap.className = 'tb-group'
        const kitLabel = document.createElement('span')
        kitLabel.className = 'tb-label'
        kitLabel.textContent = 'Drumkit'
        kitLabel.title = 'Click to open Drumkit Manager'
        kitLabel.style.cursor = 'pointer'
        this.kitLabel = kitLabel
        this.drumkitSelect = document.createElement('select')
        kitWrap.appendChild(kitLabel)
        kitWrap.appendChild(this.drumkitSelect)

        const genWrap = document.createElement('div')
        genWrap.className = 'tb-group tb-gen-group'
        const genLabel = document.createElement('span')
        genLabel.className = 'tb-label'
        genLabel.textContent = 'Generation'
        const genRow = document.createElement('div')
        genRow.className = 'tb-view-row'
        this.drumBtn = document.createElement('button')
        this.drumBtn.className = 'tb-view-btn tb-gen-btn'
        this.drumBtn.dataset.gen = 'drum'
        this.drumBtn.textContent = '↻ Drum'
        this.drumBtn.title = 'Generate drum pattern'
        this.bassBtn = document.createElement('button')
        this.bassBtn.className = 'tb-view-btn tb-gen-btn'
        this.bassBtn.dataset.gen = 'bass'
        this.bassBtn.textContent = '↻ Bass'
        this.bassBtn.title = 'Generate bass line'
        this.chordsBtn = document.createElement('button')
        this.chordsBtn.className = 'tb-view-btn tb-gen-btn'
        this.chordsBtn.dataset.gen = 'chords'
        this.chordsBtn.textContent = '↻ Chords'
        this.chordsBtn.title = 'Generate chords'
        genRow.appendChild(this.drumBtn)
        genRow.appendChild(this.bassBtn)
        genRow.appendChild(this.chordsBtn)
        genWrap.appendChild(genLabel)
        genWrap.appendChild(genRow)

        // Undo/Redo buttons
        const undoWrap = document.createElement('div')
        undoWrap.className = 'tb-group tb-undo-group tb-hide-mobile'
        const undoLabel = document.createElement('span')
        undoLabel.className = 'tb-label'
        undoLabel.textContent = 'History'
        const undoRow = document.createElement('div')
        undoRow.className = 'tb-undo-row'
        this.undoBtn = document.createElement('button')
        this.undoBtn.className = 'tb-undo-btn'
        this.undoBtn.textContent = '↶'
        this.undoBtn.title = 'Undo (Ctrl+Z)'
        this.undoBtn.disabled = true
        this.redoBtn = document.createElement('button')
        this.redoBtn.className = 'tb-undo-btn'
        this.redoBtn.textContent = '↷'
        this.redoBtn.title = 'Redo (Ctrl+Y)'
        this.redoBtn.disabled = true
        undoRow.appendChild(this.undoBtn)
        undoRow.appendChild(this.redoBtn)
        undoWrap.appendChild(undoLabel)
        undoWrap.appendChild(undoRow)

        const viewWrap = document.createElement('div')
        viewWrap.className = 'tb-group tb-hide-mobile'
        const viewLabel = document.createElement('span')
        viewLabel.className = 'tb-label'
        viewLabel.textContent = 'View'
        const viewRow = document.createElement('div')
        viewRow.className = 'tb-view-row'
        this.synthBtn = document.createElement('button')
        this.synthBtn.className = 'tb-view-btn'
        this.synthBtn.dataset.view = 'synth'
        this.synthBtn.textContent = 'Synth'
        this.synthBtn.title = 'Toggle Soft Synth'
        this.editBtn = document.createElement('button')
        this.editBtn.className = 'tb-view-btn'
        this.editBtn.dataset.view = 'edit'
        this.editBtn.textContent = 'Grid'
        this.editBtn.title = 'Toggle Track Editor'
        this.prollBtn = document.createElement('button')
        this.prollBtn.className = 'tb-view-btn'
        this.prollBtn.dataset.view = 'proll'
        this.prollBtn.textContent = 'proll'
        this.prollBtn.title = 'Toggle Proll'
        viewRow.appendChild(this.synthBtn)
        viewRow.appendChild(this.editBtn)
        viewRow.appendChild(this.prollBtn)
        viewWrap.appendChild(viewLabel)
        viewWrap.appendChild(viewRow)

        const beatsWrap = document.createElement('div')
        beatsWrap.className = 'tb-group tb-beats-group'
        const beatsLabel = document.createElement('span')
        beatsLabel.className = 'tb-label'
        beatsLabel.textContent = 'Beats'
        this.beatsSelect = document.createElement('select')
        for (let i = 1; i <= 16; i++) {
            const opt = document.createElement('option')
            opt.value = i
            opt.textContent = i
            this.beatsSelect.appendChild(opt)
        }
        beatsWrap.appendChild(beatsLabel)
        beatsWrap.appendChild(this.beatsSelect)

        this.toolsBtn = document.createElement('button')
        this.toolsBtn.className = 'tb-tools tb-hide-mobile'
        this.toolsBtn.textContent = '⚙'
        this.toolsBtn.title = 'Tools'

        this.aboutBtn = document.createElement('button')
        this.aboutBtn.className = 'tb-about'
        this.aboutBtn.textContent = '⋮'
        this.aboutBtn.title = 'About'

        /* Mobile-specific elements */
        this.patternNameMobile = document.createElement('span')
        this.patternNameMobile.className = 'tb-pattern-name-mobile'
        this.patternNameMobile.textContent = 'Pattern 1'

        this.settingsBtn = document.createElement('button')
        this.settingsBtn.className = 'tb-settings-btn'
        this.settingsBtn.textContent = '⚙'
        this.settingsBtn.title = 'Pattern Settings'

        this.container.appendChild(brand)
        this.container.appendChild(this.startBtn)
        this.container.appendChild(this.patternNameMobile)
        this.container.appendChild(bpmWrap)
        this.container.appendChild(patWrap)
        this.container.appendChild(pageWrap)
        this.container.appendChild(beatsWrap)
        this.container.appendChild(kitWrap)
        this.container.appendChild(genWrap)

        const sep = document.createElement('div')
        sep.className = 'tb-sep'
        this.container.appendChild(sep)

        this.container.appendChild(undoWrap)

        this.container.appendChild(viewWrap)
        this.container.appendChild(this.toolsBtn)
        this.container.appendChild(this.aboutBtn)
        this.container.appendChild(this.settingsBtn)
        document.body.appendChild(this.container)
    }

    bindEvents() {
        this.startBtn.addEventListener('click', () => {
            serviceRegistry.seq.toggleStartStop()
        })

        this.toolsBtn.addEventListener('click', () => {
            playbackEvents.emit("toolsToggle", true)
        })

        this.aboutBtn.addEventListener('click', () => {
            playbackEvents.emit("aboutToggle", true)
        })

        this.settingsBtn.addEventListener('click', () => {
            playbackEvents.emit("patternSettingsToggle", true)
        })

        this.synthBtn.addEventListener('click', () => {
            playbackEvents.emit("synthToggle")
        })
        this.editBtn.addEventListener('click', () => {
            playbackEvents.emit("editToggle")
        })
        this.prollBtn.addEventListener('click', () => {
            playbackEvents.emit("prollToggle")
        })

        this.undoBtn.addEventListener('click', () => {
            serviceRegistry.history?.undo()
        })

        this.redoBtn.addEventListener('click', () => {
            serviceRegistry.history?.redo()
        })

        this.patternSelect.addEventListener('change', () => {
            const num = parseInt(this.patternSelect.value, 10)
            if (!isNaN(num)) {
                serviceRegistry.cmd.setSelectedPatternNum(num)
                appState.currentPage = 0
                playbackEvents.emit("patternMetaChange")
            }
        })

        this.drumkitSelect.addEventListener('change', () => {
            const num = parseInt(this.drumkitSelect.value, 10)
            if (!isNaN(num)) {
                serviceRegistry.cmd.setSelectedDrumkitNum(num)
            }
        })

        this.kitLabel.addEventListener('click', () => {
            playbackEvents.emit("drumkitManagerToggle", true)
        })

        this.beatsSelect.addEventListener('change', () => {
            const val = parseInt(this.beatsSelect.value, 10)
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
            playbackEvents.emit("patternMetaChange")
            playbackEvents.emit("patternChange")
        })

        this.patLabel.addEventListener('click', () => {
            playbackEvents.emit("patternsToggle", true)
        })

        this.drumBtn.addEventListener('click', async () => {
            await this._toggleAutoGen(Utils.DRUM_TYPES, async (pattern, autoGen) => {
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
                    if (Utils.DRUM_TYPES.has(Utils.detectTrackType(track.name))) {
                        track.auto = true
                        track._toolbarAuto = true
                    }
                }
                serviceRegistry.cmd.commitGenerationUndo()
            })
        })

        this.bassBtn.addEventListener('click', async () => {
            await this._toggleAutoGen('BASS', async (pattern, autoGen) => {
                let bassTrack = pattern.tracks?.find(t => Utils.detectTrackType(t.name) === 'BASS')

                serviceRegistry.cmd.beginGenerationUndo(pattern)
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
                bassTrack._toolbarAuto = true
                serviceRegistry.cmd.commitGenerationUndo()
            })
        })

        this.chordsBtn.addEventListener('click', async () => {
            await this._toggleAutoGen('PIANO', async (pattern, autoGen) => {
                let pianoTrack = pattern.tracks?.find(t => Utils.detectTrackType(t.name) === 'PIANO')

                serviceRegistry.cmd.beginGenerationUndo(pattern)
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
                pianoTrack._toolbarAuto = true
                serviceRegistry.cmd.commitGenerationUndo()
            })
        })

        this.prevPageBtn.addEventListener('click', () => {
            if (appState.currentPage > 0) {
                appState.currentPage--
                playbackEvents.emit("patternMetaChange")
                playbackEvents.emit("patternChange")
            }
        })

        this.nextPageBtn.addEventListener('click', () => {
            const pattern = appState.patterns[appState.selectedPatternNum]
            if (!pattern) return
            const stepsPerBeat = Utils.getTracksArray(pattern)[0]?.stepsPerBeat ?? 4
            const totalSteps = (pattern.nbBeats ?? 4) * stepsPerBeat
            const maxPage = Math.ceil(totalSteps / 16) - 1
            if (appState.currentPage < maxPage) {
                appState.currentPage++
                playbackEvents.emit("patternMetaChange")
                playbackEvents.emit("patternChange")
            }
        })

        this.bpmToggle.addEventListener('click', () => {
            this.bpmPanel.classList.toggle('open')
        })

        this.bpmSlider.addEventListener('input', () => {
            const bpm = parseInt(this.bpmSlider.value, 10)
            this.bpmValue.textContent = bpm
            serviceRegistry.seq?.setBpm(bpm)
            playbackEvents.emit("bpmChange", bpm)
        })
    }

    _rebuildPatternSelect() {
        this.patternSelect.innerHTML = ''
        appState.patterns.forEach((pat, i) => {
            const opt = document.createElement('option')
            opt.value = i
            opt.textContent = pat.name ?? `Pattern ${i}`
            this.patternSelect.appendChild(opt)
        })
        if (this.patternSelect.options.length > 0) {
            const idx = Math.min(appState.selectedPatternNum, this.patternSelect.options.length - 1)
            this.patternSelect.selectedIndex = idx
        }
    }

    _rebuildDrumkitSelect() {
        this.drumkitSelect.innerHTML = ''
        soundRegistry.drumkitList.forEach((kit, i) => {
            const opt = document.createElement('option')
            opt.value = i
            opt.textContent = kit.name ?? `Kit ${i}`
            this.drumkitSelect.appendChild(opt)
        })
        if (this.drumkitSelect.options.length > 0) {
            const idx = Math.min(appState.selectedDrumkitNum, this.drumkitSelect.options.length - 1)
            this.drumkitSelect.selectedIndex = idx
        }
    }

    /**
     * Toggle auto-generation for tracks of given type(s).
     * @param {string|string[]} typeOrTypes - Track type(s) to toggle (e.g. 'BASS', 'PIANO', or ['KICK','SNARE',...])
     * @param {Function} generateFn - Async function to generate track(s) when auto is off. Receives (pattern, autoGen).
     */
    async _toggleAutoGen(typeOrTypes, generateFn) {
        const pattern = appState.patterns[appState.selectedPatternNum]
        if (!pattern) return

        const types = typeOrTypes instanceof Set
            ? typeOrTypes
            : new Set(Array.isArray(typeOrTypes) ? typeOrTypes : [typeOrTypes])
        const hasAuto = (pattern.tracks ?? []).some(t =>
            t._toolbarAuto && types.has(Utils.detectTrackType(t.name))
        )

        if (hasAuto) {
            for (const track of pattern.tracks) {
                if (types.has(Utils.detectTrackType(track.name))) {
                    track.auto = false
                    track._toolbarAuto = false
                }
            }
        } else {
            const { getAutoGenerateService } = await import('../state/service_loader.js')
            const autoGen = await getAutoGenerateService()
            await generateFn(pattern, autoGen)
        }

        playbackEvents.emit("noteChange")
        playbackEvents.emit("patternChange")
    }

    _setupOverflowObserver() {
        const isMobile = () => isMobileViewport()
        const check = () => {
            if (!this.container) return
            const overflowing = isMobile() && this.container.scrollWidth > this.container.clientWidth + 1
            this.container.classList.toggle('tb-overflow', overflowing)
        }
        if (typeof ResizeObserver !== 'undefined') {
            this._ro = new ResizeObserver(check)
            this._ro.observe(this.container)
        }
        window.addEventListener('resize', check)
        this._checkOverflow = check
        setTimeout(check, 0)
    }
}
