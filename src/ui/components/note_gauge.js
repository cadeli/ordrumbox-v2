// src/ui/components/note_gauge.js
// Transient gauge showing the value a note edit just produced, anchored on the
// edited note: a knob-style arc (the same phosphor sweep as OrKnob) over the
// note name and the new value, plus a ring on the note itself. Shared by the two
// surfaces that edit notes by drag: neither can show the pitch itself (the
// pattern grid has no pitch axis at all, and the piano roll only moves the note
// one row away), so the gauge is the only readout. Key repeat and drag moves
// re-arm it, then it fades out.

import { clamp, toFiniteNumber } from '../../core/numbers.js'
import { NOTE_DEFAULTS } from '../../core/note_schema.js'
import { AXIS_PITCH } from './note_edit.js'
import { MIDI_MAX, MIDI_MIN, MIDDLE_C } from '../piano_roll/constants.js'
import { fmt, pitchToMidi, pitchToNoteName } from './ui_utils.js'

/** How long the bubble stays fully visible after the last edit. */
const LIFETIME_MS = 700

/** Duration of the fade-out, must match the opacity transition in styles.css. */
const FADE_MS = 150

/** Gap between the note and the gauge, in px. */
const GAP = 4

/** Sweep of the arc, as OrKnob: 270° starting at -135°. */
const ARC_SWEEP_DEG = 270

/** Ring added to the note being edited while the gauge is up. */
const ANCHOR_CLASS = 'pp-gauge-anchor'

export default class NoteGauge {
    #getContainer
    #resolveAnchor
    #onShow
    #el = null
    #arc = null
    #body = null
    #marked = null
    #markedTitle = null
    #hideTimer = null
    #fadeTimer = null

    /**
     * @param {() => HTMLElement|null} getContainer - the panel container, read on show (it exists only after init)
     * @param {Object} [opts]
     * @param {(note: Object) => Element|null} [opts.resolveAnchor] - the note's element: each panel repaints it,
     *   so it cannot be cached (the piano roll replaces every note element on render)
     * @param {() => void} [opts.onShow] - run before painting, e.g. to take the panel's own tooltip down
     */
    constructor(getContainer, { resolveAnchor, onShow } = {}) {
        this.#getContainer = getContainer
        this.#resolveAnchor = resolveAnchor
        this.#onShow = onShow
    }

    /**
     * @param {Object} params
     * @param {Object} params.note - the edited note
     * @param {number} [params.trackPitch] - track transposition, for the note name
     * @param {string} params.label - edited property, 'velocity' or 'pitch'
     * @param {number} params.dir - +1 raised the value, -1 lowered it
     */
    show({ note, trackPitch = 0, label, dir }) {
        const container = this.#getContainer()
        const anchor = this.#resolveAnchor?.(note) ?? null
        if (!container || !anchor) return
        this.#onShow?.()

        const pitch = note.pitch ?? 0
        const isPitch = label === AXIS_PITCH
        const value = isPitch ? `pitch:${pitch > 0 ? `+${pitch}` : pitch}` : `vel:${fmt(note.velocity)}`
        const { arc, body } = this.#ensureEl(container)

        body.textContent = `${pitchToNoteName(pitch, trackPitch)}  MIDI ${pitchToMidi(pitch, trackPitch)}\n${value} ${dir > 0 ? '▲' : '▼'}`
        arc.style.setProperty('--arc-deg', `${this.#arcRatio(note, label, trackPitch) * ARC_SWEEP_DEG}deg`)

        this.#position(this.#el, container, anchor)
        this.#keepAlive(this.#el, anchor)
    }

    /**
     * How full the arc is: the velocity itself, or where the note sits on the
     * rendered keyboard for a pitch (so a drum track reads mid-arc, not empty).
     *
     * @param {Object} note
     * @param {string} label - edited property
     * @param {number} trackPitch
     * @returns {number} 0..1
     */
    #arcRatio(note, label, trackPitch) {
        if (label === AXIS_PITCH) {
            const pitch = toFiniteNumber(note.pitch, NOTE_DEFAULTS.pitch)
            const min = MIDI_MIN - MIDDLE_C - trackPitch
            const max = MIDI_MAX - MIDDLE_C - trackPitch
            return clamp((pitch - min) / (max - min), 0, 1)
        }
        return clamp(toFiniteNumber(note.velocity, NOTE_DEFAULTS.velocity), 0, 1)
    }

    /** Hide the gauge and drop its timers (panel hide / destroy). */
    hide() {
        this.#clearTimers()
        this.#unmarkAnchor()
        if (this.#el) {
            this.#el.classList.remove('pp-tooltip-fading')
            this.#el.style.display = 'none'
        }
    }

    /** @returns {boolean} whether the bubble is currently on screen */
    get isVisible() {
        return this.#el?.style.display === 'block'
    }

    #ensureEl(container) {
        if (!this.#el || !container.contains(this.#el)) {
            this.#el?.remove()
            this.#el = document.createElement('div')
            this.#el.className = 'pp-tooltip pp-tooltip-gauge'
            this.#el.style.display = 'none'
            // The dial is a knob clone (same 270° sweep as OrKnob): a filled arc
            // plus the name/value under it.
            this.#el.innerHTML = '<div class="pp-gauge-dial"><div class="pp-gauge-arc"></div></div><div class="pp-gauge-body"></div>'
            container.appendChild(this.#el)
            this.#arc = this.#el.querySelector('.pp-gauge-arc')
            this.#body = this.#el.querySelector('.pp-gauge-body')
        }
        return { arc: this.#arc, body: this.#body }
    }

    /**
     * Rings the edited note, and only ever one at a time, taking its tooltip
     * down for the duration: two readouts for the same note (native title in
     * the piano roll, hover bubble in the pattern grid) would fight on screen.
     */
    #markAnchor(anchor) {
        if (this.#marked && this.#marked !== anchor) this.#unmarkAnchor()
        if (!this.#marked) {
            this.#marked = anchor
            this.#marked.classList.add(ANCHOR_CLASS)
            this.#markedTitle = this.#marked.getAttribute('title')
            if (this.#markedTitle !== null) this.#marked.removeAttribute('title')
        }
    }

    #unmarkAnchor() {
        if (!this.#marked) return
        this.#marked.classList.remove(ANCHOR_CLASS)
        if (this.#markedTitle !== null) this.#marked.setAttribute('title', this.#markedTitle)
        this.#marked = null
        this.#markedTitle = null
    }

    #position(el, container, anchor) {
        const anchorRect = anchor.getBoundingClientRect()
        const containerRect = container.getBoundingClientRect()
        const width = el.offsetWidth
        const height = el.offsetHeight

        // Layout bounds, not data bounds: clamp() would log a warning for a
        // bubble that a note near the panel edge pushes out of view.
        const left = Math.min(
            Math.max(anchorRect.left - containerRect.left + anchorRect.width / 2 - width / 2, GAP),
            Math.max(containerRect.width - width - GAP, GAP),
        )
        const above = anchorRect.top - containerRect.top - height - GAP
        const top = above >= GAP ? above : anchorRect.bottom - containerRect.top + GAP
        el.style.left = `${left}px`
        el.style.top = `${top}px`
    }

    #keepAlive(el, anchor) {
        this.#clearTimers()
        this.#markAnchor(anchor)
        el.classList.remove('pp-tooltip-fading')
        el.style.display = 'block'
        this.#hideTimer = setTimeout(() => {
            el.classList.add('pp-tooltip-fading')
            this.#fadeTimer = setTimeout(() => {
                el.style.display = 'none'
                el.classList.remove('pp-tooltip-fading')
                this.#unmarkAnchor()
            }, FADE_MS)
        }, LIFETIME_MS)
    }

    #clearTimers() {
        if (this.#hideTimer) clearTimeout(this.#hideTimer)
        if (this.#fadeTimer) clearTimeout(this.#fadeTimer)
        this.#hideTimer = null
        this.#fadeTimer = null
    }
}