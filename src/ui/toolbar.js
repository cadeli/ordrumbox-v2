import { appState } from '../state/app_state.js'
import { soundRegistry } from '../state/sound_registry.js'
import { serviceRegistry } from '../state/service_registry.js'
import { playbackEvents } from '../state/playback_events.js'
import { injectUiCss } from './panel_helpers.js'

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

        this.startBtn = document.createElement('button')
        this.startBtn.className = 'tb-start'
        this.startBtn.textContent = 'Start'

        const bpmWrap = document.createElement('div')
        bpmWrap.className = 'tb-bpm-wrap'

        this.bpmToggle = document.createElement('button')
        this.bpmToggle.className = 'tb-bpm-toggle'
        this.bpmToggle.textContent = 'BPM 120'
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

        const patLabel = document.createElement('label')
        patLabel.textContent = 'Pattern:'
        this.patternSelect = document.createElement('select')

        const kitLabel = document.createElement('label')
        kitLabel.textContent = 'Kit:'
        this.drumkitSelect = document.createElement('select')

        this.autoGenBtn = document.createElement('button')
        this.autoGenBtn.className = 'tb-auto-gen'
        this.autoGenBtn.textContent = 'Auto Gen'

        this.clearBtn = document.createElement('button')
        this.clearBtn.className = 'tb-clear'
        this.clearBtn.textContent = 'Clear'

        // Pagination buttons
        this.prevPageBtn = document.createElement('button')
        this.prevPageBtn.className = 'tb-prev-page'
        this.prevPageBtn.textContent = '◀'
        this.prevPageBtn.title = 'Previous Page'

        this.pageLabel = document.createElement('label')
        this.pageLabel.className = 'tb-page-label'
        this.pageLabel.textContent = 'P1'

        this.nextPageBtn = document.createElement('button')
        this.nextPageBtn.className = 'tb-next-page'
        this.nextPageBtn.textContent = '▶'
        this.nextPageBtn.title = 'Next Page'

        this.outputBtn = document.createElement('button')
        this.outputBtn.className = 'tb-output'
        this.outputBtn.textContent = 'Output'

        this.toolsBtn = document.createElement('button')
        this.toolsBtn.className = 'tb-tools'
        this.toolsBtn.textContent = 'Tools'

        this.aboutBtn = document.createElement('button')
        this.aboutBtn.className = 'tb-about'
        this.aboutBtn.textContent = 'About'

        this.container.appendChild(this.startBtn)
        this.container.appendChild(bpmWrap)
        this.container.appendChild(patLabel)
        this.container.appendChild(this.patternSelect)
        this.container.appendChild(this.prevPageBtn)
        this.container.appendChild(this.pageLabel)
        this.container.appendChild(this.nextPageBtn)
        this.container.appendChild(kitLabel)
        this.container.appendChild(this.drumkitSelect)
        this.container.appendChild(this.autoGenBtn)
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
            playbackEvents.onOutputToggle.forEach(fn => fn(true))
        })

        this.toolsBtn.addEventListener('click', () => {
            playbackEvents.onToolsToggle.forEach(fn => fn(true))
        })

        this.aboutBtn.addEventListener('click', () => {
            playbackEvents.onAboutToggle.forEach(fn => fn(true))
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

        this.autoGenBtn.addEventListener('click', async () => {
            const { getAutoGenerateService } = await import('../state/service_registry.js')
            const mfAutoGenerate = await getAutoGenerateService()
            await mfAutoGenerate.generatePattern()
            this.syncPatterns()
            playbackEvents.onPatternChange.forEach(fn => fn())
        })

        this.clearBtn.addEventListener('click', () => {
            const pattern = appState.patterns[appState.selectedPatternNum]
            if (pattern && confirm('Clear all notes in current pattern?')) {
                serviceRegistry.mfCmd.cleanPattern(pattern)
                serviceRegistry.mfPatterns.computeFlatNotesFromPattern(pattern)
                playbackEvents.onPatternChange.forEach(fn => fn())
            }
        })

        this.prevPageBtn.addEventListener('click', () => {
            if (appState.currentPage > 0) {
                appState.currentPage--
                this.syncPage()
                playbackEvents.onPatternChange.forEach(fn => fn())
            }
        })

        this.nextPageBtn.addEventListener('click', () => {
            const pattern = appState.patterns[appState.selectedPatternNum]
            if (!pattern) return
            const barQuantize = pattern.tracks[0]?.barQuantize ?? 4
            const totalSteps = (pattern.nbBars ?? 4) * barQuantize
            const maxPage = Math.ceil(totalSteps / 16) - 1
            if (appState.currentPage < maxPage) {
                appState.currentPage++
                this.syncPage()
                playbackEvents.onPatternChange.forEach(fn => fn())
            }
        })

        this.bpmToggle.addEventListener('click', () => {
            this.bpmPanel.classList.toggle('open')
        })

        this.bpmSlider.addEventListener('input', () => {
            const bpm = parseInt(this.bpmSlider.value, 10)
            this.bpmValue.textContent = bpm
            serviceRegistry.mfSeq?.setBpm(bpm)
            playbackEvents.onBpmChange.forEach(fn => fn(bpm))
        })
    }

    syncState() {
        this.syncPlayButton()
        this.syncPatterns()
        this.syncDrumkits()
        this.syncPage()
    }

    syncPage() {
        this.pageLabel.textContent = `P${appState.currentPage + 1}`
        this.prevPageBtn.disabled = appState.currentPage === 0
        
        const pattern = appState.patterns[appState.selectedPatternNum]
        if (pattern) {
            const barQuantize = pattern.tracks[0]?.barQuantize ?? 4
            const totalSteps = (pattern.nbBars ?? 4) * barQuantize
            const maxPage = Math.ceil(totalSteps / 16) - 1
            this.nextPageBtn.disabled = appState.currentPage >= maxPage
        } else {
            this.nextPageBtn.disabled = true
        }
    }

    syncBpmSlider = (bpm) => {
        this.bpmSlider.value = bpm
        this.bpmValue.textContent = bpm
        this.bpmToggle.textContent = `BPM ${bpm}`
    }

    syncPlayButton = () => {
        const running = serviceRegistry.transport?.isRunning ?? false
        this.startBtn.textContent = running ? 'Stop' : 'Start'
        this.startBtn.classList.toggle('running', running)
    }

    syncPatterns = () => {
        const currentVal = this.patternSelect.value
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
    }

    syncBpmFromPattern = () => {
        const pat = appState.patterns[appState.selectedPatternNum]
        if (pat) {
            this.syncBpmSlider(pat.bpm ?? 120)
        }
    }

    syncDrumkits = () => {
        const currentVal = this.drumkitSelect.value
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
