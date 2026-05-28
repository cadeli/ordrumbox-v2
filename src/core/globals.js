import { appState } from '../state/app_state.js'
import { soundRegistry } from '../state/sound_registry.js'
import { serviceRegistry, getAutoAssignService } from '../state/service_registry.js'
import { playbackEvents } from '../state/playback_events.js'
import { TICK } from './constants.js'
import MfResourcesLoader from '../loader/resources_loader.js'

export { appState } from '../state/app_state.js'
export { soundRegistry } from '../state/sound_registry.js'
export { serviceRegistry } from '../state/service_registry.js'
export { playbackEvents } from '../state/playback_events.js'

export const MfGlobals = {
    get urlkits() { return MfResourcesLoader.KITS_PATH },
    get urlscales() { return MfResourcesLoader.SCALES_URL },
    get urldrumkits() { return MfResourcesLoader.DRUMKITS_URL },
    get urlpatterns() { return MfResourcesLoader.PATTERNS_URL },
    get urlgeneratedsounds() { return MfResourcesLoader.GENERATED_SOUNDS_URL },

    get sounds() { return soundRegistry.sounds },
    set sounds(v) { soundRegistry.sounds = v },

    get scales() { return soundRegistry.scales },
    set scales(v) { soundRegistry.scales = v },

    get generatedSounds() { return soundRegistry.generatedSounds },
    set generatedSounds(v) { soundRegistry.generatedSounds = v },

    get patterns() { return appState.patterns },
    set patterns(v) { appState.patterns = v },

    get flatNotes() { return appState.flatNotes },
    set flatNotes(v) { appState.flatNotes = v },

    get drumkitList() { return soundRegistry.drumkitList },
    set drumkitList(v) { soundRegistry.drumkitList = v },

    get drumkits() { return soundRegistry.drumkits },
    set drumkits(v) { soundRegistry.drumkits = v },

    get leds() { return soundRegistry.leds },
    set leds(v) { soundRegistry.leds = v },

    get blob() { return serviceRegistry.blob },
    set blob(v) { serviceRegistry.blob = v },

    get audioCtx() { return serviceRegistry.audioCtx },
    set audioCtx(v) { serviceRegistry.audioCtx = v },

    get audioEngine() { return serviceRegistry.audioEngine },
    set audioEngine(v) { serviceRegistry.audioEngine = v },

    get transport() { return serviceRegistry.transport },
    set transport(v) { serviceRegistry.transport = v },

    get tick() { return serviceRegistry.transport?.tick ?? 0 },
    get bpm() { return serviceRegistry.transport?.bpm ?? 120 },

    get secondsPerBeat() { return appState.secondsPerBeat },
    set secondsPerBeat(v) { appState.secondsPerBeat = v },

    get selectedDrumkit() { return appState.selectedDrumkit },
    set selectedDrumkit(v) { appState.selectedDrumkit = v },

    get selectedDrumkitNum() { return appState.selectedDrumkitNum },
    set selectedDrumkitNum(v) { appState.selectedDrumkitNum = v },

    get selectedPatternNum() { return appState.selectedPatternNum },
    set selectedPatternNum(v) { appState.selectedPatternNum = v },

    get selectedTrackNum() { return appState.selectedTrackNum },
    set selectedTrackNum(v) { appState.selectedTrackNum = v },

    get mfCmd() { return serviceRegistry.mfCmd },
    set mfCmd(v) { serviceRegistry.mfCmd = v },

    get mfPatterns() { return serviceRegistry.mfPatterns },
    set mfPatterns(v) { serviceRegistry.mfPatterns = v },

    get mfUpdates() { return serviceRegistry.mfUpdates },
    set mfUpdates(v) { serviceRegistry.mfUpdates = v },

    get midiManager() { return serviceRegistry.midiManager },
    set midiManager(v) { serviceRegistry.midiManager = v },

    get mfResourcesLoader() { return serviceRegistry.mfResourcesLoader },
    set mfResourcesLoader(v) { serviceRegistry.mfResourcesLoader = v },

    get mfSeq() { return serviceRegistry.mfSeq },
    set mfSeq(v) { serviceRegistry.mfSeq = v },

    get mfAutoGenerate() { return serviceRegistry.mfAutoGenerate },
    set mfAutoGenerate(v) { serviceRegistry.mfAutoGenerate = v },

    get mfAutoAssign() { return serviceRegistry.mfAutoAssign },
    set mfAutoAssign(v) { serviceRegistry.mfAutoAssign = v },

    getAutoAssign: () => getAutoAssignService(),

    get mfWavExporter() { return serviceRegistry.mfWavExporter },
    set mfWavExporter(v) { serviceRegistry.mfWavExporter = v },

    get TICK() { return TICK },

    get onPlaybackStart() { return playbackEvents.onPlaybackStart },
    get onPlaybackStop() { return playbackEvents.onPlaybackStop },
    get onPatternChange() { return playbackEvents.onPatternChange },

    resetAll() {
        appState.reset()
        soundRegistry.reset()
        serviceRegistry.reset()
    }
}
