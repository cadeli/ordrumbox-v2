import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import MidiExporter from '../src/logic/midi/midi_exporter.js'
import { makePattern, makeTrack, makeNote } from './helpers/make_pattern.js'

vi.mock('../src/core/download.js', () => ({
    downloadBlob: vi.fn(),
}))

import { downloadBlob } from '../src/core/download.js'

function makeSimplePattern(name = 'Pat') {
    const track = makeTrack('KICK', [makeNote(0, 0)], { nbBeats: 1, stepsPerBeat: 4 })
    return makePattern({ name, tracks: [track] })
}

describe('MidiExporter.download', () => {
    beforeEach(() => {
        downloadBlob.mockClear()
    })

    afterEach(() => {
        downloadBlob.mockClear()
    })

    it('exports a MIDI blob and delegates to downloadBlob', () => {
        const pattern = makeSimplePattern('Groove')
        const exporter = new MidiExporter()

        exporter.download(pattern, 'Groove.mid')

        expect(downloadBlob).toHaveBeenCalledTimes(1)
        const [blob, filename] = downloadBlob.mock.calls[0]
        expect(filename).toBe('Groove.mid')
        expect(blob.type).toBe('audio/midi')
    })

    it('falls back to pattern.name.mid when filename is omitted', () => {
        const pattern = makeSimplePattern('MyBeat')
        new MidiExporter().download(pattern, undefined)

        expect(downloadBlob.mock.calls[0][1]).toBe('MyBeat.mid')
    })

    it('falls back to pattern.mid when both filename and pattern.name are missing', () => {
        const pattern = makeSimplePattern(undefined)
        delete pattern.name
        new MidiExporter().download(pattern, undefined)

        expect(downloadBlob.mock.calls[0][1]).toBe('pattern.mid')
    })

    it('forwards options (loops) to export', () => {
        const pattern = makeSimplePattern('L')
        const exporter = new MidiExporter()
        const exportSpy = vi.spyOn(exporter, 'export')

        exporter.download(pattern, 'L.mid', { loops: 3 })

        expect(exportSpy).toHaveBeenCalledWith(pattern, { loops: 3 })
    })

    it('produces a non-empty MIDI blob (MThd header)', async () => {
        const pattern = makeSimplePattern('H')
        new MidiExporter().download(pattern, 'H.mid')
        const blob = downloadBlob.mock.calls[0][0]
        const bytes = new Uint8Array(await blob.arrayBuffer())
        expect(bytes.length).toBeGreaterThan(14)
        expect(String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3])).toBe('MThd')
    })
})
