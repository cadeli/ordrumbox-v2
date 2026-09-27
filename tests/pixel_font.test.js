/**
 * @vitest-environment jsdom
 *
 * Bundled pixel font (Press Start 2P, SIL OFL 1.1).
 * Pins the wiring: font file + OFL notice in src/ui/fonts, @font-face in
 * src/ui/fonts.css (linked by index.html so the splash gets it), the
 * --font-pixel variable, the credit shown in the About panel, and the
 * display/label rules that must stay on the 8px design grid (font-size must
 * be a multiple of 8 to keep glyphs aligned with the device pixel grid).
 * The font ships one weight only, so the UI must never ask for a fake bold.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const root = resolve(__dirname, '..')
const read = (p) => readFileSync(resolve(root, p), 'utf-8')
const readBytes = (p) => readFileSync(resolve(root, p))

const WOFF2_MAGIC = [0x77, 0x4f, 0x46, 0x32] // 'wOF2'

describe('bundled pixel font assets', () => {
    it('ships the woff2 font file', () => {
        const path = 'src/ui/fonts/PressStart2P-latin-400.woff2'
        expect(existsSync(resolve(root, path)), `${path} missing`).toBe(true)
        const bytes = readBytes(path)
        expect([...bytes.subarray(0, 4)]).toEqual(WOFF2_MAGIC)
        expect(bytes.length).toBeGreaterThan(4096)
        expect(bytes.length).toBeLessThan(128 * 1024)
    })

    it('ships the OFL 1.1 notice with the copyright line next to the font', () => {
        const license = read('src/ui/fonts/OFL-PressStart2P.txt')
        expect(license).toContain('SIL OPEN FONT LICENSE Version 1.1')
        expect(license).toContain('Copyright 2012 The Press Start 2P Project Authors')
        expect(license).toContain('with Reserved Font Name "Press Start 2P"')
    })

    it('declares the family in fonts.css with the required notice', () => {
        const css = read('src/ui/fonts.css')
        expect(css.match(/font-family: 'PressStart2P'/g)).toHaveLength(1)
        expect(css).toContain("url('./fonts/PressStart2P-latin-400.woff2')")
        expect(css).toContain("format('woff2')")
        expect(css).toContain('font-display: swap')
        // licence mention accompanies the @font-face block
        expect(css).toContain('SIL Open Font License 1.1')
        expect(css).toContain('Copyright 2012 The Press Start 2P Project Authors')
        expect(css).toContain('src/ui/fonts/OFL-PressStart2P.txt')
        // every url stays inside the bundled fonts directory
        for (const [, url] of css.matchAll(/url\('([^']+)'\)/g)) {
            expect(url.startsWith('./fonts/')).toBe(true)
        }
    })

    it('links fonts.css from index.html (splash loads before styles.css)', () => {
        const html = read('index.html')
        expect(html).toMatch(/<link rel="stylesheet" href="\.\/src\/ui\/fonts\.css" \/>/)
    })
})

describe('--font-pixel wiring', () => {
    const css = read('src/ui/styles.css')

    it('points --font-pixel at the bundled family with a system fallback', () => {
        expect(css).toMatch(/--font-pixel:\s*'PressStart2P', ui-monospace/)
    })

    it('uses the pixel family for the display/label selectors', () => {
        const block = css.slice(css.indexOf('/* ---- 16. Pixel display type'))
        expect(block).toContain('.ne-track,')
        expect(block).toContain('.ne-tab-btn,')
        expect(block).toContain('#soft-synth-panel .ss-group-label,')
        expect(block).toContain('.op-comp-title {')
        expect(block).toContain('font-family: var(--font-pixel)')
    })

    it('disables synthetic bold (single-weight font)', () => {
        const block = css.slice(css.indexOf('/* ---- 16. Pixel display type'))
        expect(block).toContain('font-weight: 400')
        expect(block).toContain('font-synthesis: none')
        expect(css).toMatch(/#tb \.tb-brand \{[^}]*font-weight: 400;/s)
        expect(css).toMatch(/#tb \.tb-brand \{[^}]*font-synthesis: none;/s)
    })

    it('keeps every pixel display size on the 8px grid', () => {
        const block = css.slice(css.indexOf('/* ---- 16. Pixel display type'))
        const section = block.slice(0, block.indexOf('/* ========================================'))
        const sizes = [...section.matchAll(/font-size:\s*(\d+)px/g)].map((m) => Number(m[1]))
        expect(sizes.length).toBeGreaterThan(0)
        for (const size of sizes) expect(size % 8, `${size}px is off the 8px grid`).toBe(0)
    })

    it('renders the splash title and screen label on the 8px grid', () => {
        const html = read('index.html')
        expect(html).toMatch(/font-family:\s*'PressStart2P'/)
        expect(html).toMatch(/\.ws-title \{[^}]*font-weight: 400;/s)
        expect(html).toMatch(/\.ws-title \{[^}]*font-size: 32px;/s)
        expect(html).toMatch(/\.ws-screen-label \{[^}]*font-size: 8px;/s)
        // small screens step down to 16px (still a multiple of 8)
        expect(html).toMatch(/\.ws-title \{[^}]*font-size: 16px;/s)
    })
})

describe('licence mentions', () => {
    it('credits the font in the About panel', () => {
        const about = read('src/ui/about_panel.js')
        expect(about).toContain('Press Start 2P (SIL OFL 1.1)')
        expect(about).toContain('<label>Font</label>')
    })

    it('credits the font in the README licence section', () => {
        const readme = read('README.md')
        expect(readme).toContain('Press Start 2P')
        expect(readme).toContain('SIL Open Font License')
        expect(readme).toContain('OFL-PressStart2P.txt')
    })
})
