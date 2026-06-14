import { appState } from '../../state/app_state.js'
import { getAutoAssignService, serviceRegistry } from '../../state/service_registry.js'
import Utils from '../../core/utils.js'
import MfBassGenerate from './bass_generate.js'
import MfHatGenerate from './hat_generate.js'
import MfKickGenerate from './kick_generate.js'
import MfPercGenerate from './perc_generate.js'
import MfSnareGenerate from './snare_generate.js'
import MfStructureSong from './structure_song.js'

const SECTION_DENSITY = Object.freeze({
    intro: 0.4,
    verse: 0.7,
    chorus: 1.0,
    break: 0.2,
    bridge: 0.6,
    outro: 0.3
})

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
                const type = Utils.detectTrackType(track.name)

                let config = null
                for (const [name, cfg] of Object.entries(structure)) {
                    if (Utils.detectTrackType(name) === type) {
                        config = cfg
                        break
                    }
                }

                if (config) {
                    await this.generateTrack(track, config)
                }
            }
        }

        const hasBassTrack = pattern.tracks.some(t => Utils.detectTrackType(t.name) === 'BASS')
        if (!hasBassTrack) {
            const bassTrack = serviceRegistry.mfCmd.addTrack(pattern, 'BASS')
            bassTrack.useSoftSynth = true
            bassTrack.useAutoAssignSound = false
            bassTrack.synthSoundKey = 'BASS1'
            bassTrack.velocity = 0.5
        }

        const mfAutoAssign = await getAutoAssignService()
        await mfAutoAssign.autoAssignSounds(pattern)
        serviceRegistry.mfPatterns.computeFlatNotesFromPattern(pattern)
        
        return pattern
    }

    generateTrack = async (track, config, density = 1) => {
        const type = Utils.detectTrackType(track.name)
        switch (type) {
            case 'KICK':
                await this.kickGen.generateNewKick(track, config, density)
                break
            case 'SNARE':
                await this.snareGen.generateNewSnare(track, config, density)
                break
            case 'HAT':
                await this.hatGen.generateNewHat(track, config, density)
                break
            case 'PERC':
            case 'PIANO':
                await this.percGen.generateNewPerc(track, config, density)
                break
            case 'BASS':
                await this.bassGen.generateNewBass(track, config, density)
                break
        }
    }

    changeTrack = async (loop, pattern, track) => {
        const genre = pattern._autoGenGenre || this.structureGen.getRandomGenre()
        const element = this.structureGen.getElement(loop)
        const isSectionEnd = element.isLastLoopBeforeChange
        const density = isSectionEnd ? 0.2 : (SECTION_DENSITY[element.name] ?? 0.7)

        const structure = this._cachedGenre === genre
            ? this._cachedStructure
            : (this._cachedGenre = genre, this._cachedStructure = this.structureGen.generateStructure(genre))

        const type = Utils.detectTrackType(track.name)
        let config = null

        for (const [name, cfg] of Object.entries(structure)) {
            if (Utils.detectTrackType(name) === type) {
                config = cfg
                break
            }
        }

        if (config) {
            if (isSectionEnd) {
                const savedNotes = [...track.notes]
                await this.generateTrack(track, config, density)
                const seen = new Set(savedNotes.map(n => `${n.bar}:${n.barStep}`))
                for (const note of track.notes) {
                    const key = `${note.bar}:${note.barStep}`
                    if (!seen.has(key)) {
                        savedNotes.push(note)
                    }
                }
                track.notes = savedNotes
            } else {
                track.notes = []
                await this.generateTrack(track, config, density)
            }
            serviceRegistry.mfPatterns.computeFlatNotesFromPattern(pattern)
        }
    }
}
