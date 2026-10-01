import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import swSource from '../sw.js?raw'

const ORIGIN = 'https://ordrumbox.test'
const BASE = `${ORIGIN}/`
const BUILD_ID = 'deadbeef'
const CACHE_NAME = `ordrumbox-cache-${BUILD_ID}`

function makeResponse(body, { status = 200, type = 'basic' } = {}) {
    return {
        body,
        status,
        statusText: '',
        type,
        ok: status >= 200 && status < 300,
        headers: new Headers({ 'Content-Type': 'text/plain', Vary: 'Origin' }),
        text: async () => body,
        arrayBuffer: async () => new TextEncoder().encode(body),
        clone: () => makeResponse(body, { status, type }),
    }
}

function createCacheStorage() {
    const entriesByCache = new Map()
    const handles = new Map()
    const keyOf = (request) => (typeof request === 'string' ? new URL(request, BASE).href : request.url)

    const open = vi.fn(async (name) => {
        if (!entriesByCache.has(name)) entriesByCache.set(name, new Map())
        if (!handles.has(name)) {
            const entries = entriesByCache.get(name)
            handles.set(name, {
                put: vi.fn(async (request, response) => {
                    entries.set(keyOf(request), response)
                }),
                match: vi.fn(async (request) => entries.get(keyOf(request))),
                addAll: vi.fn(async (urls) => {
                    for (const url of urls) {
                        entries.set(new URL(url, BASE).href, makeResponse(`precache:${url}`))
                    }
                }),
            })
        }
        return handles.get(name)
    })

    return {
        open,
        keys: vi.fn(async () => [...entriesByCache.keys()]),
        delete: vi.fn(async (name) => entriesByCache.delete(name)),
        match: vi.fn(async (request) => {
            for (const entries of entriesByCache.values()) {
                const hit = entries.get(keyOf(request))
                if (hit) return hit
            }
            return undefined
        }),
        entriesByCache,
    }
}

function loadServiceWorker(fetchImpl, { release = true } = {}) {
    const listeners = new Map()
    const cacheStorage = createCacheStorage()
    const fakeSelf = {
        location: new URL(BASE),
        addEventListener: (type, handler) => listeners.set(type, [...(listeners.get(type) ?? []), handler]),
        skipWaiting: vi.fn(),
        clients: { claim: vi.fn() },
    }
    let source = swSource.split('__BUILD_ID__').join(BUILD_ID)
    if (release) source = source.replace('const RELEASE_BUILD = false', 'const RELEASE_BUILD = true')
    const run = new Function('self', 'caches', 'fetch', source)
    run(fakeSelf, cacheStorage, fetchImpl)

    return { self: fakeSelf, caches: cacheStorage, listeners }
}

function dispatch(env, type, event) {
    for (const handler of env.listeners.get(type) ?? []) handler(event)
    return event
}

async function dispatchFetch(env, request) {
    const event = { request, respondWith: vi.fn(), waitUntil: vi.fn() }
    dispatch(env, 'fetch', event)
    const responsePromise = event.respondWith.mock.calls[0]?.[0]
    if (!responsePromise) return { handled: false, response: null }
    return { handled: true, response: await responsePromise }
}

async function dispatchLifecycle(env, type) {
    const waits = []
    dispatch(env, type, { waitUntil: (promise) => waits.push(promise) })
    await Promise.all(waits)
}

function makeRequest(path, { mode = 'no-cors', destination = '', method = 'GET' } = {}) {
    return { url: new URL(path, BASE).href, mode, destination, method }
}

async function seedCache(env, request, response) {
    const cache = await env.caches.open(CACHE_NAME)
    await cache.put(request, response)
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('service worker (sw.js)', () => {
    let env

    beforeEach(() => {
        env = loadServiceWorker(vi.fn(async () => makeResponse('network')))
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    it('exposes the build token used to stamp the cache name', () => {
        expect(swSource).toContain('__BUILD_ID__')
        expect(swSource).toContain('const RELEASE_BUILD = false')
        expect(CACHE_NAME).toMatch(/^ordrumbox-cache-[0-9a-f]{8}$/)
    })

    it('install pre-caches the app shell and data files', async () => {
        const fetchMock = vi.fn(async () => makeResponse('asset'))
        env = loadServiceWorker(fetchMock)

        await dispatchLifecycle(env, 'install')

        const shell = [
            `${ORIGIN}/`,
            `${ORIGIN}/index.html`,
            `${ORIGIN}/manifest.json`,
            `${ORIGIN}/logo.png`,
            `${ORIGIN}/favicon.ico`,
            `${ORIGIN}/assets/data/drumkits.json`,
            `${ORIGIN}/assets/data/song.json`,
            `${ORIGIN}/assets/data/scales.json`,
            `${ORIGIN}/assets/data/generated_sounds.json`,
        ]
        expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
            './',
            './index.html',
            './manifest.json',
            './logo.png',
            './favicon.ico',
            './assets/data/drumkits.json',
            './assets/data/song.json',
            './assets/data/scales.json',
            './assets/data/generated_sounds.json',
        ])
        expect(env.caches.open.mock.calls.every(([name]) => name === CACHE_NAME)).toBe(true)

        const cache = await env.caches.open(CACHE_NAME)
        expect(cache.put.mock.calls.map(([key]) => key)).toEqual(shell)
        for (const url of shell) expect(await cache.match(url)).toBeDefined()
    })

    it('message SKIP_WAITING activates the waiting worker', () => {
        dispatch(env, 'message', { data: 'SKIP_WAITING' })
        expect(env.self.skipWaiting).toHaveBeenCalledTimes(1)

        dispatch(env, 'message', { data: 'something-else' })
        expect(env.self.skipWaiting).toHaveBeenCalledTimes(1)
    })

    it('activate purges every stale cache and claims clients', async () => {
        const stale = await env.caches.open('ordrumbox-cache-old')
        await stale.put(makeRequest('index.html'), makeResponse('stale'))
        const current = await env.caches.open(CACHE_NAME)
        await current.put(makeRequest('index.html'), makeResponse('current'))

        await dispatchLifecycle(env, 'activate')

        expect(env.caches.delete).toHaveBeenCalledTimes(1)
        expect(env.caches.delete).toHaveBeenCalledWith('ordrumbox-cache-old')
        expect(env.self.clients.claim).toHaveBeenCalledTimes(1)
        expect([...env.caches.entriesByCache.keys()]).toEqual([CACHE_NAME])
        expect((await env.caches.match(makeRequest('index.html')))?.body).toBe('current')
    })

    it('serves navigations from the network and warms the cache', async () => {
        const fetchMock = vi.fn(async () => makeResponse('fresh html'))
        env = loadServiceWorker(fetchMock)
        const request = makeRequest('index.html', { mode: 'navigate', destination: 'document' })

        const { response } = await dispatchFetch(env, request)

        expect(response.body).toBe('fresh html')
        expect(fetchMock).toHaveBeenCalledTimes(1)
        await flush()
        const cached = await env.caches.match(request)
        expect(await cached?.text()).toBe('fresh html')
    })

    it('prefers the network for JSON data even when cached', async () => {
        const fetchMock = vi.fn(async () => makeResponse('fresh data'))
        env = loadServiceWorker(fetchMock)
        const request = makeRequest('assets/data/drumkits.json')
        await seedCache(env, request, makeResponse('stale data'))

        const { response } = await dispatchFetch(env, request)

        expect(response.body).toBe('fresh data')
        expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    it('falls back to the cached copy when the network fails', async () => {
        env = loadServiceWorker(
            vi.fn(async () => {
                throw new Error('offline')
            }),
        )
        const request = makeRequest('index.html', { mode: 'navigate', destination: 'document' })
        await seedCache(env, request, makeResponse('cached html'))

        const { response } = await dispatchFetch(env, request)

        expect(response.body).toBe('cached html')
    })

    it('answers 503 Offline when the network fails and nothing is cached', async () => {
        env = loadServiceWorker(
            vi.fn(async () => {
                throw new Error('offline')
            }),
        )

        const { response } = await dispatchFetch(env, makeRequest('index.html', { mode: 'navigate' }))

        expect(response.status).toBe(503)
        expect(await response.text()).toBe('Offline')
    })

    it('falls back to the cache when the network stalls for 3s', async () => {
        vi.useFakeTimers()
        env = loadServiceWorker(() => new Promise(() => {}))
        const request = makeRequest('index.html', { mode: 'navigate' })
        await seedCache(env, request, makeResponse('cached html'))

        const pending = dispatchFetch(env, request)
        await vi.advanceTimersByTimeAsync(3000)
        const { response } = await pending

        expect(response.body).toBe('cached html')
    })

    it('serves hashed assets from the cache without hitting the network twice', async () => {
        const fetchMock = vi.fn(async () => makeResponse('bundle'))
        env = loadServiceWorker(fetchMock)
        const request = makeRequest('assets/index-abc123.js')

        const first = await dispatchFetch(env, request)
        expect(first.response.body).toBe('bundle')
        await flush()

        const second = await dispatchFetch(env, request)
        expect(await second.response.text()).toBe('bundle')
        expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    it('revalidates every request while the worker is served by the dev server', async () => {
        const fetchMock = vi.fn(async () => makeResponse('fresh bundle'))
        env = loadServiceWorker(fetchMock, { release: false })
        const request = makeRequest('assets/index-abc123.js')
        await seedCache(env, request, makeResponse('stale bundle'))

        const { response } = await dispatchFetch(env, request)

        expect(response.body).toBe('fresh bundle')
        expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    it('does not cache opaque (non-basic, status 0) responses', async () => {
        const fetchMock = vi.fn(async () => makeResponse('opaque', { status: 0, type: 'opaque' }))
        env = loadServiceWorker(fetchMock)
        const request = makeRequest('assets/index-abc123.js')

        await dispatchFetch(env, request)
        await flush()
        await dispatchFetch(env, request)

        expect(await env.caches.match(request)).toBeUndefined()
        expect(fetchMock).toHaveBeenCalledTimes(2)
    })

    it('leaves non-GET requests to the browser', async () => {
        const { handled } = await dispatchFetch(env, makeRequest('index.html', { method: 'POST' }))
        expect(handled).toBe(false)
    })

    it('leaves cross-origin requests to the browser', async () => {
        const { handled } = await dispatchFetch(env, {
            url: 'https://other.test/app.js',
            mode: 'no-cors',
            destination: '',
            method: 'GET',
        })
        expect(handled).toBe(false)
    })
})
