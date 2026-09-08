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

describe('GM → orDrumbox auto-assign mapping', () => {
    const instDataById = new Map(
        InstrumentsManager.DATA.instruments.map(i => [i.id, i])
    )

    const kitPunchy = {
        'p_kick':      { key: 'KICK',       kit_name: 'punchy', url: 'kits/punchy/kick.wav' },
        'p_snare':     { key: 'SNARE',      kit_name: 'punchy', url: 'kits/punchy/snare.wav' },
        'p_chh':       { key: 'CHH',        kit_name: 'punchy', url: 'kits/punchy/chh.wav' },
        'p_ohh':       { key: 'OHH',        kit_name: 'punchy', url: 'kits/punchy/ohh.wav' },
        'p_rim':       { key: 'RIMSHOT',    kit_name: 'punchy', url: 'kits/punchy/rimshot.wav' },
        'p_clap':      { key: 'CLAP',       kit_name: 'punchy', url: 'kits/punchy/clap.wav' },
        'p_cowbell':   { key: 'COWBELL',    kit_name: 'punchy', url: 'kits/punchy/cowbell.wav' },
        'p_ride':      { key: 'RIDE',       kit_name: 'punchy', url: 'kits/punchy/ride.wav' },
        'p_crash':     { key: 'CRASH',      kit_name: 'punchy', url: 'kits/punchy/crash.wav' },
        'p_tom':       { key: 'TOM',        kit_name: 'punchy', url: 'kits/punchy/tom.wav' },
        'p_htom':      { key: 'HI_TOM',     kit_name: 'punchy', url: 'kits/punchy/hi_tom.wav' },
        'p_mtom':      { key: 'MTOM',       kit_name: 'punchy', url: 'kits/punchy/mtom.wav' },
        'p_ltom':      { key: 'LO_TOM',     kit_name: 'punchy', url: 'kits/punchy/lo_tom.wav' },
        'p_conga':     { key: 'CONGAS',     kit_name: 'punchy', url: 'kits/punchy/congas.wav' },
        'p_bongo':     { key: 'BONGOS',     kit_name: 'punchy', url: 'kits/punchy/bongos.wav' },
        'p_maracas':   { key: 'MARACAS',    kit_name: 'punchy', url: 'kits/punchy/maracas.wav' },
        'p_guiro':     { key: 'GUIRO',      kit_name: 'punchy', url: 'kits/punchy/guiro.wav' },
        'p_triangle':  { key: 'TRIANGLE',   kit_name: 'punchy', url: 'kits/punchy/triangle.wav' },
        'p_claves':    { key: 'CLAVES',     kit_name: 'punchy', url: 'kits/punchy/claves.wav' },
        'p_cuica':     { key: 'CUICA',      kit_name: 'punchy', url: 'kits/punchy/cuica.wav' },
        'p_piano':     { key: 'PIANO',      kit_name: 'punchy', url: 'kits/punchy/piano.wav' },
        'p_bass':      { key: 'BASS',       kit_name: 'punchy', url: 'kits/punchy/bass.wav' },
        'p_guitar':    { key: 'GUITAR',     kit_name: 'punchy', url: 'kits/punchy/guitar.wav' },
        'p_organ':     { key: 'ORGAN',      kit_name: 'punchy', url: 'kits/punchy/organ.wav' },
        'p_brass':     { key: 'BRASS',      kit_name: 'punchy', url: 'kits/punchy/brass.wav' },
        'p_sax':       { key: 'SAX',        kit_name: 'punchy', url: 'kits/punchy/sax.wav' },
        'p_strings':   { key: 'STRINGS',    kit_name: 'punchy', url: 'kits/punchy/strings.wav' },
        'p_ensemble':  { key: 'ENSEMBLE',   kit_name: 'punchy', url: 'kits/punchy/ensemble.wav' },
        'p_pipe':      { key: 'PIPE',       kit_name: 'punchy', url: 'kits/punchy/pipe.wav' },
        'p_reed':      { key: 'REED',       kit_name: 'punchy', url: 'kits/punchy/reed.wav' },
        'p_melo':      { key: 'MELO',       kit_name: 'punchy', url: 'kits/punchy/melo.wav' },
        'p_hit':       { key: 'HIT',        kit_name: 'punchy', url: 'kits/punchy/hit.wav' },
        'p_cym':       { key: 'CYM',        kit_name: 'punchy', url: 'kits/punchy/cym.wav' },
    }

    const kitElectronic = {
        'e_kick':      { key: 'KICK',       kit_name: 'electronic', url: 'kits/electronic/kick.wav' },
        'e_snare':     { key: 'SNARE',      kit_name: 'electronic', url: 'kits/electronic/snare.wav' },
        'e_chh':       { key: 'CHH',        kit_name: 'electronic', url: 'kits/electronic/chh.wav' },
        'e_ohh':       { key: 'OHH',        kit_name: 'electronic', url: 'kits/electronic/ohh.wav' },
        'e_rim':       { key: 'RIMSHOT',    kit_name: 'electronic', url: 'kits/electronic/rimshot.wav' },
        'e_clap':      { key: 'CLAP',       kit_name: 'electronic', url: 'kits/electronic/clap.wav' },
        'e_cowbell':   { key: 'COWBELL',    kit_name: 'electronic', url: 'kits/electronic/cowbell.wav' },
        'e_ride':      { key: 'RIDE',       kit_name: 'electronic', url: 'kits/electronic/ride.wav' },
        'e_crash':     { key: 'CRASH',      kit_name: 'electronic', url: 'kits/electronic/crash.wav' },
        'e_tamb':      { key: 'TAMBOURINE', kit_name: 'electronic', url: 'kits/electronic/tambourine.wav' },
        'e_tom':       { key: 'TOM',        kit_name: 'electronic', url: 'kits/electronic/tom.wav' },
        'e_htom':      { key: 'HI_TOM',     kit_name: 'electronic', url: 'kits/electronic/hi_tom.wav' },
        'e_ltom':      { key: 'LO_TOM',     kit_name: 'electronic', url: 'kits/electronic/lo_tom.wav' },
        'e_hconga':    { key: 'HI_CONGAS',  kit_name: 'electronic', url: 'kits/electronic/hi_congas.wav' },
        'e_lconga':    { key: 'LO_CONGAS',  kit_name: 'electronic', url: 'kits/electronic/lo_congas.wav' },
        'e_shaker':    { key: 'SHAKER',     kit_name: 'electronic', url: 'kits/electronic/shaker.wav' },
        'e_ethnic':    { key: 'ETHNIC',     kit_name: 'electronic', url: 'kits/electronic/ethnic.wav' },
        'e_cromaperc': { key: 'CROMAPERC',  kit_name: 'electronic', url: 'kits/electronic/cromaperc.wav' },
        'e_synthpad':  { key: 'SYNTHPAD',   kit_name: 'electronic', url: 'kits/electronic/synthpad.wav' },
    }

    const allSounds = { ...kitPunchy, ...kitElectronic }

    const setupKit = () => {
        appState.reset()
        soundRegistry.reset()
        soundRegistry.sounds = { ...allSounds }
        soundRegistry.drumkitList = [
            { name: 'punchy', instruments: [] },
            { name: 'electronic', instruments: [] }
        ]
        appState.selectedDrumkitNum = 0
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
            const kitMatch = logLine.match(/autre kit "(\w+)"/)
            info = `alt kit${kitMatch ? ' "' + kitMatch[1] + '"' : ''}`
        } else if (tier === 3) {
            const keyMatch = logLine.match(/key="(\w+)"/)
            const kitMatch = logLine.match(/(même kit|autre kit "(\w+)")/)
            const subType = kitMatch?.[1]?.startsWith('même') ? 'same kit' : `alt kit "${kitMatch?.[2] ?? '?'}"`
            info = `subst → ${keyMatch?.[1] ?? '?'} (${subType})`
        } else if (tier === 4) {
            info = 'random'
        } else if (tier === 0) {
            info = 'NOT_DEFINED'
        }

        const soundUrl = track.soundId && track.soundId !== 'NOT_DEFINED'
            ? (allSounds[track.soundId]?.url ?? track.soundId)
            : 'NONE'
        const soundKit = track.soundId && track.soundId !== 'NOT_DEFINED'
            ? (allSounds[track.soundId]?.kit_name ?? '?')
            : '-'

        return { track, soundUrl, soundKit, info, tier }
    }

    const pad = (s, n) => String(s).padStart(n)

    it('GM drums → orDrumbox → sample (kit: punchy)', () => {
        setupKit()
        const lines = Object.entries(GM_DRUM_NAMES).map(([note, gmName]) => {
            const inst = instrumentsManager.findByName(gmName)
            if (!inst || inst.id === Instrument.NOT_FOUND) {
                return `  [${pad(note, 3)}] "${gmName}" → ❌ NOT_FOUND`
            }
            const { soundUrl, soundKit, info, tier } = runAutoAssign(inst.id)
            const tierTag = `[t${tier}]`
            const infoStr = info ? ` ${info}` : ''
            return `  [${pad(note, 3)}] "${gmName}" → ${inst.id.padEnd(14)} → ${soundUrl.padEnd(32)} ${tierTag}${infoStr} (${soundKit})`
        })

        console.log('\n══ GM DRUMS → orDrumbox → sample ══')
        console.log('  kit sélectionné: punchy\n')
        console.log(lines.join('\n'))
        console.log(`\n  ${Object.keys(GM_DRUM_NAMES).length} drums`)
    })

    it('GM programs → orDrumbox → sample (kit: punchy)', () => {
        setupKit()
        const lines = Object.entries(GM_PROGRAM_NAMES).map(([prog, gmName]) => {
            const inst = instrumentsManager.findByName(gmName)
            if (!inst || inst.id === Instrument.NOT_FOUND) {
                return `  [${pad(prog, 3)}] "${gmName}" → ❌ NOT_FOUND`
            }
            const { soundUrl, soundKit, info, tier } = runAutoAssign(inst.id)
            const tierTag = `[t${tier}]`
            const infoStr = info ? ` ${info}` : ''
            return `  [${pad(prog, 3)}] "${gmName}" → ${inst.id.padEnd(14)} → ${soundUrl.padEnd(32)} ${tierTag}${infoStr} (${soundKit})`
        })

        console.log('\n══ GM PROGRAMS → orDrumbox → sample ══')
        console.log('  kit sélectionné: punchy\n')
        console.log(lines.join('\n'))
        console.log(`\n  ${Object.keys(GM_PROGRAM_NAMES).length} programs`)
    })

    it('all GM combined: one line per instrument', () => {
        setupKit()
        console.log('\n══ ALL GM → orDrumbox → sample ══')
        console.log('  kit sélectionné: punchy | alt kit: electronic\n')
        console.log('  tiers: [t1]=punchy exact/contains  [t2]=alt kit  [t3]=subst  [t4]=random')
        console.log('  ─────────────────────────────────────────────────────────────────────────\n')

        console.log('── Drums ──')
        for (const [note, gmName] of Object.entries(GM_DRUM_NAMES)) {
            const inst = instrumentsManager.findByName(gmName)
            if (!inst || inst.id === Instrument.NOT_FOUND) {
                console.log(`  [${pad(note, 3)}] "${gmName}" → ❌ NOT_FOUND`)
                continue
            }
            const { soundUrl, soundKit, info, tier } = runAutoAssign(inst.id)
            const tierTag = `[t${tier}]`
            const infoStr = info ? ` ${info}` : ''
            console.log(`  [${pad(note, 3)}] "${gmName}" → ${inst.id.padEnd(14)} → ${soundUrl.padEnd(32)} ${tierTag}${infoStr} (${soundKit})`)
        }

        console.log('\n── Programs ──')
        for (const [prog, gmName] of Object.entries(GM_PROGRAM_NAMES)) {
            const inst = instrumentsManager.findByName(gmName)
            if (!inst || inst.id === Instrument.NOT_FOUND) {
                console.log(`  [${pad(prog, 3)}] "${gmName}" → ❌ NOT_FOUND`)
                continue
            }
            const { soundUrl, soundKit, info, tier } = runAutoAssign(inst.id)
            const tierTag = `[t${tier}]`
            const infoStr = info ? ` ${info}` : ''
            console.log(`  [${pad(prog, 3)}] "${gmName}" → ${inst.id.padEnd(14)} → ${soundUrl.padEnd(32)} ${tierTag}${infoStr} (${soundKit})`)
        }

        const total = Object.keys(GM_DRUM_NAMES).length + Object.keys(GM_PROGRAM_NAMES).length
        console.log(`\n  ${total} total`)
    })
})
