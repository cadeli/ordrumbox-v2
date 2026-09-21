// e2e/synth-params.spec.js
//
// Each numeric synth control is declared once in SYNTH_PARAM_META (path + min/max).
// We render two variants of the same patch differing only on the tested control,
// and verify they produce different audio (RMS + pointwise diff).
//
// Some controls are gated by other params being non-default (e.g. vco3.octave
// needs vco3.gain > 0). We set those prerequisites in the overrides.
//
// "random" waveform is not implemented in the DSP (falls through to square),
// so we skip the square→random pair in the waveform test.

import { test, expect } from '@playwright/test';
import { renderSynthBatch, rmsWindow } from './helpers/synth_render.js';
import { bootApp } from './fixtures.js';

function setPath(obj, path, value) {
  const keys = path.split('.');
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i++) cur = (cur[keys[i]] ??= {});
  cur[keys.at(-1)] = value;
  return obj;
}

// Prerequisites that must be set for a gated param to produce audible output.
// Each entry can be an object (shared) or a function(min, max) returning overrides.
const PREREQS = {
  'vco3.gain':          { vco3: { gain: 1 } },
  'vco3.octave':        { vco3: { gain: 1 } },
  'vco3.detune':        { vco3: { gain: 1 } },
  'lfo.freq':           { lfo: { target: 'FLT', freq: 1, depth: 0.8 } },
  'lfo.depth':          { lfo: { target: 'FLT', freq: 1, depth: 0.8 } },
  'lfo2.freq':          { lfo2: { target: 'FLT', freq: 1, depth: 0.8 } },
  'lfo2.depth':         { lfo2: { target: 'FLT', freq: 1, depth: 0.8 } },
  'noise.filterQ':      { noise: { mix: 1 } },
  'noise.filterFreq':   { noise: { mix: 1 } },
  'fm.algo':            { fm: { amount: 0.5 } },
  'modEnvelope.attack':  { modEnvelope: { target: 'filter', sustain: 0.5 }, envelope: { release: 1.0 } },
  'modEnvelope.decay':   { modEnvelope: { target: 'filter', sustain: 0.2 }, envelope: { release: 1.0 } },
  'modEnvelope.sustain': { modEnvelope: { target: 'filter', sustain: 0.5 }, envelope: { release: 1.0 } },
  'modEnvelope.release': { modEnvelope: { target: 'filter', sustain: 1 }, envelope: { release: 1.0 } },
}

function buildOverride(path, value) {
  const prereq = PREREQS[path] ?? {};
  return setPath(structuredClone(prereq), path, value);
}

test.describe('Numeric synth controls (SYNTH_PARAM_META)', () => {
  test.beforeEach(async ({ page }) => {
    await bootApp(page);
  });

  test('each parameter has an audible effect between min and max', async ({ page }) => {
    const { SYNTH_PARAM_META } = await page.evaluate(() =>
      import('/src/ui/synth_editor/constants.js').then((m) => ({
        SYNTH_PARAM_META: m.SYNTH_PARAM_META,
      }))
    );

    const entries = Object.entries(SYNTH_PARAM_META);
    const configs = [];
    for (const [path, meta] of entries) {
      configs.push({ synthOverrides: buildOverride(path, meta.min) });
      configs.push({ synthOverrides: buildOverride(path, meta.max) });
    }

    const results = await renderSynthBatch(page, configs, { durationPerNote: 0.8, gapSec: 0.05 });

    const failures = [];
    for (let i = 0; i < entries.length; i++) {
      const [path, meta] = entries[i];
      const a = results[i * 2];
      const b = results[i * 2 + 1];
      const rmsA = rmsWindow(a.channelData[0], a.sampleRate, 0.05, 0.8);
      const rmsB = rmsWindow(b.channelData[0], b.sampleRate, 0.05, 0.8);
      const n = Math.min(a.channelData[0].length, b.channelData[0].length);
      let sumAbsDiff = 0;
      for (let j = 0; j < n; j++) sumAbsDiff += Math.abs(a.channelData[0][j] - b.channelData[0][j]);
      const meanAbsDiff = sumAbsDiff / n;
      const differs = meanAbsDiff > 1e-4 || Math.abs(rmsA - rmsB) > 1e-4;
      if (!differs) failures.push(`${path}: min=${meta.min} vs max=${meta.max} → meanAbsDiff=${meanAbsDiff}`);
    }

    expect(failures, `Parameters without audible effect:\n${failures.join('\n')}`).toEqual([]);
  });
});

test.describe('Synth listboxes', () => {
  test.beforeEach(async ({ page }) => {
    await bootApp(page);
  });

  test('each VCO1 waveform produces a distinct timbre', async ({ page }) => {
    const { WAVE_ICONS } = await page.evaluate(() =>
      import('/src/ui/synth_editor/constants.js').then((m) => ({ WAVE_ICONS: m.WAVE_ICONS }))
    );
    const waves = Object.keys(WAVE_ICONS);

    // Build pairs, skipping "random" → "random" (random is not implemented —
    // falls through to square in the DSP processor #v(), making square↔random
    // produce identical audio).
    const pairs = [];
    for (let i = 0; i < waves.length - 1; i++) {
      if (waves[i] === 'random' || waves[i + 1] === 'random') continue;
      pairs.push([waves[i], waves[i + 1]]);
    }

    const configs = [];
    for (const [a, b] of pairs) {
      configs.push({ synthOverrides: { vco1: { wave: a, gain: 1 } } });
      configs.push({ synthOverrides: { vco1: { wave: b, gain: 1 } } });
    }

    const results = await renderSynthBatch(page, configs, { durationPerNote: 0.8, gapSec: 0.05 });

    for (let i = 0; i < pairs.length; i++) {
      const a = results[i * 2];
      const b = results[i * 2 + 1];
      const n = Math.min(a.channelData[0].length, b.channelData[0].length);
      let sumAbsDiff = 0;
      for (let j = 0; j < n; j++) sumAbsDiff += Math.abs(a.channelData[0][j] - b.channelData[0][j]);
      const meanAbsDiff = sumAbsDiff / n;
      const rmsA = rmsWindow(a.channelData[0], a.sampleRate, 0.05, 0.8);
      const rmsB = rmsWindow(b.channelData[0], b.sampleRate, 0.05, 0.8);
      const differs = meanAbsDiff > 1e-4 || Math.abs(rmsA - rmsB) > 1e-4;
      expect(differs, `${pairs[i][0]} vs ${pairs[i][1]} sound identical`).toBe(true);
    }
  });

  test('each filter type has a distinct effect on a rich signal', async ({ page }) => {
    const { FILTER_ICONS } = await page.evaluate(() =>
      import('/src/ui/synth_editor/constants.js').then((m) => ({ FILTER_ICONS: m.FILTER_ICONS }))
    );
    const types = Object.keys(FILTER_ICONS);
    const base = { vco1: { wave: 'sawtooth', gain: 1 }, filter: { freq: 800, Q: 4 } };
    const configs = [];
    for (let i = 0; i < types.length - 1; i++) {
      configs.push({ synthOverrides: { ...base, filter: { ...base.filter, type: types[i] } } });
      configs.push({ synthOverrides: { ...base, filter: { ...base.filter, type: types[i + 1] } } });
    }

    const results = await renderSynthBatch(page, configs, { durationPerNote: 0.8, gapSec: 0.05 });

    for (let i = 0; i < types.length - 1; i++) {
      const a = results[i * 2];
      const b = results[i * 2 + 1];
      const n = Math.min(a.channelData[0].length, b.channelData[0].length);
      let sumAbsDiff = 0;
      for (let j = 0; j < n; j++) sumAbsDiff += Math.abs(a.channelData[0][j] - b.channelData[0][j]);
      const meanAbsDiff = sumAbsDiff / n;
      const rmsA = rmsWindow(a.channelData[0], a.sampleRate, 0.05, 0.8);
      const rmsB = rmsWindow(b.channelData[0], b.sampleRate, 0.05, 0.8);
      const differs = meanAbsDiff > 1e-4 || Math.abs(rmsA - rmsB) > 1e-4;
      expect(differs, `filter ${types[i]} vs ${types[i + 1]} sound identical`).toBe(true);
    }
  });
});
