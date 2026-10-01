const CACHE_NAME = 'ordrumbox-cache-__BUILD_ID__'
const NETWORK_TIMEOUT_MS = 3000
// scripts/sw_build.mjs rewrites this to true when stamping a release build. While it is
// false the dev server serves this file, so responses must stay fresh (never stale).
const RELEASE_BUILD = false
const PRE_CACHE_ASSETS = [
    './',
    './index.html',
    './manifest.json',
    './logo.png',
    './favicon.ico',
    './assets/data/drumkits.json',
    './assets/data/song.json',
    './assets/data/scales.json',
    './assets/data/generated_sounds.json',
]

self.addEventListener('install', (event) => {
    event.waitUntil(
        Promise.all(
            PRE_CACHE_ASSETS.map(async (path) => {
                const response = await fetch(path)
                if (isCacheable(response)) await putInCache(path, response)
            }),
        ),
    )
})

self.addEventListener('message', (event) => {
    if (event.data === 'SKIP_WAITING') {
        self.skipWaiting()
    }
})

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches
            .keys()
            .then((cacheNames) =>
                Promise.all(cacheNames.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name))),
            )
            .then(() => self.clients.claim()),
    )
})

function isSameOrigin(request) {
    try {
        return new URL(request.url).origin === self.location.origin
    } catch {
        return false
    }
}

function isNetworkFirst(request, url) {
    if (request.mode === 'navigate' || request.destination === 'document') return true
    const path = url.pathname
    if (path.endsWith('.json') || path.endsWith('.html')) return true
    const lastSegment = path.slice(path.lastIndexOf('/') + 1)
    return !lastSegment.includes('.')
}

function isCacheable(response) {
    return !!response && response.status === 200 && (response.type === 'basic' || response.type === 'cors')
}

function networkTimeout(ms) {
    return new Promise((_, reject) => setTimeout(() => reject(new Error('network-timeout')), ms))
}

function offlineResponse() {
    return new Response('Offline', {
        status: 503,
        statusText: 'Offline',
        headers: { 'Content-Type': 'text/plain' },
    })
}

// Vite dev serves a .css URL with two different bodies: as a stylesheet (destination
// "style") and, when it is imported from JS, as a JS module wrapper (destination
// "script"). They must not overwrite each other, so the script variant gets its own key.
function isCssModuleVariant(request) {
    return typeof request !== 'string' && request.destination === 'script' && request.url.split('?')[0].endsWith('.css')
}

function cacheKey(request) {
    if (typeof request === 'string') return new URL(request, self.location.href).href
    if (isCssModuleVariant(request)) return `${request.url}${request.url.includes('?') ? '&' : '?'}sw=script`
    return request.url
}

async function matchCached(request) {
    const cache = await caches.open(CACHE_NAME)
    const key = cacheKey(request)
    const matched = await cache.match(key)
    if (matched || typeof request === 'string' || key === request.url) return matched
    return cache.match(request.url)
}

async function putInCache(request, response) {
    // Clone before the first await: the response body is consumed by respondWith as soon as it resolves.
    const copy = response.clone()
    // Strip Vary so a cached entry always matches by URL: same-origin requests carry an
    // Origin header only sometimes (navigation / dynamic import), which would make the
    // stored Vary: Origin response miss on the next lookup.
    const headers = new Headers(copy.headers)
    headers.delete('Vary')
    const body = await copy.arrayBuffer()
    const cache = await caches.open(CACHE_NAME)
    await cache.put(
        cacheKey(request),
        new Response(body, { status: copy.status, statusText: copy.statusText, headers }),
    )
}

// Fresh content when online (HTML/data), cache as the offline fallback.
async function networkFirst(request) {
    const networkPromise = fetch(request)
    networkPromise.then((response) => (isCacheable(response) ? putInCache(request, response) : null)).catch(() => {})

    try {
        return await Promise.race([networkPromise, networkTimeout(NETWORK_TIMEOUT_MS)])
    } catch {
        const cachedResponse = await matchCached(request)
        return cachedResponse ?? offlineResponse()
    }
}

// Immutable assets (hashed JS/CSS/images, audio samples): cache wins.
async function cacheFirst(request) {
    const cachedResponse = await matchCached(request)
    if (cachedResponse) return cachedResponse

    try {
        const response = await fetch(request)
        if (isCacheable(response)) await putInCache(request, response)
        return response
    } catch {
        return offlineResponse()
    }
}

self.addEventListener('fetch', (event) => {
    const { request } = event
    if (request.method !== 'GET') return
    if (!isSameOrigin(request)) return

    const url = new URL(request.url)
    const useNetworkFirst = !RELEASE_BUILD || isNetworkFirst(request, url)
    event.respondWith(useNetworkFirst ? networkFirst(request) : cacheFirst(request))
})
