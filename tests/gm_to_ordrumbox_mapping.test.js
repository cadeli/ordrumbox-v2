import { describe, it, expect, vi } from 'vitest'
import InstrumentsManager, {
    instrumentsManager,
    GM_DRUM_NAMES,
    GM_PROGRAM_NAMES
} from '../src/logic/services/instruments_manager.js'
import { appState } from '../src/state/app_state.js'
import { soundRegistry } from '../src/state/sound_registry.js'
import { logger } from '../src/core/logger.js'
import AutoAssign from '../src/logic/services/auto_assign.js'
import Instrument from '../src/model/instrument.js'
import drumkits from '../assets/data/drumkits.json'

describe('GM → orDrumbox auto-assign mapping (real kits)', () => {
    const buildRealKitSounds = () => {
        const sounds = {}
        let idx = 0
        for (const kit of drumkits) {
            for (const inst of kit.instruments) {
                idx++
                sounds[inst.url] = {
                    kit_name: kit.name,
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
        soundRegistry.drumkitList = drumkits.map(k => ({ name: k.name, instruments: [] }))
        appState.selectedDrumkitNum = drumkits.findIndex(k => k.name === selectedKitName)
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
        const warnSpy = vi.spyOn(logger, 'warn').mockImplementation((...args) => {
            warnLogs.push(args.join(' '))
        })

        const track = { name: trackName, soundId: null, useAutoAssignSound: true, useSoftSynth: false }
        const autoAssign = new AutoAssign({ appState, soundRegistry })
        autoAssign.autoAssignTrackSounds(track)

        warnSpy.mockRestore()

        const logLine = warnLogs.find(l => l.includes('tier')) ?? warnLogs.find(l => l.includes('aléatoire')) ?? warnLogs.find(l => l.includes('NOT_DEFINED')) ?? ''
        const tierMatch = logLine.match(/tier(\d)/)
        const tier = tierMatch ? Number(tierMatch[1]) : (logLine.includes('NOT_DEFINED') ? 0 : null)

        let info = ''
        if (tier === 1) {
            info = logLine.includes('nom exact') ? 'exact' : 'contains'
        } else if (tier === 2) {
            const kitMatch = logLine.match(/autre kit "([^"]+)"/)
            info = `alt kit${kitMatch ? ' "' + kitMatch[1] + '"' : ''}`
        } else if (tier === 3) {
            const keyMatch = logLine.match(/key="(\w+)"/)
            const kitMatch = logLine.match(/(même kit|autre kit "([^"]+)")/)
            const subType = kitMatch?.[1]?.startsWith('même') ? 'same kit' : `alt kit "${kitMatch?.[2] ?? '?'}"`
            info = `subst → ${keyMatch?.[1] ?? '?'} (${subType})`
        } else if (tier === 4) {
            info = 'random'
        } else if (tier === 0) {
            info = 'NOT_DEFINED'
        }

        const soundUrl = track.soundId && track.soundId !== 'NOT_DEFINED'
            ? (realSounds[track.soundId]?.url ?? track.soundId)
            : 'NONE'
        const soundKit = track.soundId && track.soundId !== 'NOT_DEFINED'
            ? (realSounds[track.soundId]?.kit_name ?? '?')
            : '-'

        return { track, soundUrl, soundKit, info, tier }
    }

    const pad = (s, n) => String(s).padStart(n)

    it('GM drums → orDrumbox → real sample', () => {
        setupKit('punchy')
        const lines = Object.entries(GM_DRUM_NAMES).map(([note, gmName]) => {
            const { instrument: inst, syn, isExact } = findByNameDetailed(gmName)
            if (!inst || inst.id === Instrument.NOT_FOUND) {
                return `  [${pad(note, 3)}] "${gmName}" → ❌ NOT_FOUND`
            }
            const matchInfo = isExact ? 'exact_id' : `syn="${syn}"`
            const { soundUrl, soundKit, info, tier } = runAutoAssign(inst.id)
            const tierTag = `[t${tier}]`
            const infoStr = info ? ` ${info}` : ''
            return `  [${pad(note, 3)}] "${gmName}" → ${inst.id.padEnd(14)} [${matchInfo}] → ${soundUrl.padEnd(36)} ${tierTag}${infoStr} (${soundKit})`
        })

        console.log('\n══ GM DRUMS → orDrumbox → sample ══')
        console.log('  kit sélectionné: punchy\n')
        console.log(lines.join('\n'))
        console.log(`\n  ${Object.keys(GM_DRUM_NAMES).length} drums`)
    })

    it('GM programs → orDrumbox → real sample', () => {
        setupKit('punchy')
        const lines = Object.entries(GM_PROGRAM_NAMES).map(([prog, gmName]) => {
            const { instrument: inst, syn, isExact } = findByNameDetailed(gmName)
            if (!inst || inst.id === Instrument.NOT_FOUND) {
                return `  [${pad(prog, 3)}] "${gmName}" → ❌ NOT_FOUND`
            }
            const matchInfo = isExact ? 'exact_id' : `syn="${syn}"`
            const { soundUrl, soundKit, info, tier } = runAutoAssign(inst.id)
            const tierTag = `[t${tier}]`
            const infoStr = info ? ` ${info}` : ''
            return `  [${pad(prog, 3)}] "${gmName}" → ${inst.id.padEnd(14)} [${matchInfo}] → ${soundUrl.padEnd(36)} ${tierTag}${infoStr} (${soundKit})`
        })

        console.log('\n══ GM PROGRAMS → orDrumbox → sample ══')
        console.log('  kit sélectionné: punchy\n')
        console.log(lines.join('\n'))
        console.log(`\n  ${Object.keys(GM_PROGRAM_NAMES).length} programs`)
    })

    it('all GM combined: one line per instrument', () => {
        setupKit('punchy')
        console.log('\n══ ALL GM → orDrumbox → sample (real kits) ══')
        console.log('  kit sélectionné: punchy | alt: real, matt, electro, open, ropen, generated, human, 8bits, delagrange, vintage')
        console.log('  étape1: GM name → instrument [match info]  |  étape2: instrument → sample [tier]')
        console.log('  tiers: [t1]=punchy exact/contains  [t2]=alt kit  [t3]=subst  [t4]=random')
        console.log('  ────────────────────────────────────────────────────────────────────────────────────────────────\n')

        console.log('── Drums ──')
        for (const [note, gmName] of Object.entries(GM_DRUM_NAMES)) {
            const { instrument: inst, syn, isExact } = findByNameDetailed(gmName)
            if (!inst || inst.id === Instrument.NOT_FOUND) {
                console.log(`  [${pad(note, 3)}] "${gmName}" → ❌ NOT_FOUND`)
                continue
            }
            const matchInfo = isExact ? 'exact_id' : `syn="${syn}"`
            const { soundUrl, soundKit, info, tier } = runAutoAssign(inst.id)
            const tierTag = `[t${tier}]`
            const infoStr = info ? ` ${info}` : ''
            console.log(`  [${pad(note, 3)}] "${gmName}" → ${inst.id.padEnd(14)} [${matchInfo}] → ${soundUrl.padEnd(36)} ${tierTag}${infoStr} (${soundKit})`)
        }

        console.log('\n── Programs ──')
        for (const [prog, gmName] of Object.entries(GM_PROGRAM_NAMES)) {
            const { instrument: inst, syn, isExact } = findByNameDetailed(gmName)
            if (!inst || inst.id === Instrument.NOT_FOUND) {
                console.log(`  [${pad(prog, 3)}] "${gmName}" → ❌ NOT_FOUND`)
                continue
            }
            const matchInfo = isExact ? 'exact_id' : `syn="${syn}"`
            const { soundUrl, soundKit, info, tier } = runAutoAssign(inst.id)
            const tierTag = `[t${tier}]`
            const infoStr = info ? ` ${info}` : ''
            console.log(`  [${pad(prog, 3)}] "${gmName}" → ${inst.id.padEnd(14)} [${matchInfo}] → ${soundUrl.padEnd(36)} ${tierTag}${infoStr} (${soundKit})`)
        }

        const total = Object.keys(GM_DRUM_NAMES).length + Object.keys(GM_PROGRAM_NAMES).length
        console.log(`\n  ${total} total`)
    })
})
