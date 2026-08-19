import { appState } from '../state/app_state.js'
import { soundRegistry } from '../state/sound_registry.js'
import { serviceRegistry, getAutoAssignService } from '../state/service_registry.js'
import { playbackEvents } from '../state/playback_events.js'
import { TICK } from './constants.js'
import ResourcesLoader from '../loader/resources_loader.js'

export { appState } from '../state/app_state.js'
export { soundRegistry } from '../state/sound_registry.js'
export { serviceRegistry } from '../state/service_registry.js'
export { playbackEvents } from '../state/playback_events.js'

export const Globals = {
    get urlkits() { return ResourcesLoader.KITS_PATH },
    get urlscales() { return ResourcesLoader.SCALES_URL },
    get urldrumkits() { return ResourcesLoader.DRUMKITS_URL },
    get urlsong() { return ResourcesLoader.SONG_URL },
    get urlgeneratedsounds() { return ResourcesLoader.GENERATED_SOUNDS_URL },

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

    get cmd() { return serviceRegistry.cmd },
    set cmd(v) { serviceRegistry.cmd = v },

    get patternManager() { return serviceRegistry.patterns },
    set patternManager(v) { serviceRegistry.patterns = v },

    get midiManager() { return serviceRegistry.midiManager },
    set midiManager(v) { serviceRegistry.midiManager = v },

    get resourcesLoader() { return serviceRegistry.resourcesLoader },
    set resourcesLoader(v) { serviceRegistry.resourcesLoader = v },

    get seq() { return serviceRegistry.seq },
    set seq(v) { serviceRegistry.seq = v },

    get autoGenerate() { return serviceRegistry.autoGenerate },
    set autoGenerate(v) { serviceRegistry.autoGenerate = v },

    get autoAssign() { return serviceRegistry.autoAssign },
    set autoAssign(v) { serviceRegistry.autoAssign = v },

    getAutoAssign: () => getAutoAssignService(),

    get wavExporter() { return serviceRegistry.wavExporter },
    set wavExporter(v) { serviceRegistry.wavExporter = v },

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
