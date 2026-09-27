// e2e/synth_group_titles.spec.js
//
// Every synth sub-panel (card) must show its title on the first line, on top
// of the card. The grid wrapper stretches cards to equal height, so without
// `align-content: flex-start` the slack was shared between the flex lines and
// the title row drifted down on the shorter cards (FM, FltEnv, ModEnv, …).

import { test, expect } from '@playwright/test'
import { bootApp } from './fixtures.js'

const TABS = ['osc', 'flt', 'mod', 'env']

async function visibleTitleOffsets(page) {
    return page.evaluate(() =>
        [...document.querySelectorAll('#soft-synth-panel .ss-group')]
            .filter((g) => g.getBoundingClientRect().height > 0)
            .map((g) => {
                const card = g.getBoundingClientRect()
                const label = g.querySelector('.ss-group-label')?.getBoundingClientRect()
                return {
                    name: g.dataset.ssCard,
                    firstChildIsTitle: g.firstElementChild?.classList.contains('ss-group-label') ?? false,
                    offset: label ? Math.round(label.top - card.top) : null,
                }
            }),
    )
}

test.describe('Synth sub-panels — title row', () => {
    test('title sits on the first line of every visible sub-panel', async ({ page }) => {
        await bootApp(page)
        await page.locator('.tb-view-btn', { hasText: 'SYNTH' }).first().click()
        await page.waitForSelector('#soft-synth-panel .ss-group', { timeout: 10000 })

        for (const tab of TABS) {
            await page.locator(`#soft-synth-panel [data-ne-tab="${tab}"]`).click()
            await expect(page.locator(`#soft-synth-panel [data-tab-panel="${tab}"]`)).toBeVisible()

            const rows = await visibleTitleOffsets(page)
            expect(rows.length, `tab "${tab}" renders at least one sub-panel`).toBeGreaterThan(0)
            for (const row of rows) {
                expect(row.firstChildIsTitle, `${tab}/${row.name} title is the first child`).toBe(true)
                // Top line = border (1) + padding (3) + vertical centring of the
                // title inside its flex line (≤8px). A title pushed onto a
                // lower line lands at 20px+ (this is the bug the rule fixes).
                expect(row.offset, `${tab}/${row.name} title offset from card top`).toBeLessThanOrEqual(12)
            }
        }
    })
})
