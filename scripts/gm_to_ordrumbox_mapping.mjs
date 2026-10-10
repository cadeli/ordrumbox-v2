import { instrumentsManager, GM_DRUM_NAMES, GM_PROGRAM_NAMES } from '../src/logic/services/instruments_manager/index.js'
import { appState } from '../src/state/app_state.js'
import { soundRegistry } from '../src/state/sound_registry.js'
import AutoAssign from '../src/logic/services/auto_assign.js'
import Instrument from '../src/model/instrument.js'
import drumkits from '../assets/data/drumkits.json' with { type: 'json' }

const buildRealKitSounds = () => {
    const sounds = {}
    let idx = 0
    for (const kit of drumkits) {
        for (const inst of kit.instruments) {
            idx++
            sounds[inst.url] = {
                kitName: kit.name,
                url: inst.url,
                key: inst.key,
                index: idx,
                display_name: inst.display_name,
                buffer: null,
                duration: 500,
                isLoad: true,
                playStatus: false,
                rootMidi: inst.rootMidi ?? null,
                peakDb: inst.peakDb ?? null,
                decay: inst.decay ?? null,
                gainDb: 0,
                tune: 0,
            }
        }
    }
    return sounds
}

const realSounds = buildRealKitSounds()

const setupKit = (selectedKitName = 'punchy') => {
    appState.reset()
    soundRegistry.reset()
    soundRegistry.sounds = { ...realSounds }
    soundRegistry.drumkitList = drumkits.map((k) => ({ name: k.name, instruments: [] }))
    appState.selectedDrumkitIdx = drumkits.findIndex((k) => k.name === selectedKitName)
}

const findByNameDetailed = (gmName) => {
    for (const m of instrumentsManager.matchers) {
        if (m.pattern.test(gmName)) {
            const syn = m.pattern.source.replace(/^\^|\$$/g, '')
            const isExact = gmName.toUpperCase() === m.instrument.id.toUpperCase()
            return { instrument: m.instrument, syn, isExact }
        }
    }
    return { instrument: null, syn: null, isExact: false }
}

const runAutoAssign = (trackName) => {
    const warnLogs = []
    const origWarn = console.warn
    console.warn = (...args) => {
        warnLogs.push(args.join(' '))
    }

    const track = { name: trackName, sampleId: null, useAutoAssignSound: true, useSoftSynth: false }
    const autoAssign = new AutoAssign({ appState, soundRegistry })
    autoAssign.autoAssignTrackSounds(track)

    console.warn = origWarn

    const logLine =
        warnLogs.find((l) => l.includes('tier')) ??
        warnLogs.find((l) => l.includes('aléatoire')) ??
        warnLogs.find((l) => l.includes('NOT_DEFINED')) ??
        ''
    const tierMatch = logLine.match(/tier(\d)/)
    const tier = tierMatch ? Number(tierMatch[1]) : logLine.includes('NOT_DEFINED') ? 0 : null

    let info = ''
    if (tier === 1) {
        info = logLine.includes('exact match') ? 'exact' : 'contains'
    } else if (tier === 2) {
        const kitMatch = logLine.match(/(?:autre|other) kit "([^"]+)"/)
        info = `alt kit${kitMatch ? ' "' + kitMatch[1] + '"' : ''}`
    } else if (tier === 3) {
        const keyMatch = logLine.match(/key="(\w+)"/)
        const sameKit = logLine.includes('same kit')
        const kitMatch = logLine.match(/(?:autre|other) kit "([^"]+)"/)
        const subType = sameKit ? 'same kit' : `alt kit "${kitMatch?.[1] ?? '?'}"`
        info = `subst → ${keyMatch?.[1] ?? '?'} (${subType})`
    } else if (tier === 4) {
        info = 'random'
    } else if (tier === 0) {
        info = 'NOT_DEFINED'
    }

    const sampleUrl =
        track.sampleId && track.sampleId !== 'NOT_DEFINED'
            ? (realSounds[track.sampleId]?.url ?? track.sampleId)
            : 'NONE'
    const soundKit =
        track.sampleId && track.sampleId !== 'NOT_DEFINED' ? (realSounds[track.sampleId]?.kitName ?? '?') : '-'

    return { track, sampleUrl, soundKit, info, tier }
}

const pad = (s, n) => String(s).padStart(n)

// ── Combined output ───────────────────────────────────────────

setupKit('punchy')
console.log('\n══ ALL GM → orDrumbox → sample (real kits) ══')
console.log(
    '  kit sélectionné: punchy | alt: real, matt, electro, open, ropen, generated, human, 8bits, delagrange, vintage',
)
console.log('  étape1: GM name → instrument [match info]  |  étape2: instrument → sample [tier]')
console.log('  tiers: [t1]=punchy exact  [t2]=alt kit exact  [t3]=subst  [t4]=random (last resort)')
console.log('  ────────────────────────────────────────────────────────────────────────────────────────────────\n')

console.log('── Drums ──')
for (const [note, gmName] of Object.entries(GM_DRUM_NAMES)) {
    const { instrument: inst, syn, isExact } = findByNameDetailed(gmName)
    if (!inst || inst.id === Instrument.NOT_FOUND) {
        console.log(`  [${pad(note, 3)}] "${gmName}" → ❌ NOT_FOUND`)
        continue
    }
    const matchInfo = isExact ? 'exact_id' : `syn="${syn}"`
    const { sampleUrl, soundKit, info, tier } = runAutoAssign(inst.id)
    const tierTag = `[t${tier}]`
    const infoStr = info ? ` ${info}` : ''
    console.log(
        `  [${pad(note, 3)}] "${gmName}" → ${inst.id.padEnd(14)} [${matchInfo}] → ${sampleUrl.padEnd(36)} ${tierTag}${infoStr} (${soundKit})`,
    )
}

console.log('\n── Programs ──')
for (const [prog, gmName] of Object.entries(GM_PROGRAM_NAMES)) {
    const { instrument: inst, syn, isExact } = findByNameDetailed(gmName)
    if (!inst || inst.id === Instrument.NOT_FOUND) {
        console.log(`  [${pad(prog, 3)}] "${gmName}" → ❌ NOT_FOUND`)
        continue
    }
    const matchInfo = isExact ? 'exact_id' : `syn="${syn}"`
    const { sampleUrl, soundKit, info, tier } = runAutoAssign(inst.id)
    const tierTag = `[t${tier}]`
    const infoStr = info ? ` ${info}` : ''
    console.log(
        `  [${pad(prog, 3)}] "${gmName}" → ${inst.id.padEnd(14)} [${matchInfo}] → ${sampleUrl.padEnd(36)} ${tierTag}${infoStr} (${soundKit})`,
    )
}

const total = Object.keys(GM_DRUM_NAMES).length + Object.keys(GM_PROGRAM_NAMES).length
console.log(`\n  ${total} total`)
