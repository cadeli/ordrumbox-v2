import { appState } from './state/app_state.js'
import { serviceRegistry } from './state/service_registry.js'
import { soundRegistry } from './state/sound_registry.js'
import { playbackEvents } from './state/playback_events.js'
import Utils from './core/utils.js'
import ResourcesLoader from './loader/resources_loader.js'
import { logger } from './core/logger.js'
import { showToast } from './ui/toast.js'

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

function getSelectedPattern() {
    return appState.patterns[appState.selectedPatternNum]
}

function toggleTrackMute(trackIndex) {
    const track = getSelectedPattern()?.tracks?.[trackIndex]
    if (track) {
        track.mute = !track.mute
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
    playbackEvents.emit('trackParamChange', null)
}

function toggleStartStop() {
    serviceRegistry.seq.toggleStartStop()
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
            logger.error('KeyboardShortcuts', 'Failed to load generated sounds', e)
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
    logger.info('KeyboardShortcuts', 'All tracks converted to generated sounds')
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
    KeyS: logPatterns,
    KeyF: selectRandomPattern,
    KeyG: selectRandomDrumkit,
    KeyH: convertToGeneratedSounds,
    KeyD: exportCurrentTrackSound,
    KeyV: toggleVus,
    Space: toggleStartStop
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

    if (target && (target.tagName === 'TEXTAREA' || target.isContentEditable ||
        (target.tagName === 'INPUT' && /^(text|search|password|email|url|tel)$/i.test(target.type ?? 'text')))) {
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
    document.addEventListener('keydown', (event) => {
        void handleKeyboardShortcut(event)
    }, false)
}
