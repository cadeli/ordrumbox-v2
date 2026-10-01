import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildSw, computeBuildId } from '../scripts/sw_build.mjs'

const SW_SOURCE = `const CACHE_NAME = 'ordrumbox-cache-__BUILD_ID__'\nconst RELEASE_BUILD = false\n`
const HTML = '<!doctype html><html><script src="/assets/index-abc123.js"></script></html>'

function createProject({ html = HTML, source = SW_SOURCE, withHtml = true, withSource = true } = {}) {
    const root = mkdtempSync(join(tmpdir(), 'ordrumbox-sw-'))
    if (withSource) writeFileSync(join(root, 'sw.js'), source)
    if (withHtml) {
        mkdirSync(join(root, 'dist'), { recursive: true })
        writeFileSync(join(root, 'dist', 'index.html'), html)
    }
    return root
}

describe('sw build script', () => {
    let roots = []

    beforeEach(() => {
        roots = []
    })

    afterEach(() => {
        roots.forEach((root) => rmSync(root, { recursive: true, force: true }))
    })

    it('computeBuildId returns 8 hex chars and is deterministic', () => {
        const id = computeBuildId(Buffer.from(HTML))
        expect(id).toMatch(/^[0-9a-f]{8}$/)
        expect(computeBuildId(Buffer.from(HTML))).toBe(id)
        expect(computeBuildId(Buffer.from(`${HTML}<!--x-->`))).not.toBe(id)
    })

    it('stamps the cache name with the build id of dist/index.html', () => {
        const root = createProject()
        roots.push(root)

        const { buildId, outFile } = buildSw({ root })

        expect(buildId).toBe(computeBuildId(Buffer.from(HTML)))
        expect(existsSync(outFile)).toBe(true)
        const out = readFileSync(outFile, 'utf8')
        expect(out).toBe(
            SW_SOURCE.replace('__BUILD_ID__', buildId).replace(
                'const RELEASE_BUILD = false',
                'const RELEASE_BUILD = true',
            ),
        )
        expect(out).not.toContain('__BUILD_ID__')
        expect(out).toContain('const RELEASE_BUILD = true')
    })

    it('gives a different build id when index.html changes', () => {
        const rootA = createProject({ html: HTML })
        const rootB = createProject({ html: `${HTML}<!-- build 2 -->` })
        roots.push(rootA, rootB)

        const a = buildSw({ root: rootA })
        const b = buildSw({ root: rootB })

        expect(a.buildId).not.toBe(b.buildId)
        expect(readFileSync(a.outFile, 'utf8')).not.toBe(readFileSync(b.outFile, 'utf8'))
    })

    it('throws when dist/index.html is missing', () => {
        const root = createProject({ withHtml: false })
        roots.push(root)

        expect(() => buildSw({ root })).toThrow(/missing .*index\.html/)
    })

    it('throws when the sw source lost the build token', () => {
        const root = createProject({ source: 'const CACHE_NAME = "fixed"\n' })
        roots.push(root)

        expect(() => buildSw({ root })).toThrow(/__BUILD_ID__/)
    })

    it('throws when the sw source lost the release flag', () => {
        const root = createProject({ source: "const CACHE_NAME = 'ordrumbox-cache-__BUILD_ID__'\n" })
        roots.push(root)

        expect(() => buildSw({ root })).toThrow(/RELEASE_BUILD/)
    })

    it('the repo sw.js still carries the build token and the release flag', () => {
        const source = readFileSync(fileURLToPath(new URL('../sw.js', import.meta.url)), 'utf8')
        expect(source).toContain("const CACHE_NAME = 'ordrumbox-cache-__BUILD_ID__'")
        expect(source).toContain('const RELEASE_BUILD = false')
    })
})
