/**
 * Click bursts — every click answers with a candy ring (see styles.css .click-burst).
 *
 * Pure DOM + CSS: the element is pointer-events:none and removed after its
 * animation, so it never interferes with hit testing, layout or drag flows.
 */

import { pickRandom } from './random.js'

const BURST_CLASS = 'click-burst'
const COLORS = ['--toy-pink', '--toy-cyan', '--toy-yellow', '--toy-violet', '--toy-orange', '--toy-lime']
const MAX_ACTIVE = 14
const LIFETIME_MS = 700

let active = 0
let installed = false
/** @type {Set<ReturnType<typeof setTimeout>>} */
const pendingBursts = new Set()

function spawn(x, y) {
    if (active >= MAX_ACTIVE) return
    const el = document.createElement('div')
    el.className = BURST_CLASS
    el.style.setProperty('--burst-color', `var(${pickRandom(COLORS)})`)
    el.style.left = `${Math.round(x)}px`
    el.style.top = `${Math.round(y)}px`

    document.body.appendChild(el)
    active++
    const timer = setTimeout(() => {
        el.remove()
        active--
        pendingBursts.delete(timer)
    }, LIFETIME_MS)
    pendingBursts.add(timer)
}

function onPointerDown(event) {
    try {
        spawn(event.clientX, event.clientY)
    } catch {
        active = 0
    }
}
/** Registers the global pointer listener once. Safe to call repeatedly. */
export function initClickBursts() {
    if (installed || typeof document === 'undefined') return
    installed = true
    document.addEventListener('pointerdown', onPointerDown, { passive: true })
}

/** Cancel any pending burst cleanup timers. */
export function cancelPendingBursts() {
    for (const t of pendingBursts) clearTimeout(t)
    pendingBursts.clear()
}
