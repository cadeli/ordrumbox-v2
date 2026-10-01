// @ts-check
import { appState } from '../../../state/app_state.js'
import { serviceRegistry } from '../../../state/service_registry.js'
import { soundRegistry } from '../../../state/sound_registry.js'
import { playbackEvents } from '../../../state/playback_events.js'
import { getAutoAssignService } from '../../../state/service_loader.js'
import { logger } from '../../../core/logger.js'
import { showToast } from '../../../core/notify.js'
import { EVENTS } from '../../../core/events.js'

/**
 * Selection & state commands — stateless, drives appState/events directly.
 */
export default class SelectionCommands {
    // no host access needed: every member works through appState/serviceRegistry

    async setSelectedDrumkitIdx(num) {
        const previousIdx = appState.selectedDrumkitIdx
        try {
            appState.selectedDrumkitIdx = num
            await serviceRegistry.resourcesLoader.loadMissingSamplesFromDrumkits([soundRegistry.drumkitList[num]])
            if (appState.selectedDrumkitIdx !== num) return
            await this.autoAssignSoundsForNewDrumkit()
            if (appState.selectedDrumkitIdx !== num) return
            playbackEvents.emit(EVENTS.DRUMKIT_CHANGE)
        } catch (err) {
            appState.selectedDrumkitIdx = previousIdx
            logger.error('Commander', 'cmd::setSelectedDrumkitIdx failed', err)
            showToast('Drumkit switch failed', 'error')
        }
    }

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
    }

    async setSelectedPatternIdx(num) {
        const previousIdx = appState.selectedPatternIdx
        try {
            if (appState.patterns.length > 0) {
                const target = Math.max(0, Math.min(Math.trunc(Number(num)) || 0, appState.patterns.length - 1))
                appState.selectedPatternIdx = target
                const selectedPattern = appState.patterns[target]
                if (!selectedPattern) throw new Error(`No pattern at index ${target}`)
                // Same defensive treatment as the rest of the switch: a missing
                // sequencer must not roll the whole selection back (which would
                // abort the sample loading and the change event below).
                serviceRegistry.seq?.setBpm(selectedPattern.bpm)
                if (Object.keys(soundRegistry.sounds).length > 0) {
                    const autoAssign = await getAutoAssignService()
                    autoAssign.autoAssignSounds(selectedPattern)
                }
                // The awaits above give the user time to select another pattern:
                // finishing this one would re-assign sounds on the pattern they
                // just left and then announce "pattern changed" for it.
                if (appState.selectedPatternIdx !== target) return
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
                if (appState.selectedPatternIdx !== target) return
                playbackEvents.emit(EVENTS.SELECTED_PATTERN_CHANGE)
            }
        } catch (err) {
            // The index was written before anything could fail and was never
            // restored, leaving every later appState.patterns[idx] undefined.
            appState.selectedPatternIdx = previousIdx
            logger.error('Commander', 'cmd::setSelectedPatternIdx failed', err)
            showToast('Pattern switch failed', 'error')
        }
    }

    setSelectedTrackIdx(num) {
        appState.selectedTrackIdx = num
    }

    setCurrentPage(page) {
        const n = Number.isFinite(page) ? Math.max(0, Math.floor(page)) : 0
        appState.currentPage = n
    }

    resetPage() {
        appState.currentPage = 0
    }

    setCurrentView(view) {
        if (typeof view === 'string') appState.currentView = view
    }

    toggleShowVus() {
        appState.showVus = !appState.showVus
        playbackEvents.emit(EVENTS.TRACK_PARAM_CHANGE, null)
    }
}
