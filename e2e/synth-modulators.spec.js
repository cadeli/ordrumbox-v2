// e2e/synth-modulators.spec.js
//
// Architecture note (grep across the repo): LFO modulation exists in THREE
// independent places that must stay synchronized:
//   1. src/audio/worklets/processors/synth_voice_source.js#lfoValue()
//      (real per-sample calculation, audio thread)
//   2. src/ui/synth_editor.js::_computeSynthLfoMod() + LFO_TARGET_SCALE
//      (JS re-implementation for the curve displayed in the synth panel —
//      the comment above LFO_TARGET_SCALE explicitly says
//      "Matches the worklet synth_voice_source.js #lfoValue() mapping",
//      meaning it is a hand-maintained mapping, hence a natural candidate
//      for drift)
//   3. src/logic/lfo_engine.js::computeTrackLfoValues(), used by
//      src/audio/engine.js:200 for a snapshot at note trigger time
//
// This is exactly the class of bug already encountered (LFO1 → octave VCO1:
// the knob displays the modulated value but the sound doesn't move over time).
// The tests below target the two possible symptoms separately:
//   A. Static coherence (fast, no audio render) between the UI-declared targets
//      (SYNTH_LFO_TARGETS) and the mapping used for the curve (LFO_TARGET_SCALE).
//   B. The RENDERED sound is actually time-varying for each target — not just
//      "different from off", but different from one time window to the next.
//      This second criterion would have caught the "frozen" bug: a render can
//      easily differ from the non-modulated case (base value shifted) without
//      ever varying over time.
//
// IMPORTANT: All renders are batched into a SINGLE OfflineAudioContext via
// renderSynthBatch() — Chromium only produces audio on the first
// startRendering() per page.

import { test, expect } from '@playwright/test';
import { renderSynthBatch, rmsWindows } from './helpers/synth_render.js';
import { bootApp } from './fixtures.js';

test.describe('Static coherence of modulation targets', () => {
  test.beforeEach(async ({ page }) => {
    await bootApp(page);
  });

  test('all UI targets have an entry in LFO_TARGET_SCALE (displayed curve)', async ({
    page,
  }) => {
    const { targets, scaleKeys } = await page.evaluate(async () => {
      const constants = await import('/src/ui/synth_editor/constants.js');
      const editorModule = await import('/src/ui/synth_editor.js');
      const scaleKeys = editorModule.LFO_TARGET_SCALE
        ? Object.keys(editorModule.LFO_TARGET_SCALE)
        : null;
      return { targets: constants.SYNTH_LFO_TARGETS.filter((t) => t !== 'NOT'), scaleKeys };
    });

    test.skip(
      scaleKeys === null,
      "LFO_TARGET_SCALE is not exported by synth_editor.js — export it (even just for tests) to enable this static check."
    );

    const missing = targets.filter((t) => !scaleKeys.includes(t));
    expect(missing, `Targets missing UI scale (silent curve for these targets): ${missing}`).toEqual([]);
  });
});

test.describe('Real modulator effect on sound (per target)', () => {
  test.beforeEach(async ({ page }) => {
    await bootApp(page);
  });

  test('each LFO target produces time-varying sound', async ({ page }) => {
    const { SYNTH_LFO_TARGETS } = await page.evaluate(() =>
      import('/src/ui/synth_editor/constants.js').then((m) => ({
        SYNTH_LFO_TARGETS: m.SYNTH_LFO_TARGETS,
      }))
    );
    const targets = SYNTH_LFO_TARGETS.filter((t) => t !== 'NOT');
    const durationSec = 1.2;
    const lfoFreqHz = 3;

    const configs = [];
    for (const target of targets) {
      configs.push({
        synthOverrides: {
          lfo: { target, wave: 'sine', freq: lfoFreqHz, depth: 1, sync: 'off' },
        },
      });
      configs.push({
        synthOverrides: {
          lfo: { target: 'NOT', wave: 'sine', freq: lfoFreqHz, depth: 1, sync: 'off' },
        },
      });
    }

    const results = await renderSynthBatch(page, configs, { durationPerNote: durationSec, gapSec: 0.05 });

    const failures = [];
    for (let i = 0; i < targets.length; i++) {
      const target = targets[i];
      const modulated = results[i * 2];
      const baseline = results[i * 2 + 1];

      const windows = rmsWindows(modulated.channelData[0], modulated.sampleRate, durationSec, 8);
      const mean = windows.reduce((a, b) => a + b, 0) / windows.length;
      const variance = windows.reduce((a, w) => a + (w - mean) ** 2, 0) / windows.length;
      const timeVarying = Math.sqrt(variance) > mean * 0.02 + 1e-5;

      const baseWindows = rmsWindows(baseline.channelData[0], baseline.sampleRate, durationSec, 8);
      const overallRms = mean;
      const baseRms = baseWindows.reduce((a, b) => a + b, 0) / baseWindows.length;
      const differsFromBaseline = Math.abs(overallRms - baseRms) > baseRms * 0.02 + 1e-5;

      if (!timeVarying && !differsFromBaseline) {
        failures.push(`${target}: no effect detected (neither time-varying nor differs from unmodulated)`);
      } else if (!timeVarying) {
        failures.push(
          `${target}: shifts the sound but DOES NOT VARY over time — signature of "frozen modulation" bug (RMS windows: ${windows.map((w) => w.toFixed(4))})`
        );
      }
    }

    expect(failures, `Suspect LFO targets:\n${failures.join('\n')}`).toEqual([]);
  });

  test('each LFO2 target produces time-varying sound', async ({ page }) => {
    const { SYNTH_LFO_TARGETS } = await page.evaluate(() =>
      import('/src/ui/synth_editor/constants.js').then((m) => ({
        SYNTH_LFO_TARGETS: m.SYNTH_LFO_TARGETS,
      }))
    );
    const targets = SYNTH_LFO_TARGETS.filter((t) => t !== 'NOT');
    const durationSec = 1.2;
    const lfoFreqHz = 3;

    const configs = [];
    for (const target of targets) {
      configs.push({
        synthOverrides: {
          lfo2: { target, wave: 'sine', freq: lfoFreqHz, depth: 1, sync: 'off' },
        },
      });
      configs.push({
        synthOverrides: {
          lfo2: { target: 'NOT', wave: 'sine', freq: lfoFreqHz, depth: 1, sync: 'off' },
        },
      });
    }

    const results = await renderSynthBatch(page, configs, { durationPerNote: durationSec, gapSec: 0.05 });

    const failures = [];
    for (let i = 0; i < targets.length; i++) {
      const target = targets[i];
      const modulated = results[i * 2];
      const baseline = results[i * 2 + 1];

      const windows = rmsWindows(modulated.channelData[0], modulated.sampleRate, durationSec, 8);
      const mean = windows.reduce((a, b) => a + b, 0) / windows.length;
      const variance = windows.reduce((a, w) => a + (w - mean) ** 2, 0) / windows.length;
      const timeVarying = Math.sqrt(variance) > mean * 0.02 + 1e-5;

      const baseWindows = rmsWindows(baseline.channelData[0], baseline.sampleRate, durationSec, 8);
      const overallRms = mean;
      const baseRms = baseWindows.reduce((a, b) => a + b, 0) / baseWindows.length;
      const differsFromBaseline = Math.abs(overallRms - baseRms) > baseRms * 0.02 + 1e-5;

      if (!timeVarying && !differsFromBaseline) {
        failures.push(`${target}: no effect detected (neither time-varying nor differs from unmodulated)`);
      } else if (!timeVarying) {
        failures.push(
          `${target}: shifts the sound but DOES NOT VARY over time — signature of "frozen modulation" bug (RMS windows: ${windows.map((w) => w.toFixed(4))})`
        );
      }
    }

    expect(failures, `Suspect LFO2 targets:\n${failures.join('\n')}`).toEqual([]);
  });
});
