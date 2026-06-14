import { appState } from '../../state/app_state.js'
import { getAutoAssignService, serviceRegistry } from '../../state/service_registry.js'
import MfBassGenerate from './bass_generate.js'
import MfHatGenerate from './hat_generate.js'
import MfKickGenerate from './kick_generate.js'
import MfPercGenerate from './perc_generate.js'
import MfSnareGenerate from './snare_generate.js'
import MfStructureSong from './structure_song.js'

export default class MfAutoGenerate {
    static TAG = "MFAUTOGENERATE"

    constructor() {
        this.kickGen = new MfKickGenerate()
        this.snareGen = new MfSnareGenerate()
        this.hatGen = new MfHatGenerate()
        this.percGen = new MfPercGenerate()
        this.bassGen = new MfBassGenerate()
        this.structureGen = new MfStructureSong()
    }

    generatePattern = async (options = {}) => {
        let pattern = appState.patterns[appState.selectedPatternNum]
        if (!pattern) {
            pattern = serviceRegistry.mfCmd.addPattern("Generated")
        }

        const genre = options.genre || this.structureGen.getRandomGenre()
        const structure = options.structure || this.structureGen.generateStructure(genre)

        if (!pattern.tracks || pattern.tracks.length === 0) {
            for (const [trackName, config] of Object.entries(structure)) {
                const track = serviceRegistry.mfCmd.addTrack(pattern, trackName)
                await this.generateTrack(track, config)
            }
        } else {
            for (const track of pattern.tracks) {
                const type = this.detectTrackType(track.name)

                let config = null
                for (const [name, cfg] of Object.entries(structure)) {
                    if (this.detectTrackType(name) === type) {
                        config = cfg
                        break
                    }
                }

                if (config) {
                    track.notes = []
                    await this.generateTrack(track, config)
                }
            }
        }

        const mfAutoAssign = await getAutoAssignService()
        await mfAutoAssign.autoAssignSounds(pattern)
        serviceRegistry.mfPatterns.computeFlatNotesFromPattern(pattern)
        
        return pattern
    }

    generateTrack = async (track, config) => {
        const type = this.detectTrackType(track.name)
        switch (type) {
            case 'KICK':
                await this.kickGen.generateNewKick(track, config)
                break
            case 'SNARE':
                await this.snareGen.generateNewSnare(track, config)
                break
            case 'HAT':
                await this.hatGen.generateNewHat(track, config)
                break
            case 'PERC':
                await this.percGen.generateNewPerc(track, config)
                break
            case 'BASS':
                await this.bassGen.generateNewBass(track, config)
                break
        }
    }

    detectTrackType = (name) => {
        const n = name.toUpperCase()
        if (n.includes('KICK') || n.includes('BD')) return 'KICK'
        if (n.includes('SNARE') || n.includes('SD')) return 'SNARE'
        if (n.includes('HAT') || n.includes('CHH') || n.includes('OHH')) return 'HAT'
        if (n.includes('BASS') || n.includes('SYNTH')) return 'BASS'
        return 'PERC'
    }

    changeTrack = async (loop, pattern, track) => {
        const genre = this.structureGen.getRandomGenre()
        const structure = this.structureGen.generateStructure(genre)
        
        // Find configuration for this track type in the generated structure
        const type = this.detectTrackType(track.name)
        let config = null
        
        for (const [name, cfg] of Object.entries(structure)) {
            if (this.detectTrackType(name) === type) {
                config = cfg
                break
            }
        }

        if (config) {
            track.notes = []
            await this.generateTrack(track, config)
            serviceRegistry.mfPatterns.computeFlatNotesFromPattern(pattern)
        }
    }
}
