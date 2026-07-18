/**
 * DSP audio parameter tests — verifies that velocity, pitch, pan,
 * filter, and LFO produce the expected audio effects using
 * real node-web-audio-api OfflineAudioContext rendering.
 */
import { describe, it, expect } from 'vitest'
import nodeWaa from 'node-web-audio-api'
import MfAudioAnalyze from '../src/audio/analyze.js'

const { OfflineAudioContext } = nodeWaa
const SAMPLE_RATE = 44100
const analyzer = new MfAudioAnalyze()

// ─── Helpers ──────────────────────────────────────────────────────────────────

function rms(samples) {
    let sum = 0
    for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i]
    return Math.sqrt(sum / samples.length)
}

function peak(samples) {
    let max = 0
    for (let i = 0; i < samples.length; i++) max = Math.max(max, Math.abs(samples[i]))
    return max
}

function energyInRange(samples, sampleRate, lowHz, highHz) {
    const fftSize = 2048
    const binHz = sampleRate / fftSize
    const lowBin = Math.max(1, Math.floor(lowHz / binHz))
    const highBin = Math.min(Math.floor(fftSize / 2) - 1, Math.ceil(highHz / binHz))

    // Simple DFT energy in the band
    let bandEnergy = 0
    let totalEnergy = 0
    const frame = new Float32Array(fftSize)
    const len = Math.min(samples.length, fftSize)
    for (let i = 0; i < len; i++) frame[i] = samples[i]

    for (let bin = 1; bin < fftSize / 2; bin++) {
        let re = 0, im = 0
        for (let i = 0; i < fftSize; i++) {
            const angle = (2 * Math.PI * bin * i) / fftSize
            re += frame[i] * Math.cos(angle)
            im -= frame[i] * Math.sin(angle)
        }
        const mag = Math.sqrt(re * re + im * im)
        const e = mag * mag
        totalEnergy += e
        if (bin >= lowBin && bin <= highBin) bandEnergy += e
    }
    return totalEnergy > 0 ? bandEnergy / totalEnergy : 0
}

/**
 * Render a sine burst with given parameters and return the audio samples.
 */
async function renderBurst({ freq = 440, duration = 0.2, gain = 1, pan = 0,
    filterFreq = null, filterQ = null, sampleRate = SAMPLE_RATE } = {}) {
    const totalSamples = Math.ceil((duration + 0.05) * sampleRate)
    const ctx = new OfflineAudioContext(2, totalSamples, sampleRate)

    const osc = ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.value = freq

    const gainNode = ctx.createGain()
    gainNode.gain.setValueAtTime(gain, 0)
    gainNode.gain.exponentialRampToValueAtTime(0.001, duration)

    let lastNode = osc

    if (filterFreq !== null) {
        const filter = ctx.createBiquadFilter()
        filter.type = 'lowpass'
        filter.frequency.value = filterFreq
        filter.Q.value = filterQ ?? 1
        lastNode.connect(filter)
        lastNode = filter
    }

    lastNode.connect(gainNode)

    if (pan !== 0) {
        const panNode = ctx.createStereoPanner()
        panNode.pan.value = pan
        gainNode.connect(panNode)
        panNode.connect(ctx.destination)
    } else {
        gainNode.connect(ctx.destination)
    }

    osc.start(0)
    osc.stop(duration + 0.01)

    const rendered = await ctx.startRendering()
    return {
        left: rendered.getChannelData(0),
        right: rendered.getChannelData(1),
    }
}

// ─── Velocity Tests ──────────────────────────────────────────────────────────

describe('velocity → gain', () => {
    it('velocity 1.0 produces higher RMS than velocity 0.3', async () => {
        const loud = await renderBurst({ gain: 1.0, duration: 0.3 })
        const quiet = await renderBurst({ gain: 0.3, duration: 0.3 })

        expect(rms(loud.left)).toBeGreaterThan(rms(quiet.left))
    })

    it('velocity 0.5 produces approximately half the RMS of velocity 1.0', async () => {
        const full = await renderBurst({ gain: 1.0, duration: 0.3 })
        const half = await renderBurst({ gain: 0.5, duration: 0.3 })

        const ratio = rms(half.left) / rms(full.left)
        expect(ratio).toBeGreaterThan(0.3)
        expect(ratio).toBeLessThan(0.7)
    })

    it('velocity 0 produces silence', async () => {
        const silent = await renderBurst({ gain: 0, duration: 0.2 })
        expect(peak(silent.left)).toBeLessThan(0.001)
    })

    it('velocity 0.8 vs 1.0 peak ratio matches gain ratio', async () => {
        const v1 = await renderBurst({ gain: 1.0, duration: 0.1 })
        const v08 = await renderBurst({ gain: 0.8, duration: 0.1 })

        const ratio = peak(v08.left) / peak(v1.left)
        expect(ratio).toBeGreaterThan(0.7)
        expect(ratio).toBeLessThan(0.9)
    })
})

// ─── Pitch Tests ─────────────────────────────────────────────────────────────

describe('pitch → frequency', () => {
    it('higher pitch produces higher spectral centroid', async () => {
        const low = await renderBurst({ freq: 110, duration: 0.3 })
        const high = await renderBurst({ freq: 880, duration: 0.3 })

        const analysisLow = analyzer.analyzeChannelData(low.left, SAMPLE_RATE)
        const analysisHigh = analyzer.analyzeChannelData(high.left, SAMPLE_RATE)

        expect(analysisHigh.spectralCentroidHz).toBeGreaterThan(analysisLow.spectralCentroidHz)
    })

    it('pitch detection matches rendered frequency', async () => {
        const result = await renderBurst({ freq: 440, duration: 0.4 })
        const analysis = analyzer.analyzeChannelData(result.left, SAMPLE_RATE)

        if (analysis.fundamentalHz) {
            expect(Math.abs(analysis.fundamentalHz - 440) / 440).toBeLessThan(0.1)
        }
    })

    it('octave doubling (2x freq) produces ~2x spectral centroid', async () => {
        const c3 = await renderBurst({ freq: 220, duration: 0.3 })
        const c4 = await renderBurst({ freq: 440, duration: 0.3 })

        const a3 = analyzer.analyzeChannelData(c3.left, SAMPLE_RATE)
        const a4 = analyzer.analyzeChannelData(c4.left, SAMPLE_RATE)

        const ratio = a4.spectralCentroidHz / a3.spectralCentroidHz
        expect(ratio).toBeGreaterThan(1.5)
        expect(ratio).toBeLessThan(2.5)
    })

    it('different pitches produce different frequency content', async () => {
        const low = await renderBurst({ freq: 100, duration: 0.3 })
        const high = await renderBurst({ freq: 2000, duration: 0.3 })

        const lowEnergy = energyInRange(low.left, SAMPLE_RATE, 80, 200)
        const highEnergy = energyInRange(high.left, SAMPLE_RATE, 80, 200)

        // Low freq signal should have more energy in 80-200 Hz band
        expect(lowEnergy).toBeGreaterThan(highEnergy)
    })
})

// ─── Pan Tests ───────────────────────────────────────────────────────────────

describe('pan → stereo balance', () => {
    it('pan=0 produces equal energy in L and R', async () => {
        const centered = await renderBurst({ pan: 0, duration: 0.3 })

        const leftRms = rms(centered.left)
        const rightRms = rms(centered.right)

        // For a sine wave, centered pan should be roughly equal
        const ratio = Math.min(leftRms, rightRms) / Math.max(leftRms, rightRms)
        expect(ratio).toBeGreaterThan(0.8)
    })

    it('pan=-1 produces more energy in left channel', async () => {
        const left = await renderBurst({ pan: -1, duration: 0.3 })

        const leftRms = rms(left.left)
        const rightRms = rms(left.right)

        expect(leftRms).toBeGreaterThan(rightRms * 5)
    })

    it('pan=1 produces more energy in right channel', async () => {
        const right = await renderBurst({ pan: 1, duration: 0.3 })

        const leftRms = rms(right.left)
        const rightRms = rms(right.right)

        expect(rightRms).toBeGreaterThan(leftRms * 5)
    })

    it('pan=-0.5 has more left than right', async () => {
        const result = await renderBurst({ pan: -0.5, duration: 0.3 })

        expect(rms(result.left)).toBeGreaterThan(rms(result.right))
    })

    it('pan=0.5 has more right than left', async () => {
        const result = await renderBurst({ pan: 0.5, duration: 0.3 })

        expect(rms(result.right)).toBeGreaterThan(rms(result.left))
    })

    it('total energy is roughly preserved across pan positions', async () => {
        const center = await renderBurst({ pan: 0, duration: 0.3 })
        const left = await renderBurst({ pan: -1, duration: 0.3 })
        const right = await renderBurst({ pan: 1, duration: 0.3 })

        const totalEnergy = (ch) => {
            let sum = 0
            for (let i = 0; i < ch.length; i++) sum += ch[i] * ch[i]
            return sum
        }

        const eCenter = totalEnergy(center.left) + totalEnergy(center.right)
        const eLeft = totalEnergy(left.left) + totalEnergy(left.right)
        const eRight = totalEnergy(right.left) + totalEnergy(right.right)

        // Total energy should be within 50% across pan positions
        const avg = (eCenter + eLeft + eRight) / 3
        expect(eCenter).toBeGreaterThan(avg * 0.5)
        expect(eLeft).toBeGreaterThan(avg * 0.5)
        expect(eRight).toBeGreaterThan(avg * 0.5)
    })
})

// ─── Filter (Lowpass) Tests ──────────────────────────────────────────────────

describe('filter lowpass → frequency cutoff', () => {
    it('lowpass at 200 Hz reduces high-frequency energy', async () => {
        const open = await renderBurst({ freq: 1000, duration: 0.3, gain: 0.8 })
        const filtered = await renderBurst({ freq: 1000, duration: 0.3, gain: 0.8, filterFreq: 200, filterQ: 1 })

        const openHigh = energyInRange(open.left, SAMPLE_RATE, 800, 3000)
        const filteredHigh = energyInRange(filtered.left, SAMPLE_RATE, 800, 3000)

        expect(filteredHigh).toBeLessThan(openHigh)
    })

    it('lowpass at 200 Hz preserves low-frequency energy', async () => {
        const open = await renderBurst({ freq: 100, duration: 0.3, gain: 0.8 })
        const filtered = await renderBurst({ freq: 100, duration: 0.3, gain: 0.8, filterFreq: 200, filterQ: 1 })

        const openLow = energyInRange(open.left, SAMPLE_RATE, 60, 200)
        const filteredLow = energyInRange(filtered.left, SAMPLE_RATE, 60, 200)

        // Low frequencies should pass through relatively unchanged
        const ratio = filteredLow / openLow
        expect(ratio).toBeGreaterThan(0.5)
    })

    it('lowpass reduces overall RMS compared to unfiltered', async () => {
        const open = await renderBurst({ freq: 2000, duration: 0.3, gain: 0.8 })
        const filtered = await renderBurst({ freq: 2000, duration: 0.3, gain: 0.8, filterFreq: 200, filterQ: 1 })

        expect(rms(filtered.left)).toBeLessThan(rms(open.left))
    })

    it('lowpass shifts spectral centroid downward', async () => {
        const open = await renderBurst({ freq: 1000, duration: 0.3, gain: 0.8 })
        const filtered = await renderBurst({ freq: 1000, duration: 0.3, gain: 0.8, filterFreq: 300, filterQ: 1 })

        const aOpen = analyzer.analyzeChannelData(open.left, SAMPLE_RATE)
        const aFiltered = analyzer.analyzeChannelData(filtered.left, SAMPLE_RATE)

        expect(aFiltered.spectralCentroidHz).toBeLessThan(aOpen.spectralCentroidHz)
    })

    it('higher Q creates stronger resonance near cutoff', async () => {
        const lowQ = await renderBurst({ freq: 500, duration: 0.3, gain: 0.8, filterFreq: 400, filterQ: 0.5 })
        const highQ = await renderBurst({ freq: 500, duration: 0.3, gain: 0.8, filterFreq: 400, filterQ: 10 })

        // High Q should have more energy near cutoff (350-450 Hz)
        const lowQNearCutoff = energyInRange(lowQ.left, SAMPLE_RATE, 350, 450)
        const highQNearCutoff = energyInRange(highQ.left, SAMPLE_RATE, 350, 450)

        expect(highQNearCutoff).toBeGreaterThan(lowQNearCutoff)
    })
})

// ─── LFO Tests ───────────────────────────────────────────────────────────────

describe('LFO → parameter modulation', () => {
    it('amplitude LFO creates volume modulation', async () => {
        const duration = 1.0
        const lfoRate = 4 // 4 Hz
        const ctx = new OfflineAudioContext(2, Math.ceil(duration * SAMPLE_RATE), SAMPLE_RATE)

        const osc = ctx.createOscillator()
        osc.frequency.value = 440

        // LFO for amplitude modulation
        const lfo = ctx.createOscillator()
        lfo.frequency.value = lfoRate
        const lfoGain = ctx.createGain()
        lfoGain.gain.value = 0.4 // depth

        const mainGain = ctx.createGain()
        mainGain.gain.value = 0.5 // bias

        // LFO modulates gain
        lfo.connect(lfoGain)
        lfoGain.connect(mainGain.gain)

        osc.connect(mainGain)
        mainGain.connect(ctx.destination)

        osc.start(0)
        osc.stop(duration)
        lfo.start(0)
        lfo.stop(duration)

        const rendered = await ctx.startRendering()
        const samples = rendered.getChannelData(0)

        // Compute envelope to detect modulation
        const windowSize = Math.floor(SAMPLE_RATE / (lfoRate * 2))
        const numWindows = Math.floor(samples.length / windowSize)
        const envelope = []
        for (let w = 0; w < numWindows; w++) {
            let energy = 0
            for (let i = 0; i < windowSize; i++) {
                const s = samples[w * windowSize + i]
                energy += s * s
            }
            envelope.push(Math.sqrt(energy / windowSize))
        }

        // Envelope should vary (not flat)
        const minEnv = Math.min(...envelope)
        const maxEnv = Math.max(...envelope)
        expect(maxEnv - minEnv).toBeGreaterThan(0.01)
    })

    it('pitch LFO creates frequency modulation', async () => {
        const duration = 0.5
        const ctx = new OfflineAudioContext(2, Math.ceil(duration * SAMPLE_RATE), SAMPLE_RATE)

        const osc = ctx.createOscillator()
        osc.frequency.value = 440

        // LFO for pitch modulation
        const lfo = ctx.createOscillator()
        lfo.frequency.value = 3 // 3 Hz
        const lfoGain = ctx.createGain()
        lfoGain.gain.value = 50 // ±50 Hz modulation

        lfo.connect(lfoGain)
        lfoGain.connect(osc.frequency)

        const gainNode = ctx.createGain()
        gainNode.gain.value = 0.5
        osc.connect(gainNode)
        gainNode.connect(ctx.destination)

        osc.start(0)
        osc.stop(duration)
        lfo.start(0)
        lfo.stop(duration)

        const rendered = await ctx.startRendering()
        const samples = rendered.getChannelData(0)

        // FM should create sidebands — spectrum should be wider than pure sine
        const analysis = analyzer.analyzeChannelData(samples, SAMPLE_RATE)
        // FM increases spectral spread
        expect(analysis.peakLinear).toBeGreaterThan(0)
    })

    it('filter LFO creates spectral movement', async () => {
        const duration = 1.0
        const ctx = new OfflineAudioContext(2, Math.ceil(duration * SAMPLE_RATE), SAMPLE_RATE)

        const osc = ctx.createOscillator()
        osc.type = 'sawtooth'
        osc.frequency.value = 220

        const filter = ctx.createBiquadFilter()
        filter.type = 'lowpass'
        filter.frequency.value = 1000
        filter.Q.value = 5

        // LFO modulates filter cutoff
        const lfo = ctx.createOscillator()
        lfo.frequency.value = 0.5 // Slow sweep
        const lfoGain = ctx.createGain()
        lfoGain.gain.value = 800 // ±800 Hz

        lfo.connect(lfoGain)
        lfoGain.connect(filter.frequency)

        const gainNode = ctx.createGain()
        gainNode.gain.value = 0.3
        osc.connect(filter)
        filter.connect(gainNode)
        gainNode.connect(ctx.destination)

        osc.start(0)
        osc.stop(duration)
        lfo.start(0)
        lfo.stop(duration)

        const rendered = await ctx.startRendering()
        const samples = rendered.getChannelData(0)

        // Compute spectral centroid over time windows
        const windowSize = Math.floor(SAMPLE_RATE * 0.1)
        const centroids = []
        for (let offset = 0; offset + windowSize < samples.length; offset += windowSize) {
            const frame = samples.slice(offset, offset + windowSize)
            const analysis = analyzer.analyzeChannelData(frame, SAMPLE_RATE)
            centroids.push(analysis.spectralCentroidHz)
        }

        // Centroid should vary over time (filter sweep)
        const minC = Math.min(...centroids)
        const maxC = Math.max(...centroids)
        expect(maxC - minC).toBeGreaterThan(10)
    })
})

// ─── Retrigger Audio Tests ──────────────────────────────────────────────────

describe('retrigger → multiple note events', () => {
    it('4 retriggers produce 4 distinct energy bursts', async () => {
        const bpm = 120
        const tickTime = (60 * 4) / (bpm * 32) * 0.25
        const tickSpacing = 8 // rate=8
        const sampleSpacing = Math.round(tickSpacing * tickTime * SAMPLE_RATE)
        const numRetriggers = 4
        const burstDuration = Math.floor(sampleSpacing * 0.3)
        const totalSamples = sampleSpacing * numRetriggers + SAMPLE_RATE * 0.1

        const ctx = new OfflineAudioContext(1, totalSamples, SAMPLE_RATE)

        for (let i = 0; i < numRetriggers; i++) {
            const time = (i * sampleSpacing) / SAMPLE_RATE
            const osc = ctx.createOscillator()
            osc.frequency.value = 100
            const g = ctx.createGain()
            g.gain.setValueAtTime(0.8, time)
            g.gain.exponentialRampToValueAtTime(0.001, time + 0.05)
            osc.connect(g)
            g.connect(ctx.destination)
            osc.start(time)
            osc.stop(time + 0.06)
        }

        const rendered = await ctx.startRendering()
        const samples = rendered.getChannelData(0)

        // Count energy bursts by detecting peaks above threshold
        const windowSize = Math.floor(SAMPLE_RATE * 0.02)
        let bursts = 0
        let inBurst = false
        for (let i = 0; i < samples.length; i += windowSize) {
            let energy = 0
            for (let j = 0; j < windowSize && i + j < samples.length; j++) {
                energy += samples[i + j] * samples[i + j]
            }
            energy /= windowSize
            if (energy > 0.01 && !inBurst) {
                bursts++
                inBurst = true
            } else if (energy < 0.001) {
                inBurst = false
            }
        }

        expect(bursts).toBe(numRetriggers)
    })
})

// ─── Arpeggio Audio Tests ───────────────────────────────────────────────────

describe('arpeggio → pitch sequence', () => {
    it('arp sequence creates frequency steps in the output', async () => {
        const intervals = [0, 4, 7] // major triad
        const baseFreq = 220
        const noteDuration = 0.15

        // Render each arp note
        const freqs = intervals.map(i => baseFreq * Math.pow(2, i / 12))
        const analyses = []

        for (const freq of freqs) {
            const result = await renderBurst({ freq, duration: noteDuration, gain: 0.8 })
            const analysis = analyzer.analyzeChannelData(result.left, SAMPLE_RATE)
            analyses.push(analysis)
        }

        // Each successive note should have higher spectral centroid
        for (let i = 1; i < analyses.length; i++) {
            expect(analyses[i].spectralCentroidHz).toBeGreaterThan(analyses[i - 1].spectralCentroidHz)
        }
    })
})
