import { clamp } from '../../core/numbers.js'
export function bufferToWav(abuffer) {
    const channelCount = abuffer.numberOfChannels,
        length = abuffer.length * channelCount * 2 + 44,
        buffer = new ArrayBuffer(length),
        view = new DataView(buffer),
        channels = []
    let i,
        sample,
        offset = 0,
        pos = 0

    setUint32(0x46464952) // "RIFF"
    setUint32(length - 8) // file length - 8
    setUint32(0x45564157) // "WAVE"

    setUint32(0x20746d66) // "fmt " chunk
    setUint32(16) // length = 16
    setUint16(1) // PCM (uncompressed)
    setUint16(channelCount)
    setUint32(abuffer.sampleRate)
    setUint32(abuffer.sampleRate * 2 * channelCount) // avg. bytes/sec
    setUint16(channelCount * 2) // block-align
    setUint16(16) // 16-bit (hardcoded)

    setUint32(0x61746164) // "data" - chunk
    setUint32(length - pos - 4) // chunk length

    for (i = 0; i < abuffer.numberOfChannels; i++) channels.push(abuffer.getChannelData(i))

    while (pos < length) {
        for (i = 0; i < channelCount; i++) {
            sample = clamp(channels[i][offset], -1, 1)
            sample = (sample < 0 ? sample * 0x8000 : sample * 0x7fff) | 0
            view.setInt16(pos, sample, true)
            pos += 2
        }
        offset++
    }

    return new Blob([buffer], { type: 'audio/wav' })

    function setUint16(data) {
        view.setUint16(pos, data, true)
        pos += 2
    }

    function setUint32(data) {
        view.setUint32(pos, data, true)
        pos += 4
    }
}

export function computeWavExportDuration(bpm, beatCount, loopCount) {
    const secondsPerBeat = 60 / bpm
    const patternDuration = beatCount * secondsPerBeat
    return patternDuration * loopCount
}

export function computeWavExportSamples(bpm, beatCount, loopCount, sampleRate) {
    const duration = computeWavExportDuration(bpm, beatCount, loopCount)
    return Math.round(duration * sampleRate)
}
