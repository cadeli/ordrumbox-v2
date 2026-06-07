/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import MfSeq from '../src/core/seq.js'
import { TICK } from '../src/core/constants.js'
import { serviceRegistry } from '../src/state/service_registry.js'
import { appState } from '../src/state/app_state.js'
import { soundRegistry } from '../src/state/sound_registry.js'
import TrackEditor from '../src/ui/track_editor.js'
import MidiExporter from '../src/logic/midi/midi_exporter.js'
import WorkletLoader from '../src/audio/worklets/loader.js'

describe('Functional LFO Synchronization Test', () => {
    let seq, editor, mockAudioCtx

    beforeEach(async () => {
        document.body.innerHTML = ''
        appState.reset()
        serviceRegistry.reset()
        soundRegistry.reset()

        // 1. Mock Audio Context
        const makeParam = () => ({ value: 1, setValueAtTime: vi.fn(), setTargetAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), cancelScheduledValues: vi.fn(), connect: vi.fn() })
        
        mockAudioCtx = {
            currentTime: 10,
            sampleRate: 44100,
            createGain: () => ({ gain: makeParam(), connect: vi.fn(), disconnect: vi.fn() }),
            createConstantSource: () => ({ offset: makeParam(), connect: vi.fn(), start: vi.fn(), stop: vi.fn(), disconnect: vi.fn() }),
            createAnalyser: () => ({ fftSize: 1024, connect: vi.fn(), disconnect: vi.fn(), frequencyBinCount: 512 }),
            createBuffer: () => ({ getChannelData: () => new Float32Array(1) }),
            createBufferSource: () => ({ start: vi.fn(), buffer: null }),
            destination: {}
        }
        serviceRegistry.audioCtx = mockAudioCtx
        
        serviceRegistry.mfResourcesLoader = {
            ensureResourcesLoaded: vi.fn().mockResolvedValue(true),
            loadGeneratedSounds: vi.fn().mockResolvedValue({})
        }

        vi.spyOn(WorkletLoader, 'isSupported').mockReturnValue(true)
        vi.spyOn(WorkletLoader, 'ensureLoaded').mockResolvedValue(true)
        vi.spyOn(WorkletLoader, 'createNode').mockImplementation(() => ({
            parameters: new Map([
                ['transportTime', makeParam()],
                ['volume', makeParam()],
                ['pan', makeParam()],
                ['cutoff', makeParam()],
                ['q', makeParam()],
                ['filterMode', makeParam()],
                ['satType', makeParam()],
                ['satDrive', makeParam()],
                ['satOut', makeParam()],
                ['satMix', makeParam()],
                ['revRoom', makeParam()],
                ['revDamp', makeParam()],
                ['revWidth', makeParam()],
                ['revMix', makeParam()],
                ['dlyTimeL', makeParam()],
                ['dlyTimeR', makeParam()],
                ['dlyFb', makeParam()],
                ['dlyMix', makeParam()],
                ['dlyMode', makeParam()],
                ['bpm', makeParam()],
                ['lfoVeloFreq', makeParam()], ['lfoVeloWave', makeParam()], ['lfoVeloDepth', makeParam()], ['lfoVeloBias', makeParam()], ['lfoVeloPhase', makeParam()], ['lfoVeloMix', makeParam()]
            ]),
            connect: vi.fn(),
            disconnect: vi.fn()
        }))

        // Mock Worker
        global.Worker = vi.fn().mockImplementation(() => ({
            postMessage: vi.fn(),
            onmessage: vi.fn(),
            terminate: vi.fn()
        }))

        // 2. Setup Pattern (Freq 1 = 16 beats = 128 ticks period)
        const lfoConfig = { freq: 1, phase: 0, min: 0, max: 1, waveform: 0 }
        const track = { 
            name: 'KICK', 
            velocity: 1.0, 
            velocityLfo: lfoConfig,
            bars: 4,
            barQuantize: 4,
            notes: [
                { bar: 0, barStep: 0, velocity: 1.0 }, // Tick 0
                { bar: 2, barStep: 0, velocity: 1.0 }  // Tick 64 (Step 32)
            ]
        }
        appState.patterns = [{ name: 'SyncTest', bpm: 120, nbBars: 4, tracks: [track] }]
        appState.selectedPatternNum = 0

        // 3. Initialize full stack
        seq = new MfSeq()
        
        vi.spyOn(seq, 'start').mockImplementation(async () => {
            seq.ensureTransport()
            seq.serviceRegistry.transport.setBpm(120)
            seq.ensureAudioEngine()
            seq.serviceRegistry.audioEngine.unlocked = true 
            await seq.serviceRegistry.audioEngine.start(appState.patterns[0])
            // seq.serviceRegistry.transport.start() // Skip actual worker start
            seq.serviceRegistry.transport.isRunning = true
            seq.serviceRegistry.transport.tick = 0
        })
        
        await seq.start() 

        editor = new TrackEditor()
        editor.init()
        editor._track = track
        appState.trackEditorVisibility.levels = true
        editor.sync()
    })

    it('should be perfectly synced at Step 0 (Minimum)', () => {
        serviceRegistry.transport.tick = 0
        editor._updateLfoSliders()
        const sliderVal = editor._sliders.get('velocity').getValue()
        expect(sliderVal).toBe(0)

        const exporter = new MidiExporter()
        const bytes = exporter.export(appState.patterns[0])
        let onsetIdx = -1
        for(let i=0; i<bytes.length; i++) {
            if(bytes[i] === 0x99 && bytes[i+1] === 36) { onsetIdx = i; break }
        }
        expect(onsetIdx).toBeGreaterThan(-1)
        expect(bytes[onsetIdx + 2]).toBe(0) 
    })

    it('should be perfectly synced at Step 32 / 8 beats (Peak)', () => {
        serviceRegistry.transport.tick = 64
        editor._updateLfoSliders()
        const sliderVal = editor._sliders.get('velocity').getValue()
        expect(sliderVal).toBe(1)

        const exporter = new MidiExporter()
        const bytes = exporter.export(appState.patterns[0])
        let onset1Idx = -1
        for(let i=0; i<bytes.length; i++) {
            if(bytes[i] === 0x99 && bytes[i+1] === 36) { onset1Idx = i; break }
        }
        let onset2Idx = -1
        for(let i=onset1Idx+1; i<bytes.length; i++) {
            if(bytes[i] === 0x99 && bytes[i+1] === 36) { onset2Idx = i; break }
        }
        expect(onset2Idx).toBeGreaterThan(-1)
        expect(bytes[onset2Idx + 2]).toBe(127) 
    })

    it('should maintain sync at Step 64 / 16 beats (Cycle End)', () => {
        serviceRegistry.transport.tick = 128
        editor._updateLfoSliders()
        const sliderVal = editor._sliders.get('velocity').getValue()
        expect(sliderVal).toBe(0)
    })
})
