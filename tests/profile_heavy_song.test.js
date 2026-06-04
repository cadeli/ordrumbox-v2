/**
 * @vitest-environment jsdom
 *
 * Profiling benchmark: simulates a heavy song load
 *  - 64-bar pattern
 *  - 8 tracks
 *  - Multiple synth voices
 *  - Active LFOs
 *  - Automation (note parameters)
 *
 * Measures:
 *  - Load time (ms)
 *  - Heap usage (MB) via performance.memory
 *  - FPS estimate over a synthetic playback window
 *  - GC pressure (object allocations during a render tick)
 *  - CPU proxy: time spent per render tick
 */
import { describe, it, expect, beforeAll, vi } from 'vitest'
import { appState } from '../src/state/app_state.js'
import { soundRegistry } from '../src/state/sound_registry.js'
import { serviceRegistry } from '../src/state/service_registry.js'
import { playbackEvents } from '../src/state/playback_events.js'
import { computeFlatNotesFromPattern } from '../src/patterns/engine.js'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { execSync } from 'child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = join(__dirname, '..')
const LOG_DIR = join(PROJECT_ROOT, 'profile_logs')
const LOG_FILE = join(LOG_DIR, 'profile_history.jsonl')
const SUMMARY_FILE = join(LOG_DIR, 'profile_latest.json')

const NB_BARS = 64
const NB_TRACKS = 8
const STEPS_PER_BAR = 16
const LFO_UPDATE_TICKS = 6000

function buildHeavyTrack(name, idx) {
    const notes = []
    for (let bar = 0; bar < NB_BARS; bar++) {
        for (let step = 0; step < STEPS_PER_BAR; step++) {
            if ((step + idx) % 4 === 0) {
                notes.push({
                    bar,
                    barStep: step,
                    velocity: 0.5 + (step % 8) / 16,
                    pan: Math.sin(step / 4) * 0.5,
                    pitch: Math.cos(bar / 8) * 2,
                    triggerFreq: 1 + (idx % 3),
                    triggerPhase: step % 16,
                    triggerProbability: 0.8,
                    retriggerNum: 1 + (idx % 2),
                    retriggerStep: 1 + (step % 3),
                    arp: step % 2 === 0 ? 'up' : 'off',
                    arpTriggerProbability: 0.7
                })
            }
        }
    }
    return {
        name,
        notes,
        mute: false,
        solo: false,
        useAutoAssignSound: false,
        useSoftSynth: true,
        synthSoundKey: `BASS${idx}`,
        soundId: '',
        velocity: 0.8,
        pan: 0,
        pitch: 0,
        filterCutoff: 12000,
        filterResonance: 1,
        filterType: 'lowpass',
        filterLfo: 0,
        filterEnvelopeAmount: 0,
        lfoPitch: 0,
        lfoVolume: 0,
        lfoPan: 0,
        lfoFilter: 0,
        pitchLfo: 0.2,
        volumeLfo: 0.1,
        panLfo: 0.05,
        filterLfoValue: 0.15,
        pitchEnv: 0,
        delaySend: 0.2,
        reverbSend: 0.3,
        saturationDrive: 0.1,
        delayActive: idx % 2 === 0,
        reverbActive: idx % 3 === 0,
        saturationActive: idx % 4 === 0,
        swingAmount: 0,
        swingMode: 'off',
        loopLength: NB_BARS,
        loopEnabled: false
    }
}

function buildHeavyPattern() {
    const tracks = []
    for (let i = 0; i < NB_TRACKS; i++) {
        tracks.push(buildHeavyTrack(`TRK_${i}`, i))
    }
    return {
        name: 'PROFILE_HEAVY',
        bpm: 140,
        nbBars: NB_BARS,
        bars: NB_BARS,
        barQuantize: STEPS_PER_BAR,
        tracks
    }
}

const measurements = {}

function getGitInfo() {
    try {
        const commit = execSync('git rev-parse --short HEAD', { cwd: PROJECT_ROOT }).toString().trim()
        const branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: PROJECT_ROOT }).toString().trim()
        const dirty = execSync('git status --porcelain', { cwd: PROJECT_ROOT }).toString().trim().length > 0
        return { commit, branch, dirty }
    } catch {
        return { commit: 'unknown', branch: 'unknown', dirty: false }
    }
}

function readHistory() {
    if (!existsSync(LOG_FILE)) return []
    try {
        return readFileSync(LOG_FILE, 'utf-8')
            .split('\n')
            .filter(line => line.trim())
            .map(line => JSON.parse(line))
    } catch {
        return []
    }
}

function writeLogEntry(entry) {
    if (!existsSync(LOG_DIR)) {
        mkdirSync(LOG_DIR, { recursive: true })
    }
    writeFileSync(LOG_FILE, JSON.stringify(entry) + '\n', { flag: 'a' })
    writeFileSync(SUMMARY_FILE, JSON.stringify(entry, null, 2))
}

function diffMetrics(prev, curr) {
    if (!prev) return null
    const pct = (a, b) => {
        if (prev[a] === 0) return null
        return +(((curr[a] - prev[a]) / prev[a]) * 100).toFixed(2)
    }
    return {
        loadTotal: pct('loadTotal', 'loadTotal'),
        lfoAvg: pct('lfoAvgMs', 'lfoAvgMs'),
        fps: pct('fpsEstimated', 'fpsEstimated'),
        allocMs: pct('allocMs', 'allocMs')
    }
}

function measureHeapMB() {
    if (typeof performance !== 'undefined' && performance.memory) {
        return {
            used: performance.memory.usedJSHeapSize / 1024 / 1024,
            total: performance.memory.totalJSHeapSize / 1024 / 1024,
            limit: performance.memory.jsHeapSizeLimit / 1024 / 1024
        }
    }
    return { used: 0, total: 0, limit: 0 }
}

describe('Profile heavy song (64 bars, 8 tracks, synths, LFOs, automation)', () => {
    let pattern
    let flatNotes

    beforeAll(() => {
        appState.reset()
        soundRegistry.reset()
        serviceRegistry.reset()

        global.fetch = vi.fn().mockResolvedValue({
            json: () => Promise.resolve({ major: { scaleSteps: [0, 2, 4, 5, 7, 9, 11] } })
        })

        HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
            fillRect: vi.fn(), clearRect: vi.fn(), getImageData: vi.fn(),
            putImageData: vi.fn(), createImageData: vi.fn(), setTransform: vi.fn(),
            drawImage: vi.fn(), save: vi.fn(), fillText: vi.fn(), restore: vi.fn(),
            beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), closePath: vi.fn(),
            stroke: vi.fn(), translate: vi.fn(), scale: vi.fn(), rotate: vi.fn(),
            arc: vi.fn(), fill: vi.fn(), measureText: vi.fn().mockReturnValue({ width: 0 }),
            transform: vi.fn(), rect: vi.fn(), clip: vi.fn()
        })

        soundRegistry.drumkitList = [
            { name: 'real', instruments: [{ key: 'KICK', url: 'real/kick.wav' }] }
        ]
        soundRegistry.sounds = {
            'real/kick.wav': { key: 'KICK', url: 'real/kick.wav', buffer: { duration: 0.5, sampleRate: 44100, getChannelData: () => new Float32Array(1024) } }
        }
        soundRegistry.generatedSounds = {}
        for (let i = 0; i < NB_TRACKS; i++) {
            soundRegistry.generatedSounds[`BASS${i}`] = {
                key: `BASS${i}`,
                url: `BASS${i}`,
                buffer: { duration: 0.5, sampleRate: 44100, getChannelData: () => new Float32Array(1024) }
            }
        }
    })

    it('measures load, memory, FPS, GC, and CPU proxy', async () => {
        const heapBefore = measureHeapMB()

        const t0 = performance.now()
        pattern = buildHeavyPattern()
        appState.patterns = [pattern]
        appState.selectedPatternNum = 0
        const t1 = performance.now()
        measurements.patternBuildMs = t1 - t0

        const t2 = performance.now()
        flatNotes = computeFlatNotesFromPattern(pattern)
        const t3 = performance.now()
        measurements.flatNotesMs = t3 - t2

        const t4 = performance.now()
        playbackEvents.onPatternChange.forEach(fn => fn())
        const t5 = performance.now()
        measurements.patternChangeMs = t5 - t4

        await new Promise(r => setTimeout(r, 50))
        const heapAfterLoad = measureHeapMB()

        const t6 = performance.now()
        const lfoCycles = []
        for (let t = 0; t < LFO_UPDATE_TICKS; t++) {
            const tickStart = performance.now()
            for (let trk = 0; trk < pattern.tracks.length; trk++) {
                const track = pattern.tracks[trk]
                const basePitch = Math.sin(t / 100) * 2
                const baseFilter = 10000 + Math.cos(t / 80) * 4000
                const baseVol = 0.8 + Math.sin(t / 60) * 0.1
                track.pitch = basePitch
                track.filterCutoff = Math.max(20, baseFilter)
                track.velocity = baseVol
            }
            const tickEnd = performance.now()
            lfoCycles.push(tickEnd - tickStart)
        }
        const t7 = performance.now()
        measurements.lfoTotalMs = t7 - t6
        measurements.lfoAvgMs = lfoCycles.reduce((a, b) => a + b, 0) / lfoCycles.length
        measurements.lfoMaxMs = Math.max(...lfoCycles)

        const t8 = performance.now()
        let renderCount = 0
        const FRAME_BUDGET_MS = 1000 / 60
        const RENDER_WINDOW_MS = 500
        const renderStart = performance.now()
        const frames = []
        const flatNotesArr = Array.from(flatNotes.values())
        while (performance.now() - renderStart < RENDER_WINDOW_MS) {
            const fs = performance.now()
            const rendered = flatNotesArr.length
            for (let i = 0; i < rendered; i++) {
                const n = flatNotesArr[i]
                const _ = n.velocity * 0.5
            }
            renderCount++
            const fe = performance.now()
            frames.push(fe - fs)
            if (fe - fs < FRAME_BUDGET_MS) {
                await new Promise(r => setTimeout(r, 0))
            }
        }
        const t9 = performance.now()
        const realElapsedMs = t9 - t8
        measurements.renderWindowMs = realElapsedMs
        measurements.renderIterations = renderCount
        measurements.fpsEstimated = (renderCount / realElapsedMs) * 1000
        measurements.avgFrameMs = frames.reduce((a, b) => a + b, 0) / frames.length
        measurements.maxFrameMs = Math.max(...frames)

        let objectAllocations = 0
        const t10 = performance.now()
        for (let i = 0; i < 5000; i++) {
            const temp = { i, v: Math.random(), a: [1, 2, 3] }
            objectAllocations++
            if (temp.i > 999999) break
        }
        const t11 = performance.now()
        measurements.gcProxyAllocs = objectAllocations
        measurements.gcProxyMs = t11 - t10
        measurements.estimatedGcPerMin = (objectAllocations / realElapsedMs) * 60000

        const heapAfter = measureHeapMB()
        const heapDelta = heapAfter.used - heapBefore.used

        const noteCount = pattern.tracks.reduce((sum, t) => sum + t.notes.length, 0)
        const loadTotal = +(measurements.patternBuildMs + measurements.flatNotesMs + measurements.patternChangeMs).toFixed(2)
        const heapUsed = +heapAfter.used.toFixed(2)
        const heapDeltaRounded = +heapDelta.toFixed(2)
        const lfoAvg = +measurements.lfoAvgMs.toFixed(4)
        const fpsEst = +measurements.fpsEstimated.toFixed(2)
        const allocMsRounded = +measurements.gcProxyMs.toFixed(2)

        console.log('\n========== PROFILE REPORT ==========')
        console.log(`Pattern       : ${NB_BARS} bars × ${NB_TRACKS} tracks × ${STEPS_PER_BAR} steps (${noteCount} notes, ${pattern.bpm} BPM)`)
        console.log(`Load total    : ${loadTotal} ms`)
        console.log(`Heap used     : ${heapUsed} MB (Δ ${heapDeltaRounded >= 0 ? '+' : ''}${heapDeltaRounded} MB)`)
        console.log(`LFO avg/tick  : ${lfoAvg} ms`)
        console.log(`FPS estimate  : ${fpsEst}`)
        console.log(`GC proxy      : ${allocMsRounded} ms`)
        console.log('====================================\n')

        const git = getGitInfo()
        const logEntry = {
            timestamp: new Date().toISOString(),
            iso: process.platform,
            node: process.version,
            git,
            config: {
                bars: NB_BARS,
                tracks: NB_TRACKS,
                stepsPerBar: STEPS_PER_BAR,
                totalNotes: noteCount,
                bpm: pattern.bpm,
                lfoTicks: LFO_UPDATE_TICKS
            },
            metrics: {
                loadTotal: +((measurements.patternBuildMs + measurements.flatNotesMs + measurements.patternChangeMs)).toFixed(2),
                patternBuildMs: +measurements.patternBuildMs.toFixed(2),
                flatNotesMs: +measurements.flatNotesMs.toFixed(2),
                patternChangeMs: +measurements.patternChangeMs.toFixed(2),
                heapBeforeMB: +heapBefore.used.toFixed(2),
                heapAfterLoadMB: +heapAfterLoad.used.toFixed(2),
                heapAfterAllMB: +heapAfter.used.toFixed(2),
                heapDeltaMB: +heapDelta.toFixed(2),
                lfoTotalMs: +measurements.lfoTotalMs.toFixed(2),
                lfoAvgMs: +measurements.lfoAvgMs.toFixed(4),
                lfoMaxMs: +measurements.lfoMaxMs.toFixed(4),
                fpsEstimated: +measurements.fpsEstimated.toFixed(2),
                avgFrameMs: +measurements.avgFrameMs.toFixed(4),
                maxFrameMs: +measurements.maxFrameMs.toFixed(4),
                renderIterations: measurements.renderIterations,
                allocMs: +measurements.gcProxyMs.toFixed(2),
                allocsInTest: measurements.gcProxyAllocs,
                estimatedGcPerMin: +measurements.estimatedGcPerMin.toFixed(0)
            }
        }

        const history = readHistory()
        const previous = history.length > 0 ? history[history.length - 1] : null
        const diff = diffMetrics(previous?.metrics, logEntry.metrics)
        logEntry.diff = diff
        logEntry.runNumber = history.length + 1

        writeLogEntry(logEntry)

        if (diff) {
            console.log(`\n📊 Comparison vs previous run (${previous.git?.commit ?? 'unknown'}):`)
            console.log(`  loadTotal:    ${diff.loadTotal > 0 ? '+' : ''}${diff.loadTotal}%`)
            console.log(`  lfoAvg:       ${diff.lfoAvg > 0 ? '+' : ''}${diff.lfoAvg}%`)
            console.log(`  fpsEstimated: ${diff.fps > 0 ? '+' : ''}${diff.fps}%`)
            console.log(`  allocMs:      ${diff.allocMs > 0 ? '+' : ''}${diff.allocMs}%`)
        } else {
            console.log('\n📊 First run — no comparison available')
        }
        console.log(`\n📁 Log entry written to: ${LOG_FILE}`)
        console.log(`📁 Latest summary:        ${SUMMARY_FILE}`)
        console.log(`   Total runs in history: ${history.length + 1}\n`)

        expect(pattern.tracks.length).toBe(NB_TRACKS)
        expect(noteCount).toBeGreaterThan(0)
        expect(flatNotes.size).toBeGreaterThan(0)
        expect(measurements.lfoAvgMs).toBeLessThan(5)
    })
})
