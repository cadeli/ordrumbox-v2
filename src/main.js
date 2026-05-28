
import MfSeq from './core/seq.js'
import MfCmd from './logic/commands/cmd.js'
import MfPatterns from './patterns/manager.js'
import Toolbar from './ui/toolbar.js'
import PatternPanel from './ui/pattern_panel.js'
import NoteEditor from './ui/note_editor.js'
import TrackEditor from './ui/track_editor.js'
import ToolsPanel from './ui/tools_panel.js'

import MfResourcesLoader from './loader/resources_loader.js'
import { FALLBACK_FPS } from './core/constants.js'
import { appState } from './state/app_state.js'
import { serviceRegistry } from './state/service_registry.js'
import { soundRegistry } from './state/sound_registry.js'
import { playbackEvents } from './state/playback_events.js'

serviceRegistry.audioCtx = null
serviceRegistry.mfCmd = new MfCmd()
serviceRegistry.mfResourcesLoader = new MfResourcesLoader()
serviceRegistry.mfSeq = new MfSeq()
serviceRegistry.mfAutoGenerate = null
serviceRegistry.mfPatterns = new MfPatterns()
serviceRegistry.mfAutoAssign = null
serviceRegistry.midiManager = null


function scheduleAfterFirstPaint(callback) {
    requestAnimationFrame(() => {
        const scheduleIdle = window.requestIdleCallback ?? ((idleCallback) => window.setTimeout(idleCallback, 0))
        scheduleIdle(callback, { timeout: 500 })
    })
}


let _toolbar, _patternPanel, _noteEditor, _trackEditor, _toolsPanel

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
    _noteEditor = new NoteEditor()
    _trackEditor = new TrackEditor()
    _toolsPanel = new ToolsPanel()
    _toolbar.init()
    _patternPanel.init()
    _noteEditor.init()
    _trackEditor.init()
    _toolsPanel.init()

    scheduleAfterFirstPaint(async () => {
        try {
            await serviceRegistry.mfResourcesLoader.loadPatterns(MfResourcesLoader.PATTERNS_URL)
            if (soundRegistry.drumkitList.length === 0) {
                await serviceRegistry.mfResourcesLoader.loadDrumkitList(MfResourcesLoader.DRUMKITS_URL)
            }
        } catch (e) {
            console.error('Failed to load startup resources', e)
        }
        if (appState.patterns.length > 0) {
            playbackEvents.onPatternChange.forEach(fn => fn())
            playbackEvents.onDrumkitChange.forEach(fn => fn())
            serviceRegistry.mfCmd.setSelectedPatternNum(0)
            const pattern = appState.patterns[0]
            const trackIdx = pattern.tracks.findIndex(t => t.name === 'SNARE')
            if (trackIdx !== -1) {
                const track = pattern.tracks[trackIdx]
                playbackEvents.onTrackSelect.forEach(fn => fn({ track, trackIdx }))
            }
        }
    })
    requestAnimFrame(draw)
}

window.requestAnimFrame = (function () {
    return window.requestAnimationFrame ||
        window.webkitRequestAnimationFrame ||
        window.mozRequestAnimationFrame ||
        window.oRequestAnimationFrame ||
        window.msRequestAnimationFrame ||
        function (callback) {
            window.setTimeout(callback, 1000 / FALLBACK_FPS);
        };
})();

function draw() {
    requestAnimFrame(draw)
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
    KeyP: serializePatterns,
    KeyB: generatePattern,
    KeyS: logPatterns,
    KeyF: selectRandomPattern,
    KeyG: selectRandomDrumkit,
    KeyH: convertToGeneratedSounds,
    Space: toggleStartStop
}

document.addEventListener('keydown', (event) => {
    void handleKeyboardShortcut(event)
}, false)

async function handleKeyboardShortcut(event) {
    // Sliders handling (Arrows)
    const target = event.target
    if (target && target.tagName === 'INPUT' && target.type === 'range') {
        if (event.code === 'ArrowLeft' || event.code === 'ArrowRight') {
            event.preventDefault()
            const step = parseFloat(target.step) || 1
            const val = parseFloat(target.value)
            const newVal = event.code === 'ArrowLeft' ? val - step : val + step
            target.value = Math.max(parseFloat(target.min), Math.min(parseFloat(target.max), newVal))
            target.dispatchEvent(new Event('input', { bubbles: true }))
            return
        }
    }

    // Ignore shortcuts when typing in input fields
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
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
        // serviceRegistry.mfUpdates.trackToggleMute(track)
        track.mute = !track.mute;
    }
}

function previewTrack(trackIndex) {
    serviceRegistry.mfSeq.simpleBeep(trackIndex)
}

async function serializePatterns() {
    const { PatternExporter } = await import('./patterns/exporter.js')
    const legacy = PatternExporter.toLegacyFormat(appState.patterns, serviceRegistry.mfCmd)
    console.log(legacy.data)
    console.log(legacy.string)
}

async function generatePattern() {
    const { getAutoGenerateService } = await import('./state/service_registry.js')
    const mfAutoGenerate = await getAutoGenerateService()
    await mfAutoGenerate.generatePattern()
}

function logPatterns() {
    console.log(JSON.stringify(appState.patterns))
    console.log(JSON.stringify(soundRegistry.generatedSounds))
}

function selectRandomPattern() {
    const num = Math.floor(Math.random() * appState.patterns.length)
    serviceRegistry.mfCmd.setSelectedPatternNum(num)
}

function selectRandomDrumkit() {
    const num = Math.floor(Math.random() * soundRegistry.drumkitList.length)
    serviceRegistry.mfCmd.setSelectedDrumkitNum(num)
}

function addPattern() {
    serviceRegistry.mfCmd.addPattern()
}

function toggleStartStop() {
    serviceRegistry.mfSeq.toggleStartStop()
}

const SYNTH_SOUND_MAP = {
    KICK: 'BASS0',
    SNARE: 'SN',
    HAT: 'SYNTH1',
    BASS: 'BASS2',
    PERC: 'SYNTH2'
}

function detectTrackSynthType(name) {
    const n = name.toUpperCase()
    if (n.includes('KICK') || n.includes('BD')) return 'KICK'
    if (n.includes('SNARE') || n.includes('SD')) return 'SNARE'
    if (n.includes('HAT') || n.includes('CHH') || n.includes('OHH')) return 'HAT'
    if (n.includes('BASS') || n.includes('SYNTH')) return 'BASS'
    return 'PERC'
}

async function convertToGeneratedSounds() {
    const selPattern = getSelectedPattern()
    if (!selPattern) return

    if (Object.keys(soundRegistry.generatedSounds).length === 0) {
        try {
            await serviceRegistry.mfResourcesLoader.loadGeneratedSounds(MfResourcesLoader.GENERATED_SOUNDS_URL)
        } catch (e) {
            console.error('Failed to load generated sounds', e)
        }
    }

    Object.values(selPattern.tracks).forEach(track => {
        const type = detectTrackSynthType(track.name)
        track.useSoftSynth = true
        track.useAutoAssignSound = false
        track.synthSoundKey = SYNTH_SOUND_MAP[type] ?? 'BASS1'
    })

    serviceRegistry.mfPatterns.computeFlatNotesFromPattern(selPattern, 0)
    serviceRegistry.audioEngine?.invalidateCache()
    console.log('All tracks converted to generated sounds')
}
