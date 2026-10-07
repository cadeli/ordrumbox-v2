// src/logic/services/pattern_auto_gen.js
//
// Shared orchestration behind the three ↻ generation buttons. The toolbar
// (ViewSwitch) and the pattern settings panel used to copy-paste this whole
// shape: detect whether auto-generation is already on for the target track
// types, run the generation inside ONE undo transaction (genre/harmony
// resolution, track creation, flat-note recompute), and publish the result as
// a single NOTE_CHANGE + PATTERN_CHANGE batch.

import { appState } from '../../state/app_state.js'
import { serviceRegistry } from '../../state/service_registry.js'
import { playbackEvents } from '../../state/event_bus.js'
import { getAutoGeneratorService } from '../../state/service_loader.js'
import { DRUM_TYPES, detectTrackType } from '../../core/drum_taxonomy.js'
import { filterEmptyMelodicTracks } from '../../core/tracks.js'
import { showToast } from '../../core/notify.js'
import { EVENTS } from '../../core/events.js'

/**
 * Synth preset + structure fallback per generated melodic track type —
 * the config each UI used to pass by hand.
 * @type {Record<string, {synthSoundKey: string, defaultVariant: string}>}
 */
const MELODIC_GEN_PRESETS = {
    BASS: { synthSoundKey: 'BASS1', defaultVariant: 'basic' },
    PIANO: { synthSoundKey: 'PIANO', defaultVariant: 'chordStab' },
}

class PatternAutoGen {
    /**
     * Toggle shell shared by every generation button: when a matching track
     * already plays with generation on, turn the family off; otherwise run
     * `generate` inside an undo transaction (errors cancel it and toast).
     * Either way the change is published as one batch.
     *
     * `auto` is the runtime truth (the player regenerates those tracks);
     * `_toolbarAuto` is accepted alongside it for patterns saved by older
     * builds where the two flags could drift apart — and it stays the key the
     * toolbar lights its buttons on. Both flags are written and cleared
     * together so they can never disagree again.
     *
     * @param {Set<string>|string|string[]} typeOrTypes - track types the button covers
     * @param {(pattern: any, autoGen: any) => Promise<void>} generate - the "turn on" path
     */
    async toggleAutoGeneration(typeOrTypes, generate) {
        const pattern = appState.selectedPattern
        if (!pattern) return

        const types =
            typeOrTypes instanceof Set ? typeOrTypes : new Set(Array.isArray(typeOrTypes) ? typeOrTypes : [typeOrTypes])
        const isAutoOn = (/** @type {any} */ t) => Boolean(t.auto || t._toolbarAuto)
        const hasAuto = (pattern.tracks ?? []).some((t) => isAutoOn(t) && types.has(detectTrackType(t.name)))

        if (hasAuto) {
            for (const track of pattern.tracks) {
                if (types.has(detectTrackType(track.name))) {
                    track.auto = false
                    track._toolbarAuto = false
                }
            }
        } else {
            try {
                const autoGen = await getAutoGeneratorService()
                await generate(pattern, autoGen)
            } catch (err) {
                serviceRegistry.cmd.cancelGenerationUndo?.()
                showToast('Auto-generation failed: ' + err.message, 'error')
            }
        }

        playbackEvents.batch(() => {
            playbackEvents.emit(EVENTS.NOTE_CHANGE)
            playbackEvents.emit(EVENTS.PATTERN_CHANGE)
        })
    }

    /**
     * ↻ Drum — regenerates the percussion family over the EXISTING tracks;
     * it never creates one and empties melodic leftovers are filtered out.
     */
    async toggleDrums() {
        await this.toggleAutoGeneration(DRUM_TYPES, async (pattern, autoGen) => {
            if (!serviceRegistry.cmd.beginGenerationUndo(pattern)) return
            await autoGen.generatePattern()

            if (pattern.tracks) {
                pattern.tracks = filterEmptyMelodicTracks(pattern.tracks)
            }
            for (const track of pattern.tracks) {
                if (DRUM_TYPES.has(detectTrackType(track.name))) {
                    track.auto = true
                    track._toolbarAuto = true
                }
            }
            serviceRegistry.cmd.commitGenerationUndo()
        })
    }

    /**
     * ↻ Bass / ↻ Chords — drives a single melodic track type and creates the
     * track on first use from the pattern's genre structure (harmony resolved
     * on the first structure element).
     * @param {'BASS'|'PIANO'} trackType
     */
    async toggleMelodic(trackType) {
        const preset = MELODIC_GEN_PRESETS[trackType]
        if (!preset) throw new Error(`No auto-generation preset for track type "${trackType}"`)

        await this.toggleAutoGeneration(trackType, async (pattern, autoGen) => {
            if (!serviceRegistry.cmd.beginGenerationUndo(pattern)) return

            let track = pattern.tracks?.find((t) => detectTrackType(t.name) === trackType)
            if (!track) {
                if (!pattern._autoGenGenre) pattern._autoGenGenre = autoGen.structureGen.getRandomGenre()
                const genre = pattern._autoGenGenre
                const firstElement = autoGen.structureGen.getElement(0)
                const harmony = autoGen.structureGen.resolveHarmony(genre, firstElement.name, firstElement.loopInElement)
                const structure = autoGen.structureGen.generateStructure(genre)
                const variant = structure[trackType] ?? preset.defaultVariant

                track = serviceRegistry.cmd.addTrack(pattern, trackType)
                track.useSoftSynth = true
                track.useAutoAssignSound = false
                track.synthSoundKey = preset.synthSoundKey
                track.velocity = 0.8
                await autoGen.generateTrack(track, variant, 1, pattern, harmony)
                serviceRegistry.flatNotes.applyFlatNotes(pattern)
            }
            track.auto = true
            track._toolbarAuto = true
            serviceRegistry.cmd.commitGenerationUndo()
        })
    }
}

export default new PatternAutoGen()
