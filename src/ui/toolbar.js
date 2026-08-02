import { appState } from '../state/app_state.js'
import { soundRegistry } from '../state/sound_registry.js'
import { serviceRegistry } from '../state/service_registry.js'
import { playbackEvents } from '../state/playback_events.js'
import { injectUiCss } from './components/panel_helpers.js'
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
        this.syncState()
        this.subscribeEvents()
        this._setupOverflowObserver()
    }

    subscribeEvents() {
        playbackEvents.onPlaybackStart.push(() => this.syncPlayButton())
        playbackEvents.onPlaybackStop.push(() => this.syncPlayButton())
        playbackEvents.onPatternChange.push(() => {
            this.syncPatterns()
            this.syncPage()
            this.syncGenButtons()
        })
        playbackEvents.onDrumkitChange.push(() => {
            this.syncDrumkits()
            this.syncPatterns()
        })
        playbackEvents.onBpmChange.push((bpm) => {
            this.syncBpmSlider(bpm)
        })
    }

    refresh() {
        this.syncPlayButton()
        this.syncPatterns()
        this.syncDrumkits()
        this.syncPage()
    }

    createDOM() {
        this.container = document.createElement('div')
        this.container.id = 'tb'

        const brand = document.createElement('span')
        brand.className = 'tb-brand'
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
        pageWrap.className = 'tb-group'
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
        genWrap.className = 'tb-group'
        const genLabel = document.createElement('span')
        genLabel.className = 'tb-label'
        genLabel.textContent = 'Generation'
        const genRow = document.createElement('div')
        genRow.className = 'tb-view-row'
        this.drumBtn = document.createElement('button')
        this.drumBtn.className = 'tb-view-btn'
        this.drumBtn.dataset.gen = 'drum'
        this.drumBtn.textContent = 'Drum'
        this.drumBtn.title = 'Generate drum pattern'
        this.bassBtn = document.createElement('button')
        this.bassBtn.className = 'tb-view-btn'
        this.bassBtn.dataset.gen = 'bass'
        this.bassBtn.textContent = 'Bass'
        this.bassBtn.title = 'Generate bass line'
        this.chordsBtn = document.createElement('button')
        this.chordsBtn.className = 'tb-view-btn'
        this.chordsBtn.dataset.gen = 'chords'
        this.chordsBtn.textContent = 'Chords'
        this.chordsBtn.title = 'Generate chords'
        genRow.appendChild(this.drumBtn)
        genRow.appendChild(this.bassBtn)
        genRow.appendChild(this.chordsBtn)
        genWrap.appendChild(genLabel)
        genWrap.appendChild(genRow)

        const viewWrap = document.createElement('div')
        viewWrap.className = 'tb-group'
        const viewLabel = document.createElement('span')
        viewLabel.className = 'tb-label'
        viewLabel.textContent = 'View'
        const viewRow = document.createElement('div')
        viewRow.className = 'tb-view-row'
        this.gridBtn = document.createElement('button')
        this.gridBtn.className = 'tb-view-btn actif'
        this.gridBtn.dataset.view = 'grid'
        this.gridBtn.textContent = 'Grid'
        this.gridBtn.title = 'Toggle Pattern Grid'
        this.synthBtn = document.createElement('button')
        this.synthBtn.className = 'tb-view-btn'
        this.synthBtn.dataset.view = 'synth'
        this.synthBtn.textContent = 'Synth'
        this.synthBtn.title = 'Toggle Soft Synth'
        this.editBtn = document.createElement('button')
        this.editBtn.className = 'tb-view-btn'
        this.editBtn.dataset.view = 'edit'
        this.editBtn.textContent = 'Edit'
        this.editBtn.title = 'Toggle Track Editor'
        viewRow.appendChild(this.gridBtn)
        viewRow.appendChild(this.synthBtn)
        viewRow.appendChild(this.editBtn)
        viewWrap.appendChild(viewLabel)
        viewWrap.appendChild(viewRow)

        const beatsWrap = document.createElement('div')
        beatsWrap.className = 'tb-group'
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

        this.clearBtn = document.createElement('button')
        this.clearBtn.className = 'tb-clear'
        this.clearBtn.textContent = 'Clear'

        this.outputBtn = document.createElement('button')
        this.outputBtn.className = 'tb-output'
        this.outputBtn.textContent = 'Master'

        this.toolsBtn = document.createElement('button')
        this.toolsBtn.className = 'tb-tools'
        this.toolsBtn.textContent = '⚙'
        this.toolsBtn.title = 'Tools'

        this.aboutBtn = document.createElement('button')
        this.aboutBtn.className = 'tb-about'
        this.aboutBtn.textContent = '⋮'
        this.aboutBtn.title = 'About'

        this.container.appendChild(brand)
        this.container.appendChild(this.startBtn)
        this.container.appendChild(bpmWrap)
        this.container.appendChild(patWrap)
        this.container.appendChild(pageWrap)
        this.container.appendChild(beatsWrap)
        this.container.appendChild(kitWrap)
        this.container.appendChild(genWrap)
        this.container.appendChild(viewWrap)
        this.container.appendChild(this.clearBtn)
        this.container.appendChild(this.outputBtn)
        this.container.appendChild(this.toolsBtn)
        this.container.appendChild(this.aboutBtn)
        document.body.appendChild(this.container)
    }

    bindEvents() {
        this.startBtn.addEventListener('click', () => {
            serviceRegistry.mfSeq.toggleStartStop()
        })

        this.outputBtn.addEventListener('click', () => {
            playbackEvents.dispatchOutputToggle(true)
        })

        this.toolsBtn.addEventListener('click', () => {
            playbackEvents.dispatchToolsToggle(true)
        })

        this.aboutBtn.addEventListener('click', () => {
            playbackEvents.dispatchAboutToggle(true)
        })

        this.gridBtn.addEventListener('click', () => {
            playbackEvents.dispatchGridToggle()
        })
        this.synthBtn.addEventListener('click', () => {
            playbackEvents.dispatchSynthToggle()
        })
        this.editBtn.addEventListener('click', () => {
            playbackEvents.dispatchEditToggle()
        })

        this.patternSelect.addEventListener('change', () => {
            const num = parseInt(this.patternSelect.value, 10)
            if (!isNaN(num)) {
                serviceRegistry.mfCmd.setSelectedPatternNum(num)
                appState.currentPage = 0
                this.syncPage()
            }
        })

        this.drumkitSelect.addEventListener('change', () => {
            const num = parseInt(this.drumkitSelect.value, 10)
            if (!isNaN(num)) {
                serviceRegistry.mfCmd.setSelectedDrumkitNum(num)
            }
        })

        this.kitLabel.addEventListener('click', () => {
            playbackEvents.dispatchDrumkitManagerToggle(true)
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
            this.syncPage()
            playbackEvents.dispatchPatternChange()
        })

        this.patLabel.addEventListener('click', () => {
            playbackEvents.dispatchPatternsToggle(true)
        })

        this.drumBtn.addEventListener('click', async () => {
            const pattern = appState.patterns[appState.selectedPatternNum]
            if (!pattern) return

            const { getAutoGenerateService } = await import('../state/service_registry.js')
            const mfAutoGenerate = await getAutoGenerateService()
            await mfAutoGenerate.generatePattern()

            // Remove auto-added melodic tracks with no notes
            if (pattern.tracks) {
                pattern.tracks = pattern.tracks.filter(t => {
                    const type = Utils.detectTrackType(t.name)
                    const isMelodic = type === 'BASS' || type === 'PIANO' || type === 'ORGAN'
                    return !isMelodic || (t.notes && t.notes.length > 0)
                })
            }

            for (const track of pattern.tracks) {
                const type = Utils.detectTrackType(track.name)
                const isDrum = type === 'KICK' || type === 'SNARE' || type === 'HAT' || type === 'CLAP' || type === 'COWBELL' || type === 'PERC'
                track.auto = isDrum
            }
            this.syncGenButtons()
            this.syncPatterns()
            playbackEvents.dispatchPatternChange()
        })

        this.bassBtn.addEventListener('click', async () => {
            const pattern = appState.patterns[appState.selectedPatternNum]
            if (!pattern) return

            const hasBass = pattern.tracks?.some(t => Utils.detectTrackType(t.name) === 'BASS')
            if (!hasBass) {
                const { getAutoGenerateService } = await import('../state/service_registry.js')
                const mfAutoGenerate = await getAutoGenerateService()

                if (!pattern._autoGenGenre) {
                    pattern._autoGenGenre = mfAutoGenerate.structureGen.getRandomGenre()
                }
                const genre = pattern._autoGenGenre
                const firstElement = mfAutoGenerate.structureGen.getElement(0)
                const harmony = mfAutoGenerate.structureGen.resolveHarmony(genre, firstElement.name, firstElement.loopInElement)
                const structure = mfAutoGenerate.structureGen.generateStructure(genre)
                const bassVariant = structure.BASS ?? 'basic'

                const track = serviceRegistry.mfCmd.addTrack(pattern, 'BASS')
                track.useSoftSynth = true
                track.useAutoAssignSound = false
                track.synthSoundKey = 'BASS1'
                track.velocity = 0.8
                track.auto = true
                await mfAutoGenerate.generateTrack(track, bassVariant, 1, pattern, harmony)
                serviceRegistry.mfPatterns.computeFlatNotesFromPattern(pattern)
            }
            this.syncGenButtons()
            this.syncPatterns()
            playbackEvents.dispatchPatternChange()
        })

        this.chordsBtn.addEventListener('click', async () => {
            const pattern = appState.patterns[appState.selectedPatternNum]
            if (!pattern) return

            const hasPiano = pattern.tracks?.some(t => Utils.detectTrackType(t.name) === 'PIANO')
            if (!hasPiano) {
                const { getAutoGenerateService } = await import('../state/service_registry.js')
                const mfAutoGenerate = await getAutoGenerateService()

                if (!pattern._autoGenGenre) {
                    pattern._autoGenGenre = mfAutoGenerate.structureGen.getRandomGenre()
                }
                const genre = pattern._autoGenGenre
                const firstElement = mfAutoGenerate.structureGen.getElement(0)
                const harmony = mfAutoGenerate.structureGen.resolveHarmony(genre, firstElement.name, firstElement.loopInElement)
                const structure = mfAutoGenerate.structureGen.generateStructure(genre)
                const pianoVariant = structure.PIANO ?? 'chordStab'

                const track = serviceRegistry.mfCmd.addTrack(pattern, 'PIANO')
                track.useSoftSynth = true
                track.useAutoAssignSound = false
                track.synthSoundKey = 'PIANO'
                track.velocity = 0.8
                track.auto = true
                await mfAutoGenerate.generateTrack(track, pianoVariant, 1, pattern, harmony)
                serviceRegistry.mfPatterns.computeFlatNotesFromPattern(pattern)
            }
            this.syncGenButtons()
            this.syncPatterns()
            playbackEvents.dispatchPatternChange()
        })

        this.clearBtn.addEventListener('click', () => {
            const pattern = appState.patterns[appState.selectedPatternNum]
            if (pattern && confirm('Clear all notes in current pattern?')) {
                serviceRegistry.mfCmd.cleanPattern(pattern)
                serviceRegistry.mfPatterns.computeFlatNotesFromPattern(pattern)
                playbackEvents.dispatchPatternChange()
            }
        })

        this.prevPageBtn.addEventListener('click', () => {
            if (appState.currentPage > 0) {
                appState.currentPage--
                this.syncPage()
                playbackEvents.dispatchPatternChange()
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
                this.syncPage()
                playbackEvents.dispatchPatternChange()
            }
        })

        this.bpmToggle.addEventListener('click', () => {
            this.bpmPanel.classList.toggle('open')
        })

        this.bpmSlider.addEventListener('input', () => {
            const bpm = parseInt(this.bpmSlider.value, 10)
            this.bpmValue.textContent = bpm
            serviceRegistry.mfSeq?.setBpm(bpm)
            playbackEvents.dispatchBpmChange(bpm)
        })
    }

    syncState() {
        this.syncPlayButton()
        this.syncPatterns()
        this.syncDrumkits()
        this.syncBeats()
        this.syncPage()
        this.syncGenButtons()
    }

    syncPage() {
        const pattern = appState.patterns[appState.selectedPatternNum]
        if (pattern) {
            const stepsPerBeat = Utils.getTracksArray(pattern)[0]?.stepsPerBeat ?? 4
            const totalSteps = (pattern.nbBeats ?? 4) * stepsPerBeat
            const maxPage = Math.ceil(totalSteps / 16) - 1
            this.pageLabel.textContent = `${appState.currentPage + 1}/${maxPage + 1}`
            this.nextPageBtn.disabled = appState.currentPage >= maxPage
        } else {
            this.pageLabel.textContent = '1/1'
            this.nextPageBtn.disabled = true
        }
        this.prevPageBtn.disabled = appState.currentPage === 0
    }

    syncBpmSlider = (bpm) => {
        this.bpmSlider.value = bpm
        this.bpmValue.textContent = bpm
        this.bpmToggle.textContent = bpm
    }

    syncPlayButton = () => {
        const running = serviceRegistry.transport?.isRunning ?? false
        this.startBtn.textContent = running ? '■' : '▶'
        this.startBtn.classList.toggle('running', running)
    }

    syncGenButtons = () => {
        const pattern = appState.patterns[appState.selectedPatternNum]
        const tracks = pattern?.tracks ?? []
        const drumTypes = new Set(['KICK', 'SNARE', 'HAT', 'CLAP', 'COWBELL', 'PERC'])
        const hasDrumAuto = tracks.some(t => t.auto && drumTypes.has(Utils.detectTrackType(t.name)))
        const hasBassAuto = tracks.some(t => t.auto && Utils.detectTrackType(t.name) === 'BASS')
        const hasPianoAuto = tracks.some(t => t.auto && Utils.detectTrackType(t.name) === 'PIANO')
        this.drumBtn.classList.toggle('actif', hasDrumAuto)
        this.bassBtn.classList.toggle('actif', hasBassAuto)
        this.chordsBtn.classList.toggle('actif', hasPianoAuto)
    }

    syncPatterns = () => {
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
        this.syncBpmFromPattern()
        this.syncBeats()
    }

    syncBpmFromPattern = () => {
        const pat = appState.patterns[appState.selectedPatternNum]
        if (pat) {
            this.syncBpmSlider(pat.bpm ?? 120)
        }
    }

    syncDrumkits = () => {
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

    syncBeats = () => {
        const pattern = appState.patterns[appState.selectedPatternNum]
        this.beatsSelect.value = pattern?.nbBeats ?? 4
    }

    _setupOverflowObserver() {
        const isMobile = () => window.innerWidth <= 768
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
