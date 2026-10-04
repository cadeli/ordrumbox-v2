// src/ui/pattern_panel/GridSection.js
// Track grid: rows, beat cells, note slices, ghosts, dividers, solo,
// volume sliders, vu meters, master track, add-track button.

import Utils from '../../core/utils.js'
import { soundRegistry } from '../../state/sound_registry.js'
import { valueOrFallback } from '../../core/logger.js'
import { getNoteSubPositions } from '../../patterns/note_positions.js'
import { createStepResolver } from '../../patterns/step_resolver.js'

export default class GridSection {
    #editor

    /** @param {import('../pattern_panel.js').default} editor */
    constructor(editor) {
        this.#editor = editor
    }

    /** Build noteMap + ghostMap for a track (cached by coordinator). */
    buildTrackData(track, startBeat, endBeatPage, _pattern) {
        const stepsPerBeat = track.stepsPerBeat ?? 4
        const notes = Array.isArray(track.notes)
            ? track.notes
            : Object.values(valueOrFallback(track.notes, {}, 'PatternPanel', 'track.notes fallback'))

        const noteMap = new Map()
        notes.forEach((n) => {
            const key = `${n.beat}:${n.beatStep}`
            if (!noteMap.has(key)) noteMap.set(key, [])
            noteMap.get(key).push(n)
        })

        const ghostMap = new Map()
        const resolveSpanEnd = createStepResolver(track)
        const totalSteps = (track.beatCount ?? 4) * stepsPerBeat
        noteMap.forEach((notes) => {
            for (const note of notes) {
                getNoteSubPositions(note, track, totalSteps, resolveSpanEnd).forEach(({ pos, type }) => {
                    const stepAbs = Math.floor(pos)
                    const { beat } = Utils.stepToBeat(stepAbs, stepsPerBeat)
                    if (beat >= startBeat && beat < endBeatPage) {
                        if (!ghostMap.has(stepAbs)) ghostMap.set(stepAbs, [])
                        ghostMap.get(stepAbs).push({ offset: pos - stepAbs, type })
                    }
                })
            }
        })

        return { noteMap, ghostMap }
    }

    /** Render the inner HTML of a cell (ghosts + note slices) */
    renderCellContent(notesAtStep = [], ghostsAtStep = []) {
        let noteSlicesHtml = ''
        if (notesAtStep && notesAtStep.length > 0) {
            const slicePct = (100 / notesAtStep.length).toFixed(2)
            noteSlicesHtml = notesAtStep
                .map((note, voiceIdx) => {
                    const vel = note.velocity ?? 0.8
                    const alpha = 0.25 + vel * 0.75
                    return `<div class="pp-note-slice" data-voice-idx="${voiceIdx}" style="width:${slicePct}%;opacity:${alpha.toFixed(2)}"></div>`
                })
                .join('')
        }

        const ghosts = (ghostsAtStep ?? [])
            .map(({ type }) => {
                const ghostCls = type === 'euclidean' ? 'pp-ghost pp-ghost-euclidean' : 'pp-ghost pp-ghost-retrigger'
                return `<div class="${ghostCls}"></div>`
            })
            .join('')

        return `${ghosts}${noteSlicesHtml}`
    }

    /** Surgically update a single cell DOM element in-place */
    updateCell(cellEl, track, b, s, cached, _pattern) {
        if (!cellEl) return
        const stepsPerBeat = track.stepsPerBeat ?? 4
        const absPos = b * stepsPerBeat + s
        const isBeyondTrack = b >= (track.beatCount ?? 4)
        const totalSteps = (track.beatCount ?? 4) * stepsPerBeat
        const loopAt = track.loopAtStep ?? totalSteps

        const notesAtStep = cached.noteMap.get(`${b}:${s}`) ?? []
        const ghostsAtStep = cached.ghostMap.get(absPos) ?? []

        cellEl.classList.toggle('pp-cell-out', isBeyondTrack)
        cellEl.classList.toggle('filled', notesAtStep.length > 0)
        cellEl.classList.toggle('pp-cell-multi', notesAtStep.length > 1)
        cellEl.classList.toggle('pp-loop', loopAt > 0 && absPos === loopAt - 1)

        let isRand = false
        let isFixed = false
        if (notesAtStep.length > 0) {
            const firstNote = notesAtStep[0]
            if ((firstNote.prob ?? 1) < 1) {
                isRand = true
            } else if ((firstNote.every ?? 1) > 1) {
                isFixed = true
            }
        }
        cellEl.classList.toggle('pp-trig-rand', isRand)
        cellEl.classList.toggle('pp-trig-fixed', isFixed)

        cellEl.innerHTML = this.renderCellContent(notesAtStep, ghostsAtStep)
    }

    /** Surgically update all cells for a given track in-place */
    updateTrackCells(trackIdx, track, pattern, startBeat, endBeatPage, trackDataCache, cellMap) {
        const cached = this.buildTrackData(track, startBeat, endBeatPage, pattern)
        trackDataCache.set(trackIdx, cached)

        const stepsPerBeat = track.stepsPerBeat ?? 4
        for (let b = startBeat; b < endBeatPage; b++) {
            if (b < (pattern.beatCount ?? 4)) {
                for (let s = 0; s < stepsPerBeat; s++) {
                    const cell = cellMap.get(`${trackIdx}:${b}:${s}`)
                    if (cell) {
                        this.updateCell(cell, track, b, s, cached, pattern)
                    }
                }
            }
        }
    }

    /**
     * @param {any[]} tracks
     * @param {any} pattern
     * @param {{startBeat: number, endBeatPage: number, effectiveTrackIdx: number, cachedPage?: any, cachedVersion?: any, trackDataDirty?: any, trackDataCache: Map<number, any>}} opts
     * @returns {string} tracks HTML (including toolbar row + waveform canvas)
     */
    render(tracks, pattern, opts) {
        const editor = this.#editor
        const { startBeat, endBeatPage, effectiveTrackIdx } = opts
        const totalStepsFor = (track) => (track.beatCount ?? 4) * (track.stepsPerBeat ?? 4)

        let html = '<div class="pp-tracks">'
        tracks.forEach((track, tIdx) => {
            if (!track) return
            const stepsPerBeat = track.stepsPerBeat ?? 4

            let cached = opts.trackDataCache.get(tIdx)
            if (!cached) {
                cached = this.buildTrackData(track, startBeat, endBeatPage, pattern)
                opts.trackDataCache.set(tIdx, cached)
            }

            let beatsHtml = '<div class="pp-beats">'
            for (let b = startBeat; b < endBeatPage; b++) {
                let cellsHtml = ''
                if (b < (pattern.beatCount ?? 4)) {
                    const trackBeatCount = track.beatCount ?? 4
                    for (let s = 0; s < stepsPerBeat; s++) {
                        const absPos = b * stepsPerBeat + s
                        const isBeyondTrack = b >= trackBeatCount

                        const notesAtStep = cached.noteMap.get(`${b}:${s}`)

                        const cls = ['pp-cell']
                        if (isBeyondTrack) cls.push('pp-cell-out')

                        if (notesAtStep && notesAtStep.length > 0) {
                            cls.push('filled')
                            if (notesAtStep.length > 1) cls.push('pp-cell-multi')

                            const firstNote = notesAtStep[0]
                            if ((firstNote.prob ?? 1) < 1) {
                                cls.push('pp-trig-rand')
                            } else if ((firstNote.every ?? 1) > 1) {
                                cls.push('pp-trig-fixed')
                            }
                        }

                        const loopAt = track.loopAtStep ?? totalStepsFor(track)
                        if (loopAt > 0 && absPos === loopAt - 1) cls.push('pp-loop')

                        const ghostsAtStep = cached.ghostMap.get(absPos) ?? []
                        const innerHtml = this.renderCellContent(notesAtStep, ghostsAtStep)

                        const cellHtml = `<div class="${cls.join(' ')}" data-track="${tIdx}" data-beat="${b}" data-step="${s}" data-pos="${absPos}">${innerHtml}</div>`
                        cellsHtml += cellHtml
                    }
                }
                beatsHtml += `<div class="pp-beat" data-beat="${b}">${cellsHtml}</div>`
            }
            beatsHtml += '</div>'

            const isSelected = effectiveTrackIdx === tIdx
            const isMuted = track.mute === true
            const isSolo = track.solo === true
            const soundUrl =
                track.soundId && track.soundId !== 'NOT_DEFINED'
                    ? (soundRegistry.sounds[track.soundId]?.url ?? track.soundId)
                    : ''
            html += `
                <div class="pp-track ${isMuted ? 'pp-muted' : ''} ${isSelected ? 'pp-selected' : ''}">
                    <div class="pp-vu ${isSelected ? 'selected' : ''}" data-track="${tIdx}"><div class="pp-vu-fill"></div></div>
                    <div class="pp-track-left">
                        <div class="pp-track-top">
                            <span class="pp-track-name ${isSelected ? 'selected' : ''}" data-track="${tIdx}">${editor.esc(valueOrFallback(track.name, 'Track', 'PatternPanel', 'track name fallback'))}</span>
                            <input type="range" class="pp-volume" min="0" max="1" step="0.01" value="${track.velocity ?? 1}" data-track="${tIdx}">
                        </div>
                        ${track.useSoftSynth && track.synthSoundKey ? `<div class="pp-track-url">SYNTH: ${editor.esc(track.synthSoundKey)}</div>` : soundUrl ? `<div class="pp-track-url" title="${editor.esc(soundUrl)}">${editor.esc(soundUrl)}</div>` : ''}
                    </div>
                    <div class="pp-divider ${isMuted ? 'muted' : ''}" data-track="${tIdx}" role="button" tabindex="0" title="Mute"></div>
                    <div class="pp-solo ${isSolo ? 'active' : ''}" data-track="${tIdx}" role="button" tabindex="0" title="Solo"></div>
                    ${beatsHtml}
                </div>`
        })
        html += `<div class="pp-toolbar-row">
            <div class="pp-master-track" id="pp-master-btn">
                <span class="pp-track-name">Master</span>
                <input type="range" class="pp-master-volume" min="0" max="2" step="0.01" value="1" title="Master Gain">
            </div>
            <div class="pp-add-track" id="pp-add-track">+ new track</div>
            <div class="pp-delete-track" id="pp-delete-track">− delete track</div>
        </div>`
        html += `<canvas class="pp-waveform-overlay"></canvas></div>`

        return html
    }

    /** Apply scroll constraints after render. */
    applyScrollConstraints(tracksEl, tracks) {
        const TRACK_HEIGHT = 46
        const TRACK_GAP = 3
        const MAX_VISIBLE = 10
        if (tracks.length > MAX_VISIBLE) {
            const maxH = MAX_VISIBLE * TRACK_HEIGHT + (MAX_VISIBLE - 1) * TRACK_GAP
            tracksEl.style.maxHeight = maxH + 'px'
            tracksEl.style.overflowY = 'auto'
        } else {
            tracksEl.style.maxHeight = ''
            tracksEl.style.overflowY = ''
        }
    }

    /** Build the cellMap from DOM. Returns a Map<string, HTMLElement>. */
    buildCellMap(container) {
        const cellMap = new Map()
        const cells = container.querySelectorAll('.pp-cell')
        for (const cell of cells) {
            const key = `${cell.dataset.track}:${cell.dataset.beat}:${cell.dataset.step}`
            cellMap.set(key, cell)
        }
        return cellMap
    }
}
