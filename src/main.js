import Sequencer from './core/seq.js'
import Commander from './logic/commands/cmd.js'
import * as patternsManager from './patterns/manager.js'

import Toolbar from './ui/toolbar.js'
import PatternPanel from './ui/pattern_panel.js'
import PianoRollPanel from './ui/piano_roll_panel.js'
import NoteEditor from './ui/note_editor.js'
import TrackEditor from './ui/track_editor.js'
import ToolsPanel from './ui/tools_panel.js'
import OutputPanel from './ui/output_panel.js'
import AboutPanel from './ui/about_panel.js'
import DrumkitManager from './ui/drumkit_manager.js'
import SongPanel from './ui/song_panel.js'
import ViewManager from './ui/view_manager.js'
import MobileTabBar from './ui/mobile_tab_bar.js'
import PatternSettingsPanel from './ui/pattern_settings_panel.js'

import ResourcesLoader from './loader/resources_loader.js'
import Utils from './core/utils.js'
import { appState } from './state/app_state.js'
import { getHistoryService } from './state/service_loader.js'
import { serviceRegistry } from './state/service_registry.js'
import { soundRegistry } from './state/sound_registry.js'
import { playbackEvents } from './state/playback_events.js'
import { logger } from "./core/logger.js"
import { idbReport } from './core/idb.js'
import { isMobileViewport } from './core/constants.js'
import { initSignals } from './state/signals.js'
import { initKeyboardShortcuts } from './keyboard_shortcuts.js'
import { initServiceWorker } from './service_worker.js'

logger.suppressTags(['Instrument', 'Fallback', 'PatternImport'])
logger.setLevel(logger.LEVELS?.INFO ?? 1)

serviceRegistry.audioCtx = null
serviceRegistry.cmd = new Commander()
serviceRegistry.resourcesLoader = new ResourcesLoader()
serviceRegistry.seq = new Sequencer()
serviceRegistry.autoGenerate = null
serviceRegistry.patterns = patternsManager
serviceRegistry.autoAssign = null
serviceRegistry.midiManager = null
serviceRegistry.history = await getHistoryService()

initSignals(serviceRegistry)


function scheduleAfterFirstPaint(callback) {
    requestAnimationFrame(() => {
        const scheduleIdle = window.requestIdleCallback ?? ((idleCallback) => window.setTimeout(idleCallback, 0))
        scheduleIdle(callback, { timeout: 500 })
    })
}


let _toolbar, _patternPanel, _pianoRollPanel, _noteEditor, _trackEditor, _toolsPanel, _outputPanel, _aboutPanel, _drumkitManager, _songPanel, _viewManager, _mobileTabBar, _patternSettingsPanel

export function init() {
    if (window.orientation > 1) {
        let de = document.documentElement;
        if (de.requestFullscreen) {
            de.requestFullscreen();
        } else if (de.mozRequestFullScreen) {
            de.mozRequestFullScreen();
        } else if (de.webkitRequestFullscreen) {
            de.webkitRequestFullscreen();
        } else if (de.msRequestFullscreen) {
            de.msRequestFullscreen();
        }
        screen.orientation.lock("landscape-primary");
    }

    _toolbar = new Toolbar()
    _patternPanel = new PatternPanel()
    _pianoRollPanel = new PianoRollPanel()
    _noteEditor = new NoteEditor()
    _trackEditor = new TrackEditor()
    _toolsPanel = new ToolsPanel()
    _outputPanel = new OutputPanel()
    _aboutPanel = new AboutPanel()
    _drumkitManager = new DrumkitManager()
    _songPanel = new SongPanel()
    _toolbar.init()
    _patternPanel.init()
    _pianoRollPanel.init()
    _trackEditor.init()
    _noteEditor.setContainer(_trackEditor._neContainer)
    _noteEditor.init()
    _trackEditor.setNoteEditor(_noteEditor)
    _toolsPanel.init()
    _outputPanel.init()
    _aboutPanel.init()
    _drumkitManager.init()
    _songPanel.init()

    _mobileTabBar = new MobileTabBar()
    _mobileTabBar.init()
    _patternSettingsPanel = new PatternSettingsPanel()
    _patternSettingsPanel.init()

    const appContent = document.createElement('div')
    appContent.id = 'app-content'
    appContent.appendChild(_patternPanel.container)
    appContent.appendChild(_pianoRollPanel.container)
    appContent.appendChild(_trackEditor.container)
    appContent.appendChild(_trackEditor.synthEditor.panel)
    const mountTarget = document.getElementById('app-main') ?? document.body
    mountTarget.appendChild(appContent)

    _patternPanel.container.style.display = 'flex'

    _viewManager = new ViewManager({
        trackEditor: _trackEditor,
        synthEditor: _trackEditor.synthEditor,
        pianoRollPanel: _pianoRollPanel,
        noteEditor: _noteEditor,
        toolsPanel: _toolsPanel,
        patternSettingsPanel: _patternSettingsPanel,
        outputPanel: _outputPanel,
        drumkitManager: _drumkitManager,
        patternsPanel: _songPanel,
        aboutPanel: _aboutPanel,
    })
    serviceRegistry.viewManager = _viewManager
    _viewManager.init()

    playbackEvents.on("trackSelect", (data) => {
        if (data && data.trackIdx !== undefined) {
            appState.selectedTrackNum = data.trackIdx
        }
    })

    const tbEl = document.getElementById('tb')
    if (tbEl && typeof ResizeObserver !== 'undefined') {
        const ro = new ResizeObserver(entries => {
            for (const entry of entries) {
                document.documentElement.style.setProperty('--tb-h', `${entry.contentRect.height}px`)
            }
        })
        ro.observe(tbEl)
        document.documentElement.style.setProperty('--tb-h', `${tbEl.getBoundingClientRect().height}px`)
    }

    document.addEventListener('keydown', (e) => {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
        const el = e.target
        if (!(el instanceof HTMLInputElement) || el.type !== 'range') return
        if (el.disabled || el.readOnly) return

        const min = Utils.toFiniteNumber(parseFloat(el.min), 0, 'min')
        const max = Utils.toFiniteNumber(parseFloat(el.max), 100, 'max')
        const step = Utils.toFiniteNumber(parseFloat(el.step), 1, 'step')
        const cur = parseFloat(el.value)
        const dir = e.key === 'ArrowRight' ? 1 : -1
        let next = cur + dir * step
        next = Math.round((next - min) / step) * step + min
        next = Math.min(max, Math.max(min, next))

        if (next === cur) {
            e.preventDefault()
            return
        }
        el.value = String(next)
        el.dispatchEvent(new Event('input',  { bubbles: true }))
        el.dispatchEvent(new Event('change', { bubbles: true }))
        e.preventDefault()
    })

    document.addEventListener('click', (e) => {
        const t = e.target
        if (!(t instanceof HTMLElement)) return
        const isLabel = t.tagName === 'LABEL'
        const isValue = t instanceof HTMLSpanElement && t.classList.contains('ne-val')
        if (!isLabel && !isValue) return
        const row = t.closest('.ne-row')
        if (!row) return
        const slider = row.querySelector('input[type="range"]')
        if (slider && !slider.disabled) slider.focus()
    })

    initKeyboardShortcuts()
    initServiceWorker()

    scheduleAfterFirstPaint(async () => {
        try {
            await serviceRegistry.resourcesLoader.loadSettings()
            soundRegistry.settings._loaded = true
            await serviceRegistry.resourcesLoader.loadSong(ResourcesLoader.SONG_URL)
            if (soundRegistry.drumkitList.length === 0) {
                await serviceRegistry.resourcesLoader.loadDrumkitList(ResourcesLoader.DRUMKITS_URL)
            }
            if (Object.keys(soundRegistry.generatedSounds).length === 0) {
                await serviceRegistry.resourcesLoader.loadGeneratedSounds(ResourcesLoader.GENERATED_SOUNDS_URL)
            }
        } catch (e) {
            logger.error('Main', 'Failed to load startup resources', e)
        }
        if (appState.patterns.length > 0) {
            serviceRegistry.resourcesLoader.restoreSession()

            const dkNum = Math.min(appState.selectedDrumkitNum, soundRegistry.drumkitList.length - 1)
            const patNum = Math.min(appState.selectedPatternNum, appState.patterns.length - 1)
            appState.selectedDrumkitNum = dkNum
            appState.selectedPatternNum = patNum

            playbackEvents.emit("patternStructureChange")
            playbackEvents.emit("patternChange")
            playbackEvents.emit("drumkitChange")

            serviceRegistry.cmd.setSelectedDrumkitNum(dkNum)
            serviceRegistry.cmd.setSelectedPatternNum(patNum)

            const savedView = soundRegistry.settings.session?.currentView
            const resolvedView = savedView === 'output' ? 'master' : savedView
            if (isMobileViewport()) {
                playbackEvents.emit("mobileSeqToggle")
            } else if (resolvedView) {
                playbackEvents.emit(resolvedView + 'Toggle', true)
            } else {
                playbackEvents.emit("editToggle")
            }

            if (!isMobileViewport() && resolvedView !== 'master') {
                playbackEvents.emit("masterToggle", true)
            }
        }

        ;(async () => {
            const report = await idbReport()
            console.group('%c IndexedDB Report', 'color: #e94560; font-weight: bold')
            logger.info('Main', 'Usage:', report.usagePct ?? 'N/A', `(${(report.usageBytes ?? 0).toLocaleString()} / ${(report.quotaBytes ?? 0).toLocaleString()} bytes)`)
            for (const [store, keys] of Object.entries(report.stores ?? {})) {
                logger.info('Main', `Store "${store}":`, keys.length, 'entries', keys)
            }
            console.groupEnd()
        })()
    })
}
