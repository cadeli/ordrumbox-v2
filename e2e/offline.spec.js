import { test, expect } from '@playwright/test'
import { bootApp } from './fixtures.js'

async function startApp(page) {
    const button = page.locator('#waiting-screen-start-btn')
    await expect(button).toBeVisible()
    await button.click()
    await page.waitForFunction(() => window.__e2e?.ready === true, { timeout: 15_000 })
    await expect(page.locator('#waiting-screen')).toBeHidden()
}

test.describe('offline boot (service worker)', () => {
    test('registers the service worker, warms the cache and boots offline', async ({ page, context }) => {
        await bootApp(page)

        const registrations = await page.evaluate(() => navigator.serviceWorker.getRegistrations())
        expect(registrations.length).toBeGreaterThan(0)

        await page.waitForFunction(async () => (await navigator.serviceWorker.ready).active !== null)
        await page.waitForFunction(() => navigator.serviceWorker.controller !== null)

        // First controlled load: every request now goes through the worker and
        // lands in the cache (the first, uncontrolled boot could not).
        await page.reload()
        await startApp(page)

        await expect
            .poll(
                async () =>
                    page.evaluate(async () => {
                        if (!(await caches.match(window.location.href))) return false
                        const names = await caches.keys()
                        for (const name of names) {
                            const requests = await (await caches.open(name)).keys()
                            // Vite dev may append an HMR ?t= query to the module URL.
                            if (requests.some((request) => new URL(request.url).pathname === '/src/main.js'))
                                return true
                        }
                        return false
                    }),
                { timeout: 5_000 },
            )
            .toBe(true)

        await context.setOffline(true)
        await page.reload()

        await startApp(page)
        await expect(page.locator('#waiting-screen')).toBeHidden()
        await expect(page.locator('main').first()).toBeVisible()
    })
})
