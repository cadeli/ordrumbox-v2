export function parseMidiNoteOn(data) {
    if (!data || data.length < 3) return null
    const status = data[0]
    if (status >= 0xF8) return null
    const command = status & 0xF0
    const channel = (status & 0x0F) + 1
    const noteNumber = data[1]
    const velocity = data[2]
    if (command !== 0x90 || velocity <= 0) return null
    return { command, channel, noteNumber, velocity }
}

export function parseMidiRealtime(status) {
    if (status < 0xF8) return null
    switch (status) {
        case 0xFA: return 'start'
        case 0xFB: return 'continue'
        case 0xFC: return 'stop'
        case 0xF8: return 'clock'
        default: return null
    }
}

export function estimateBpmFromClockPulses(pulseTimes) {
    if (!Array.isArray(pulseTimes) || pulseTimes.length < 2) return null
    const intervals = []
    for (let i = 1; i < pulseTimes.length; i++) {
        intervals.push(pulseTimes[i] - pulseTimes[i - 1])
    }
    const avgIntervalMs = intervals.reduce((sum, value) => sum + value, 0) / intervals.length
    if (!avgIntervalMs || avgIntervalMs <= 0) return null
    return 60000 / (avgIntervalMs * 24)
}

export function updateClockPulseTracking(pulseTimes, now, maxPulses = 24) {
    const updated = [...pulseTimes, now]
    if (updated.length > maxPulses) {
        return updated.slice(updated.length - maxPulses)
    }
    return updated
}

export function isMidiSupported() {
    return typeof navigator !== 'undefined' && typeof navigator.requestMIDIAccess === 'function'
}


