// e2e/song-wav-export.spec.js
//
// Tools ▸ Export ▸ "Export Song" renders the whole arrangement to a WAV: every
// clip layered, at the song's single tempo.
//
// Two things the export can silently get wrong, and what each test pins down:
//   - the file length: rendering one pattern, or ignoring `loopMeasureCount`, produces
//     a valid WAV of the wrong size;
//   - whether the clips really are all in it: a render that only sounds the
//     first clip is also the right size, so length alone proves nothing.
//
// Audio is judged on the WAV bytes, decoded here: RMS/peak for "there is sound",
// and a sample-by-sample comparison for "the second clip is in the mix" — the
// RMS of two drum patterns can be nearly equal while the waveforms differ
// completely, so loudness alone cannot assert layering.

import { test, expect } from '@playwright/test'
import { bootApp } from './fixtures.js'
import { TICK } from '../src/core/constants.js'
import { BEATS_PER_MEASURE } from '../src/model/song_schema.js'

const SR = 44100

/**
 * Renders a song inside the page and returns the decoded WAV facts.
 *
 * Uses a purpose-built arrangement rather than the demo song so the render stays
 * short: two measures holding both demo patterns on the same measure.
 */
async function renderSongWav(page, { bpm = 120, loopMeasureCount = 2, clips }) {
    return page.evaluate(
        async ({ bpm, loopMeasureCount, clips }) => {
            const { default: WavExporter } = await import('/src/audio/export/wav_exporter.js')
            const { appState } = window.__e2e
            const song = { id: 'e2e', name: 'E2E Song', description: '', bpm, loopMeasureCount, clips }

            const blob = await new WavExporter().exportSongToWav(song, { patterns: appState.patterns })
            const dv = new DataView(await blob.arrayBuffer())

            const channels = dv.getUint16(22, true)
            const sampleRate = dv.getUint32(24, true)
            const bits = dv.getUint16(34, true)
            const frames = dv.getUint32(40, true) / (channels * (bits / 8))

            // first channel, enough to compare two renders sample by sample
            const left = new Float32Array(frames)
            for (let i = 0; i < frames; i++) left[i] = dv.getInt16(44 + i * 2 * channels, true) / 32768

            let mean = 0
            for (let i = 0; i < frames; i++) mean += left[i]
            mean /= frames
            let sumSq = 0
            let peak = 0
            for (let i = 0; i < frames; i++) {
                const d = left[i] - mean // AC only: a DC offset is not "sound"
                sumSq += d * d
                if (Math.abs(d) > peak) peak = Math.abs(d)
            }

            return {
                riff: String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3)),
                channels,
                sampleRate,
                bits,
                seconds: frames / sampleRate,
                rms: Math.sqrt(sumSq / frames),
                peak,
                left: Array.from(left),
            }
        },
        { bpm, loopMeasureCount, clips },
    )
}

/** How differently two renders sound, independent of any absolute level. */
function compare(a, b) {
    let differing = 0
    let num = 0
    let den = 0
    for (let i = 0; i < a.length; i++) {
        const d = a[i] - b[i]
        if (d !== 0) differing++
        num += d * d
        den += a[i] * a[i]
    }
    return { pctDiffering: (100 * differing) / a.length, relRms: Math.sqrt(num / den) }
}

/** The first demo patterns, which the boot has already loaded samples for. */
const demoClipIds = (page) => page.evaluate(() => window.__e2e.appState.patterns.slice(0, 2).map((p) => p.id))

test.describe('Song WAV export', () => {
    test('renders the arrangement at the right length, with audio in it', async ({ page }) => {
        test.setTimeout(120_000)
        await bootApp(page)
        const [a, b] = await demoClipIds(page)

        const wav = await renderSongWav(page, {
            bpm: 120,
            loopMeasureCount: 2,
            clips: [
                { pattern: a, startMeasure: 0, measureCount: 2 },
                { pattern: b, startMeasure: 0, measureCount: 2 },
            ],
        })

        // a valid 16-bit stereo RIFF file
        expect(wav.riff).toBe('RIFF')
        expect(wav.channels).toBe(2)
        expect(wav.sampleRate).toBe(SR)
        expect(wav.bits).toBe(16)

        // 2 measures of 4/4 at 120 bpm = 2 * 4 * 0.5 s
        expect(wav.seconds).toBeCloseTo(4, 3)

        // and it is actually filled, not a valid-but-empty render
        expect(wav.rms).toBeGreaterThan(0.001)
        expect(wav.peak).toBeGreaterThan(0.05)
    })

    test('length follows the tempo of the song, not of a pattern', async ({ page }) => {
        test.setTimeout(120_000)
        await bootApp(page)
        const [a] = await demoClipIds(page)

        const wav = await renderSongWav(page, {
            bpm: 240,
            loopMeasureCount: 2,
            clips: [{ pattern: a, startMeasure: 0, measureCount: 2 }],
        })

        // twice the tempo, half the wall-clock time
        expect(wav.seconds).toBeCloseTo(2, 3)
        expect(wav.rms).toBeGreaterThan(0.001)
    })

    // The length above is also what a single-pattern render would give, so this
    // is the assertion that actually proves the arrangement was exported.
    test('a second clip on the same measure changes the render', async ({ page }) => {
        test.setTimeout(120_000)
        await bootApp(page)
        const [a, b] = await demoClipIds(page)

        const single = await renderSongWav(page, {
            bpm: 120,
            loopMeasureCount: 2,
            clips: [{ pattern: a, startMeasure: 0, measureCount: 2 }],
        })
        const layered = await renderSongWav(page, {
            bpm: 120,
            loopMeasureCount: 2,
            clips: [
                { pattern: a, startMeasure: 0, measureCount: 2 },
                { pattern: b, startMeasure: 0, measureCount: 2 },
            ],
        })

        expect(single.rms).toBeGreaterThan(0.001)
        const diff = compare(single.left, layered.left)
        // the extra clip rewrites most of the waveform; RMS is not asserted
        // because two drum patterns of similar density have similar RMS
        expect(diff.pctDiffering).toBeGreaterThan(50)
        expect(diff.relRms).toBeGreaterThan(0.05)
    })

    test('refuses a song with no playable clip', async ({ page }) => {
        await bootApp(page)
        const message = await page.evaluate(async () => {
            const { default: WavExporter } = await import('/src/audio/export/wav_exporter.js')
            try {
                await new WavExporter().exportSongToWav(
                    { id: 'empty', name: 'Empty', description: '', bpm: 120, clips: [] },
                    { patterns: window.__e2e.appState.patterns },
                )
                return null
            } catch (e) {
                return e.message
            }
        })
        expect(message).toMatch(/no playable clip/i)
    })

    // The button itself, on the demo song. Its loop is shortened first: the demo
    // arrangement is 66 measures (132 s of audio to render), far too long for a test,
    // and the export follows the arrangement exactly as it is configured.
    test('the Export Song button downloads the whole arrangement', async ({ page }) => {
        test.setTimeout(180_000)
        await bootApp(page)
        await page.evaluate(() => (window.__e2e.appState.songs[0].loopMeasureCount = 2))

        // the Export tab is not the one shown when the panel opens
        await page.locator('.tb-tools').click()
        await page.locator('.ne-tab-btn[data-ne-tab="export"]').click()
        await expect(page.locator('#tp-export-song-wav')).toBeVisible()

        const [download] = await Promise.all([
            page.waitForEvent('download', { timeout: 120_000 }),
            page.locator('#tp-export-song-wav').click(),
        ])

        const stream = await download.createReadStream()
        const chunks = []
        for await (const chunk of stream) chunks.push(chunk)
        const file = Buffer.concat(chunks)
        const dv = new DataView(file.buffer, file.byteOffset, file.byteLength)

        expect(String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3))).toBe('RIFF')
        expect(dv.getUint16(22, true)).toBe(2)
        const frames = dv.getUint32(40, true) / (2 * 2)
        // 2 measures of 4/4 at 120 bpm = 2 * 4 * 0.5 s
        expect(frames / dv.getUint32(24, true)).toBeCloseTo(4, 1)
    })

    // cross-check the numbers above against the shared constants, so the
    // expectations cannot silently drift from the engine
    test('the expected lengths match the engine constants', () => {
        expect(BEATS_PER_MEASURE).toBe(4)
        expect(BEATS_PER_MEASURE * TICK).toBe(128)
        // 2 measures of 4/4, at 120 bpm and then at 240 bpm
        expect(2 * BEATS_PER_MEASURE * (60 / 120)).toBeCloseTo(4, 6)
        expect(2 * BEATS_PER_MEASURE * (60 / 240)).toBeCloseTo(2, 6)
    })
})
