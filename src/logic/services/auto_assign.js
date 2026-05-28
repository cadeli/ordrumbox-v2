import { appState as _appState } from '../../state/app_state.js'
import { soundRegistry as _soundRegistry } from '../../state/sound_registry.js'
import InstrumentsManager from './instruments_manager.js'
import Utils from '../../core/utils.js'
import { NOT_FOUND } from '../../core/constants.js'

export default class MfAutoAssign {
    static TAG = "MFAUTOASSIGN"
    static NOT_FOUND = NOT_FOUND
    constructor({ appState, soundRegistry } = {}) {
        this._appState = appState ?? _appState
        this._soundRegistry = soundRegistry ?? _soundRegistry
    }

    autoAssignSounds = (pattern) => {
        if (Object.keys(this._soundRegistry.sounds).length > 0) {
            Object.values(pattern.tracks).forEach((track, indexTrack) => {
                if (track.useAutoAssignSound === true && track.useSoftSynth === false) {
                    this.autoAssignTrackSounds(track, indexTrack)
                }
            })
        } else {
            console.warn("MfAutoAssign::autoAssignSounds no sounds")
        }
    }

    autoAssignTrackSounds = (track) => {
        const validInstrumentIds = InstrumentsManager.DATA?.instruments?.map(i => i.id) ?? []
        if (!validInstrumentIds.includes(track.name)) {
            const instrumentsManager = new InstrumentsManager()
            const foundInstrument = instrumentsManager.findInstrumentFromFileName(track.name)
            const newName = foundInstrument?.id
            if (newName && validInstrumentIds.includes(newName)) {
                console.warn(`Renaming track '${track.name}' to '${newName}' for auto-assign`)
                track.name = newName
            } 
        }
        const selDrumkitName = this._soundRegistry.drumkitList[this._appState.selectedDrumkitNum].name
        //console.log("autoAssignTrackSounds : look for", track.name)
        let soundId = this.getSoundIdFromKitAndTrackname(selDrumkitName, track.name)
        if (soundId == NOT_FOUND) {
            track.useAutoAssignSound = false
            console.log("getSoundIdFromKitAndTrackname No match for track:", track.name, " kit:", this.getKitAsText(selDrumkitName))
            soundId = this.getSoundIdFromTrackname(track.name)
        }
        if (soundId == NOT_FOUND) {
            console.log("getSoundIdFromTrackname Direct No match for track:", track.name, " kit:", this.getKitAsText(selDrumkitName))
            soundId = this.findSoundEquivalence(soundId, selDrumkitName, track)
        }
        if (soundId == NOT_FOUND) {
            console.log("findSoundEquivalence No match for track:", track.name, " kit:", this.getKitAsText(selDrumkitName))
            soundId = Utils.getRandomKey(this._soundRegistry.sounds)
            console.warn("mfCmd::autoAssignSounds (choose rnd : " + soundId + " ) cannot find from kit:" + selDrumkitName + " nb instr=" + this._soundRegistry.drumkitList[this._appState.selectedDrumkitNum].instruments.length + ":" + track.name)
        }
        //console.warn("mfCmd::autoAssignSounds track:" + track.name + "=" + this._soundRegistry.sounds[soundId].url)
        if (soundId === null || soundId === "") {
            console.error("autoAssignTrackSounds :: No SoundID")
        }
        track.soundId = soundId
    }

    findSoundEquivalence = (soundId, selDrumkitName, track) => {
        if (soundId !== NOT_FOUND) return soundId;

        const equivalences = {
            "RIDE": ["OHH"],
            "COW": ["COWBELL"],
            "TOM": ["MTOM", "LTOM", "HTOM", "BASS", "MELO"],
            "CRASH": ["RIDE", "CONGAS"],
            "COWBELL": ["RIMSHOT", "RIDE", "TIMBAL", "LTOM"],
            "CLAP": ["LWOODBLOCK", "MELO", "RIMSHOT", "HIT", "HTOM"],
            "OHH": ["TAMBOURINE", "SGUIRO"],
            "BASS": ["TOM"],
            "MELO": ["PIANO"],
            "SYNTHLEAD": ["ORGAN","PIANO"],
            "STRINGS":["ORGAN","PIANO"]
        };

        const replacements = equivalences[track.name];

        if (replacements) {
            for (const targetKey of replacements) {
                let candidateId = this.getSoundIdFromKitAndTrackname(selDrumkitName, targetKey);
                if (candidateId !== NOT_FOUND) {
                    return candidateId;
                }
                candidateId = this.getSoundIdFromTrackname( targetKey);
                if (candidateId !== NOT_FOUND) {
                    return candidateId;
                }
            }
        }
        return soundId;
    }

    getSoundIdFromKitAndTrackname = (drumkitName, trackName) => {
        let ret = NOT_FOUND
        for (const [key, value] of Object.entries(this._soundRegistry.sounds)) {
            if (value.kit_name === drumkitName) {
                //Allow trackName like KICK_01
                if (trackName.toUpperCase().trim().includes(value.key.toUpperCase().trim())) {
                    //console.log("getSoundIdFromKitAndTrackname match for track:", trackName, " kit:", drumkitName, " key:", sound.key)
                    ret = key
                    return ret
                }
            }
        }
        // if (ret === NOT_FOUND) {
        //     console.warn("getSoundIdFromKitAndTrackname No match for track:", trackName, " kit:", this.getKitAsText(drumkitName))
        // }
        return ret
    }

    getSoundIdFromTrackname = (trackName) => {
        let ret = NOT_FOUND
        for (const [key, sound] of Object.entries(this._soundRegistry.sounds)) {
            // console.log("getSoundIdFromAnyKitAndTrackname test for track:", trackName.toUpperCase(), " sound:", sound.key, " url:", sound.url)  
            if (trackName.toUpperCase().trim().includes(sound.key.toUpperCase().trim())) {
               // console.log("getSoundIdFromAnyKitAndTrackname match for track:", trackName.toUpperCase(),  " sound:", sound.url)
                ret = key
                return ret
            }
        }
        // if (ret === NOT_FOUND) {
        //     console.warn("getSoundIdFromAnyKitAndTrackname No match for track:", trackName)
        // }
        return ret
    }



    getKitAsText = (drumkitName) => {
        const debugtxt = Object.values(this._soundRegistry.sounds)
            .filter(sound => sound && sound.kit_name === drumkitName)
            .map(sound => `${sound.key}`)
            .join(",");

        return ` <${drumkitName} : ${debugtxt}> `;
    }



}
