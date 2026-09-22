import { appState } from '../../../state/app_state.js'
import { serviceRegistry } from '../../../state/service_registry.js'
import { soundRegistry } from '../../../state/sound_registry.js'
import { playbackEvents } from '../../../state/playback_events.js'
import { getAutoAssignService } from '../../../state/service_loader.js'
import { logger } from '../../../core/logger.js'
import { showToast } from '../../../ui/toast.js'

/**
 * Selection & state commands — returns an object of methods bound to the Commander instance.
 */
export function createSelectionMethods(cmd) {
    return {
        async setSelectedDrumkitNum(num) {
            try {
                appState.selectedDrumkitNum = num
                await serviceRegistry.resourcesLoader.loadMissingSamplesFromDrumkits([soundRegistry.drumkitList[num]])
                await this.autoAssignSoundsForNewDrumkit()
                playbackEvents.emit("drumkitChange")
            } catch (err) {
                logger.error('Commander', 'cmd::setSelectedDrumkitNum failed', err)
                showToast('Drumkit switch failed', 'error')
            }
        },

        async autoAssignSoundsForNewDrumkit() {
            try {
                let selPattern = appState.patterns[appState.selectedPatternNum]
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
                    let selPattern = appState.patterns[appState.selectedPatternNum]
                    serviceRegistry.seq.setBpm(selPattern.bpm)
                    if (Object.keys(soundRegistry.sounds).length > 0) {
                        const autoAssign = await getAutoAssignService()
                        autoAssign.autoAssignSounds(selPattern)
                    }
                    serviceRegistry.patterns.applyFlatNotes(selPattern)
                    playbackEvents.emit("selectedPatternChange")
                }
            } catch (err) {
                logger.error('Commander', 'cmd::setSelectedPatternNum failed', err)
                showToast('Pattern switch failed', 'error')
            }
        }
    }
}
