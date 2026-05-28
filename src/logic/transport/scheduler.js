export function computeSecondsPerBeat(bpm, tick = 32) {
    return (60 * 4) / (bpm * tick)
}

export function computeNextStepTime(currentTime, secondsPerBeat) {
    return currentTime + 0.25 * secondsPerBeat
}

export function computeTickAdvance(currentTick) {
    return currentTick + 1
}

export function computeStepDisplay(tick) {
    return Math.floor(tick / 4)
}

export class Scheduler {
    constructor(options = {}) {
        this.bpm = options.bpm ?? 120
        this.tick = options.tick ?? 0
        this.nextStepTime = options.nextStepTime ?? 0
        this.isRunning = options.isRunning ?? false
        this.tickResolution = options.tickResolution ?? 32
        this.scheduleAheadTime = options.scheduleAheadTime ?? 0.1
    }

    get secondsPerBeat() {
        return computeSecondsPerBeat(this.bpm, this.tickResolution)
    }

    advanceNote() {
        this.nextStepTime = computeNextStepTime(this.nextStepTime, this.secondsPerBeat)
        this.tick = computeTickAdvance(this.tick)
        return computeStepDisplay(this.tick)
    }

    shouldSchedule(currentTime) {
        return this.nextStepTime < currentTime + this.scheduleAheadTime
    }

    setBpm(bpm) {
        this.bpm = bpm
    }
}
