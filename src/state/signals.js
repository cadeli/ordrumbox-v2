// src/state/signals.js — Reactive signals for the app.
//
// Bridges existing state (appState, serviceRegistry, playbackEvents)
// into the signals system (createSignal / computed / effect).
//
// Pattern:
//   - appState top-level props are auto-tracked via reactive()
//   - External state (transport, history, viewManager) is bridged via events → createSignal()
//   - A `tick` counter coalesces high-frequency updates into per-frame reads

import { createSignal, computed } from '../core/signals.js'
import { appState } from './app_state.js'
import { playbackEvents } from './playback_events.js'
import { soundRegistry } from './sound_registry.js'
import Utils from '../core/utils.js'

// ═══════════════════════════════════════════════════════
// 1. Transport & Playback
// ═══════════════════════════════════════════════════════

/** @type {[() => boolean, (v: boolean) => void]} */
export const [isPlaying, _setIsPlaying] = createSignal(false)

/** @type {[() => number, (v: number) => void]} */
export const [transportTick, _setTransportTick] = createSignal(0)

playbackEvents.on('playbackStart', () => _setIsPlaying(true))
playbackEvents.on('playbackStop', () => {
    _setIsPlaying(false)
    _setTransportTick(0)
})

/** @type {[() => number, (v: number) => void]} */
export const [currentBpm, _setCurrentBpm] = createSignal(120)

playbackEvents.on('bpmChange', (bpm) => _setCurrentBpm(bpm))
playbackEvents.on('patternChange', () => {
    const pat = appState.patterns[appState.selectedPatternNum]
    if (pat) _setCurrentBpm(pat.bpm ?? 120)
})
playbackEvents.on('patternStructureChange', () => {
    const pat = appState.patterns[appState.selectedPatternNum]
    if (pat) _setCurrentBpm(pat.bpm ?? 120)
})

/** { tick, beat, bar } — updated per animation frame during playback */
export const playbackClock = computed(() => {
    const tick = transportTick()
    const pat = appState.patterns[appState.selectedPatternNum]
    const nbBeats = pat?.nbBeats ?? 4
    const ticksPerBeat = 32
    const ticksPerLoop = ticksPerBeat * nbBeats
    const loopTick = ticksPerLoop > 0 ? tick % ticksPerLoop : 0
    const beat = Math.floor(loopTick / ticksPerBeat)
    const bar = ticksPerLoop > 0 ? Math.floor(tick / ticksPerLoop) : 0
    return { tick, beat, bar }
})

// ═══════════════════════════════════════════════════════
// 2. Pattern Computed
// ═══════════════════════════════════════════════════════

export const currentPatternIdx = computed(() => appState.selectedPatternNum)

export const currentPattern = computed(() =>
    appState.patterns[appState.selectedPatternNum] ?? null
)

/** Tracks array for the active pattern — refreshed on structural changes */
export const [currentTracks, _setCurrentTracks] = createSignal([])

/** Bumps when any track-level data changes (note, param, structure) */
export const [trackVersion, _bumpTrackVersion] = createSignal(0)

const _refreshTracks = () => {
    const pat = appState.patterns[appState.selectedPatternNum]
    _setCurrentTracks(Utils.getTracksArray(pat))
}

playbackEvents.on('patternChange', _refreshTracks)
playbackEvents.on('trackParamChange', _refreshTracks)
playbackEvents.on('patternStructureChange', _refreshTracks)
playbackEvents.on('noteChange', () => _bumpTrackVersion(v => v + 1))
playbackEvents.on('trackParamChange', () => _bumpTrackVersion(v => v + 1))
playbackEvents.on('patternStructureChange', () => _bumpTrackVersion(v => v + 1))

export const selectedTrack = computed(() => {
    const tracks = currentTracks()
    return tracks[appState.selectedTrackNum] ?? null
})

export const totalPages = computed(() => {
    const pat = currentPattern()
    return Math.ceil((pat?.nbBeats ?? 4))
})

export const canPrevPage = computed(() =>
    appState.currentPage > 0
)

export const canNextPage = computed(() =>
    appState.currentPage < totalPages() - 1
)

// ═══════════════════════════════════════════════════════
// 3. History (Undo / Redo)
// ═══════════════════════════════════════════════════════

/** @type {[() => boolean, (v: boolean) => void]} */
export const [canUndo, _setCanUndo] = createSignal(false)

/** @type {[() => boolean, (v: boolean) => void]} */
export const [canRedo, _setCanRedo] = createSignal(false)

/** @type {[() => { past: number, future: number }, (v: object) => void]} */
export const [historyStats, _setHistoryStats] = createSignal({ past: 0, future: 0 })

playbackEvents.on('historyChange', (state) => {
    _setCanUndo(state?.canUndo ?? false)
    _setCanRedo(state?.canRedo ?? false)
    _setHistoryStats({ past: state?.pastLength ?? 0, future: state?.futureLength ?? 0 })
})

// ═══════════════════════════════════════════════════════
// 4. View / Navigation
// ═══════════════════════════════════════════════════════

/** @type {[() => string | null, (v: string) => void]} */
export const [activeView, _setActiveView] = createSignal(null)

/** @type {[() => string | null, (v: string | null) => void]} */
export const [activeSlotPanel, _setActiveSlotPanel] = createSignal(null)

// ═══════════════════════════════════════════════════════
// 5. Audio & Kits
// ═══════════════════════════════════════════════════════

/** @type {[() => boolean, (v: boolean) => void]} */
export const [audioUnlocked, _setAudioUnlocked] = createSignal(false)

/** @type {[() => Array, (v: Array) => void]} */
export const [drumkitList, _setDrumkitList] = createSignal([])

playbackEvents.on('drumkitChange', () => {
    _setDrumkitList([...(soundRegistry?.drumkitList ?? [])])
})

// ═══════════════════════════════════════════════════════
// 6. RAF-based tick reader (coalesces transport ticks → per-frame)
// ═══════════════════════════════════════════════════════

let _rafId = null
let _lastTransportTick = -1
let _serviceRegistry = null

function _readTransportTick() {
    const tick = _serviceRegistry?.transport?.tick ?? 0
    if (tick !== _lastTransportTick) {
        _lastTransportTick = tick
        _setTransportTick(tick)
    }
    if (_serviceRegistry?.transport?.isRunning) {
        _rafId = requestAnimationFrame(_readTransportTick)
    } else {
        _rafId = null
    }
}

playbackEvents.on('playbackStart', () => {
    if (!_rafId) _rafId = requestAnimationFrame(_readTransportTick)
})
playbackEvents.on('playbackStop', () => {
    if (_rafId) { cancelAnimationFrame(_rafId); _rafId = null }
    _lastTransportTick = -1
})

// ═══════════════════════════════════════════════════════
// 7. Lifecycle
// ═══════════════════════════════════════════════════════

/**
 * Hydrate signals from current state. Call after services are initialized.
 * @param {object} registry - serviceRegistry instance
 */
export function initSignals(registry) {
    _serviceRegistry = registry

    const pat = appState.patterns[appState.selectedPatternNum]
    _setCurrentTracks(Utils.getTracksArray(pat))
    _setCurrentBpm(pat?.bpm ?? 120)

    if (soundRegistry?.drumkitList?.length) {
        _setDrumkitList([...soundRegistry.drumkitList])
    }
}
