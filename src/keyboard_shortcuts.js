import { appState } from './state/app_state.js'
import { serviceRegistry } from './state/service_registry.js'
import { getAutoAssignService, getAutoGeneratorService } from './state/service_loader.js'
import { soundRegistry } from './state/sound_registry.js'
import { playbackEvents } from './state/event_bus.js'
import { detectTrackType } from './core/drum_taxonomy.js'
import { pickRandom, pickRandomKey } from './core/random.js'
import { COLOR_SCHEME_COUNT, normalizeColorScheme } from './core/constants.js'
import ResourcesLoader from './loader/resources_loader.js'
import { logger } from './core/logger.js'
import { showToast } from './core/notify.js'
import { EVENTS } from './core/events.js'
import { Exporter } from './patterns/exporter.js'
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

function toggleTrackMute(trackIdx) {
    const track = appState.selectedPattern?.tracks?.[trackIdx]
    if (track) {
        track.mute = !track.mute
        playbackEvents.batch(() => {
            playbackEvents.emit(EVENTS.TRACK_PARAM_CHANGE, track)
            playbackEvents.emit(EVENTS.PATTERN_CHANGE)
        })
    }
}

function previewTrack(trackIdx) {
    serviceRegistry.seq.simpleBeep(trackIdx)
}

async function generatePattern() {
    const cmd = serviceRegistry.cmd
    if (!cmd?.addPattern) return

    // B always starts from a brand new pattern instead of overwriting the
    // currently selected one.
    const previousIdx = appState.selectedPatternIdx
    const newIdx = appState.patterns.length
    cmd.addPattern()
    await cmd.setSelectedPatternIdx(newIdx)
    cmd.resetPage?.()
    emitPatternStructureChange()

    const autoGen = await getAutoGeneratorService()
    const generated = await autoGen.generatePattern()

    if (!generated) {
        cmd.removePattern?.(newIdx)
        await cmd.setSelectedPatternIdx(Math.min(previousIdx, appState.patterns.length - 1))
        emitPatternStructureChange()
        showToast('Pattern generation failed', 'error')
        return
    }

    emitPatternStructureChange()
    showToast(`Pattern "${generated.name ?? 'pattern'}" generated`, 'success')
}

function toggleVus() {
    serviceRegistry.cmd?.toggleShowVus()
    showToast(appState.showVus ? 'VU meters on' : 'VU meters off', 'info')
}

function cycleColorScheme() {
    const current = normalizeColorScheme(soundRegistry.settings.colorScheme)
    const next = (current % COLOR_SCHEME_COUNT) + 1
    soundRegistry.settings.colorScheme = next
    playbackEvents.emit(EVENTS.COLOR_SCHEME_CHANGE, next)
    void serviceRegistry.resourcesLoader?.saveSettings?.()
    showToast(`Color scheme ${next}/${COLOR_SCHEME_COUNT}`, 'info')
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
    const pattern = appState.selectedPattern
    if (!pattern) {
        showToast('No pattern selected', 'info')
        return
    }
    const data = Exporter.export(pattern)
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    downloadBlob(blob, `ordrumbox-${pattern.name ?? 'pattern'}.json`)
    showToast(`Pattern "${pattern.name ?? 'pattern'}" exported`, 'success')
}

function addNewPattern() {
    const cmd = serviceRegistry.cmd
    if (!cmd?.addPattern) return
    const newIdx = appState.patterns.length
    cmd.addPattern()
    cmd.setSelectedPatternIdx(newIdx)
    cmd.resetPage?.()
    emitPatternStructureChange()
    showToast('Pattern added', 'success')
}

async function duplicateCurrentPattern() {
    const cmd = serviceRegistry.cmd
    const pattern = appState.selectedPattern
    if (!pattern || !cmd?.addPattern) return
    const clone = cmd.addPattern((pattern.name ?? 'Pattern') + ' copy')
    Object.assign(clone, structuredClone(pattern))
    clone.name = (pattern.name ?? 'Pattern') + ' copy'
    await cmd.setSelectedPatternIdx(appState.patterns.length - 1)
    emitPatternStructureChange()
    showToast('Pattern duplicated', 'success')
}

function selectRandomPattern() {
    const patterns = appState.patterns ?? []
    const picked = pickRandom(patterns)
    if (!picked) {
        showToast('No pattern selected', 'info')
        return
    }
    const num = patterns.indexOf(picked)
    serviceRegistry.cmd.setSelectedPatternIdx(num)
    showToast(`Pattern "${picked.name ?? num + 1}" selected`, 'success')
}

function selectRandomDrumkit() {
    const drumkits = soundRegistry.drumkitList ?? []
    const picked = pickRandom(drumkits)
    if (!picked) {
        showToast('No drumkit available', 'info')
        return
    }
    const num = drumkits.indexOf(picked)
    serviceRegistry.cmd.setSelectedDrumkitIdx(num)
    showToast(`Drumkit "${picked.name ?? num + 1}" selected`, 'success')
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
    const selectedPattern = appState.selectedPattern
    if (!selectedPattern) {
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

    // A type with no patch of its own used to fall back to 'BASS1' (so e.g. COWBELL
    // became a bass patch, silently), then to nothing at all (the track stayed on
    // its sample, so the action silently skipped it). Now it gets a RANDOM patch:
    // the track is converted either way, and the toast names what was random.
    const randomPicks = new Map()
    const generatedSoundKeys = Object.keys(soundRegistry.generatedSounds)
    Object.values(selectedPattern.tracks).forEach((track) => {
        const type = detectTrackType(track.name)
        let synthKey = SYNTH_SOUND_MAP[type]
        if (!generatedSoundKeys.includes(synthKey)) {
            synthKey = pickRandomKey(soundRegistry.generatedSounds)
            if (synthKey) randomPicks.set(type || track.name, synthKey)
        }
        track.useSoftSynth = true
        track.useAutoAssignSound = false
        track.synthSoundKey = synthKey
    })

    serviceRegistry.flatNotes.applyFlatNotes(selectedPattern)
    serviceRegistry.audioEngine?.invalidateCache()
    playbackEvents.emit(EVENTS.PATTERN_CHANGE)
    logger.info('KeyboardShortcuts', 'All tracks converted to generated sounds')
    if (randomPicks.size > 0) {
        const detail = [...randomPicks].map(([type, key]) => `${type}→${key}`).join(', ')
        showToast(`No synth patch for: ${detail} (random)`, 'info')
    } else {
        showToast('All tracks converted to generated sounds', 'success')
    }
}

function assignRandomSampleAllTracks() {
    const selectedPattern = appState.selectedPattern
    if (!selectedPattern) {
        showToast('No pattern selected', 'info')
        return
    }

    const allSounds = Object.keys(soundRegistry.sounds)
    if (allSounds.length === 0) {
        showToast('No samples loaded', 'error')
        return
    }

    Object.values(selectedPattern.tracks).forEach((track) => {
        track.useAutoAssignSound = false
        track.useSoftSynth = false
        track.sampleId = pickRandom(allSounds)
    })

    serviceRegistry.flatNotes.applyFlatNotes(selectedPattern)
    serviceRegistry.audioEngine?.invalidateCache()
    playbackEvents.emit(EVENTS.PATTERN_CHANGE)
    showToast('Random samples assigned', 'success')
}

async function autoAssignAllTracks() {
    const selectedPattern = appState.selectedPattern
    if (!selectedPattern) {
        showToast('No pattern selected', 'info')
        return
    }

    Object.values(selectedPattern.tracks).forEach((track) => {
        track.useAutoAssignSound = true
        track.useSoftSynth = false
    })

    const autoAssign = await getAutoAssignService()
    autoAssign.autoAssignSounds(selectedPattern)
    serviceRegistry.flatNotes.applyFlatNotes(selectedPattern)
    serviceRegistry.audioEngine?.invalidateCache()
    playbackEvents.emit(EVENTS.PATTERN_CHANGE)
    showToast('All tracks auto-assigned', 'success')
}

const PHYSICAL_KEYBOARD_SHORTCUTS = {
    KeyB: generatePattern,
    KeyC: cycleColorScheme,
    KeyF: selectRandomPattern,
    KeyG: selectRandomDrumkit,
    KeyH: convertToGeneratedSounds,
    KeyJ: autoAssignAllTracks,
    KeyK: assignRandomSampleAllTracks,
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
    const muteTrackIdx = PHYSICAL_TRACK_MUTE_KEYS.indexOf(code)
    if (muteTrackIdx !== -1) {
        return () => toggleTrackMute(muteTrackIdx)
    }

    const previewTrackIdx = PHYSICAL_TRACK_PREVIEW_KEYS.indexOf(code)
    if (previewTrackIdx !== -1) {
        return () => previewTrack(previewTrackIdx)
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

    // Bare keys only: without this guard Ctrl+C (copy), Ctrl+V (paste)… would
    // also hit the physical-code map below — Ctrl+C would cycle the color
    // scheme while copying in the pattern grid.
    if (event.ctrlKey || event.metaKey || event.altKey) {
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
