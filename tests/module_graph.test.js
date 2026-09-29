/**
 * Module graph rules — enforces the layering of src/ (AGENTS.md architecture).
 *
 * - Imports are parsed after stripping comments, so JSDoc `import('./x.js')`
 *   type references do not count as edges.
 * - Static edges (import/export ... from, side-effect imports) must obey the
 *   per-layer allow-lists below and must not form cycles.
 * - Dynamic imports (service_loader pattern) are allowed to cross layers
 *   freely, except that no layer outside ui/ may ever load a ui module.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const SRC_DIR = fileURLToPath(new URL('../src', import.meta.url))

/** Per-layer allowed target layers for STATIC import edges. */
const ALLOWED_STATIC = {
    core: ['core', 'model'],
    model: ['model', 'core'],
    state: ['state', 'core'],
    patterns: ['patterns', 'core', 'model', 'state'],
    cache: ['cache', 'core'],
    loader: ['loader', 'cache', 'core', 'patterns', 'state'],
    audio: ['audio', 'core', 'model', 'state', 'patterns', 'loader', 'logic'],
    logic: ['logic', 'core', 'model', 'state', 'patterns', 'audio', 'cache', 'loader'],
    ui: ['ui', 'core', 'model', 'state', 'patterns', 'audio', 'logic', 'cache', 'loader'],
    bootstrap: ['bootstrap', '(root)', 'core', 'loader', 'logic', 'patterns', 'state', 'ui'],
    '(root)': ['bootstrap', '(root)', 'core', 'loader', 'patterns', 'state', 'ui'],
}

const listJsFiles = (dir) =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) return listJsFiles(full)
        return entry.name.endsWith('.js') ? [full] : []
    })

const stripComments = (code) => code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')

// group 1 = static edge (from '...' | import '...'), group 2 = dynamic import('...')
const IMPORT_RE = /(?:\bfrom\s*|\bimport\s+)['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]/g

const layerOf = (file) => {
    const rel = path.relative(SRC_DIR, file)
    return rel.includes(path.sep) ? rel.split(path.sep)[0] : '(root)'
}

const resolveImport = (fromFile, spec) => {
    if (!spec.startsWith('.')) return null // package import (none expected in src/)
    const target = path.normalize(path.join(path.dirname(fromFile), spec))
    if (target.endsWith('.js')) return fs.existsSync(target) ? target : null
    if (fs.existsSync(target)) return target // asset import (css, json, …)
    if (path.extname(target)) return null
    if (fs.existsSync(`${target}.js`)) return `${target}.js`
    return null
}

const files = listJsFiles(SRC_DIR)
const staticEdges = []
const dynamicEdges = []
const unresolved = []

for (const file of files) {
    const code = stripComments(fs.readFileSync(file, 'utf8'))
    let match
    IMPORT_RE.lastIndex = 0
    while ((match = IMPORT_RE.exec(code))) {
        const [, staticSpec, dynSpec] = match
        const spec = staticSpec ?? dynSpec
        if (!spec) continue
        const resolved = resolveImport(file, spec)
        if (spec.startsWith('.') && !resolved) {
            unresolved.push(`${path.relative(SRC_DIR, file)} -> ${spec}`)
            continue
        }
        if (!resolved) continue
        const edge = { from: file, to: resolved, spec }
        if (dynSpec) dynamicEdges.push(edge)
        else staticEdges.push(edge)
    }
}

const describeEdge = (edge) => `${path.relative(SRC_DIR, edge.from)} -> ${path.relative(SRC_DIR, edge.to)}`

describe('module graph', () => {
    it('finds source files across the whole tree', () => {
        expect(files.length).toBeGreaterThan(100)
    })

    it('every relative import resolves to an existing file', () => {
        expect(unresolved).toEqual([])
    })

    it('static imports never form a cycle', () => {
        const graph = new Map()
        for (const edge of staticEdges) {
            if (!graph.has(edge.from)) graph.set(edge.from, [])
            graph.get(edge.from).push(edge.to)
        }
        const VISITING = 1
        const DONE = 2
        const state = new Map()
        const stack = []
        let cycle = null

        const visit = (node) => {
            state.set(node, VISITING)
            stack.push(node)
            for (const next of graph.get(node) ?? []) {
                if (state.get(next) === VISITING) {
                    cycle = stack.slice(stack.indexOf(next)).concat(next)
                    return true
                }
                if (!state.get(next) && visit(next)) return true
            }
            stack.pop()
            state.set(node, DONE)
            return false
        }

        for (const file of files) {
            if (!state.get(file) && visit(file)) break
        }

        const pretty = cycle ? cycle.map((f) => path.relative(SRC_DIR, f)).join('\n  <- ') : ''
        expect(pretty).toBe('')
    })

    it.each(Object.entries(ALLOWED_STATIC))(
        'layer "%s" only statically imports allowed layers (%j)',
        (layer, allowed) => {
            const violations = staticEdges
                .filter((edge) => layerOf(edge.from) === layer && !allowed.includes(layerOf(edge.to)))
                .map(describeEdge)
            expect(violations).toEqual([])
        },
    )

    it('ui modules are never imported from outside ui/bootstrap/root', () => {
        const violations = staticEdges
            .filter((edge) => layerOf(edge.to) === 'ui' && !['ui', 'bootstrap', '(root)'].includes(layerOf(edge.from)))
            .map(describeEdge)
        expect(violations).toEqual([])
    })

    it('dynamic imports never load a ui module from outside ui', () => {
        const violations = dynamicEdges
            .filter((edge) => layerOf(edge.to) === 'ui' && layerOf(edge.from) !== 'ui')
            .map(describeEdge)
        expect(violations).toEqual([])
    })
})
