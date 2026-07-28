import { logger } from "../core/logger.js"
export default class MfAudioAnalyze {
    static TAG = "MFAUDIOANALYZE"
    static DEFAULTS = Object.freeze({
        envelopePoints: 128,
        fftSize: 1024,
        pitchFrameSize: 4096,
        minFundamentalHz: 40,
        maxFundamentalHz: 2000
    })

    analyzeAudioBuffer(audioBuffer, options = {}) {
        if (!audioBuffer || typeof audioBuffer.sampleRate !== 'number' || typeof audioBuffer.numberOfChannels !== 'number') {
            throw new TypeError('analyzeAudioBuffer expects an AudioBuffer-like object')
        }

        const channels = []
        for (let channelIndex = 0; channelIndex < audioBuffer.numberOfChannels; channelIndex++) {
            channels.push(audioBuffer.getChannelData(channelIndex))
        }

        const monoData = this.mixToMono(channels)
        return this.analyzeChannelData(monoData, audioBuffer.sampleRate, options)
    }

    analyzeChannelData(channelData, sampleRate, options = {}) {
        if (!channelData || typeof channelData.length !== 'number') {
            throw new TypeError('analyzeChannelData expects a Float32Array or array-like PCM buffer')
        }
        if (!Number.isFinite(sampleRate) || sampleRate <= 0) {
            throw new TypeError('sampleRate must be a positive number')
        }

        const config = { ...MfAudioAnalyze.DEFAULTS, ...options }
        const samples = channelData instanceof Float32Array ? channelData : Float32Array.from(channelData)

        if (samples.length === 0) {
            return {
                envelope: [],
                pitch: null,
                volume: 0,
                length: 0,
                peakDb: -Infinity,
                rmsDb: -Infinity,
                fundamentalHz: null,
                spectralCentroidHz: 0,
                energySubPct: 0,
                energyHighPct: 0,
                harmonicRatio: 0,
                pitchConfidence: 0
            }
        }

        const envelope = this.computeEnvelope(samples, config.envelopePoints)
        const { peakLinear, peakDb, rmsLinear, rmsDb } = this.computeLevelMetrics(samples)
        const pitchFrame = this.selectAnalysisFrame(samples, config.pitchFrameSize)
        const pitchMetrics = this.estimateFundamental(pitchFrame, sampleRate, config.minFundamentalHz, config.maxFundamentalHz)
        const spectrumFrame = this.selectAnalysisFrame(samples, config.fftSize)
        const spectrumMetrics = this.computeSpectralMetrics(spectrumFrame, sampleRate, pitchMetrics.fundamentalHz)

        return {
            envelope,
            pitch: pitchMetrics.fundamentalHz,
            volume: rmsLinear,
            length: samples.length / sampleRate,
            peakDb,
            rmsDb,
            fundamentalHz: pitchMetrics.fundamentalHz,
            spectralCentroidHz: spectrumMetrics.spectralCentroidHz,
            energySubPct: spectrumMetrics.energySubPct,
            energyHighPct: spectrumMetrics.energyHighPct,
            harmonicRatio: spectrumMetrics.harmonicRatio,
            pitchConfidence: pitchMetrics.pitchConfidence,
            peakLinear,
            rmsLinear
        }
    }

    analyzeWavBuffer(wavBuffer, options = {}) {
        const decoded = this.decodeWavBuffer(wavBuffer)
        const mono = this.mixToMono(decoded.channels)
        return {
            ...this.analyzeChannelData(mono, decoded.sampleRate, options),
            sampleRate: decoded.sampleRate,
            numberOfChannels: decoded.numberOfChannels,
            bitsPerSample: decoded.bitsPerSample
        }
    }

    decodeWavBuffer(wavBuffer) {
        const bytes = wavBuffer instanceof Uint8Array ? wavBuffer : new Uint8Array(wavBuffer)
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)

        if (this.readFourCC(view, 0) !== 'RIFF' || this.readFourCC(view, 8) !== 'WAVE') {
            throw new Error('Unsupported WAV file: missing RIFF/WAVE header')
        }

        let offset = 12
        let format = null
        let sampleRate = 0
        let numberOfChannels = 0
        let bitsPerSample = 0
        let dataOffset = -1
        let dataSize = 0

        while (offset + 8 <= view.byteLength) {
            const chunkId = this.readFourCC(view, offset)
            const chunkSize = view.getUint32(offset + 4, true)
            const chunkDataOffset = offset + 8

            if (chunkId === 'fmt ') {
                format = view.getUint16(chunkDataOffset, true)
                numberOfChannels = view.getUint16(chunkDataOffset + 2, true)
                sampleRate = view.getUint32(chunkDataOffset + 4, true)
                bitsPerSample = view.getUint16(chunkDataOffset + 14, true)
            } else if (chunkId === 'data') {
                dataOffset = chunkDataOffset
                dataSize = chunkSize
                break
            }

            offset = chunkDataOffset + chunkSize + (chunkSize % 2)
        }

        if (!format || dataOffset < 0 || !sampleRate || !numberOfChannels || !bitsPerSample) {
            throw new Error('Unsupported WAV file: incomplete fmt/data chunks')
        }

        if (![1, 3].includes(format)) {
            throw new Error(`Unsupported WAV format: ${format}`)
        }

        const bytesPerSample = bitsPerSample / 8
        const frameCount = Math.floor(dataSize / (bytesPerSample * numberOfChannels))
        const channels = Array.from({ length: numberOfChannels }, () => new Float32Array(frameCount))

        let pointer = dataOffset
        for (let frameIndex = 0; frameIndex < frameCount; frameIndex++) {
            for (let channelIndex = 0; channelIndex < numberOfChannels; channelIndex++) {
                channels[channelIndex][frameIndex] = this.readSample(view, pointer, format, bitsPerSample)
                pointer += bytesPerSample
            }
        }

        return {
            sampleRate,
            numberOfChannels,
            bitsPerSample,
            channels
        }
    }

    mixToMono(channels) {
        if (!Array.isArray(channels) || channels.length === 0) {
            return new Float32Array()
        }
        if (channels.length === 1) {
            return new Float32Array(channels[0])
        }

        const length = Math.min(...channels.map((channel) => channel.length))
        const mono = new Float32Array(length)

        for (let channelIndex = 0; channelIndex < channels.length; channelIndex++) {
            const channel = channels[channelIndex]
            for (let sampleIndex = 0; sampleIndex < length; sampleIndex++) {
                mono[sampleIndex] += channel[sampleIndex]
            }
        }

        const scale = 1 / channels.length
        for (let sampleIndex = 0; sampleIndex < length; sampleIndex++) {
            mono[sampleIndex] *= scale
        }

        return mono
    }

    computeEnvelope(samples, envelopePoints) {
        const points = Math.max(1, Math.min(envelopePoints, samples.length))
        const envelope = []

        for (let pointIndex = 0; pointIndex < points; pointIndex++) {
            const start = Math.floor((pointIndex * samples.length) / points)
            const end = Math.min(samples.length, Math.floor(((pointIndex + 1) * samples.length) / points))
            let peak = 0

            for (let index = start; index < end; index++) {
                const amplitude = Math.abs(samples[index])
                if (amplitude > peak) {
                    peak = amplitude
                }
            }

            envelope.push(Number(peak.toFixed(6)))
        }

        return envelope
    }

    computeLevelMetrics(samples) {
        let peakLinear = 0
        let sumSquares = 0

        for (let index = 0; index < samples.length; index++) {
            const value = samples[index]
            const absValue = Math.abs(value)
            if (absValue > peakLinear) {
                peakLinear = absValue
            }
            sumSquares += value * value
        }

        const rmsLinear = Math.sqrt(sumSquares / samples.length)
        return {
            peakLinear,
            peakDb: this.linearToDb(peakLinear),
            rmsLinear,
            rmsDb: this.linearToDb(rmsLinear)
        }
    }

    selectAnalysisFrame(samples, targetSize) {
        const frameSize = Math.max(32, this.nextPowerOfTwo(Math.min(targetSize, samples.length)))
        if (samples.length <= frameSize) {
            const frame = new Float32Array(frameSize)
            frame.set(samples.subarray(0, Math.min(samples.length, frameSize)))
            return frame
        }

        let bestOffset = 0
        let bestEnergy = -1
        const hopSize = Math.max(1, Math.floor(frameSize / 4))

        for (let offset = 0; offset + frameSize <= samples.length; offset += hopSize) {
            let energy = 0
            for (let index = offset; index < offset + frameSize; index++) {
                const sample = samples[index]
                energy += sample * sample
            }

            if (energy > bestEnergy) {
                bestEnergy = energy
                bestOffset = offset
            }
        }

        return samples.slice(bestOffset, bestOffset + frameSize)
    }

    estimateFundamental(frame, sampleRate, minFundamentalHz, maxFundamentalHz) {
        const normalized = this.removeDc(frame)
        const maxLag = Math.min(normalized.length - 1, Math.floor(sampleRate / Math.max(minFundamentalHz, 1)))
        const minLag = Math.max(1, Math.floor(sampleRate / Math.max(maxFundamentalHz, 1)))
        const energy = normalized.reduce((sum, value) => sum + value * value, 0)

        if (energy === 0 || maxLag <= minLag) {
            return { fundamentalHz: null, pitchConfidence: 0 }
        }

        let bestLag = -1
        let bestCorrelation = 0
        const correlations = new Float64Array(maxLag + 1)

        for (let lag = minLag; lag <= maxLag; lag++) {
            let numerator = 0
            let energyA = 0
            let energyB = 0

            for (let index = 0; index < normalized.length - lag; index++) {
                const a = normalized[index]
                const b = normalized[index + lag]
                numerator += a * b
                energyA += a * a
                energyB += b * b
            }

            const denominator = Math.sqrt(energyA * energyB)
            const correlation = denominator > 0 ? numerator / denominator : 0
            correlations[lag] = correlation

            if (correlation > bestCorrelation) {
                bestCorrelation = correlation
                bestLag = lag
            }
        }

        if (bestLag <= 0 || bestCorrelation < 0.1) {
            return { fundamentalHz: null, pitchConfidence: Math.max(0, Number(bestCorrelation.toFixed(4))) }
        }

        const candidateThreshold = Math.max(0.6, bestCorrelation * 0.9)
        for (let lag = minLag + 1; lag < maxLag; lag++) {
            if (
                correlations[lag] >= candidateThreshold &&
                correlations[lag] >= correlations[lag - 1] &&
                correlations[lag] >= correlations[lag + 1]
            ) {
                bestLag = lag
                bestCorrelation = correlations[lag]
                break
            }
        }

        return {
            fundamentalHz: Number((sampleRate / bestLag).toFixed(3)),
            pitchConfidence: Number(Math.min(1, Math.max(0, bestCorrelation)).toFixed(4))
        }
    }

    computeSpectralMetrics(frame, sampleRate, fundamentalHz) {
        const fftSize = Math.max(64, Math.min(1024, this.nextPowerOfTwo(frame.length)))
        const windowedFrame = this.applyHannWindow(frame, fftSize)
        const spectrum = this.computeMagnitudeSpectrum(windowedFrame)
        const binHz = sampleRate / fftSize

        let weightedFrequencySum = 0
        let totalMagnitude = 0
        let totalEnergy = 0
        let subEnergy = 0
        let highEnergy = 0
        let harmonicEnergy = 0

        for (let bin = 1; bin < spectrum.length; bin++) {
            const frequencyHz = bin * binHz
            const magnitude = spectrum[bin]
            const energy = magnitude * magnitude

            weightedFrequencySum += frequencyHz * magnitude
            totalMagnitude += magnitude
            totalEnergy += energy

            if (frequencyHz < 80) {
                subEnergy += energy
            }
            if (frequencyHz > 2000) {
                highEnergy += energy
            }
        }

        if (fundamentalHz && totalEnergy > 0) {
            const maxHarmonic = Math.floor((sampleRate / 2) / fundamentalHz)
            for (let harmonic = 1; harmonic <= maxHarmonic; harmonic++) {
                const targetHz = harmonic * fundamentalHz
                const centerBin = Math.round(targetHz / binHz)
                for (let bin = Math.max(1, centerBin - 1); bin <= Math.min(spectrum.length - 1, centerBin + 1); bin++) {
                    const magnitude = spectrum[bin]
                    harmonicEnergy += magnitude * magnitude
                }
            }
        }

        return {
            spectralCentroidHz: totalMagnitude > 0 ? Number((weightedFrequencySum / totalMagnitude).toFixed(3)) : 0,
            energySubPct: totalEnergy > 0 ? Number(((subEnergy / totalEnergy) * 100).toFixed(3)) : 0,
            energyHighPct: totalEnergy > 0 ? Number(((highEnergy / totalEnergy) * 100).toFixed(3)) : 0,
            harmonicRatio: totalEnergy > 0 ? Number(Math.min(1, harmonicEnergy / totalEnergy).toFixed(4)) : 0
        }
    }

    removeDc(frame) {
        const mean = frame.reduce((sum, value) => sum + value, 0) / frame.length
        const normalized = new Float32Array(frame.length)

        for (let index = 0; index < frame.length; index++) {
            normalized[index] = frame[index] - mean
        }

        return normalized
    }

    applyHannWindow(frame, fftSize) {
        const output = new Float32Array(fftSize)
        const size = Math.min(frame.length, fftSize)

        for (let index = 0; index < size; index++) {
            const window = 0.5 * (1 - Math.cos((2 * Math.PI * index) / (size > 1 ? size - 1 : (logger.warn('Analyzer', 'size<=1', size), 1))))
            output[index] = frame[index] * window
        }

        return output
    }

    computeMagnitudeSpectrum(realInput) {
        const size = realInput.length
        const half = Math.floor(size / 2)
        const magnitudes = new Float64Array(half)

        for (let bin = 0; bin < half; bin++) {
            let real = 0
            let imag = 0

            for (let sampleIndex = 0; sampleIndex < size; sampleIndex++) {
                const phase = (2 * Math.PI * bin * sampleIndex) / size
                const sample = realInput[sampleIndex]
                real += sample * Math.cos(phase)
                imag -= sample * Math.sin(phase)
            }

            magnitudes[bin] = Math.hypot(real, imag)
        }

        return magnitudes
    }

    nextPowerOfTwo(value) {
        let power = 1
        while (power < value) {
            power <<= 1
        }
        return power
    }

    linearToDb(value) {
        if (!Number.isFinite(value) || value <= 0) {
            return -Infinity
        }
        return Number((20 * Math.log10(value)).toFixed(3))
    }

    readFourCC(view, offset) {
        return String.fromCharCode(
            view.getUint8(offset),
            view.getUint8(offset + 1),
            view.getUint8(offset + 2),
            view.getUint8(offset + 3)
        )
    }

    readSample(view, offset, format, bitsPerSample) {
        if (format === 3 && bitsPerSample === 32) {
            return view.getFloat32(offset, true)
        }

        if (format !== 1) {
            throw new Error(`Unsupported WAV sample encoding: format=${format} bits=${bitsPerSample}`)
        }

        switch (bitsPerSample) {
            case 8:
                return (view.getUint8(offset) - 128) / 128
            case 16:
                return view.getInt16(offset, true) / 32768
            case 24: {
                const b0 = view.getUint8(offset)
                const b1 = view.getUint8(offset + 1)
                const b2 = view.getInt8(offset + 2)
                return (b0 | (b1 << 8) | (b2 << 16)) / 8388608
            }
            case 32:
                return view.getInt32(offset, true) / 2147483648
            default:
                throw new Error(`Unsupported WAV bit depth: ${bitsPerSample}`)
        }
    }
}
