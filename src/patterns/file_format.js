/**
 * file_format.js — The boundary between JSON files and the runtime model.
 *
 * Files (`library.json`, `kits.json`, pattern exports, `.odbox` songs) use the
 * key names of the orDrumbox Rust app, so both apps share them. The runtime
 * model, IndexedDB and the MCP tool arguments keep their own names. These tables
 * are the only place that knows both, and the Rust side's are its `json_record!`
 * tables (`ordrumbox-core/src/track.rs`, `note.rs`).
 *
 * Reading renames the file keys and leaves every other key alone, so a runtime
 * object passes through unchanged. Writing is just as safe on a file object.
 */

/** File key → runtime key. */
const TRACK_KEYS = {
    autoAssign: 'useAutoAssignSound',
    samplePath: 'sampleId',
    loopLength: 'loopAtStep',
    volume: 'velocity',
    volumeLfo: 'velocityLfo',
    transpose: 'pitch',
    transposeLfo: 'pitchLfo',
    autoMode: 'auto',
    useSynth: 'useSoftSynth',
    hitVariation: 'variation',
    noteVariation: 'variation2',
    autoPitchChance: 'prob_pitch',
    autoVelocityChance: 'prob_velocity',
    autoSilenceChance: 'prob_silence',
    autoFillChance: 'prob_fill',
    autoGhostChance: 'prob_ghost',
    autoRetriggerChance: 'prob_retrig',
    autoEuclideanChance: 'prob_euclid',
    autoNoteProbabilityChance: 'prob_note',
    autoNoteProbabilityRange: 'prob_note_depth',
    autoArpChance: 'prob_arp',
    pitchRange: 'pitch_range',
    pitchScaleLock: 'pitch_scale_lock',
    autoVariant: 'auto_variant',
    autoDensity: 'auto_density',
    filterCutoffLfo: 'filterFreqLfo',
    filterCutoff: 'filterFreq',
    reverbMix: 'reverbAmount',
    delayBeats: 'delayTime',
    delayMix: 'delayDepth',
    saturationMix: 'saturationAmount',
    saturationOn: 'sat',
    synthPreset: 'synthSoundKey',
    autoHitVariation: 'auto_variation',
    autoNoteVariation: 'auto_variation2',
}

const NOTE_KEYS = {
    step: 'beatStep',
    cycle: 'every',
    probability: 'prob',
    retriggerRate: 'rate',
    retriggerProbability: 'arpTriggerProbability',
    euclideanPulses: 'euclideanFill',
    cycleOffset: 'pos',
    arpScale: '_arpScale',
    arpDirection: '_arpType',
}

const ARP_KEYS = { direction: 'mode' }

const PATTERN_KEYS = { autoGenre: '_autoGenGenre', autoKeyOffset: '_autoGenKeyOffset', autoScale: '_autoGenScale' }

const SONG_KEYS = { loopMeasures: 'loopMeasureCount' }

const CLIP_KEYS = { patternId: 'pattern' }

const LIBRARY_KEYS = { info: 'infos', selectedPattern: 'selectedPatternIdx', selectedSong: 'selectedSongIdx' }

const KIT_KEYS = { info: 'infos', samples: 'instruments' }

const SAMPLE_KEYS = { path: 'url', displayName: 'display_name', transpose: 'tune' }

/** Runtime or web-app keys that no file holds. */
const PATTERN_DROPPED_KEYS = ['application', 'url', '_revision']
const TRACK_DROPPED_KEYS = ['fxSelected']

const inverted = (keys) => Object.fromEntries(Object.entries(keys).map(([file, runtime]) => [runtime, file]))

const READ = { track: TRACK_KEYS, note: NOTE_KEYS, arp: ARP_KEYS, pattern: PATTERN_KEYS, song: SONG_KEYS }
Object.assign(READ, { clip: CLIP_KEYS, library: LIBRARY_KEYS, kit: KIT_KEYS, sample: SAMPLE_KEYS })
const WRITE = Object.fromEntries(Object.entries(READ).map(([name, keys]) => [name, inverted(keys)]))

/** The same object with `keys` renamed, in place in the key order; the target key wins if both are there. */
function renamed(object, keys) {
    const entries = Object.entries(object).filter(([key]) => !(keys[key] in object))
    return Object.fromEntries(entries.map(([key, value]) => [keys[key] ?? key, value]))
}

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)

const mapped = (items, convert) => Object.values(items ?? []).map(convert)

function convertNote(note, tables) {
    if (!isObject(note)) return note // a compact array: its header carries the names
    const out = renamed(note, tables.note)
    if (isObject(out.arp)) out.arp = renamed(out.arp, tables.arp)
    return out
}

function convertNoteArps(notes, noteKeys, tables) {
    const arpSlot = Array.isArray(noteKeys) ? noteKeys.indexOf('arp') : -1
    return mapped(notes, (note) => {
        if (!Array.isArray(note)) return convertNote(note, tables)
        if (!isObject(note[arpSlot])) return note
        return note.map((value, i) => (i === arpSlot ? renamed(value, tables.arp) : value))
    })
}

function convertTrack(track, tables) {
    if (!isObject(track)) return track
    const out = renamed(track, tables.track)
    if (out.notes) out.notes = convertNoteArps(out.notes, out.noteKeys, tables)
    if (Array.isArray(out.noteKeys)) out.noteKeys = out.noteKeys.map((key) => tables.note[key] ?? key)
    return out
}

function convertPattern(pattern, tables) {
    if (!isObject(pattern)) return pattern
    const out = renamed(pattern, tables.pattern)
    if (out.tracks) out.tracks = mapped(out.tracks, (track) => convertTrack(track, tables))
    return out
}

function convertSong(song, tables) {
    if (!isObject(song)) return song
    const out = renamed(song, tables.song)
    if (Array.isArray(out.clips)) out.clips = out.clips.map((clip) => (isObject(clip) ? renamed(clip, tables.clip) : clip))
    return out
}

function convertLibrary(doc, tables) {
    if (Array.isArray(doc)) return doc.map((pattern) => convertPattern(pattern, tables))
    if (!isObject(doc)) return doc
    const out = renamed(doc, tables.library)
    if (Array.isArray(out.patterns)) out.patterns = out.patterns.map((pattern) => convertPattern(pattern, tables))
    if (Array.isArray(out.songs)) out.songs = out.songs.map((song) => convertSong(song, tables))
    return out
}

function convertKit(kit, tables) {
    if (!isObject(kit)) return kit
    const out = renamed(kit, tables.kit)
    const samples = out.instruments ?? out.samples
    if (!Array.isArray(samples)) return out
    const converted = samples.map((sample) => (isObject(sample) ? renamed(sample, tables.sample) : sample))
    return { ...out, ...(out.instruments ? { instruments: converted } : { samples: converted }) }
}

function without(object, keys) {
    return Object.fromEntries(Object.entries(object).filter(([key]) => !keys.includes(key)))
}

/** Tags are written as a list. The generators' `{style, type}` map keeps its values, in order. */
function tagsForFile(tags) {
    return isObject(tags) ? Object.values(tags) : tags
}

/** @param {any} raw a pattern from a file @returns {any} the same pattern with the runtime names */
export function patternFromFile(raw) {
    return convertPattern(raw, READ)
}

/** @param {any} pattern a pattern with the runtime names @returns {any} the same pattern as a file holds it */
export function patternToFile(pattern) {
    if (!isObject(pattern)) return pattern
    const out = convertPattern(without(pattern, PATTERN_DROPPED_KEYS), WRITE)
    if (out.tracks) out.tracks = out.tracks.map((track) => (isObject(track) ? without(track, TRACK_DROPPED_KEYS) : track))
    if (out.tags === null) delete out.tags
    else if (out.tags) out.tags = tagsForFile(out.tags)
    return out
}

/** @param {any} raw a library or song file, or a bare pattern array @returns {any} the runtime shape */
export function libraryFromFile(raw) {
    return convertLibrary(raw, READ)
}

/** @param {any} doc a library or song record with the runtime names @returns {any} the file shape */
export function libraryToFile(doc) {
    const out = convertLibrary(doc, WRITE)
    if (!isObject(out)) return out
    return Array.isArray(out.patterns) ? { ...out, patterns: out.patterns.map(patternToFile) } : out
}

/** @param {any} raw a kit from a file @returns {any} the same kit with the runtime names */
export function kitFromFile(raw) {
    return convertKit(raw, READ)
}

/** @param {any} kit a kit with the runtime names @returns {any} the same kit as a file holds it */
export function kitToFile(kit) {
    return convertKit(kit, WRITE)
}

/** @param {any} raw the `kits.json` list @returns {any[]} the kits with the runtime names */
export function kitsFromFile(raw) {
    return mapped(raw, kitFromFile)
}
