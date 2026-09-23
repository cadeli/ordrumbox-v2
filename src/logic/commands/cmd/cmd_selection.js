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
        async setSelectedDrumkitNum(num) {
            try {
                appState.selectedDrumkitNum = num
                await serviceRegistry.resourcesLoader.loadMissingSamplesFromDrumkits([soundRegistry.drumkitList[num]])
                await this.autoAssignSoundsForNewDrumkit()
                playbackEvents.emit(EVENTS.DRUMKIT_CHANGE)
            } catch (err) {
                logger.error('Commander', 'cmd::setSelectedDrumkitNum failed', err)
                showToast('Drumkit switch failed', 'error')
            }
        },

        async autoAssignSoundsForNewDrumkit() {
            try {
                const selPattern = appState.patterns[appState.selectedPatternNum]
                serviceRegistry.seq.setBpm(selPattern.bpm)
                const autoAssign = await getAutoAssignService()
                autoAssign.autoAssignSounds(selPattern)
                serviceRegistry.patterns.applyFlatNotes(selPattern)
                serviceRegistry.audioEngine?.invalidateCache()
            } catch (err) {
                logger.error('Commander', 'cmd::autoAssignSoundsForNewDrumkit failed', err)
                showToast('Sound assignment failed', 'error')
            }
        },

        async setSelectedPatternNum(num) {
            try {
                if (appState.patterns.length > 0) {
                    appState.selectedPatternNum = num
                    const selPattern = appState.patterns[appState.selectedPatternNum]
                    serviceRegistry.seq.setBpm(selPattern.bpm)
                    if (Object.keys(soundRegistry.sounds).length > 0) {
                        const autoAssign = await getAutoAssignService()
                        autoAssign.autoAssignSounds(selPattern)
                    }
                    serviceRegistry.patterns.applyFlatNotes(selPattern)
                    playbackEvents.emit(EVENTS.SELECTED_PATTERN_CHANGE)
                }
            } catch (err) {
                logger.error('Commander', 'cmd::setSelectedPatternNum failed', err)
                showToast('Pattern switch failed', 'error')
            }
        },

        setSelectedTrackNum(num) {
            appState.selectedTrackNum = num
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
