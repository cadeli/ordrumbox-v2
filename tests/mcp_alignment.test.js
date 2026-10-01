import { describe, it, expect } from 'vitest'
import { tools, handleToolCall } from '../ordrumboxMcpserver.mjs'
import { TRACK_DEFAULTS, TRACK_VALUE_RANGES } from '../src/model/track_schema.js'
import { NOTE_DEFAULTS } from '../src/core/note_schema.js'

const toolByName = (name) => tools.find((t) => t.name === name)

const updateTrackProps = () => toolByName('updateTrack').inputSchema.properties.updates.properties

const noteItemProps = () => toolByName('addNotesToPattern').inputSchema.properties.notes.items.properties

const noteUpdateProps = () => toolByName('updateTrack').inputSchema.properties.noteUpdates.properties

describe('MCP server stays aligned with the app model', () => {
    it('exposes unique tool names', () => {
        const names = tools.map((t) => t.name)
        expect(new Set(names).size).toBe(names.length)
    })

    it('every listed tool has a handler (never "Unknown tool")', async () => {
        // Empty args make handlers fail on validation before any file write,
        // so this stays read-only against the repo data.
        for (const tool of tools) {
            const res = await handleToolCall(tool.name, {})
            const payload = res?.content?.[0]?.text ?? ''
            expect(payload, `${tool.name} has no handler`).not.toContain('Unknown tool')
        }
    })

    it('updateTrack schema covers every TRACK_DEFAULTS field', () => {
        const props = updateTrackProps()
        const positional = new Set(['name', 'notes'])
        for (const key of Object.keys(TRACK_DEFAULTS)) {
            if (positional.has(key)) continue
            expect(props, `missing updates.${key}`).toHaveProperty(key)
        }
        expect(props).toHaveProperty('delayDepth')
        expect(props).not.toHaveProperty('delayAmount')
        expect(JSON.stringify(tools)).not.toContain('delayAmount')
    })

    it('updateTrack numeric ranges come from TRACK_VALUE_RANGES', () => {
        const props = updateTrackProps()
        for (const [key, range] of Object.entries(TRACK_VALUE_RANGES)) {
            expect(props[key], `missing updates.${key}`).toBeDefined()
            expect(props[key].minimum, `minimum of ${key}`).toBe(range.min)
            expect(props[key].maximum, `maximum of ${key}`).toBe(range.max)
        }
    })

    it('delay type enum matches the delay engine modes', () => {
        expect(updateTrackProps().delayType.enum).toEqual(['none', 'slap', 'tape', 'pingpong'])
    })

    it('note schemas cover every NOTE_DEFAULTS field', () => {
        const positional = new Set(['beat', 'beatStep'])
        const item = noteItemProps()
        const updates = noteUpdateProps()
        for (const key of Object.keys(NOTE_DEFAULTS)) {
            if (positional.has(key)) continue
            expect(item, `missing notes.${key}`).toHaveProperty(key)
            expect(updates, `missing noteUpdates.${key}`).toHaveProperty(key)
        }
        expect(item.euclidianFill.maximum).toBe(16)
        expect(item.euclidianRotation).toEqual(expect.objectContaining({ type: 'integer', minimum: 0, maximum: 15 }))
    })

    it('LFO fields are nullable objects with the modelled shape', () => {
        const props = updateTrackProps()
        for (const key of ['velocityLfo', 'pitchLfo', 'panLfo', 'filterFreqLfo', 'filterQLfo']) {
            expect(props[key].type).toEqual(expect.arrayContaining(['object', 'null']))
            expect(Object.keys(props[key].properties).sort()).toEqual(['freq', 'max', 'min', 'phase', 'type'])
        }
    })

    it('read-only tools work against the repo data', async () => {
        const list = await handleToolCall('listPatterns', {})
        const { patterns, count } = JSON.parse(list.content[0].text)
        expect(count).toBeGreaterThan(0)

        const load = await handleToolCall('loadPattern', { patternName: patterns[0] })
        const pattern = JSON.parse(load.content[0].text)
        expect(pattern.error).toBeUndefined()
        expect(pattern.tracks.length).toBeGreaterThan(0)

        const track = pattern.tracks[0]
        // Full normalized output: defaults filled, derived keys omitted.
        expect(track).toHaveProperty('delayDepth')
        expect(track).toHaveProperty('swingAmount')
        expect(track).toHaveProperty('prob_pitch')
        expect(track).not.toHaveProperty('loopPointBeat')
        expect(track).not.toHaveProperty('loopPointStep')

        const kits = await handleToolCall('listKitSamples', {})
        expect(JSON.parse(kits.content[0].text).count).toBeGreaterThan(0)

        const instruments = await handleToolCall('listAllInstrumentsNames', {})
        expect(JSON.parse(instruments.content[0].text).count).toBeGreaterThan(0)
    })
})
