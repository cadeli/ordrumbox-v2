import { appState as _appState } from '../../state/app_state.js'
import { soundRegistry as soundRegistrySingleton } from '../../state/sound_registry.js'
import InstrumentsManager, { instrumentsManager } from './instruments_manager/index.js'
import { pickRandom, pickRandomKey } from '../../core/random.js'
import { detectTrackType } from '../../core/drum_taxonomy.js'
import { getTracksArray } from '../../core/tracks.js'
import { NOT_FOUND } from '../../core/constants.js'
import { logger } from '../../core/logger.js'

const TAG = 'AutoAssign'

/**
 * @param {string} name
 * @returns {string} trimmed, upper-cased name — how sound keys are compared
 */
const normalizeName = (name) => String(name ?? '').trim().toUpperCase()

export default class AutoAssign {
    static TAG = TAG
    static NOT_FOUND = NOT_FOUND

    #appState
    #soundRegistry

    /**
     * @param {object} [deps]
     * @param {any} [deps.appState]
     * @param {any} [deps.soundRegistry]
     */
    constructor({ appState, soundRegistry } = {}) {
        this.#appState = appState ?? _appState
        this.#soundRegistry = soundRegistry ?? soundRegistrySingleton
    }

    autoAssignSounds = (pattern) => {
        const tracks = getTracksArray(pattern)

        // Soft-synth tracks first, and independently of the drumkits: a track with
        // useSoftSynth and no synthSoundKey used to be left alone here, and
        // VoiceFactory then reported "no synth preset assigned" on EVERY note of it
        // (a silent track plus a toast per note).
        tracks.forEach((track) => {
            if (track.useSoftSynth === true) this.assignSynthPatch(track)
        })

        if (Object.keys(this.#soundRegistry.sounds).length > 0) {
            const drumkitList = this.#soundRegistry.drumkitList
            const selectedIdx = this.#appState.selectedDrumkitIdx
            const kitName = drumkitList?.[selectedIdx]?.name ?? '?'
            logger.warn(TAG, `── Auto-assign: kit="${kitName}", pattern="${pattern?.name ?? '?'}" ──`)
            tracks.forEach((track) => {
                if (track.useAutoAssignSound === true && track.useSoftSynth === false) {
                    this.autoAssignTrackSounds(track)
                }
            })
        }
    }

    /**
     * Gives a soft-synth track a preset to play.
     *
     * Keeps the patch the track already has as long as it exists in the registry
     * (so an explicit choice is never overwritten), and otherwise picks one AT
     * RANDOM — the same last resort the drum path uses when nothing matches.
     *
     * @param {any} track
     * @returns {string|null} the patch key the track ends up with
     */
    assignSynthPatch = (track) => {
        const generated = this.#soundRegistry.generatedSounds ?? {}
        const keys = Object.keys(generated)
        if (keys.length === 0) {
            logger.warn(TAG, `  ${track.name}: no synth preset loaded, soft-synth track left unassigned`)
            return null
        }
        if (track.synthSoundKey && generated[track.synthSoundKey]) return track.synthSoundKey

        const picked = pickRandomKey(generated)
        const why = track.synthSoundKey ? `stale "${track.synthSoundKey}"` : 'none'
        track.synthSoundKey = picked
        logger.warn(TAG, `  ${track.name}: synth preset ${why} → ${picked} (random)`)
        return picked
    }

    autoAssignTrackSounds = (track) => {
        const originalName = track.name
        // track.name is NEVER rewritten: the instrument id it resolves to is only
        // a matching key for the sounds below.
        const matchName = this.#resolveInstrumentId(track.name)
        const matchNames = [...new Set([track.name, matchName].map(normalizeName))]

        const drumkitList = this.#soundRegistry.drumkitList
        const selectedIdx = this.#appState.selectedDrumkitIdx
        if (!drumkitList || drumkitList.length <= selectedIdx) return

        const selectedDrumkitName = drumkitList[selectedIdx].name

        // ── tier 1 : same kit, exact name match (random among all matches) ─
        const tier1Ids = this.#findExactSoundIds(matchNames, { kitName: selectedDrumkitName })
        if (tier1Ids.length > 0) {
            const picked = pickRandom(tier1Ids)
            const url = this.#soundRegistry.sounds[picked]?.url
            logger.warn(
                TAG,
                `  ${originalName} [${selectedDrumkitName}] => ${url}  (exact match, tier1: same kit, ${tier1Ids.length} candidate(s))`,
            )
            track.sampleId = picked
            return
        }

        // ── tier 2 : other kits, exact name match (random among all matches)
        const tier2Ids = this.#findExactSoundIds(matchNames, { excludeKitName: selectedDrumkitName })
        if (tier2Ids.length > 0) {
            const picked = pickRandom(tier2Ids)
            const sound = this.#soundRegistry.sounds[picked]
            logger.warn(
                TAG,
                `  ${originalName} [${selectedDrumkitName}] => ${sound?.url}  (exact match, tier2: other kit "${sound?.kitName}", ${tier2Ids.length} candidate(s))`,
            )
            track.sampleId = picked
            return
        }

        // ── tier 3 : substitution chain of the instrument ──────────────────
        const eqResult = this.findSoundEquivalence(NOT_FOUND, selectedDrumkitName, matchName)
        if (eqResult !== NOT_FOUND) {
            const matchedKey = this.#soundRegistry.sounds[eqResult]?.key
            const url = this.#soundRegistry.sounds[eqResult]?.url
            const matchedKit = this.#soundRegistry.sounds[eqResult]?.kitName
            const inSameKit = matchedKit === selectedDrumkitName
            logger.warn(
                TAG,
                `🟡 ${originalName} [${selectedDrumkitName}] => ${url}  (substitution to key="${matchedKey}", ${inSameKit ? 'same kit' : `other kit "${matchedKit}"`}, tier3)`,
            )
            track.sampleId = eqResult
            return
        }

        // ── tier 4 : last resort, any sound of the registry ────────────────
        const picked = pickRandom(Object.keys(this.#soundRegistry.sounds))
        if (picked) {
            const url = this.#soundRegistry.sounds[picked]?.url
            logger.warn(TAG, `🔴 ${originalName} [${selectedDrumkitName}] => ${url}  (random, tier4)`)
            track.sampleId = picked
        } else {
            logger.warn(TAG, `🔴 ${originalName} [${selectedDrumkitName}] => NOT_DEFINED  (no match)`)
            track.sampleId = 'NOT_DEFINED'
        }
    }

    /**
     * The instrument id a track name maps to. Used to MATCH sounds — the track
     * name itself is left untouched.
     *
     * @param {string} trackName
     * @returns {string} the instrument id, or trackName when nothing resolves
     */
    #resolveInstrumentId(trackName) {
        const validInstrumentIds = InstrumentsManager.DATA?.instruments?.map((i) => i.id) ?? []
        if (validInstrumentIds.includes(trackName)) return trackName
        const foundId = instrumentsManager.findInstrumentFromFileName(trackName)?.id
        return foundId && validInstrumentIds.includes(foundId) ? foundId : trackName
    }

    /**
     * [key, sound] entries of the registry, optionally restricted to one kit
     * or to everything but one kit.
     *
     * @param {string|null} [kitName] keep only this kit
     * @param {string|null} [excludeKitName] drop this kit
     * @returns {Array<[string, any]>}
     */
    #entriesInScope(kitName = null, excludeKitName = null) {
        return Object.entries(this.#soundRegistry.sounds).filter(([, sound]) => {
            if (kitName && sound.kitName !== kitName) return false
            if (excludeKitName && sound.kitName === excludeKitName) return false
            return true
        })
    }

    /**
     * Every sound whose key equals one of the given names (case-insensitive).
     *
     * @param {string[]} names - normalized track/instrument names
     * @param {{kitName?: string|null, excludeKitName?: string|null}} [scope]
     * @returns {string[]} sound keys, empty when nothing matches exactly
     */
    #findExactSoundIds(names, { kitName = null, excludeKitName = null } = {}) {
        return this.#entriesInScope(kitName, excludeKitName)
            .filter(([, sound]) => names.includes(normalizeName(sound.key)))
            .map(([key]) => key)
    }

    /**
     * Resolve the instrument's substitution chain.
     * @param {string} notFoundId always the NOT_FOUND sentinel: the caller only
     *   calls this when it has no sound, so the parameter is the sentinel itself
     * @param {string} selectedDrumkitName
     * @param {string} trackName - the instrument id resolved from the track
     *   (track.name itself is never rewritten)
     */
    findSoundEquivalence = (notFoundId, selectedDrumkitName, trackName) => {
        if (notFoundId !== NOT_FOUND) return notFoundId

        const instData = InstrumentsManager.DATA?.instruments?.find((i) => i.id === trackName)
        const replacements = instData?.subst ? Object.values(instData.subst) : null

        if (replacements) {
            for (const targetKey of replacements) {
                let candidateId = this.getSampleIdFromTrackname(targetKey, selectedDrumkitName)
                if (candidateId !== NOT_FOUND) {
                    return candidateId
                }
                candidateId = this.getSampleIdFromTrackname(targetKey)
                if (candidateId !== NOT_FOUND) {
                    return candidateId
                }

                // Try matching via instrument synonyms (e.g., RIMSHOT has "CL" which matches "CLAP")
                const targetInst = InstrumentsManager.DATA?.instruments?.find((i) => i.id === targetKey)
                if (targetInst?.synonyms?.length) {
                    for (const syn of targetInst.synonyms) {
                        // Use simple string synonyms (not regex patterns)
                        if (!syn.includes('.') && !syn.includes('*') && !syn.includes('^') && !syn.includes('$')) {
                            // Check if any sound key includes this synonym (reverse direction)
                            candidateId = this.getSampleIdByKeyContaining(selectedDrumkitName, syn)
                            if (candidateId !== NOT_FOUND) return candidateId
                            candidateId = this.getSampleIdByKeyContaining(null, syn)
                            if (candidateId !== NOT_FOUND) return candidateId
                        }
                    }
                }
            }
        }
        // no substitution matched: the caller keeps the sentinel and auto-assigns
        return notFoundId
    }

    /**
     * A random sound whose key contains `searchStr`, optionally within one kit.
     * @param {string|null} drumkitName null searches every kit
     * @param {string} searchStr
     * @returns {string} a sound key, or NOT_FOUND
     */
    getSampleIdByKeyContaining = (drumkitName, searchStr) => {
        const upperSearch = searchStr.toUpperCase().trim()
        if (!upperSearch) return NOT_FOUND
        const ids = this.#entriesInScope(drumkitName)
            .filter(([, sound]) => sound.key?.toUpperCase().includes(upperSearch))
            .map(([key]) => key)
        return pickRandom(ids) ?? NOT_FOUND
    }

    /**
     * A random sound matching a name — optionally restricted to one kit, which
     * is the only difference from searching every kit.
     *
     * Exact key matches win: when at least one sound has the key `trackName`,
     * the pick is among those. Otherwise it is among every sound of the same
     * coarse type (detectTrackType).
     *
     * @param {string} trackName
     * @param {string|null} [drumkitName] null searches every kit
     * @returns {string} a sound key, or NOT_FOUND
     */
    getSampleIdFromTrackname = (trackName, drumkitName = null) => {
        const trackType = detectTrackType(trackName)
        const wanted = normalizeName(trackName)
        const exact = []
        const sameType = []
        for (const [key, sound] of this.#entriesInScope(drumkitName)) {
            if (normalizeName(sound.key) === wanted) exact.push(key)
            else if (detectTrackType(sound.key) === trackType) sameType.push(key)
        }
        return pickRandom(exact.length > 0 ? exact : sameType) ?? NOT_FOUND
    }
}