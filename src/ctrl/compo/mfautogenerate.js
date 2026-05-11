import { MfGlobals } from '../../mfglobals.js'
import MfBassGenerate from './mfbassgenerate.js'
import MfHatGenerate from './mfhatgenerate.js'
import MfKickGenerate from './mfkickgenerate.js'
import MfPercGenerate from './mfpercgenerate.js'
import MfSnareGenerate from './mfsnaregenerate.js'
import MfStructureSong from './mfstructuresong.js'

export default class MfAutoGenerate {
    static TAG = "MFAUTOGENERATE"

    constructor() {
        this.mfStructureSong = new MfStructureSong()
        this.mfBassGenerate = new MfBassGenerate()
        this.mfHatGenerate = new MfHatGenerate()
        this.mfKickGenerate = new MfKickGenerate()
        this.mfPercGenerate = new MfPercGenerate()
        this.mfSnareGenerate = new MfSnareGenerate()
        this.currentStructureElement = null
    }

    generatePattern = (pattern = MfGlobals.patterns[MfGlobals.selectedPatternNum]) => {
        if (!pattern) { return null }

        Object.values(pattern.tracks ?? []).forEach((track) => {
            if (track.auto === true) {
                this.changeTrack(0, pattern, track)
            }
        })
        this.refreshPattern(pattern)
        return pattern
    }

    changeTrack = (loop, pattern, track) => {
        const isInvalid = !pattern || !track || track.auto !== true;
        const structureElement = !isInvalid ? this.mfStructureSong.getElement(loop) : null;

        const shouldChange = structureElement && (
            structureElement.loopInElement === 0 ||
            (this.isSnareTrack(track)  && structureElement.isLastLoopBeforeChange)
        );
        const { name: strucElName, isLastLoopBeforeChange, loopInElement } = structureElement;
        const strucElSubName = isLastLoopBeforeChange ? "lastLoopBeforeChange" : "none";
        console.log("MfAutoGenerate::changeTrack ", strucElName, "-", strucElSubName, "-", loopInElement);

        if (shouldChange) {
            const { name: strucElName, isLastLoopBeforeChange, loopInElement } = structureElement;
            const strucElSubName = isLastLoopBeforeChange ? "lastLoopBeforeChange" : "none";

            MfGlobals.mfCmd.cleanTrack(track);
            this.currentStructureElement = structureElement;

            this.executeGenerator(track, strucElName, strucElSubName, loop);
        }

        this.refreshPattern(pattern);
        return track;
    }

    executeGenerator(track, strucElName, strucElSubName, loop) {
        if (this.isPercTrack(track)) {
            return this.mfPercGenerate.generateNewPerc(track, strucElName, strucElSubName);
        }
        if (this.isBassTrack(track)) {
            return this.mfBassGenerate.generateNewBass(track, strucElName, strucElSubName);
        }
        if (this.isKickTrack(track)) {
            return this.mfKickGenerate.generateNewKick(track, strucElName, strucElSubName);
        }
        if (this.isSnareTrack(track)) {
            return this.mfSnareGenerate.generateNewSnare(track, strucElName, strucElSubName);
        }
        if (this.isHatTrack(track)) {
            return this.mfHatGenerate.generateNewHat(track, strucElName, strucElSubName);
        }
        this.generateRandomFill(track, loop);
    }

    generateRandomFill(track, loop) {
        for (let bar = 0; bar < track.bars; bar++) {
            for (let step = 0; step < track.barQuantize; step++) {
                if (Math.random() < 0.10) {
                    this.createNote(track, bar, step, loop);
                }
            }
        }
    }

    createNote = (track, bar, barStep, loop) => {
        const existingNotes = MfGlobals.mfCmd.isNoteAt(track, bar, barStep)
        if (existingNotes.length > 0) {
            return existingNotes[0]
        }

        const accent = (barStep === 0)
        const note = MfGlobals.mfCmd.addNote(track, bar, barStep)
        note.velocity = accent ? 1 : 0.55
        if (Math.random() < 0.60) {
            note.triggerFreq = this.getRandomInt(2, 5)
            // note.triggerPhase = this.getRandomInt(0, note.triggerFreq - 1)
        } else if (Math.random() < 0.05) {
            note.retriggerStep = this.getRandomInt(2, 4)
            note.retriggerNum = this.getRandomInt(4, 8)
            note.arp = {
                mode: 'up',
                intervals: [0]
            }
        }
        return note
    }

    getRandomInt = (min, max) => {
        return Math.floor(Math.random() * (max - min + 1)) + min
    }

    isBassTrack = (track) => {
        return String(track?.name ?? '').toUpperCase().includes('BASS')
    }

    isKickTrack = (track) => {
        const trackName = String(track?.name ?? '').toUpperCase()
        return trackName.includes('KICK') || trackName === 'BD'
    }

    isSnareTrack = (track) => {
        return String(track?.name ?? '').toUpperCase().includes('SNARE')
    }

    isHatTrack = (track) => {
        const trackName = String(track?.name ?? '').toUpperCase()
        return trackName.includes('CHH') || trackName.includes('OHH') || trackName.includes('HAT')
    }

    isPercTrack = (track) => {
        const trackName = String(track?.name ?? '').toUpperCase()
        return trackName.includes('TOM')
            || trackName.includes('CONG')
            || trackName.includes('BONGO')
            || trackName.includes('TIMBAL')
    }



    refreshPattern = async (pattern) => {
        const mfAutoAssign = await MfGlobals.getAutoAssign()
        mfAutoAssign.autoAssignSounds(pattern)
        MfGlobals.mfPatterns?.computeFlatNotesFromPattern(pattern)
        MfGlobals.mfUpdates?.updatePatternView(pattern, MfGlobals.displayBars)
    }
}
