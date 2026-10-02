import { test, expect } from '@playwright/test'
import { bootApp } from './fixtures.js'

test('la vue Song est atteignable et affiche tous ses elements', async ({ page }) => {
    await bootApp(page)

    const btn = page.locator('.tb-view-btn[data-view="song"]')
    await expect(btn).toBeVisible()
    await expect(btn).toHaveText('Song')

    // Grid visible avant, panel song caché
    const song = page.locator('#song-panel')
    await expect(song).toBeHidden()

    await btn.click()

    await expect(song).toBeVisible()
    await expect(btn).toHaveClass(/active/)
    await expect(page.locator('.tb-view-btn[data-view="edit"]')).not.toHaveClass(/active/)

    // tous les elements de l'ancien panel sont la
    for (const sel of [
        '#sg-list',
        '#sg-song-name',
        '#sg-song-date',
        '#sg-song-desc',
        '#sg-save',
        '#sg-load',
        '#sg-export',
        '#sg-import',
    ]) {
        await expect(page.locator(sel), sel).toBeVisible()
    }

    // Rename and Delete were removed as redundant: renaming is the double-click
    // on a name, deleting is the x in the pattern panel header (Grid view).
    await expect(page.locator('#sg-rename')).toHaveCount(0)
    await expect(page.locator('#sg-delete')).toHaveCount(0)

    // le panel est bien dans le workspace, plus en position fixe
    const parentId = await song.evaluate((el) => el.parentElement?.id)
    expect(parentId).toBe('app-content')
    // the song view is a fixed band, like the pattern panel: under the toolbar,
    // above the master slot, left of the track editor overlay
    const geom = await page.evaluate(() => {
        const r = (id) => {
            const el = document.getElementById(id)
            const b = el.getBoundingClientRect()
            return {
                top: Math.round(b.top),
                bottom: Math.round(b.bottom),
                left: Math.round(b.left),
                right: Math.round(b.right),
            }
        }
        return { tb: r('tb'), master: r('output-panel'), te: r('te-panel'), song: r('song-panel') }
    })
    expect(geom.song.top, 'song panel starts just under the toolbar').toBe(geom.tb.bottom)
    expect(geom.song.bottom, 'song panel stops just above the master panel').toBeLessThanOrEqual(geom.master.top)
    expect(geom.song.bottom).toBeGreaterThan(geom.master.top - 10)
    expect(geom.song.right, 'song panel must not sit under the track editor').toBeLessThanOrEqual(geom.te.left)

    // la liste se remplit depuis appState (le song par défaut a deja des patterns)
    const before = await page.locator('#sg-list .sg-item').count()
    await page.evaluate(() => {
        const { playbackEvents, serviceRegistry } = window.__e2e
        for (let i = 0; i < 3; i++) serviceRegistry.cmd.addPattern('P' + i)
        playbackEvents.emit('patternStructureChange')
    })
    await expect(page.locator('#sg-list .sg-item')).toHaveCount(before + 3)

    // revenir a Grid masque le panel song
    await page.locator('.tb-view-btn[data-view="edit"]').click()
    await expect(song).toBeHidden()
    await expect(page.locator('#pattern-panel')).toBeVisible()
})

/**
 * Regression: the song view was appended last in #app-content, but #te-panel
 * and the synth editor are position:fixed overlays at the same z-index — the
 * later sibling won the paint order and the song panel covered their controls,
 * so every knob was dead. Pinned here with elementFromPoint + a real drag.
 */
test('le track editor et le note editor restent actionnables dans la vue Song', async ({ page }) => {
    await bootApp(page)
    await page.locator('.tb-view-btn[data-view="song"]').click()
    await page.waitForTimeout(300)

    const te = page.locator('#te-panel')
    const ne = page.locator('#ne-container')
    await expect(te).toBeVisible()
    await expect(ne).toBeVisible()

    // the overlay panels must stay after the song panel in #app-content
    const order = await page.evaluate(() => [...document.getElementById('app-content').children].map((c) => c.id))
    expect(order.indexOf('song-panel')).toBeLessThan(order.indexOf('te-panel'))

    // Real actionability, not just geometry: locator.click() performs hit
    // testing, so it times out when something covers the control. page.mouse
    // does NOT, which is why an earlier version of this test passed against the
    // bug. Both editors sit in #te-panel (the note editor is inside it) as
    // position:fixed overlays; with the song panel appended after them the
    // later sibling won the paint order and every control was dead.
    for (const sel of [
        '#te-panel .or-knob[data-or-knob="velocity"]',
        '#te-panel .or-knob[data-or-knob="pan"]',
        '#te-panel .te-waveform',
        '#ne-container .or-knob >> nth=0',
    ]) {
        await expect(page.locator(sel).first(), sel).toBeVisible()
        await page.locator(sel).first().click({ timeout: 3000 })
    }

    // and a knob still reacts: knobs change on a drag, not on a click
    const readVelocity = () =>
        page.evaluate(() => {
            const { appState } = window.__e2e
            return appState.patterns[appState.selectedPatternIdx]?.tracks?.[appState.selectedTrackIdx]?.velocity
        })
    const knob = te.locator('.or-knob[data-or-knob="velocity"]').first()
    const box = await knob.boundingBox()
    const before = await readVelocity()
    const cx = box.x + box.width / 2
    const cy = box.y + box.height / 2
    await page.mouse.move(cx, cy)
    await page.mouse.down()
    await page.mouse.move(cx, cy - 40, { steps: 8 })
    await page.mouse.up()
    await expect.poll(readVelocity).not.toBe(before)

    // the song panel is still usable at the same time
    await expect(page.locator('#song-panel')).toBeVisible()
    await page.locator('#sg-import').click()
})

/**
 * Regression: BasePanel.show() hard-codes `display: block`, which overrode
 * `.workspace-panel`'s `display: flex`. The song view was then not a flex
 * container at all, so `.sg-body` grew to its content (2118px) inside a 654px
 * panel that clips (`overflow: hidden`) — the pattern list below the fold was
 * simply unreachable and its `overflow-y: auto` never engaged.
 */
test('la liste des patterns defile au-dela du pli', async ({ page }) => {
    await bootApp(page)
    await page.evaluate(() => {
        const { serviceRegistry, playbackEvents } = window.__e2e
        for (let i = 0; i < 40; i++) serviceRegistry.cmd.addPattern('Pattern ' + i)
        playbackEvents.emit('patternStructureChange')
    })
    await page.locator('.tb-view-btn[data-view="song"]').click()
    await page.waitForTimeout(300)

    // the panel must not overflow its own box any more
    const panel = page.locator('#song-panel')
    const box = await panel.evaluate((el) => ({ clientH: el.clientHeight, scrollH: el.scrollHeight }))
    expect(box.scrollH).toBeLessThanOrEqual(box.clientH + 1)

    // the list is a scroll container with content taller than its viewport
    const list = page.locator('#sg-list')
    const metrics = await list.evaluate((el) => ({
        clientH: el.clientHeight,
        scrollH: el.scrollHeight,
        overflowY: getComputedStyle(el).overflowY,
    }))
    expect(metrics.overflowY).toBe('auto')
    expect(metrics.scrollH).toBeGreaterThan(metrics.clientH)

    // ... and the wheel actually moves it
    await list.hover()
    await page.mouse.wheel(0, 600)
    await expect.poll(() => list.evaluate((el) => el.scrollTop)).toBeGreaterThan(0)
})
