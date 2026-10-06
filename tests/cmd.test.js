import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { appState } from '../src/state/app_state.js'
import { soundRegistry } from '../src/state/sound_registry.js'
import { serviceRegistry } from '../src/state/service_registry.js'
import Commander from '../src/logic/commands/cmd.js'
import { getPanFromTrackName } from '../src/core/drum_taxonomy.js'
import { isNoteAt, kitIsLoaded, getTrackFromType, getAllSoundsForType } from './helpers/cmd_test_helpers.js'
import { makePattern } from './helpers/make_pattern.js'
import HistoryManager from '../src/logic/history_manager.js'
import { resetUserErrorReports } from '../src/core/notify.js'

describe('Functional: Commander operations', () => {
    let cmd

    beforeEach(() => {
        appState.reset()
        soundRegistry.reset()
        serviceRegistry.reset()
        cmd = new Commander()
        serviceRegistry.cmd = cmd
    })

    describe('Pattern CRUD', () => {
        it('createPattern produces correct defaults', () => {
            const pattern = cmd.addPattern('Test')

            expect(pattern.name).toBe('Test')
            expect(pattern.bpm).toBe(120)
            expect(pattern.beatCount).toBe(4)
            expect(pattern.tracks).toEqual([])
            expect(pattern.description).toBe('')
        })

        it('auto-generates name when null', () => {
            appState.patterns = [makePattern({ name: 'a' }), makePattern({ name: 'b' })]
            const pattern = cmd.addPattern(null)

            expect(pattern.name).toBe('NewPat_2')
        })

        it('setPatternBpm updates correctly', () => {
            const pattern = cmd.addPattern('Test')
            cmd.setPatternBpm(pattern, 140)

            expect(pattern.bpm).toBe(140)
        })

        it('getPatternByName finds by name case-insensitive', () => {
            cmd.addPattern('TestPat')
            expect(cmd.getPatternByName('testpat')).toBeTruthy()
            expect(cmd.getPatternByName('TESTPAT')).toBeTruthy()
            expect(cmd.getPatternByName('noname')).toBeNull()
        })

        it('setPatternDescription sets description', () => {
            const pattern = cmd.addPattern('Test')
            cmd.setPatternDescription(pattern, 'my desc')
            expect(pattern.description).toBe('my desc')
        })

        it('setPatternDescription handles null pattern', () => {
            expect(() => cmd.setPatternDescription(null, 'x')).toThrow()
        })

        it('setPatternBpm with invalid value uses default', () => {
            const pattern = cmd.addPattern('Test')
            cmd.setPatternBpm(pattern, 0)
            expect(pattern.bpm).toBe(120)
        })

        // The library entry itself is a command too: undo has to take the
        // pattern out of the library, not only revert what happened inside it
        // (see tests/undo_roundtrip.test.js for everything below that level).
        it('undo removes the pattern it added to the library', () => {
            const history = new HistoryManager(50)
            serviceRegistry.history = history
            expect(appState.patterns).toHaveLength(0)
            cmd.addPattern('UndoMe')
            expect(appState.patterns).toHaveLength(1)

            history.undo()
            expect(appState.patterns).toHaveLength(0)

            history.redo()
            expect(appState.patterns).toHaveLength(1)
        })
    })

    describe('Track operations', () => {
        it('createTrack produces correct default structure', () => {
            const track = cmd.createTrack(4, 'KICK', 4)

            expect(track.name).toBe('KICK')
            expect(track.beatCount).toBe(4)
            expect(track.stepsPerBeat).toBe(4)
            expect(track.loopAtStep).toBe(16)
            expect(track.notes).toEqual([])
            expect(track.mute).toBe(false)
            expect(track.solo).toBe(false)
        })

        it('addNote produces correct default note structure', () => {
            const track = cmd.createTrack(4, 'KICK', 4)
            const note = cmd.addNote(track, 1, 2, 5)

            expect(note.beat).toBe(1)
            expect(note.beatStep).toBe(2)
            expect(note.pitch).toBe(5)
            expect(note.velocity).toBe(0.8)
            expect(note.steppc).toBe(50)
            expect(note.every).toBe(1)
            expect(note.pos).toBe(0)
            expect(note.retriggerCount).toBe(1)
            expect(note.euclideanFill).toBe(0)
        })

        it('deleteNote removes correct note', () => {
            const track = cmd.createTrack(4, 'KICK', 4)
            cmd.addNote(track, 0, 0)
            cmd.addNote(track, 1, 0)
            cmd.addNote(track, 2, 0)

            cmd.deleteNote(track, { beat: 1, beatStep: 0, pitch: 0 })

            expect(track.notes.length).toBe(2)
            expect(isNoteAt(track, 1, 0).length).toBe(0)
            expect(isNoteAt(track, 0, 0).length).toBe(1)
            expect(isNoteAt(track, 2, 0).length).toBe(1)
        })

        it('isNoteAt returns array of notes at position', () => {
            const track = cmd.createTrack(4, 'KICK', 4)
            cmd.addNote(track, 0, 0)
            cmd.addNote(track, 0, 0)

            expect(isNoteAt(track, 0, 0).length).toBe(2)
            expect(isNoteAt(track, 99, 99).length).toBe(0)
        })

        it('updateTrack applies whitelisted properties only', () => {
            const track = cmd.createTrack(4, 'KICK', 4)
            cmd.updateTrack(track, { beatCount: 8, mute: true, unknownProp: 'test' })

            expect(track.beatCount).toBe(8)
            expect(track.mute).toBe(true)
            expect(track.unknownProp).toBeUndefined()
        })

        it('cleanTrack removes all notes and resets loop', () => {
            const track = cmd.createTrack(4, 'KICK', 4)
            cmd.addNote(track, 0, 0)
            track.loopAtStep = 2 * (track.stepsPerBeat ?? 4)
            track.loopAtStep = 10

            cmd.cleanTrack(track)

            expect(track.notes).toEqual([])
            expect(track.loopAtStep).toBe(16)
        })

        it('copies all known properties via updateTrack', () => {
            const track = cmd.createTrack(4, 'KICK', 4)
            const source = {
                sampleId: 'snd_1',
                beatCount: 8,
                stepsPerBeat: 8,
                loopAtStep: 32,
                swingResolution: 2,
                swingAmount: 0.3,
                velocity: 0.9,
                pitch: 5,
                pan: -0.5,
                solo: true,
                mute: true,
                auto: true,
                useSoftSynth: true,
                filterType: 'lowpass',
                filterFreq: 5000,
                filterQ: 2.5,
                reverbType: 'room',
                reverbAmount: 0.4,
                delayType: 'digital',
                delayTime: 2,
                delayDepth: 0.3,
                fxSelected: 'delay',
                saturationType: 'hard',
                saturationAmount: 0.5,
                synthSoundKey: 'saw',
            }
            cmd.updateTrack(track, source)

            expect(track.sampleId).toBe('snd_1')
            expect(track.beatCount).toBe(8)
            expect(track.stepsPerBeat).toBe(8)
            expect(track.loopAtStep).toBe(32)
            expect(track.swingResolution).toBe(2)
            expect(track.swingAmount).toBe(0.3)
            expect(track.velocity).toBe(0.9)
            expect(track.pitch).toBe(5)
            expect(track.pan).toBe(-0.5)
            expect(track.solo).toBe(true)
            expect(track.mute).toBe(true)
            expect(track.auto).toBe(true)
            expect(track.useSoftSynth).toBe(true)
            expect(track.filterType).toBe('lowpass')
            expect(track.filterFreq).toBe(5000)
            expect(track.filterQ).toBe(2.5)
            expect(track.reverbType).toBe('room')
            expect(track.reverbAmount).toBe(0.4)
            expect(track.delayType).toBe('digital')
            expect(track.delayTime).toBe(2)
            expect(track.delayDepth).toBe(0.3)
            expect(track.fxSelected).toBe('delay')
            expect(track.saturationType).toBe('hard')
            expect(track.saturationAmount).toBe(0.5)
            expect(track.synthSoundKey).toBe('saw')
        })

        it('keeps loopAtStep as written, whatever the subdivision', () => {
            const track = cmd.createTrack(4, 'KICK', 4)
            cmd.updateTrack(track, { loopAtStep: 10 })
            expect(track.loopAtStep).toBe(10)
        })

        it('updateTrack returns track unchanged for null updates', () => {
            const track = cmd.createTrack(4, 'KICK', 4)
            expect(cmd.updateTrack(track, null)).toBe(track)
            expect(cmd.updateTrack(track, undefined)).toBe(track)
        })

        it('updateTrack returns track unchanged for non-object updates', () => {
            const track = cmd.createTrack(4, 'KICK', 4)
            expect(cmd.updateTrack(track, 42)).toBe(track)
        })

        it('does not touch loopAtStep when only stepsPerBeat changes', () => {
            const track = cmd.createTrack(4, 'KICK', 4)
            cmd.updateTrack(track, { stepsPerBeat: 8, loopAtStep: 20 })
            expect(track.loopAtStep).toBe(20)
        })

        it('caps stepsPerBeat at 8 when steppc exceeds 100', () => {
            const track = cmd.createTrack(4, 'KICK', 4)
            track.stepsPerBeat = 9
            const note = cmd.addNote(track, 0, 5)
            expect(track.stepsPerBeat).toBe(8)
            expect(note.steppc).toBe(63)
        })
    })

    describe('Note property updates', () => {
        it('can set note properties directly', () => {
            const track = cmd.createTrack(4, 'KICK', 4)
            const note = cmd.addNote(track, 0, 0)
            note.beatStep = 2
            note.beat = 1
            note.velocity = 0.5
            note.pan = -0.3
            note.pitch = 7
            note.arp = [0, 12]
            note.every = 2
            note.pos = 1
            note.prob = 0.8
            note.arpTriggerProbability = 0.9
            note.retriggerCount = 3
            note.rate = 2
            note.euclideanFill = 2

            expect(note.beatStep).toBe(2)
            expect(note.beat).toBe(1)
            expect(note.velocity).toBe(0.5)
            expect(note.pan).toBe(-0.3)
            expect(note.pitch).toBe(7)
            expect(note.arp).toEqual([0, 12])
            expect(note.every).toBe(2)
            expect(note.pos).toBe(1)
            expect(note.prob).toBe(0.8)
            expect(note.arpTriggerProbability).toBe(0.9)
            expect(note.retriggerCount).toBe(3)
            expect(note.rate).toBe(2)
            expect(note.euclideanFill).toBe(2)
        })
    })

    describe('Pan from track name', () => {
        it('returns correct pan values', () => {
            expect(getPanFromTrackName('KICK')).toBe(0)
            expect(getPanFromTrackName('SNARE')).toBe(0.3)
            expect(getPanFromTrackName('CHH')).toBe(-0.3)
            expect(getPanFromTrackName('CRASH')).toBe(1)
            expect(getPanFromTrackName('UNKNOWN')).toBe(0)
        })
    })

    describe('Loop point increment', () => {
        it('decrements loopAtStep with wrap-around', () => {
            const track = cmd.createTrack(4, 'KICK', 4)
            track.loopAtStep = 16

            cmd.decrLoopPoint(track)
            expect(track.loopAtStep).toBe(15)

            for (let i = 0; i < 15; i++) {
                cmd.decrLoopPoint(track)
            }
            expect(track.loopAtStep).toBe(16)
        })
    })

    describe('Steps-per-beat quantize cycle', () => {
        it('incrStepsPerBeat changes stepsPerBeat', () => {
            const track = cmd.createTrack(4, 'KICK', 4)
            const note = cmd.addNote(track, 0, 2)
            note.steppc = 50

            const original = track.stepsPerBeat
            cmd.incrStepsPerBeat(track)
            expect(track.stepsPerBeat).not.toBe(original)
        })

        it('roundtrips notes through 8→4→8 stepsPerBeat changes', () => {
            const track = cmd.createTrack(4, 'KICK', 8)
            cmd.addNote(track, 0, 0)
            cmd.addNote(track, 0, 4)
            cmd.addNote(track, 1, 2)
            cmd.addNote(track, 2, 6)

            const origBeats = track.notes.map((n) => n.beat)
            const origSteps = track.notes.map((n) => n.beatStep)

            track.stepsPerBeat = 4
            track.notes.forEach((note) => {
                note.beatStep = Math.min(Math.round((note.steppc / 100) * 4), 3)
            })

            expect(track.notes.map((n) => n.beatStep)).toEqual([0, 2, 1, 3])
            track.notes.forEach((note, i) => {
                expect(note.beat).toBe(origBeats[i])
            })

            track.stepsPerBeat = 8
            track.notes.forEach((note) => {
                note.beatStep = Math.min(Math.round((note.steppc / 100) * 8), 7)
            })

            track.notes.forEach((note, i) => {
                expect(note.beat).toBe(origBeats[i])
                expect(note.beatStep).toBe(origSteps[i])
            })
        })

        it('roundtrips notes through 8→1→8 stepsPerBeat changes via steppc', () => {
            const track = cmd.createTrack(4, 'KICK', 8)
            cmd.addNote(track, 0, 0)
            cmd.addNote(track, 0, 3)
            cmd.addNote(track, 0, 4)
            cmd.addNote(track, 1, 6)

            const origBeats = track.notes.map((n) => n.beat)
            const origSteps = track.notes.map((n) => n.beatStep)

            track.stepsPerBeat = 1
            track.notes.forEach((note) => {
                note.beatStep = Math.min(Math.round((note.steppc / 100) * 1), 0)
            })

            track.stepsPerBeat = 8
            track.notes.forEach((note) => {
                note.beatStep = Math.min(Math.round((note.steppc / 100) * 8), 7)
            })

            track.notes.forEach((note, i) => {
                expect(note.beat).toBe(origBeats[i])
                expect(note.beatStep).toBe(origSteps[i])
            })
        })

        it('roundtrips notes through 6→2→6 stepsPerBeat changes via steppc', () => {
            const track = cmd.createTrack(4, 'KICK', 6)
            cmd.addNote(track, 0, 0)
            cmd.addNote(track, 0, 1)
            cmd.addNote(track, 0, 2)
            cmd.addNote(track, 0, 3)
            cmd.addNote(track, 0, 4)
            cmd.addNote(track, 0, 5)
            cmd.addNote(track, 1, 3)
            cmd.addNote(track, 2, 5)

            const origBeats = track.notes.map((n) => n.beat)
            const origSteps = track.notes.map((n) => n.beatStep)

            track.stepsPerBeat = 2
            track.notes.forEach((note) => {
                note.beatStep = Math.min(Math.round((note.steppc / 100) * 2), 1)
            })

            track.stepsPerBeat = 6
            track.notes.forEach((note) => {
                note.beatStep = Math.min(Math.round((note.steppc / 100) * 6), 5)
            })

            track.notes.forEach((note, i) => {
                expect(note.beat).toBe(origBeats[i])
                expect(note.beatStep).toBe(origSteps[i])
            })
        })

        it('maps note to correct step on downsample via steppc (8→4)', () => {
            const track = cmd.createTrack(4, 'KICK', 8)
            cmd.addNote(track, 0, 7)

            track.stepsPerBeat = 4
            track.notes.forEach((note) => {
                note.beatStep = Math.min(Math.round((note.steppc / 100) * 4), 3)
            })

            expect(track.notes[0].beat).toBe(0)
            expect(track.notes[0].beatStep).toBe(3)
        })

        it('preserves all notes through 4→1→4 via steppc', () => {
            const track = cmd.createTrack(4, 'KICK', 4)
            cmd.addNote(track, 0, 0)
            cmd.addNote(track, 0, 1)
            cmd.addNote(track, 0, 2)
            cmd.addNote(track, 0, 3)

            const origSteps = track.notes.map((n) => n.beatStep)

            track.stepsPerBeat = 1
            track.notes.forEach((note) => {
                note.beatStep = Math.min(Math.round((note.steppc / 100) * 1), 0)
            })

            track.stepsPerBeat = 4
            track.notes.forEach((note) => {
                note.beatStep = Math.min(Math.round((note.steppc / 100) * 4), 3)
            })

            track.notes.forEach((note, i) => {
                expect(note.beatStep).toBe(origSteps[i])
            })
        })
    })

    describe('getTrackFromType', () => {
        it('finds track by name in pattern', () => {
            const pattern = cmd.addPattern('Test')
            cmd.addTrack(pattern, 'KICK')
            cmd.addTrack(pattern, 'SNARE')

            expect(getTrackFromType(pattern, 'KICK').name).toBe('KICK')
            expect(getTrackFromType(pattern, 'SNARE').name).toBe('SNARE')
            expect(getTrackFromType(pattern, 'MISSING')).toBeNull()
        })
    })

    describe('setPatternBeatCount', () => {
        it('changes pattern beatCount and updates tracks', () => {
            const pattern = cmd.addPattern('Test')
            cmd.addTrack(pattern, 'KICK')
            cmd.setPatternBeatCount(pattern, 8)

            expect(pattern.beatCount).toBe(8)
            expect(pattern.tracks[0].beatCount).toBe(8)
        })

        it('adjusts loopAtStep if it exceeds the new beat count', () => {
            const pattern = cmd.addPattern('Test')
            cmd.addTrack(pattern, 'KICK')
            pattern.tracks[0].loopAtStep = 32

            cmd.setPatternBeatCount(pattern, 4)
            expect(pattern.tracks[0].loopAtStep).toBe(16)
            expect(pattern.tracks[0].beatCount).toBe(4)
        })

        it('falls back to the default when out of bounds', () => {
            const pattern = cmd.addPattern('Test')
            cmd.setPatternBeatCount(pattern, 999)

            expect(pattern.beatCount).toBe(4)
        })

        it('undoes back to the previous length', () => {
            const history = new HistoryManager(50)
            serviceRegistry.history = history
            const pattern = cmd.addPattern('Test')
            const kick = cmd.addTrack(pattern, 'KICK')
            cmd.setPatternBeatCount(pattern, 12)

            history.undo()

            expect(pattern.beatCount).toBe(4)
            expect(kick.beatCount).toBe(4)
        })
    })

    describe('cleanPattern', () => {
        it('empties all tracks in pattern', () => {
            const pattern = cmd.addPattern('Test')
            const t1 = cmd.addTrack(pattern, 'KICK')
            const t2 = cmd.addTrack(pattern, 'SNARE')
            cmd.addNote(t1, 0, 0)
            cmd.addNote(t2, 0, 0)

            cmd.cleanPattern(pattern)

            expect(t1.notes).toEqual([])
            expect(t2.notes).toEqual([])
        })
    })

    describe('changeTrackSound', () => {
        it('updates sampleId and flags', () => {
            const track = cmd.createTrack(4, 'KICK', 4)
            cmd.changeTrackSound(track, 'snd_42')

            expect(track.sampleId).toBe('snd_42')
            expect(track.useAutoAssignSound).toBe(false)
            expect(track.useSoftSynth).toBe(false)
        })
    })

    describe('changeTrackName', () => {
        it('updates name', () => {
            const track = cmd.createTrack(4, 'KICK', 4)
            cmd.changeTrackName(track, 'NEWNAME')

            expect(track.name).toBe('NEWNAME')
        })
    })

    describe('getAllSoundsForType', () => {
        it('finds sounds by key', () => {
            soundRegistry.sounds = {
                s1: { key: 'kd', kitName: 'real' },
                s2: { key: 'sd', kitName: 'real' },
                s3: { key: 'kd', kitName: 'electro' },
            }

            const sounds = getAllSoundsForType('kd')
            expect(sounds.length).toBe(2)
            expect(sounds[0].kitName).toBe('real')
            expect(sounds[1].kitName).toBe('electro')
        })

        it('returns empty array when no match', () => {
            soundRegistry.sounds = { s1: { key: 'kd' } }
            expect(getAllSoundsForType('xx')).toEqual([])
        })
    })

    describe('getSampleIdFromUrl', () => {
        it('finds sampleId by url', () => {
            soundRegistry.sounds = {
                snd_1: { url: 'kits/real/kick.wav' },
                snd_2: { url: 'kits/real/snare.wav' },
            }

            expect(cmd.getSampleIdFromUrl('kits/real/kick.wav')).toBe('snd_1')
            expect(cmd.getSampleIdFromUrl('kits/real/snare.wav')).toBe('snd_2')
        })

        it('returns NOT_FOUND when no match', () => {
            soundRegistry.sounds = { snd_1: { url: 'a.wav' } }
            expect(cmd.getSampleIdFromUrl('b.wav')).toBe('NOT_FOUND')
        })
    })

    describe('kitIsLoaded', () => {
        it('returns true when kit sounds are loaded', () => {
            soundRegistry.sounds = { s1: { kitName: 'real' } }
            expect(kitIsLoaded({ name: 'real' })).toBe(true)
            expect(kitIsLoaded({ name: 'electro' })).toBe(false)
        })
    })

    // ── stable pattern ids ───────────────────────────────────────────────────────
    // Song arrangements reference patterns by id, so ids must be unique in the
    // library and must survive a rename.

    describe('Pattern ids', () => {
        it('gives a new pattern a slug id', () => {
            const p = cmd.addPattern('Rock Pattern')
            expect(p.id).toBe('rock-pattern')
        })

        it('does not reuse an id across same-named patterns', () => {
            const a = cmd.addPattern('Same')
            const b = cmd.addPattern('Same')
            expect(b.id).not.toBe(a.id)
        })

        it('keeps the id when the pattern is renamed', () => {
            const p = cmd.addPattern('Rock')
            cmd.renamePattern(appState.patterns.indexOf(p), 'Something Else')
            expect(p.id).toBe('rock')
        })

        // A clone copies every field, id included: two patterns sharing one would
        // make an arrangement reference ambiguous.
        it('refreshPatternId mints a new id for a clone', () => {
            const source = cmd.addPattern('Verse')
            const clone = cmd.addPattern('Verse copy')
            Object.assign(clone, structuredClone(source))
            clone.name = 'Verse copy'
            expect(clone.id).toBe(source.id)
            expect(cmd.refreshPatternId(clone)).not.toBe(source.id)
            expect(source.id).toBe('verse')
        })
    })

    // ── arrangement clips ────────────────────────────────────────────────────────

    describe('arrangement clips', () => {
        let history

        beforeEach(() => {
            history = new HistoryManager(50)
            serviceRegistry.history = history
        })

        const song = (clips) => {
            appState.songs = [{ id: 'demo', name: 'Demo', bpm: 120, clips }]
            appState.selectedSongIdx = 0
            return appState.songs[0]
        }

        it('addSongClip places a clip on the selected song', () => {
            song([])
            expect(cmd.addSongClip({ pattern: 'rock', startMeasure: 4, measureCount: 2 })).toBe(true)
            expect(appState.songs[0].clips).toEqual([{ pattern: 'rock', startMeasure: 4, measureCount: 2 }])
        })

        it('addSongClip coerces a bogus position and duration', () => {
            song([])
            cmd.addSongClip({ pattern: 'rock', startMeasure: -3, measureCount: 0 })
            expect(appState.songs[0].clips[0]).toEqual({ pattern: 'rock', startMeasure: 0, measureCount: 1 })
        })

        it('addSongClip does nothing without a song or a pattern', () => {
            appState.songs = []
            expect(cmd.addSongClip({ pattern: 'rock', startMeasure: 0, measureCount: 1 })).toBe(false)
            song([])
            expect(cmd.addSongClip(null)).toBe(false)
            expect(appState.songs[0].clips).toHaveLength(0)
        })

        it('addSongClip is undoable and redoable', () => {
            song([])
            cmd.addSongClip({ pattern: 'rock', startMeasure: 0, measureCount: 1 })
            history.undo()
            expect(appState.songs[0].clips).toHaveLength(0)
            history.redo()
            expect(appState.songs[0].clips).toHaveLength(1)
        })

        it('removeSongClips removes the given indices in one undo step', () => {
            song([
                { pattern: 'a', startMeasure: 0, measureCount: 1 },
                { pattern: 'b', startMeasure: 1, measureCount: 1 },
                { pattern: 'c', startMeasure: 2, measureCount: 1 },
            ])
            expect(cmd.removeSongClips([0, 2])).toBe(true)
            expect(appState.songs[0].clips.map((c) => c.pattern)).toEqual(['b'])

            history.undo()
            expect(appState.songs[0].clips.map((c) => c.pattern)).toEqual(['a', 'b', 'c'])
        })

        it('removeSongClips restores the original order on undo', () => {
            song([
                { pattern: 'a', startMeasure: 0, measureCount: 1 },
                { pattern: 'b', startMeasure: 1, measureCount: 1 },
                { pattern: 'c', startMeasure: 2, measureCount: 1 },
            ])
            cmd.removeSongClips([1])
            history.undo()
            expect(appState.songs[0].clips.map((c) => c.pattern)).toEqual(['a', 'b', 'c'])
        })

        it('removeSongClips ignores out-of-range indices', () => {
            song([{ pattern: 'a', startMeasure: 0, measureCount: 1 }])
            expect(cmd.removeSongClips([5, -1, 1.5])).toBe(false)
            expect(appState.songs[0].clips).toHaveLength(1)
        })

        it('removeSongClips does nothing without a song', () => {
            appState.songs = []
            expect(cmd.removeSongClips([0])).toBe(false)
        })
    })

    // The loop is the grid width and what the player loops over, so it has to
    // follow the content instead of freezing at whatever the file declared.
    describe('arrangement loop follows the content', () => {
        let history

        beforeEach(() => {
            history = new HistoryManager(50)
            serviceRegistry.history = history
            appState.patterns = [makePattern({ name: 'Rock', id: 'rock', beatCount: 4 })]
        })

        const song = (clips, loopMeasureCount) => {
            appState.songs = [
                { id: 'demo', name: 'Demo', bpm: 120, clips, ...(loopMeasureCount ? { loopMeasureCount } : {}) },
            ]
            appState.selectedSongIdx = 0
            return appState.songs[0]
        }
        const loop = () => appState.songs[0].loopMeasureCount

        it('grows to cover a clip added past the old loop', () => {
            song([{ pattern: 'rock', startMeasure: 0, measureCount: 1 }], 4)
            expect(cmd.addPatternAtMeasure('rock', 20)).not.toBeNull()
            // otherwise the clip would be placed where nothing ever plays
            expect(loop()).toBe(21)
        })

        // A length declared by a song file is honoured on load, but it is not a promise:
        // the first edit snaps the loop onto what is actually placed.
        it('snaps a declared length onto the content on the first edit', () => {
            song([{ pattern: 'rock', startMeasure: 0, measureCount: 1 }], 32)
            cmd.addPatternAtMeasure('rock', 4)
            expect(loop()).toBe(5)
        })

        it('shrinks when the last clip is removed', () => {
            const s = song([
                { pattern: 'rock', startMeasure: 0, measureCount: 2 },
                { pattern: 'rock', startMeasure: 10, measureCount: 4 },
            ])
            s.loopMeasureCount = 14
            cmd.removeSongClips([1])
            expect(loop()).toBe(2)
        })

        it('takes the furthest end, not the last one in the list', () => {
            song([
                { pattern: 'rock', startMeasure: 0, measureCount: 2 },
                { pattern: 'rock', startMeasure: 10, measureCount: 4 },
                { pattern: 'rock', startMeasure: 4, measureCount: 1 },
            ])
            cmd.addPatternAtMeasure('rock', 0)
            expect(loop()).toBe(14)
        })

        it('drops the loop when the last clip goes', () => {
            song([{ pattern: 'rock', startMeasure: 0, measureCount: 2 }])
            cmd.removeSongClips([0])
            expect(appState.songs[0].clips).toHaveLength(0)
            expect(loop()).toBeUndefined()
        })

        it('undo puts the previous loop length back', () => {
            song([{ pattern: 'rock', startMeasure: 0, measureCount: 1 }], 8)
            cmd.removeSongClips([0])
            expect(loop()).toBeUndefined()

            history.undo()
            expect(loop()).toBe(8)

            // and the loop it shrinks to is itself undone
            cmd.addPatternAtMeasure('rock', 30)
            expect(loop()).toBe(31)
            history.undo()
            expect(loop()).toBe(8)
        })

        it('redo replays the loop change too', () => {
            song([{ pattern: 'rock', startMeasure: 0, measureCount: 1 }])
            cmd.addPatternAtMeasure('rock', 6)
            expect(loop()).toBe(7)

            history.undo()
            expect(loop()).toBeUndefined()
            history.redo()
            expect(loop()).toBe(7)
        })
    })

    // ── placement API (pattern name/id → clip) ──────────────────────────────────

    describe('arrangement placement API', () => {
        let history

        beforeEach(() => {
            history = new HistoryManager(50)
            serviceRegistry.history = history
            appState.patterns = [
                makePattern({ name: 'Verse', id: 'verse', beatCount: 8 }),
                makePattern({ name: 'Chorus', id: 'chorus', beatCount: 12 }),
            ]
            appState.songs = [{ id: 'demo', name: 'Demo', bpm: 120, clips: [] }]
            appState.selectedSongIdx = 0
            resetUserErrorReports()
            // Several tests below drive a refusal path on purpose.
            // reportUserError() attaches the cause to console.warn outside
            // production, which would print expected stack traces that read
            // like failures.
            vi.spyOn(console, 'warn').mockImplementation(() => {})
        })

        afterEach(() => {
            vi.restoreAllMocks()
        })

        it('addPatternAtMeasure resolves a pattern by name and derives its length', () => {
            const clip = cmd.addPatternAtMeasure('Verse', 2)
            expect(clip).toEqual({ pattern: 'verse', startMeasure: 2, measureCount: 2 })
        })

        it('addPatternAtMeasure accepts an id, any case, and surrounding blanks', () => {
            expect(cmd.addPatternAtMeasure('  cHoRuS ', 0)).toEqual({
                pattern: 'chorus',
                startMeasure: 0,
                measureCount: 3,
            })
            expect(appState.songs[0].clips).toHaveLength(1)
        })

        it('addPatternAtMeasure honours an explicit duration', () => {
            expect(cmd.addPatternAtMeasure('verse', 0, { measureCount: 4 })).toEqual({
                pattern: 'verse',
                startMeasure: 0,
                measureCount: 4,
            })
        })

        it('addPatternAtMeasure targets the requested song', () => {
            appState.songs.push({ id: 'other', name: 'Other', bpm: 120, clips: [] })
            cmd.addPatternAtMeasure('Verse', 1, { songIdx: 1 })
            expect(appState.songs[1].clips).toHaveLength(1)
            expect(appState.songs[0].clips).toHaveLength(0)
        })

        it('addPatternAtMeasure repairs an id-less pattern instead of writing a dangling clip', () => {
            const anonymous = makePattern({ name: 'Loop' })
            delete anonymous.id
            appState.patterns.push(anonymous)

            const clip = cmd.addPatternAtMeasure('Loop', 0)
            expect(clip.pattern).toBe('loop')
            expect(appState.patterns.find((p) => p.name === 'Loop').id).toBe('loop')
        })

        it('addPatternAtMeasure refuses an unknown pattern and does nothing', () => {
            expect(cmd.addPatternAtMeasure('Nope', 0)).toBeNull()
            expect(appState.songs[0].clips).toHaveLength(0)
            expect(console.warn).toHaveBeenCalled()
        })

        it('addPatternAtMeasure does nothing without a song', () => {
            appState.songs = []
            expect(cmd.addPatternAtMeasure('Verse', 0)).toBeNull()
            expect(console.warn).toHaveBeenCalled()
        })

        it('addPatternAtMeasure is undoable and redoable', () => {
            cmd.addPatternAtMeasure('Verse', 0)
            history.undo()
            expect(appState.songs[0].clips).toHaveLength(0)
            history.redo()
            expect(appState.songs[0].clips).toHaveLength(1)
        })

        it('repeatPatternAtMeasure repeats the clip starting at that measure, same length', () => {
            cmd.addPatternAtMeasure('Verse', 0)
            const repeated = cmd.repeatPatternAtMeasure(0)
            expect(repeated).toEqual({ pattern: 'verse', startMeasure: 2, measureCount: 2 })
            expect(appState.songs[0].clips).toHaveLength(2)
        })

        it('repeatPatternAtMeasure does nothing when the measure is empty', () => {
            expect(cmd.repeatPatternAtMeasure(4)).toBeNull()
            expect(appState.songs[0].clips).toHaveLength(0)
            expect(console.warn).toHaveBeenCalled()
        })

        it('removePatternAtMeasure removes every clip starting at that measure', () => {
            cmd.addPatternAtMeasure('Verse', 0)
            cmd.addPatternAtMeasure('Chorus', 0)
            cmd.addPatternAtMeasure('Verse', 2)

            const removed = cmd.removePatternAtMeasure(0)
            expect(removed.map((c) => c.pattern)).toEqual(['verse', 'chorus'])
            expect(appState.songs[0].clips.map((c) => c.startMeasure)).toEqual([2])

            history.undo()
            expect(appState.songs[0].clips).toHaveLength(3)
        })

        it('removePatternAtMeasure leaves the other measures alone and reports an empty one', () => {
            cmd.addPatternAtMeasure('Verse', 0)
            expect(cmd.removePatternAtMeasure(7)).toEqual([])
            expect(appState.songs[0].clips).toHaveLength(1)
            expect(console.warn).toHaveBeenCalled()
        })

        it('removePatternClips removes the whole row in one undo step', () => {
            cmd.addPatternAtMeasure('Verse', 0)
            cmd.addPatternAtMeasure('Chorus', 1)
            cmd.addPatternAtMeasure('Verse', 3)

            expect(cmd.removePatternClips('Verse')).toHaveLength(2)
            expect(appState.songs[0].clips.map((c) => c.pattern)).toEqual(['chorus'])

            history.undo()
            expect(appState.songs[0].clips.map((c) => c.pattern)).toEqual(['verse', 'chorus', 'verse'])
        })

        it('removePatternClips cleans up a clip whose pattern left the library', () => {
            cmd.addPatternAtMeasure('Verse', 0)
            appState.patterns.length = 0
            expect(cmd.removePatternClips('verse')).toHaveLength(1)
            expect(appState.songs[0].clips).toHaveLength(0)
        })

        it('removePatternClips without a reference changes nothing', () => {
            cmd.addPatternAtMeasure('Verse', 0)
            expect(cmd.removePatternClips('  ')).toEqual([])
            expect(appState.songs[0].clips).toHaveLength(1)
            expect(console.warn).toHaveBeenCalled()
        })

        it('removePatternClips is a no-op when the pattern is not in the arrangement', () => {
            cmd.addPatternAtMeasure('Verse', 0)
            expect(cmd.removePatternClips('Chorus')).toEqual([])
            expect(appState.songs[0].clips).toHaveLength(1)
        })
    })

    // ── arrangement CRUD ────────────────────────────────────────────────────────

    describe('arrangement CRUD', () => {
        let history

        beforeEach(() => {
            history = new HistoryManager(50)
            serviceRegistry.history = history
            appState.patterns = [makePattern({ name: 'Verse', id: 'verse' })]
            appState.songs = []
            appState.selectedSongIdx = 0
            resetUserErrorReports()
            vi.spyOn(console, 'warn').mockImplementation(() => {})
        })

        afterEach(() => {
            vi.restoreAllMocks()
        })

        it('addSong creates a normalized song and selects it', () => {
            const song = cmd.addSong({ name: '  My song  ', description: 'demo', bpm: 128 })

            expect(song.name).toBe('My song')
            expect(song.description).toBe('demo')
            expect(song.bpm).toBe(128)
            expect(song.clips).toEqual([])
            expect(song.id).toBe('my-song')
            expect(appState.songs).toEqual([song])
            expect(appState.selectedSongIdx).toBe(0)
        })

        it('addSong falls back to a default name and a valid tempo', () => {
            const song = cmd.addSong({ bpm: 9999 })
            expect(song.name).toBe('Untitled')
            expect(song.bpm).toBe(120)
        })

        it('addSong never reuses an id across arrangements', () => {
            const first = cmd.addSong({ name: 'Intro' })
            const second = cmd.addSong({ name: 'Intro' })

            expect(first.id).toBe('intro')
            expect(second.id).toBe('intro-2')
            expect(appState.selectedSongIdx).toBe(1)
        })

        it('addSong is undoable and redoable', () => {
            cmd.addSong({ name: 'Temp' })

            history.undo()
            expect(appState.songs).toHaveLength(0)
            expect(appState.selectedSongIdx).toBe(0)

            history.redo()
            expect(appState.songs.map((s) => s.name)).toEqual(['Temp'])
            expect(appState.selectedSongIdx).toBe(0)
        })

        it('a clip placed after creation can be undone on its own', () => {
            cmd.addSong({ name: 'With clips' })
            cmd.addPatternAtMeasure('Verse', 0)
            expect(appState.songs[0].clips).toHaveLength(1)

            history.undo()
            expect(appState.songs[0].clips).toHaveLength(0)
        })

        it('removeSong deletes the selected one and keeps a valid selection', () => {
            cmd.addSong({ name: 'First' })
            cmd.addSong({ name: 'Second' })
            appState.selectedSongIdx = 0

            expect(cmd.removeSong()).toBe(true)
            expect(appState.songs.map((s) => s.name)).toEqual(['Second'])
            expect(appState.selectedSongIdx).toBe(0)

            history.undo()
            expect(appState.songs.map((s) => s.name)).toEqual(['First', 'Second'])
        })

        it('removeSong restores the original slot on undo', () => {
            appState.songs = [
                { id: 'a', name: 'A', bpm: 120, clips: [] },
                { id: 'b', name: 'B', bpm: 120, clips: [] },
                { id: 'c', name: 'C', bpm: 120, clips: [] },
            ]
            appState.selectedSongIdx = 0
            cmd.removeSong(1)
            cmd.addSong({ name: 'D' })
            expect(appState.songs.map((s) => s.name)).toEqual(['A', 'C', 'D'])

            history.undo() // the creation
            history.undo() // the removal: B goes back to its own slot, not the end
            expect(appState.songs.map((s) => s.name)).toEqual(['A', 'B', 'C'])

            history.redo()
            history.redo()
            expect(appState.songs.map((s) => s.name)).toEqual(['A', 'C', 'D'])
        })

        it('removeSong reports when there is nothing at that index', () => {
            expect(cmd.removeSong(3)).toBe(false)
        })

        it('setSelectedSongIdx clamps to the available arrangements', () => {
            appState.songs = [{ id: 'a', name: 'A', bpm: 120, clips: [] }]

            expect(cmd.setSelectedSongIdx(5)).toBe(0)
            expect(cmd.setSelectedSongIdx(-2)).toBe(0)
            expect(appState.selectedSongIdx).toBe(0)
        })
    })
})
