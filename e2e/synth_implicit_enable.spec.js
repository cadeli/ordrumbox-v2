// e2e/synth_implicit_enable.spec.js
//
// Touching a control of a "dead by default" synth group (gain 0, amount 0,
// mix 0, LFO target NOT, mod env target off) must power that group on with
// the documented implicit values, without touching the presets on disk.

import { test, expect } from '@playwright/test'
import { bootApp } from './fixtures.js'
import { installDialogHandler, knobSet, synthField, expectNum, expectVal } from './helpers/ui_session.js'

test.describe('Synth implicit enable', () => {
    test('touching dead-group controls powers the group on', async ({ page }) => {
        const dialogs = installDialogHandler(page)
        await bootApp(page)
        const ss = page.locator('#soft-synth-panel')
        await page.locator('button.tb-view-btn[data-view="synth"]').click()
        await expect(ss).toBeVisible()
        await ss.locator('.or-knob[data-or-knob="vco2.gain"]').first().waitFor()

        const presetKey = await ss.locator('select[data-action="synth-preset"]').inputValue()
        expect(presetKey, 'a preset is loaded in the editor').not.toBe('')

        // vco2: gain forced to 0 → touching the wave icon raises gain to 0.5
        await knobSet(dialogs, ss, 'vco2.gain', 0)
        await expectNum(() => synthField(page, presetKey, 'vco2', 'gain'), 0)
        await ss.locator('button[data-synth-path="vco2.wave"][data-wave-val="square"]').click()
        await expectNum(() => synthField(page, presetKey, 'vco2', 'gain'), 0.5)

        // fm: amount forced to 0 → touching an algo icon sets amount 0.3
        await knobSet(dialogs, ss, 'fm.amount', 0)
        await expectNum(() => synthField(page, presetKey, 'fm', 'amount'), 0)
        await ss.locator('button[data-synth-path="fm.algo"][data-wave-val="2"]').click()
        await expectNum(() => synthField(page, presetKey, 'fm', 'amount'), 0.3)
        await expectVal(() => synthField(page, presetKey, 'bypassFm'), false)

        // lfo: target NOT + depth 0 → touching the wave icon points the target
        // to filter.freq, unbypasses the card and lifts depth to 0.5
        await ss.locator('button[data-ne-tab="mod"]').click()
        await knobSet(dialogs, ss, 'lfo.depth', 0)
        await ss.locator('select[data-synth-path="lfo.target"]').selectOption('NOT')
        await expectVal(() => synthField(page, presetKey, 'lfo', 'target'), 'NOT')
        await ss.locator('button[data-synth-path="lfo.wave"][data-wave-val="triangle"]').click()
        await expectVal(() => synthField(page, presetKey, 'lfo', 'target'), 'filter.freq')
        await expectNum(() => synthField(page, presetKey, 'lfo', 'depth'), 0.5)
        await expectVal(() => synthField(page, presetKey, 'bypassLfo1'), false)
        await expect(ss.locator('select[data-synth-path="lfo.target"]')).toHaveValue('filter.freq')

        // noise: mix 0 + card bypassed → touching a filter icon sets mix 0.15,
        // unbypasses the flag and restores the power button UI
        await knobSet(dialogs, ss, 'noise.mix', 0)
        await expectNum(() => synthField(page, presetKey, 'noise', 'mix'), 0)
        await ss.locator('button[data-power-card="noise"]').click()
        await expectVal(() => synthField(page, presetKey, 'bypassNoise'), true)
        await expect(ss.locator('[data-ss-card="noise"]')).toHaveClass(/bypassed/)
        await ss.locator('button[data-synth-path="noise.filterType"][data-wave-val="bandpass"]').click()
        await expectNum(() => synthField(page, presetKey, 'noise', 'mix'), 0.15)
        await expectVal(() => synthField(page, presetKey, 'bypassNoise'), false)
        await expect(ss.locator('[data-ss-card="noise"]')).not.toHaveClass(/bypassed/)
        await expect(ss.locator('button[data-power-card="noise"]')).toHaveClass(/active/)

        // mod envelope: target off → touching an ADSR knob points it to filter
        await ss.locator('button[data-ne-tab="flt"]').click()
        await ss.locator('select[data-synth-path="modEnvelope.target"]').selectOption('off')
        await expectVal(() => synthField(page, presetKey, 'modEnvelope', 'target'), 'off')
        await knobSet(dialogs, ss, 'modEnvelope.attack', 0.05)
        await expectVal(() => synthField(page, presetKey, 'modEnvelope', 'target'), 'filter')
        await expectVal(() => synthField(page, presetKey, 'bypassModEnv'), false)
        await expect(ss.locator('select[data-synth-path="modEnvelope.target"]')).toHaveValue('filter')
    })
})
