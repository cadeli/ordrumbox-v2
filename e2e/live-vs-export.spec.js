// e2e/live-vs-export.spec.js
//
// Verifies that the WavExporter offline rendering pipeline produces audio
// equivalent to a direct AudioEngine + OfflineAudioContext render of the
// same pattern. Both paths use the same engine code, so they should produce
// identical AudioBuffers — any divergence indicates a scheduling or wiring
// bug in the export pipeline.

import { test, expect } from '@playwright/test';
import { bootApp } from './fixtures.js';

function computeRms(data) {
  let sum = 0;
  for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
  return Math.sqrt(sum / data.length);
}

function computePeak(data) {
  let peak = 0;
  for (let i = 0; i < data.length; i++) {
    const abs = Math.abs(data[i]);
    if (abs > peak) peak = abs;
  }
  return peak;
}

function computeEnvelope(data, blockSize = 1024) {
  const env = [];
  for (let i = 0; i < data.length; i += blockSize) {
    let sum = 0;
    const end = Math.min(i + blockSize, data.length);
    for (let j = i; j < end; j++) sum += data[j] * data[j];
    env.push(Math.sqrt(sum / (end - i)));
  }
  return env;
}

function envelopeCorrelation(a, b) {
  const n = Math.min(a.length, b.length);
  if (n === 0) return 0;
  let sumA = 0, sumB = 0;
  for (let i = 0; i < n; i++) { sumA += a[i]; sumB += b[i]; }
  const meanA = sumA / n, meanB = sumB / n;
  let cov = 0, varA = 0, varB = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i] - meanA;
    const db = b[i] - meanB;
    cov += da * db;
    varA += da * da;
    varB += db * db;
  }
  const denom = Math.sqrt(varA * varB);
  return denom === 0 ? 0 : cov / denom;
}

test.describe('Live vs Export equivalence', () => {
  test.beforeEach(async ({ page }) => {
    await bootApp(page);
  });

  test('WavExporter and direct engine render produce equivalent audio for the loaded pattern', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const { default: WavExporter } = await import('/src/audio/export/wav_exporter.js');
      const { default: AudioEngine } = await import('/src/audio/engine.js');
      const { appState, serviceRegistry, soundRegistry } = window.__e2e;
      const { TICK } = await import('/src/core/constants.js');

      const pattern = appState.patterns[appState.selectedPatternNum];
      if (!pattern || !pattern.tracks?.length) return null;

      const computeRms = (data) => {
        let sum = 0;
        for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
        return Math.sqrt(sum / data.length);
      };
      const computePeak = (data) => {
        let peak = 0;
        for (let i = 0; i < data.length; i++) { const a = Math.abs(data[i]); if (a > peak) peak = a; }
        return peak;
      };

      // --- Export path ---
      const exporter = new WavExporter();
      const wavBlob = await exporter.exportPatternToWav(pattern, 1);
      const arrayBuffer = await wavBlob.arrayBuffer();
      const decodeCtx = new OfflineAudioContext(2, 1, 44100);
      const decoded = await decodeCtx.decodeAudioData(arrayBuffer);

      // --- Direct engine path ---
      const TICK_TIME = (60 * 4) / (pattern.bpm * TICK) * 0.25;
      const duration = pattern.nbBeats * TICK * TICK_TIME;
      const sampleRate = 44100;
      const offlineCtx = new OfflineAudioContext(2, Math.floor(sampleRate * duration), sampleRate);

      const engine = new AudioEngine({
        audioCtx: offlineCtx,
        sounds: soundRegistry.sounds,
        generatedSounds: soundRegistry.generatedSounds,
        patterns: [pattern],
        selectedPatternNum: 0,
        getSelectedPatternNum: () => 0,
        computeNextStep: (note, track) => serviceRegistry.patterns.computeNextPatternStepNote(note, track),
        getAutoGenerate: () => null,
        uiState: {},
        TICK,
        secondsPerBeat: TICK_TIME * 4,
        isOffline: true,
      });

      const savedTransport = serviceRegistry.transport;
      serviceRegistry.transport = { bpm: pattern.bpm };
      await engine.start(pattern);
      engine.mixer.setBpm(pattern.bpm);
      const totalTicks = pattern.nbBeats * TICK;
      for (let t = 0; t < totalTicks; t++) {
        await engine.playNotes(t, t * TICK_TIME);
      }
      serviceRegistry.transport = savedTransport;

      const rendered = await offlineCtx.startRendering();

      const exportCh = Array.from(decoded.getChannelData(0));
      const directCh = Array.from(rendered.getChannelData(0));

      return {
        exportRms: computeRms(exportCh),
        directRms: computeRms(directCh),
        exportPeak: computePeak(exportCh),
        directPeak: computePeak(directCh),
        exportLength: exportCh.length,
        directLength: directCh.length,
        exportCh,
        directCh,
      };
    });

    expect(result, 'No pattern loaded').not.toBeNull();
    expect(result.exportRms).toBeGreaterThan(0.001);
    expect(result.directRms).toBeGreaterThan(0.001);
    expect(result.exportPeak).toBeGreaterThan(0.001);
    expect(result.directPeak).toBeGreaterThan(0.001);

    const rmsDiff = Math.abs(result.exportRms - result.directRms) / Math.max(result.exportRms, result.directRms);
    expect(rmsDiff, `RMS difference: export=${result.exportRms.toFixed(4)} direct=${result.directRms.toFixed(4)}`).toBeLessThan(0.05);

    const peakDiff = Math.abs(result.exportPeak - result.directPeak) / Math.max(result.exportPeak, result.directPeak);
    expect(peakDiff, `Peak difference: export=${result.exportPeak.toFixed(4)} direct=${result.directPeak.toFixed(4)}`).toBeLessThan(0.05);

    const n = Math.min(result.exportCh.length, result.directCh.length);
    let sumAbsDiff = 0;
    for (let i = 0; i < n; i++) sumAbsDiff += Math.abs(result.exportCh[i] - result.directCh[i]);
    const meanAbsDiff = sumAbsDiff / n;
    expect(meanAbsDiff, `Mean absolute sample diff: ${meanAbsDiff}`).toBeLessThan(0.005);

    const envA = computeEnvelope(result.exportCh);
    const envB = computeEnvelope(result.directCh);
    const corr = envelopeCorrelation(envA, envB);
    expect(corr, `Envelope correlation: ${corr}`).toBeGreaterThan(0.95);
  });

  test('export produces non-silent audio for synth patterns', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const { default: WavExporter } = await import('/src/audio/export/wav_exporter.js');
      const { appState, soundRegistry } = window.__e2e;

      const synthKeys = Object.keys(soundRegistry.generatedSounds ?? {});
      if (synthKeys.length === 0) return null;

      const pattern = {
        name: 'SynthExportTest',
        bpm: 120,
        nbBeats: 2,
        tracks: [
          {
            name: 'BASS',
            useSoftSynth: true,
            synthSoundKey: synthKeys[0],
            stepsPerBeat: 4,
            velocity: 1,
            notes: [{ beat: 0, beatStep: 0, pitch: 0 }, { beat: 0, beatStep: 8, pitch: 0 }],
          },
        ],
      };

      appState.patterns = [pattern];
      appState.selectedPatternNum = 0;

      const exporter = new WavExporter();
      const wavBlob = await exporter.exportPatternToWav(pattern, 1);
      const arrayBuffer = await wavBlob.arrayBuffer();
      const audioCtx = new OfflineAudioContext(2, 1, 44100);
      const decoded = await audioCtx.decodeAudioData(arrayBuffer);

      const ch = Array.from(decoded.getChannelData(0));
      let sum = 0;
      for (let i = 0; i < ch.length; i++) sum += ch[i] * ch[i];
      return { rms: Math.sqrt(sum / ch.length) };
    });

    test.skip(result === null, 'No synth sounds loaded');
    expect(result.rms, 'Synth export should produce audible audio').toBeGreaterThan(0.001);
  });
});
