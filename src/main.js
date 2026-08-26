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
import PatternsPanel from './ui/patterns_panel.js'
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
import { showToast } from './ui/toast.js'
import { idbReport } from './core/idb.js'
import { isMobileViewport } from './core/constants.js'
import { initSignals } from './state/signals.js'

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


let _toolbar, _patternPanel, _pianoRollPanel, _noteEditor, _trackEditor, _toolsPanel, _outputPanel, _aboutPanel, _drumkitManager, _patternsPanel, _viewManager, _mobileTabBar, _patternSettingsPanel

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
    _patternsPanel = new PatternsPanel()
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
    _patternsPanel.init()

    _mobileTabBar = new MobileTabBar()
    _mobileTabBar.init()
    _patternSettingsPanel = new PatternSettingsPanel()
    _patternSettingsPanel.init()

    const appContent = document.createElement('div')
    appContent.id = 'app-content'
    appContent.appendChild(_patternPanel.container)
    appContent.appendChild(_pianoRollPanel.container)
    appContent.appendChild(_trackEditor.container)
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
        patternsPanel: _patternsPanel,
        aboutPanel: _aboutPanel,
    })
    serviceRegistry.viewManager = _viewManager
    _viewManager.init()

    playbackEvents.on("trackSelect", (data) => {
        if (data && data.trackIdx !== undefined) {
            appState.selectedTrackNum = data.trackIdx
        }
    })

    window.addEventListener('resize', () => {
        const repositionable = [
            _trackEditor, _toolsPanel, _outputPanel, _aboutPanel, _drumkitManager, _patternsPanel,
            _trackEditor.synthEditor
        ]
        repositionable.forEach(p => {
            if (p?.reposition) p.reposition()
        })
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

    // Ensure all <input type="range"> sliders respond to Arrow Left/Right
    // when focused, regardless of native browser quirks or CSS that might
    // block the default behavior (e.g. the LFO dual-range container uses
    // pointer-events:none on the track).
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
        // Snap to step grid
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

    // When the user clicks on a slider's <label> (title) or <span.ne-val>
    // (value display), focus the associated range input. The LFO dual-range
    // container uses pointer-events:none on the track, so clicking on the
    // label/value is the natural way to focus that slider.
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
            // Restore saved session state (dk, pattern, track, view) BEFORE
            // emitting any event that could trigger a save (e.g. drumkitChange
            // -> ResourcesLoader.saveSession()). emit() is synchronous, so
            // emitting first would fire saveSession() while appState still
            // holds its default values (0), clobbering the persisted session
            // in memory *and* in IndexedDB before restoreSession() can read it.
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


const PHYSICAL_TRACK_MUTE_KEYS = [
    'Digit1',
    'Digit2',
    'Digit3',
    'Digit4',
    'Digit5',
    'Digit6',
    'Digit7',
    'Digit8',
    'Digit9'
]

const PHYSICAL_TRACK_PREVIEW_KEYS = [
    'KeyQ',
    'KeyW',
    'KeyE',
    'KeyR',
    'KeyT',
    'KeyY',
    'KeyU',
    'KeyI'
]

const PHYSICAL_KEYS_PREVENTING_BROWSER_DEFAULT = new Set(['Space'])

const PHYSICAL_KEYBOARD_SHORTCUTS = {
    KeyB: generatePattern,
    KeyS: logPatterns,
    KeyF: selectRandomPattern,
    KeyG: selectRandomDrumkit,
    KeyH: convertToGeneratedSounds,
    KeyD: exportCurrentTrackSound,
    KeyV: toggleVus,
    Space: toggleStartStop
}

document.addEventListener('keydown', (event) => {
    void handleKeyboardShortcut(event)
}, false)

async function handleKeyboardShortcut(event) {
    const target = event.target

    // Ignore shortcuts when typing in text fields
    if (target && (target.tagName === 'TEXTAREA' || target.isContentEditable ||
        (target.tagName === 'INPUT' && /^(text|search|password|email|url|tel)$/i.test(target.type ?? 'text')))) {
        return
    }

    const shortcut = getKeyboardShortcut(event.code, event.key)
    if (!shortcut) {
        return
    }

    // Space should prevent default (scrolling) even if handled via event.key
    if (PHYSICAL_KEYS_PREVENTING_BROWSER_DEFAULT.has(event.code) || event.key === ' ') {
        event.preventDefault()
    }

    await shortcut()
}


function getKeyboardShortcut(code, key) {
    const muteTrackIndex = PHYSICAL_TRACK_MUTE_KEYS.indexOf(code)
    if (muteTrackIndex !== -1) {
        return () => toggleTrackMute(muteTrackIndex)
    }

    const previewTrackIndex = PHYSICAL_TRACK_PREVIEW_KEYS.indexOf(code)
    if (previewTrackIndex !== -1) {
        return () => previewTrack(previewTrackIndex)
    }

    // Fallback for Space using event.key
    if (code === 'Space' || key === ' ') {
        return PHYSICAL_KEYBOARD_SHORTCUTS.Space
    }

    return PHYSICAL_KEYBOARD_SHORTCUTS[code]
}

function getSelectedPattern() {
    return appState.patterns[appState.selectedPatternNum]
}

function toggleTrackMute(trackIndex) {
    const track = getSelectedPattern()?.tracks?.[trackIndex]
    if (track) {
        track.mute = !track.mute;
        playbackEvents.emit('patternChange')
    }
}

function previewTrack(trackIndex) {
    serviceRegistry.seq.simpleBeep(trackIndex)
}

async function generatePattern() {
    const { getAutoGenerateService } = await import('./state/service_loader.js')
    const autoGen = await getAutoGenerateService()
    await autoGen.generatePattern()
}

function toggleVus() {
    appState.showVus = !appState.showVus
    playbackEvents.emit("trackParamChange", null)
}

function logPatterns() {
    logger.info('Main', JSON.stringify(appState.patterns))
    logger.info('Main', JSON.stringify(soundRegistry.generatedSounds))
}

function selectRandomPattern() {
    const num = Math.floor(Math.random() * appState.patterns.length)
    serviceRegistry.cmd.setSelectedPatternNum(num)
}

function selectRandomDrumkit() {
    const num = Math.floor(Math.random() * soundRegistry.drumkitList.length)
    serviceRegistry.cmd.setSelectedDrumkitNum(num)
}

function toggleStartStop() {
    serviceRegistry.seq.toggleStartStop()
}

const SYNTH_SOUND_MAP = {
    KICK: 'BASS0',
    SNARE: 'SN',
    HAT: 'CHH_SYNTH',
    OHH: 'OHH_SYNTH',
    BASS: 'BASS2',
    PERC: 'SYNTH2',
    PIANO: 'PIANO',
    TOM: 'TOM'
}

async function convertToGeneratedSounds() {
    const selPattern = getSelectedPattern()
    if (!selPattern) return

    if (Object.keys(soundRegistry.generatedSounds).length === 0) {
        try {
            await serviceRegistry.resourcesLoader.loadGeneratedSounds(ResourcesLoader.GENERATED_SOUNDS_URL)
        } catch (e) {
            logger.error('Main', 'Failed to load generated sounds', e)
        }
    }

    Object.values(selPattern.tracks).forEach(track => {
        const type = Utils.detectTrackType(track.name)
        track.useSoftSynth = true
        track.useAutoAssignSound = false
        track.synthSoundKey = SYNTH_SOUND_MAP[type] ?? 'BASS1'
    })

    serviceRegistry.patterns.computeFlatNotesFromPattern(selPattern, 0)
    serviceRegistry.audioEngine?.invalidateCache()
    playbackEvents.emit('patternChange')
    logger.info('Main', 'All tracks converted to generated sounds')
}

async function exportCurrentTrackSound() {
    const selPattern = getSelectedPattern()
    if (!selPattern) return

    const trackIdx = appState.selectedTrackNum
    const track = selPattern.tracks[trackIdx]
    if (!track) {
        showToast('No track selected', 'info')
        return
    }

    if (!track.useSoftSynth || !track.synthSoundKey) {
        showToast('Current track does not use a generated sound', 'info')
        return
    }

    const generatedSound = soundRegistry.generatedSounds[track.synthSoundKey]
    if (!generatedSound) {
        showToast('Generated sound not found', 'error')
        return
    }

    try {
        // const sampleRate = 44100
        logger.info('Main', JSON.stringify(generatedSound, null, 2))
    } catch (e) {
        logger.error('Main', 'Export failed', e)
        showToast('Export failed: ' + e.message, 'error')
    }
}

// Service Worker Registration for PWA with Update Notification
if ('serviceWorker' in navigator) {
    window.addEventListener('load', async () => {
        const swPath = './sw.js';
        
        try {
            const registration = await navigator.serviceWorker.register(swPath)
            logger.info('Main', 'orDrumbox SW registered with scope:', registration.scope);

            // Check for updates periodically (every hour)
            setInterval(() => {
                registration.update();
            }, 1000 * 60 * 60);

            // Handle the case where an update is already waiting
            if (registration.waiting) {
                showUpdateNotification(registration.waiting);
            }

            // Listen for new updates
            registration.addEventListener('updatefound', () => {
                const newWorker = registration.installing;
                newWorker.addEventListener('statechange', () => {
                    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                        showUpdateNotification(newWorker);
                    }
                });
            })
        } catch (error) {
            logger.error('Main', 'orDrumbox SW registration failed:', error);
        }
    });

    // Reload the page when the new Service Worker takes control
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!refreshing) {
            window.location.reload();
            refreshing = true;
        }
    });
}

function showUpdateNotification(worker) {
    const isPWA = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true
    const label = isPWA ? 'Nouvelle version disponible !' : 'Mise à jour disponible !'
    showToast(label, 'info', {
        actions: [{ label: 'Installer', onClick: () => worker.postMessage('SKIP_WAITING') }],
        dismissible: true,
    })
}