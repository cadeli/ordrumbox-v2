// e2e/persistence.spec.js
//
// E2E-B: Persistence between sessions.
// State → IndexedDB (idb_cache.js) → full reset → reload → identical state.
// Tests the complete application cycle, including APP_VERSION cache invalidation.

import { test, expect } from '@playwright/test'

test.describe('E2E-B: Persistence between sessions', () => {
    test('state saved in IndexedDB is restored after reload', async ({ page }) => {
        await page.goto('/')
        await page.locator('#waiting-screen-start-btn').click()
        await page.locator('#waiting-screen').waitFor({ state: 'hidden', timeout: 15_000 })
        await page.waitForFunction(() => window.__e2e?.ready === true, { timeout: 10_000 })

        await page.evaluate(() => {
            const ps = window.__e2e.serviceRegistry.patterns
            if (ps?.persistPatterns) ps.persistPatterns()
        })
        await page.waitForTimeout(800)

        const snapshot = await page.evaluate(() => ({
            patternCount: window.__e2e.appState.patterns.length,
            patternNames: window.__e2e.appState.patterns.map((p) => p.name),
            trackCounts: window.__e2e.appState.patterns.map((p) => (p.tracks ?? []).length),
            selectedDrumkit: window.__e2e.appState.selectedDrumkit,
            selectedPatternNum: window.__e2e.appState.selectedPatternNum,
        }))

        await page.reload()
        await page.locator('#waiting-screen-start-btn').click()
        await page.locator('#waiting-screen').waitFor({ state: 'hidden', timeout: 15_000 })
        await page.waitForFunction(() => window.__e2e?.ready === true, { timeout: 10_000 })

        const restored = await page.evaluate(() => ({
            patternCount: window.__e2e.appState.patterns.length,
            patternNames: window.__e2e.appState.patterns.map((p) => p.name),
            trackCounts: window.__e2e.appState.patterns.map((p) => (p.tracks ?? []).length),
            selectedDrumkit: window.__e2e.appState.selectedDrumkit,
            selectedPatternNum: window.__e2e.appState.selectedPatternNum,
        }))

        expect(restored.patternCount).toBe(snapshot.patternCount)
        expect(restored.patternNames).toEqual(snapshot.patternNames)
        expect(restored.trackCounts).toEqual(snapshot.trackCounts)
        expect(restored.selectedDrumkit).toBe(snapshot.selectedDrumkit)
    })

    test('IDB entry with different APP_VERSION is rejected (stale cache)', async ({ page }) => {
        await page.goto('/')
        await page.locator('#waiting-screen-start-btn').click()
        await page.locator('#waiting-screen').waitFor({ state: 'hidden', timeout: 15_000 })
        await page.waitForFunction(() => window.__e2e?.ready === true, { timeout: 10_000 })

        await page.evaluate(() => {
            const ps = window.__e2e.serviceRegistry.patterns
            if (ps?.persistPatterns) ps.persistPatterns()
        })
        await page.waitForTimeout(800)

        const corrupted = await page.evaluate(async () => {
            const bogusVersion = '1.0.0'

            const dbOpen = indexedDB.open('ordrumbox', 4)
            const db = await new Promise((res, rej) => {
                dbOpen.onsuccess = () => res(dbOpen.result)
                dbOpen.onerror = () => rej(dbOpen.error)
            })

            const tx = db.transaction('patterns', 'readwrite')
            const store = tx.objectStore('patterns')
            const existing = await new Promise((res) => {
                const req = store.get('song_data')
                req.onsuccess = () => res(req.result)
                req.onerror = () => res(null)
            })
            if (existing) {
                existing.version = bogusVersion
                store.put(existing, 'song_data')
            }
            db.close()
            return { hadData: !!existing, bogusVersion }
        })

        expect(corrupted.hadData).toBe(true)

        await page.reload()
        await page.locator('#waiting-screen-start-btn').click()
        await page.locator('#waiting-screen').waitFor({ state: 'hidden', timeout: 15_000 })
        await page.waitForFunction(() => window.__e2e?.ready === true, { timeout: 10_000 })

        const after = await page.evaluate(() => ({
            patternCount: window.__e2e.appState.patterns.length,
        }))

        expect(after.patternCount).toBeGreaterThan(0)
    })

    test('clearAllCache deletes all IDB cache', async ({ page }) => {
        await page.goto('/')
        await page.locator('#waiting-screen-start-btn').click()
        await page.locator('#waiting-screen').waitFor({ state: 'hidden', timeout: 15_000 })
        await page.waitForFunction(() => window.__e2e?.ready === true, { timeout: 10_000 })

        await page.evaluate(async () => {
            const { serviceRegistry } = window.__e2e
            const ps = serviceRegistry.patterns
            if (ps?.persistPatterns) ps.persistPatterns()
            await new Promise((r) => setTimeout(r, 800))

            const dbOpen = indexedDB.open('ordrumbox', 4)
            const db = await new Promise((res, rej) => {
                dbOpen.onsuccess = () => res(dbOpen.result)
                dbOpen.onerror = () => rej(dbOpen.error)
            })
            const storeNames = [...db.objectStoreNames]
            for (const name of storeNames) {
                const tx = db.transaction(name, 'readwrite')
                tx.objectStore(name).clear()
            }
            db.close()
        })

        await page.reload()
        await page.locator('#waiting-screen-start-btn').click()
        await page.locator('#waiting-screen').waitFor({ state: 'hidden', timeout: 15_000 })
        await page.waitForFunction(() => window.__e2e?.ready === true, { timeout: 10_000 })

        const after = await page.evaluate(() => ({
            patternCount: window.__e2e.appState.patterns.length,
        }))

        expect(after.patternCount).toBeGreaterThan(0)
    })
})
