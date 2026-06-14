
import MfSeq from './core/seq.js'
import MfCmd from './logic/commands/cmd.js'
import * as patternsManager from './patterns/manager.js'

import Toolbar from './ui/toolbar.js'
import PatternPanel from './ui/pattern_panel.js'
import NoteEditor from './ui/note_editor.js'
import TrackEditor from './ui/track_editor.js'
import ToolsPanel from './ui/tools_panel.js'
import OutputPanel from './ui/output_panel.js'
import AboutPanel from './ui/about_panel.js'

import MfResourcesLoader from './loader/resources_loader.js'
import Utils from './core/utils.js'
import { appState } from './state/app_state.js'
import { serviceRegistry } from './state/service_registry.js'
import { soundRegistry } from './state/sound_registry.js'
import { playbackEvents } from './state/playback_events.js'

serviceRegistry.audioCtx = null
serviceRegistry.mfCmd = new MfCmd()
serviceRegistry.mfResourcesLoader = new MfResourcesLoader()
serviceRegistry.mfSeq = new MfSeq()
serviceRegistry.mfAutoGenerate = null
serviceRegistry.mfPatterns = patternsManager
serviceRegistry.mfAutoAssign = null
serviceRegistry.midiManager = null


function scheduleAfterFirstPaint(callback) {
    requestAnimationFrame(() => {
        const scheduleIdle = window.requestIdleCallback ?? ((idleCallback) => window.setTimeout(idleCallback, 0))
        scheduleIdle(callback, { timeout: 500 })
    })
}


let _toolbar, _patternPanel, _noteEditor, _trackEditor, _toolsPanel, _outputPanel, _aboutPanel

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
    _outputPanel = new OutputPanel()
    _aboutPanel = new AboutPanel()
    _toolbar.init()
    _patternPanel.init()
    _noteEditor.init()
    _trackEditor.init()
    _toolsPanel.init()
    _outputPanel.init()
    _aboutPanel.init()

    playbackEvents.onTrackSelect.push((data) => {
        if (data && data.trackIdx !== undefined) {
            appState.selectedTrackNum = data.trackIdx
        }
    })

    window.addEventListener('resize', () => {
        const repositionable = [
            _trackEditor, _noteEditor, _toolsPanel, _outputPanel, _aboutPanel
        ]
        repositionable.forEach(p => {
            if (p?.reposition) p.reposition()
        })
    })

    // Ensure all <input type="range"> sliders respond to Arrow Left/Right
    // when focused, regardless of native browser quirks or CSS that might
    // block the default behavior (e.g. the LFO dual-range container uses
    // pointer-events:none on the track).
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
        const el = e.target
        if (!(el instanceof HTMLInputElement) || el.type !== 'range') return
        if (el.disabled || el.readOnly) return

        const min = parseFloat(el.min) || 0
        const max = parseFloat(el.max) || 100
        const step = parseFloat(el.step) || 1
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
            await serviceRegistry.mfResourcesLoader.loadPatterns(MfResourcesLoader.PATTERNS_URL)
            if (soundRegistry.drumkitList.length === 0) {
                await serviceRegistry.mfResourcesLoader.loadDrumkitList(MfResourcesLoader.DRUMKITS_URL)
            }
            if (Object.keys(soundRegistry.generatedSounds).length === 0) {
                await serviceRegistry.mfResourcesLoader.loadGeneratedSounds(MfResourcesLoader.GENERATED_SOUNDS_URL)
            }
        } catch (e) {
            console.error('Failed to load startup resources', e)
        }
        if (appState.patterns.length > 0) {
            playbackEvents.dispatchPatternChange()
            playbackEvents.dispatchDrumkitChange()
            
            // Set initial drumkit first to trigger sample loading
            serviceRegistry.mfCmd.setSelectedDrumkitNum(0)
            // Then select pattern (which will auto-assign once sounds are loaded)
            serviceRegistry.mfCmd.setSelectedPatternNum(0)

        }
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
    KeyP: serializePatterns,
    KeyB: generatePattern,
    KeyS: logPatterns,
    KeyF: selectRandomPattern,
    KeyG: selectRandomDrumkit,
    KeyH: convertToGeneratedSounds,
    KeyD: exportCurrentTrackSound,
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
    HAT: 'CHH_SYNTH',
    OHH: 'OHH_SYNTH',
    BASS: 'BASS2',
    PERC: 'SYNTH2',
    PIANO: 'PIANO',
    TOM: 'TOM'
}

function detectTrackSynthType(name) {
    const n = name.toUpperCase()
    if (n.includes('KICK') || n.includes('BD')) return 'KICK'
    if (n.includes('SNARE') || n.includes('SD')) return 'SNARE'
    if (n.includes('OHH')) return 'OHH'
    if (n.includes('HAT') || n.includes('CHH')) return 'HAT'
    if (n.includes('TOM')) return 'TOM'
    if (n.includes('BASS')) return 'BASS'
    if (n.includes('PIANO')) return 'PIANO'
    if (n.includes('SYNTH')) return 'BASS'
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

async function exportCurrentTrackSound() {
    const selPattern = getSelectedPattern()
    if (!selPattern) return

    const trackIdx = appState.selectedTrackNum
    const track = selPattern.tracks[trackIdx]
    if (!track) {
        alert('No track selected')
        return
    }

    if (!track.useSoftSynth || !track.synthSoundKey) {
        alert('Current track does not use a generated sound')
        return
    }

    const generatedSound = soundRegistry.generatedSounds[track.synthSoundKey]
    if (!generatedSound) {
        alert('Generated sound not found')
        return
    }

    try {
        // const sampleRate = 44100
        console.log(JSON.stringify(generatedSound, null, 2))
    } catch (e) {
        console.error('Export failed', e)
        alert('Export failed: ' + e.message)
    }
}

// Service Worker Registration for PWA with Update Notification
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        const swPath = window.location.pathname.includes('/dist/') ? './sw.js' : './sw.js';
        
        navigator.serviceWorker.register(swPath)
            .then(registration => {
                console.log('orDrumbox SW registered with scope:', registration.scope);

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
                });
            })
            .catch(error => {
                console.error('orDrumbox SW registration failed:', error);
            });
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
    // Detect if we are in PWA mode or standalone
    const isPWA = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
    
    const div = document.createElement('div');
    div.id = 'pwa-update-toast';
    div.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        background: #2c3e50;
        color: white;
        padding: 16px 24px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.5);
        display: flex;
        align-items: center;
        gap: 16px;
        z-index: 10000;
        font-family: sans-serif;
        border: 1px solid #34495e;
        animation: slideIn 0.3s ease-out;
    `;

    const label = isPWA ? 'Nouvelle version disponible !' : 'Mise à jour disponible !';
    
    div.innerHTML = `
        <span style="font-weight: 500;">${label}</span>
        <button id="pwa-update-btn" style="
            background: #3498db;
            color: white;
            border: none;
            padding: 8px 16px;
            border-radius: 4px;
            cursor: pointer;
            font-weight: bold;
            transition: background 0.2s;
        ">Installer</button>
        <button id="pwa-close-btn" style="
            background: transparent;
            color: #bdc3c7;
            border: none;
            cursor: pointer;
            font-size: 20px;
        ">&times;</button>
        <style>
            @keyframes slideIn {
                from { transform: translateY(100px); opacity: 0; }
                to { transform: translateY(0); opacity: 1; }
            }
            #pwa-update-btn:hover { background: #2980b9; }
        </style>
    `;

    document.body.appendChild(div);

    div.querySelector('#pwa-update-btn').onclick = () => {
        worker.postMessage('SKIP_WAITING');
    };

    div.querySelector('#pwa-close-btn').onclick = () => {
        div.remove();
    };
}
