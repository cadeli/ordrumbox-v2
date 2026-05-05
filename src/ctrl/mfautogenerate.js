import { MfGlobals } from '../mfglobals.js'
import MfAutoCompose from './mfautocompose.js'

const AUTO_GENERATE_STYLES = ["funk", "trib", "blues", "boogie", "bossa", "chacha", "disco", "electro",
    "jazz", "march", "tango", "paso", "Charleston", "pop", "reggae", "rock", "rnb",
    "samba", "shuffle", "ska", "slow", "swing", "twist", "waltz"]

const CORE_TRACK_TYPES = ["KICK", "SNARE", "CHH", "OHH"]
const OPTIONAL_TRACK_TYPES = ["CLAP", "COWBELL", "TOM"]


export default class MfAutoGenerate {
    static TAG = "MFAUTOGENERATE"

    constructor() {
        this.mfAutoCompose = new MfAutoCompose()
        this.trackLibIndex = new Map()
        this.isTrackLibLoading = false
        this.isScalesLoading = false
    }


    loadTrackLib = () => {
        if (this.isTrackLibLoading || !MfGlobals.mfResourcesLoader) {
            return
        }
        console.log("MfAutoGenerate::loadTrackLib")
        this.isTrackLibLoading = true
        MfGlobals.mfResourcesLoader.loadTrackLib(MfGlobals.urltracklib, this.loadScales)
    }

    loadScales = () => {
        this.isTrackLibLoading = false
        this.rebuildTrackLibIndex()
        if (this.isScalesLoading || !MfGlobals.mfResourcesLoader) {
            return
        }
        this.isScalesLoading = true
        console.log("MfAutoGenerate::loadScales")
        console.log("trackLib")
        console.log(MfGlobals.trackLib)
        //
        MfGlobals.trackLib.forEach(track => {
            console.log("MfAutoGenerate::loadScales track :", track?.tags?.style)
        });
        //
        MfGlobals.mfResourcesLoader.loadScales(MfGlobals.urlscales, this.checkResources)
    }

    checkResources = () => {
        this.isScalesLoading = false
        console.log("MfAutoGenerate::checkResources")
        console.log("scales")
        console.log(MfGlobals.scales)
    }

    getCurrentPattern = () => {
        return MfGlobals.patterns?.[MfGlobals.selectedPatternNum] ?? null
    }

    ensureTrackLibReady = () => {
        if (MfGlobals.trackLib.length <= 0) {
            this.loadTrackLib()
            return false
        }
        if (this.trackLibIndex.size === 0) {
            this.rebuildTrackLibIndex()
        }
        return true
    }

    rebuildTrackLibIndex = () => {
        this.trackLibIndex.clear()
        MfGlobals.trackLib.forEach((track) => {
            const trackName = String(track?.name ?? '').trim().toUpperCase()
            const trackType = String(track?.tags?.type ?? '').trim().toLowerCase()
            const trackStyle = String(track?.tags?.style ?? '').trim().toLowerCase()
            if (!trackName || !trackType) {
                return
            }
            const exactKey = this.getTrackLibKey(trackStyle, trackName, trackType)
            const fallbackKey = this.getTrackLibKey('*', trackName, trackType)

            if (!this.trackLibIndex.has(exactKey)) {
                this.trackLibIndex.set(exactKey, [])
            }
            this.trackLibIndex.get(exactKey).push(track)

            if (!this.trackLibIndex.has(fallbackKey)) {
                this.trackLibIndex.set(fallbackKey, [])
            }
            this.trackLibIndex.get(fallbackKey).push(track)
        })
    }

    getTrackLibKey = (style, inst, type) => {
        return `${String(style).trim().toLowerCase()}::${String(inst).trim().toUpperCase()}::${String(type).trim().toLowerCase()}`
    }

    pickRandomTrackFromKey = (key) => {
        const tracks = this.trackLibIndex.get(key) ?? []
        if (tracks.length === 0) {
            return null
        }
        return this.cloneTrackTemplate(tracks[Math.floor(Math.random() * tracks.length)])
    }

    cloneTrackTemplate = (track) => {
        return track ? JSON.parse(JSON.stringify(track)) : null
    }

    refreshPatternState = async (pattern, displayBars = 1) => {
        if (!pattern) {
            return
        }
        const mfAutoAssign = await MfGlobals.getAutoAssign()
        mfAutoAssign.autoAssignSounds(pattern)
        MfGlobals.mfPatterns.computeFlatNotesFromPattern(pattern)
        MfGlobals.mfUpdates.updatePatternView(pattern, displayBars)
    }

    generateTrack = async (style, track) => {
        console.log("MFAUTOGENERATE::generateTrack")
        if (!track) {
            return
        }
        if (!this.ensureTrackLibReady()) {
            return
        }
        let pattern = this.getCurrentPattern()
        if (!pattern) {
            return
        }
        let newTrack = this.getRndTrackNoStyle(track.name, "default") //ATT no styles
        if (!newTrack) {
            newTrack = MfGlobals.mfCmd.createTrack(pattern.nbBars, track.name)
            this.generateNewBass(pattern, newTrack)
        }
        track.notes = Array.isArray(newTrack.notes) ? [...newTrack.notes] : []
        track.loopAtStep = Number(newTrack.loopAtStep ?? track.loopAtStep ?? 0)
        this.replaceTrack(pattern, track)
        track.loopPointBar = Math.floor(track.loopAtStep / track.stepsPerBar)
        track.loopPointStep = track.loopAtStep % track.stepsPerBar
        await this.refreshPatternState(pattern, 1)

    }

    //TODO style as parameter
    generatePattern = async () => {
        console.log("MFAUTOGENERATE::generatePattern")
        if (!this.ensureTrackLibReady()) {
            return
        }

        let pattern = this.getCurrentPattern()
        if (!pattern) {
            return
        }
        MfGlobals.mfCmd.cleanPattern(pattern)

        let style = AUTO_GENERATE_STYLES[Math.floor(Math.random() * AUTO_GENERATE_STYLES.length)]

        CORE_TRACK_TYPES.forEach((trackName) => {
            const generatedTrack = this.getRndTrack(style, trackName, "default")
            this.replaceTrack(pattern, generatedTrack)
        })

        let track = this.getRndTrack(style, "CRASH", "default")
        if (track != null) {
            if (track.notes.length < 3 && track.loopAtStep == 16) {
                this.replaceTrack(pattern, track)
            } else {
                track.name = "OHH"
                this.replaceTrack(pattern, track)
            }
        }

        const optionalTrackType = OPTIONAL_TRACK_TYPES[Math.floor(Math.random() * OPTIONAL_TRACK_TYPES.length)]
        track = this.getRndTrack(style, optionalTrackType, "default")
        this.replaceTrack(pattern, track)

        this.optimizeHH(pattern)
        MfGlobals.patterns[MfGlobals.selectedPatternNum] = pattern
        await this.refreshPatternState(MfGlobals.patterns[MfGlobals.selectedPatternNum], 1)
    }

    optimizeHH = (pattern) => {
        let trackCHH = MfGlobals.mfCmd.getTrackFromType(pattern, "CHH")
        let trackOHH = MfGlobals.mfCmd.getTrackFromType(pattern, "OHH")
        if (!trackCHH) return
        if (!trackOHH) return
        
        Object.values(trackCHH.notes).forEach((note) => {
            let step = note.stepInBar
            let bar = note.bar
            let notes = MfGlobals.mfCmd.isNoteAt(trackOHH, bar, step)
            if (notes.length > 0) {
                MfGlobals.mfCmd.deleteNote(trackOHH, notes[0])
            }
        })
    }

    replaceTrack = (mfPattern, newTrack) => {
        if (newTrack == null) { return }
        Object.values(mfPattern.tracks).forEach((track) => {
            if (track.name === newTrack.name) {
                let newTrackCopy = this.cloneTrackTemplate(newTrack)
                Object.assign(track, newTrackCopy)
            }
        })
    }

    getRndTrack = (style, inst, type) => {
        if (!this.ensureTrackLibReady()) {
            return null
        }
        const exactKey = this.getTrackLibKey(style, inst, type)
        const track = this.pickRandomTrackFromKey(exactKey)
        if (track) {
            return track
        }
        console.log("mfAutogenerate::getRndTrack  no track =" + style + "=" + inst + " in trackLib")
        return this.getRndTrackNoStyle(inst, type)
    }

    getRndTrackNoStyle = (inst, type) => {
        if (!this.ensureTrackLibReady()) {
            return null
        }
        const fallbackKey = this.getTrackLibKey('*', inst, type)
        const track = this.pickRandomTrackFromKey(fallbackKey)
        if (track) {
            return track
        }
        console.error("mfAutogenerate::getRndTrackNoStyle no track any type =" + type + " inst=" + inst + " in trackLib")
        return null
    }

    generateNewBass = (pattern, bassTrack, variantName = null) => {
        return this.mfAutoCompose.generateNewBass(pattern, bassTrack, variantName)
    }


}
