import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const TOKEN = '__BUILD_ID__'
const RELEASE_FLAG = 'const RELEASE_BUILD = false'
const RELEASE_FLAG_STAMPED = 'const RELEASE_BUILD = true'

export function computeBuildId(content) {
    return createHash('sha256').update(content).digest('hex').slice(0, 8)
}

/**
 * Writes <distDir>/sw.js from the sw.js source, stamping the cache name with a
 * build id derived from dist/index.html (which references the hashed bundles) and
 * flipping RELEASE_BUILD so the worker uses its release cache strategy.
 * Each deploy therefore gets a unique CACHE_NAME and old caches are purged on activate.
 */
export function buildSw({ root = process.cwd(), distDir = 'dist', swSource = 'sw.js' } = {}) {
    const distPath = resolve(root, distDir)
    const htmlPath = resolve(distPath, 'index.html')
    if (!existsSync(htmlPath)) {
        throw new Error(`sw build: missing ${htmlPath} (run vite build first)`)
    }

    const sourcePath = resolve(root, swSource)
    const source = readFileSync(sourcePath, 'utf8')
    if (!source.includes(TOKEN)) {
        throw new Error(`sw build: ${sourcePath} does not contain the ${TOKEN} token`)
    }
    if (!source.includes(RELEASE_FLAG)) {
        throw new Error(`sw build: ${sourcePath} does not contain "${RELEASE_FLAG}"`)
    }

    const buildId = computeBuildId(readFileSync(htmlPath))
    const outFile = resolve(distPath, 'sw.js')
    mkdirSync(dirname(outFile), { recursive: true })
    const stamped = source.split(TOKEN).join(buildId).replace(RELEASE_FLAG, RELEASE_FLAG_STAMPED)
    writeFileSync(outFile, stamped)

    return { buildId, outFile }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const { buildId, outFile } = buildSw()
    console.log(`sw build: ${outFile} (build id ${buildId})`)
}
