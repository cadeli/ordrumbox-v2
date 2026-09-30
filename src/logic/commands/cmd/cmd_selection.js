import { appState } from '../../../state/app_state.js'
import { serviceRegistry } from '../../../state/service_registry.js'
import { soundRegistry } from '../../../state/sound_registry.js'
import { playbackEvents } from '../../../state/playback_events.js'
import { getAutoAssignService } from '../../../state/service_loader.js'
import { logger } from '../../../core/logger.js'
import { showToast } from '../../../core/notify.js'
import { EVENTS } from '../../../core/events.js'

/**
 * Selection & state commands — returns an object of methods bound to the Commander instance.
 */
export function createSelectionMethods(_cmd) {
    return {
        async setSelectedDrumkitIdx(num) {
            try {
                appState.selectedDrumkitIdx = num
                await serviceRegistry.resourcesLoader.loadMissingSamplesFromDrumkits([soundRegistry.drumkitList[num]])
                await this.autoAssignSoundsForNewDrumkit()
                playbackEvents.emit(EVENTS.DRUMKIT_CHANGE)
            } catch (err) {
                logger.error('Commander', 'cmd::setSelectedDrumkitIdx failed', err)
                showToast('Drumkit switch failed', 'error')
            }
        },

        async autoAssignSoundsForNewDrumkit() {
            try {
                const selectedPattern = appState.patterns[appState.selectedPatternIdx]
                serviceRegistry.seq.setBpm(selectedPattern.bpm)
                const autoAssign = await getAutoAssignService()
                autoAssign.autoAssignSounds(selectedPattern)
                serviceRegistry.patterns.applyFlatNotes(selectedPattern)
                serviceRegistry.audioEngine?.invalidateCache()
            } catch (err) {
                logger.error('Commander', 'cmd::autoAssignSoundsForNewDrumkit failed', err)
                showToast('Sound assignment failed', 'error')
            }
        },

        async setSelectedPatternIdx(num) {
            try {
                if (appState.patterns.length > 0) {
                    appState.selectedPatternIdx = num
                    const selectedPattern = appState.patterns[appState.selectedPatternIdx]
                    serviceRegistry.seq.setBpm(selectedPattern.bpm)
                    if (Object.keys(soundRegistry.sounds).length > 0) {
                        const autoAssign = await getAutoAssignService()
                        autoAssign.autoAssignSounds(selectedPattern)
                    }
                    serviceRegistry.patterns.applyFlatNotes(selectedPattern)
                    // Explicit sound assignments can point to samples of another
                    // drumkit than the selected one — load them on demand so the
                    // pattern is audible right after a switch or a reload.
                    // Isolated: a missing loader or a failed fetch must never
                    // abort the switch itself (the emit below still has to run).
                    try {
                        await serviceRegistry.resourcesLoader?.loadSamplesForPatterns([selectedPattern])
                    } catch (err) {
                        logger.warn('Commander', 'cmd::setSelectedPatternIdx sample loading failed', err)
                    }
                    playbackEvents.emit(EVENTS.SELECTED_PATTERN_CHANGE)
                }
            } catch (err) {
                logger.error('Commander', 'cmd::setSelectedPatternIdx failed', err)
                showToast('Pattern switch failed', 'error')
            }
        },

        setSelectedTrackIdx(num) {
            appState.selectedTrackIdx = num
        },

        setCurrentPage(page) {
            const n = Number.isFinite(page) ? Math.max(0, Math.floor(page)) : 0
            appState.currentPage = n
        },

        resetPage() {
            appState.currentPage = 0
        },

        setCurrentView(view) {
            if (typeof view === 'string') appState.currentView = view
        },

        toggleShowVus() {
            appState.showVus = !appState.showVus
            playbackEvents.emit(EVENTS.TRACK_PARAM_CHANGE, null)
        },
    }
}
