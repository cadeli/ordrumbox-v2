import { appState } from './state/app_state.js'
import { serviceRegistry } from './state/service_registry.js'
import { getAutoAssignService, getAutoGenerateService } from './state/service_loader.js'
import { soundRegistry } from './state/sound_registry.js'
import { playbackEvents } from './state/playback_events.js'
import Utils from './core/utils.js'
import ResourcesLoader from './loader/resources_loader.js'
import { logger } from './core/logger.js'
import { showToast } from './core/notify.js'
import { EVENTS } from './core/events.js'
import { PatternExporter } from './patterns/exporter.js'
import { downloadBlob } from './core/download.js'

const PHYSICAL_TRACK_MUTE_KEYS = [
    'Digit1',
    'Digit2',
    'Digit3',
    'Digit4',
    'Digit5',
    'Digit6',
    'Digit7',
    'Digit8',
    'Digit9',
]

const PHYSICAL_TRACK_PREVIEW_KEYS = ['KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT', 'KeyY', 'KeyU', 'KeyI', 'KeyO', 'KeyP']

const PHYSICAL_KEYS_PREVENTING_BROWSER_DEFAULT = new Set(['Space'])

function getSelectedPattern() {
    return appState.patterns[appState.selectedPatternNum]
}

function toggleTrackMute(trackIndex) {
    const track = getSelectedPattern()?.tracks?.[trackIndex]
    if (track) {
        track.mute = !track.mute
        playbackEvents.batch(() => {
            playbackEvents.emit(EVENTS.TRACK_PARAM_CHANGE, track)
            playbackEvents.emit(EVENTS.PATTERN_CHANGE)
        })
    }
}

function previewTrack(trackIndex) {
    serviceRegistry.seq.simpleBeep(trackIndex)
}

async function generatePattern() {
    const autoGen = await getAutoGenerateService()
    await autoGen.generatePattern()
}

function toggleVus() {
    serviceRegistry.cmd?.toggleShowVus()
}

function toggleStartStop() {
    serviceRegistry.seq.toggleStartStop()
}

function emitPatternStructureChange() {
    playbackEvents.batch(() => {
        playbackEvents.emit(EVENTS.PATTERN_STRUCTURE_CHANGE)
        playbackEvents.emit(EVENTS.PATTERN_CHANGE)
    })
}

function saveCurrentPattern() {
    const pattern = getSelectedPattern()
    if (!pattern) {
        showToast('No pattern selected', 'info')
        return
    }
    const data = PatternExporter.export(pattern)
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    downloadBlob(blob, `ordrumbox-${pattern.name ?? 'pattern'}.json`)
}

function addNewPattern() {
    const cmd = serviceRegistry.cmd
    if (!cmd?.addPattern) return
    const newIdx = appState.patterns.length
    cmd.addPattern()
    cmd.setSelectedPatternNum(newIdx)
    cmd.resetPage?.()
    emitPatternStructureChange()
    showToast('Pattern added', 'success')
}

async function duplicateCurrentPattern() {
    const cmd = serviceRegistry.cmd
    const pattern = getSelectedPattern()
    if (!pattern || !cmd?.addPattern) return
    const clone = cmd.addPattern((pattern.name ?? 'Pattern') + ' copy')
    Object.assign(clone, structuredClone(pattern))
    clone.name = (pattern.name ?? 'Pattern') + ' copy'
    await cmd.setSelectedPatternNum(appState.patterns.length - 1)
    emitPatternStructureChange()
    showToast('Pattern duplicated', 'success')
}

function selectRandomPattern() {
    const num = Math.floor(Math.random() * appState.patterns.length)
    serviceRegistry.cmd.setSelectedPatternNum(num)
}

function selectRandomDrumkit() {
    const num = Math.floor(Math.random() * soundRegistry.drumkitList.length)
    serviceRegistry.cmd.setSelectedDrumkitNum(num)
}

const SYNTH_SOUND_MAP = {
    KICK: 'BASS0',
    SNARE: 'SN',
    HAT: 'CHH_SYNTH',
    OHH: 'OHH_SYNTH',
    BASS: 'BASS2',
    PERC: 'SYNTH2',
    PIANO: 'PIANO',
    TOM: 'TOM',
}

async function convertToGeneratedSounds() {
    const selPattern = getSelectedPattern()
    if (!selPattern) {
        showToast('No pattern selected', 'info')
        return
    }

    if (Object.keys(soundRegistry.generatedSounds).length === 0) {
        try {
            await serviceRegistry.resourcesLoader.loadGeneratedSounds(ResourcesLoader.GENERATED_SOUNDS_URL)
        } catch (e) {
            logger.error('KeyboardShortcuts', 'Failed to load generated sounds', e)
            showToast('Failed to load generated sounds', 'error')
            return
        }
    }

    Object.values(selPattern.tracks).forEach((track) => {
        const type = Utils.detectTrackType(track.name)
        track.useSoftSynth = true
        track.useAutoAssignSound = false
        track.synthSoundKey = SYNTH_SOUND_MAP[type] ?? 'BASS1'
    })

    serviceRegistry.patterns.applyFlatNotes(selPattern)
    serviceRegistry.audioEngine?.invalidateCache()
    playbackEvents.emit(EVENTS.PATTERN_CHANGE)
    logger.info('KeyboardShortcuts', 'All tracks converted to generated sounds')
    showToast('All tracks converted to generated sounds', 'success')
}

function assignRandomSampleAllTracks() {
    const selPattern = getSelectedPattern()
    if (!selPattern) return

    const allSounds = Object.keys(soundRegistry.sounds)
    if (allSounds.length === 0) {
        showToast('No samples loaded', 'error')
        return
    }

    Object.values(selPattern.tracks).forEach((track) => {
        track.useAutoAssignSound = false
        track.useSoftSynth = false
        track.soundId = allSounds[Math.floor(Math.random() * allSounds.length)]
    })

    serviceRegistry.patterns.applyFlatNotes(selPattern)
    serviceRegistry.audioEngine?.invalidateCache()
    playbackEvents.emit(EVENTS.PATTERN_CHANGE)
    showToast('Random samples assigned', 'success')
}

async function autoAssignAllTracks() {
    const selPattern = getSelectedPattern()
    if (!selPattern) return

    Object.values(selPattern.tracks).forEach((track) => {
        track.useAutoAssignSound = true
        track.useSoftSynth = false
    })

    const autoAssign = await getAutoAssignService()
    autoAssign.autoAssignSounds(selPattern)
    serviceRegistry.patterns.applyFlatNotes(selPattern)
    serviceRegistry.audioEngine?.invalidateCache()
    playbackEvents.emit(EVENTS.PATTERN_CHANGE)
    showToast('All tracks auto-assigned', 'success')
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
        logger.info('KeyboardShortcuts', JSON.stringify(generatedSound, null, 2))
    } catch (e) {
        logger.error('KeyboardShortcuts', 'Export failed', e)
        showToast('Export failed: ' + e.message, 'error')
    }
}

const PHYSICAL_KEYBOARD_SHORTCUTS = {
    KeyB: generatePattern,
    KeyF: selectRandomPattern,
    KeyG: selectRandomDrumkit,
    KeyH: convertToGeneratedSounds,
    KeyJ: autoAssignAllTracks,
    KeyK: assignRandomSampleAllTracks,
    KeyD: exportCurrentTrackSound,
    KeyV: toggleVus,
    Space: toggleStartStop,
}

function getModShortcut(event) {
    if (!event.ctrlKey && !event.metaKey) return null
    const key = (event.key || '').toLowerCase()
    if (key === 's' || event.code === 'KeyS') return saveCurrentPattern
    if (key === 'n' || event.code === 'KeyN') return addNewPattern
    if (key === 'd' || event.code === 'KeyD') return duplicateCurrentPattern
    return null
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

    if (code === 'Space' || key === ' ') {
        return PHYSICAL_KEYBOARD_SHORTCUTS.Space
    }

    return PHYSICAL_KEYBOARD_SHORTCUTS[code]
}

async function handleKeyboardShortcut(event) {
    const target = event.target

    if (
        target &&
        (target.tagName === 'TEXTAREA' ||
            target.isContentEditable ||
            (target.tagName === 'INPUT' && /^(text|search|password|email|url|tel)$/i.test(target.type ?? 'text')))
    ) {
        return
    }

    const modShortcut = getModShortcut(event)
    if (modShortcut) {
        event.preventDefault()
        await modShortcut()
        return
    }

    const shortcut = getKeyboardShortcut(event.code, event.key)
    if (!shortcut) {
        return
    }

    if (PHYSICAL_KEYS_PREVENTING_BROWSER_DEFAULT.has(event.code) || event.key === ' ') {
        event.preventDefault()
    }

    await shortcut()
}

export function initKeyboardShortcuts() {
    document.addEventListener(
        'keydown',
        (event) => {
            void handleKeyboardShortcut(event)
        },
        false,
    )
}
