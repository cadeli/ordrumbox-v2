import { describe, it, expect } from 'vitest'
import InstrumentsManager, {
    instrumentsManager,
    GM_DRUM_NAMES,
    GM_PROGRAM_NAMES
} from '../src/logic/services/instruments_manager.js'
import Instrument from '../src/model/instrument.js'

describe('GM → orDrumbox mapping', () => {
    const instDataById = new Map(
        InstrumentsManager.DATA.instruments.map(i => [i.id, i])
    )

    const formatInstrument = (inst, gmName) => {
        const data = instDataById.get(inst.id)
        if (!data) return `  → ${inst.id} (no DATA entry)`
        const lines = [`  → ${inst.id} (drum=${data.drum}, pan=${data.pan})`]
        if (data.name?.syn?.length) {
            lines.push(`    syn: [${data.name.syn.join(' | ')}]`)
        }
        if (data.midi?.length) {
            const midiInfo = data.midi.map(m =>
                `${m.name}${m.key ? ' key=' + m.key : ''}${m.programm ? ' prog=' + m.programm : ''}`
            ).join(', ')
            lines.push(`    midi: [${midiInfo}]`)
        }
        const substVals = Object.values(data.subst ?? {})
        if (substVals.length) {
            lines.push(`    subst: [${substVals.join(' → ')}]`)
            const chain = instrumentsManager.getTrackCandidatesFromInstrument(inst)
            lines.push(`    chain: [${chain.join(' → ')}]`)
        }
        return lines.join('\n')
    }

    it('all GM_DRUM_NAMES resolve to an orDrumbox instrument', () => {
        const results = []
        for (const [note, gmName] of Object.entries(GM_DRUM_NAMES)) {
            const inst = instrumentsManager.findByName(gmName)
            results.push({ note: Number(note), gmName, inst })
        }

        const table = results.map(r => {
            const instId = r.inst?.id ?? 'NOT_FOUND'
            const isNotFound = !r.inst || instId === Instrument.NOT_FOUND
            const header = `  [${String(r.note).padStart(3)}] "${r.gmName}" → ${isNotFound ? '❌ NOT_FOUND' : instId}`
            if (isNotFound) return header
            return `${header}\n${formatInstrument(r.inst, r.gmName)}`
        }).join('\n')

        console.log('\n══ GM DRUM NAMES → orDrumbox ══')
        console.log(table)

        const notFound = results.filter(r => !r.inst || r.inst.id === Instrument.NOT_FOUND)
        console.log(`\n  Total: ${results.length} drums, ${notFound.length} NOT_FOUND`)
        if (notFound.length) {
            console.log('  Missing:', notFound.map(r => `"${r.gmName}" (note=${r.note})`).join(', '))
        }
    })

    it('all GM_PROGRAM_NAMES resolve to an orDrumbox instrument', () => {
        const results = []
        for (const [prog, gmName] of Object.entries(GM_PROGRAM_NAMES)) {
            const inst = instrumentsManager.findByName(gmName)
            results.push({ prog: Number(prog), gmName, inst })
        }

        const table = results.map(r => {
            const instId = r.inst?.id ?? 'NOT_FOUND'
            const isNotFound = !r.inst || instId === Instrument.NOT_FOUND
            const header = `  [${String(r.prog).padStart(3)}] "${r.gmName}" → ${isNotFound ? '❌ NOT_FOUND' : instId}`
            if (isNotFound) return header
            return `${header}\n${formatInstrument(r.inst, r.gmName)}`
        }).join('\n')

        console.log('\n══ GM PROGRAM NAMES → orDrumbox ══')
        console.log(table)

        const notFound = results.filter(r => !r.inst || r.inst.id === Instrument.NOT_FOUND)
        console.log(`\n  Total: ${results.length} programs, ${notFound.length} NOT_FOUND`)
        if (notFound.length) {
            console.log('  Missing:', notFound.map(r => `"${r.gmName}" (prog=${r.prog})`).join(', '))
        }
    })

    it('all GM_DRUM_NAMES instruments have valid substitution chains', () => {
        console.log('\n══ GM DRUM SUBSTITUTION CHAINS ══')
        for (const [note, gmName] of Object.entries(GM_DRUM_NAMES)) {
            const inst = instrumentsManager.findByName(gmName)
            if (!inst || inst.id === Instrument.NOT_FOUND) continue
            const data = instDataById.get(inst.id)
            if (!data) continue
            const chain = instrumentsManager.getTrackCandidatesFromInstrument(inst)
            const substStr = chain.join(' → ')
            console.log(`  [${String(note).padStart(3)}] "${gmName}" → ${inst.id}  chain: ${substStr}`)
        }
    })

    it('all GM_PROGRAM_NAMES instruments have valid substitution chains', () => {
        console.log('\n══ GM PROGRAM SUBSTITUTION CHAINS ══')
        for (const [prog, gmName] of Object.entries(GM_PROGRAM_NAMES)) {
            const inst = instrumentsManager.findByName(gmName)
            if (!inst || inst.id === Instrument.NOT_FOUND) continue
            const data = instDataById.get(inst.id)
            if (!data) continue
            const chain = instrumentsManager.getTrackCandidatesFromInstrument(inst)
            const substStr = chain.join(' → ')
            console.log(`  [${String(prog).padStart(3)}] "${gmName}" → ${inst.id}  chain: ${substStr}`)
        }
    })

    it('detailed view: GM drums with full instrument info', () => {
        console.log('\n══ GM DRUMS — DETAILED ══')
        for (const [note, gmName] of Object.entries(GM_DRUM_NAMES)) {
            const inst = instrumentsManager.findByName(gmName)
            const isNotFound = !inst || inst.id === Instrument.NOT_FOUND
            console.log(`\n[${String(note).padStart(3)}] "${gmName}"`)
            if (isNotFound) {
                console.log('  → ❌ NOT FOUND in InstrumentsManager')
            } else {
                console.log(formatInstrument(inst, gmName))
            }
        }
    })

    it('detailed view: GM programs with full instrument info', () => {
        console.log('\n══ GM PROGRAMS — DETAILED ══')
        for (const [prog, gmName] of Object.entries(GM_PROGRAM_NAMES)) {
            const inst = instrumentsManager.findByName(gmName)
            const isNotFound = !inst || inst.id === Instrument.NOT_FOUND
            console.log(`\n[${String(prog).padStart(3)}] "${gmName}"`)
            if (isNotFound) {
                console.log('  → ❌ NOT FOUND in InstrumentsManager')
            } else {
                console.log(formatInstrument(inst, gmName))
            }
        }
    })

    it('summary: group GM instruments by orDrumbox category', () => {
        console.log('\n══ GM → orDrumbox CATEGORY SUMMARY ══')

        const drumCategories = new Map()
        for (const [note, gmName] of Object.entries(GM_DRUM_NAMES)) {
            const inst = instrumentsManager.findByName(gmName)
            const cat = inst?.id ?? 'NOT_FOUND'
            if (!drumCategories.has(cat)) drumCategories.set(cat, [])
            drumCategories.get(cat).push({ note: Number(note), gmName })
        }

        console.log('\n── Drums ──')
        for (const [cat, items] of drumCategories) {
            const label = cat === 'NOT_FOUND'
                ? '❌ NOT_FOUND'
                : `${cat} (drum=${instDataById.get(cat)?.drm ?? instDataById.get(cat)?.drum})`
            console.log(`\n  ${label}:`)
            for (const item of items) {
                console.log(`    [${String(item.note).padStart(3)}] ${item.gmName}`)
            }
        }

        const programCategories = new Map()
        for (const [prog, gmName] of Object.entries(GM_PROGRAM_NAMES)) {
            const inst = instrumentsManager.findByName(gmName)
            const cat = inst?.id ?? 'NOT_FOUND'
            if (!programCategories.has(cat)) programCategories.set(cat, [])
            programCategories.get(cat).push({ prog: Number(prog), gmName })
        }

        console.log('\n── Programs ──')
        for (const [cat, items] of programCategories) {
            const data = instDataById.get(cat)
            const label = cat === 'NOT_FOUND'
                ? '❌ NOT_FOUND'
                : `${cat} (drum=${data?.drum})`
            console.log(`\n  ${label}:`)
            for (const item of items) {
                console.log(`    [${String(item.prog).padStart(3)}] ${item.gmName}`)
            }
        }

        console.log(`\n  Drum categories: ${drumCategories.size}, Program categories: ${programCategories.size}`)
    })
})
