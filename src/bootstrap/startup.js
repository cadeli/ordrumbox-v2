import { showToast } from '../core/notify.js'
import ResourcesLoader from '../loader/resources_loader.js'
import { appState } from '../state/app_state.js'
import { serviceRegistry } from '../state/service_registry.js'
import { soundRegistry } from '../state/sound_registry.js'
import { playbackEvents } from '../state/playback_events.js'
import { logger } from '../core/logger.js'
import { getStorageReport } from '../core/idb.js'
import { isMobileViewport } from '../core/constants.js'
import { EVENTS, VIEW_TOGGLE } from '../core/events.js'

const WELCOME_MESSAGE = 'software drum machine'

function scheduleAfterFirstPaint(callback) {
    requestAnimationFrame(() => {
        const scheduleIdle = window.requestIdleCallback ?? ((idleCallback) => window.setTimeout(idleCallback, 0))
        scheduleIdle(callback, { timeout: 500 })
    })
}

async function loadStartupResources() {
    try {
        await serviceRegistry.resourcesLoader.loadSettings()
        soundRegistry.settings.loaded = true
        await serviceRegistry.resourcesLoader.loadSong(ResourcesLoader.SONG_URL)
        if (soundRegistry.drumkitList.length === 0) {
            await serviceRegistry.resourcesLoader.loadDrumkitList(ResourcesLoader.DRUMKITS_URL)
        }
        if (Object.keys(soundRegistry.generatedSounds).length === 0) {
            await serviceRegistry.resourcesLoader.loadGeneratedSounds(ResourcesLoader.GENERATED_SOUNDS_URL)
        }
    } catch (e) {
        logger.error('Main', 'Failed to load startup resources', e)
        showToast('Failed to load resources: ' + e.message, 'error')
    }
}

function restoreInitialView() {
    if (appState.patterns.length === 0) return

    serviceRegistry.resourcesLoader.restoreSession()

    const dkIdx = Math.min(appState.selectedDrumkitIdx, soundRegistry.drumkitList.length - 1)
    const patIdx = Math.min(appState.selectedPatternIdx, appState.patterns.length - 1)

    playbackEvents.batch(() => {
        playbackEvents.emit(EVENTS.PATTERN_STRUCTURE_CHANGE)
        playbackEvents.emit(EVENTS.PATTERN_CHANGE)
        playbackEvents.emit(EVENTS.DRUMKIT_CHANGE)
    })

    serviceRegistry.cmd.setSelectedDrumkitIdx(dkIdx)
    serviceRegistry.cmd.setSelectedPatternIdx(patIdx)

    const savedView = appState.currentView
    const resolvedView = savedView === 'output' ? 'master' : savedView
    if (isMobileViewport()) {
        playbackEvents.emit(EVENTS.MOBILE_SEQ_TOGGLE)
    } else if (resolvedView && VIEW_TOGGLE[resolvedView]) {
        playbackEvents.emit(VIEW_TOGGLE[resolvedView], true)
    } else {
        playbackEvents.emit(EVENTS.EDIT_TOGGLE)
    }

    if (!isMobileViewport() && resolvedView !== 'master') {
        playbackEvents.emit(EVENTS.MASTER_TOGGLE, true)
    }
}

function installE2eHook() {
    const win = /** @type {Window & { __e2e?: unknown }} */ (window)
    win.__e2e = {
        ready: true,
        appState,
        serviceRegistry,
        soundRegistry,
        playbackEvents,
    }
}

async function logIdbReport() {
    // Dev diagnostic only: dropped from prod builds by terser (drop_console)
    // and skipped under vitest so the report never pollutes the test output.
    const meta = /** @type {ImportMeta & { env?: { MODE?: string } }} */ (import.meta)
    if (meta.env?.MODE === 'test') return

    const report = await getStorageReport()
    console.group('%c IndexedDB Report', 'color: #e94560; font-weight: bold')
    logger.info(
        'Main',
        'Usage:',
        report.usageRatio != null ? `${(report.usageRatio * 100).toFixed(2)}%` : 'N/A',
        `(${(report.usageBytes ?? 0).toLocaleString()} / ${(report.quotaBytes ?? 0).toLocaleString()} bytes)`,
    )
    for (const [store, keys] of Object.entries(report.stores ?? {})) {
        logger.info('Main', `Store "${store}":`, keys.length, 'entries', keys)
    }
    console.groupEnd()
}

/** Deferred startup: load resources, restore session/view, expose e2e hook. */
export function startAfterFirstPaint() {
    scheduleAfterFirstPaint(async () => {
        await loadStartupResources()
        restoreInitialView()
        installE2eHook()
        void logIdbReport()

        // Welcome line carried over from the splash screen. Skipped under
        // automation so a toast can never cover the UI e2e specs are clicking.
        if (typeof navigator === 'undefined' || navigator.webdriver !== true) {
            showToast(WELCOME_MESSAGE, 'info')
        }
    })
}
