import { describe, it, expect, vi } from 'vitest'
import { downloadBlob } from '../src/core/download.js'

describe('downloadBlob', () => {
    it('creates an anchor, sets href/download, clicks, and revokes the URL', () => {
        const mockUrl = 'blob:mock'
        const mockAnchor = { href: '', download: '', click: vi.fn() }
        const createObjectUrlSpy = vi.fn(() => mockUrl)
        const revokeObjectUrlSpy = vi.fn()
        const createElementSpy = vi.fn(() => mockAnchor)

        vi.stubGlobal('URL', { createObjectURL: createObjectUrlSpy, revokeObjectURL: revokeObjectUrlSpy })
        vi.stubGlobal('document', { createElement: createElementSpy })

        downloadBlob(new Blob(['x']), 'file.wav')

        expect(createElementSpy).toHaveBeenCalledWith('a')
        expect(mockAnchor.href).toBe(mockUrl)
        expect(mockAnchor.download).toBe('file.wav')
        expect(mockAnchor.click).toHaveBeenCalled()
        expect(revokeObjectUrlSpy).toHaveBeenCalledWith(mockUrl)

        vi.unstubAllGlobals()
    })

    it('downloadWav defaults filename to pattern.wav', async () => {
        const { default: WavExporter } = await import('../src/audio/export/wav_exporter.js')
        const exporter = new WavExporter()

        const mockAnchor = { href: '', download: '', click: vi.fn() }
        vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:x'), revokeObjectURL: vi.fn() })
        vi.stubGlobal('document', { createElement: vi.fn(() => mockAnchor) })

        exporter.downloadWav(new Blob(['x']), null)
        expect(mockAnchor.download).toBe('pattern.wav')

        vi.unstubAllGlobals()
    })
})
