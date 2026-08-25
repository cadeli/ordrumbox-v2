// src/ui/pattern_panel/GridSection.js
// Track grid: rows, beat cells, note slices, ghosts, dividers, solo,
// volume sliders, vu meters, master track, add-track button.

import Utils from '../../core/utils.js'
import { soundRegistry } from '../../state/sound_registry.js'
import { nameOr } from '../../core/logger.js'

export default class GridSection {
    /** @param {import('./pattern_panel.js').default} editor */
    constructor(editor) { this._editor = editor }

    /** Build noteMap + ghostMap for a track (cached by coordinator). */
    buildTrackData(track, startBeat, endBeatPage, pattern) {
        const stepsPerBeat = track.stepsPerBeat ?? 4
        const notes = Array.isArray(track.notes) ? track.notes : Object.values(nameOr(track.notes, {}, 'PatternPanel', 'track.notes fallback'))

        const noteMap = new Map()
        notes.forEach(n => {
            const key = `${n.beat}:${n.beatStep}`
            if (!noteMap.has(key)) noteMap.set(key, [])
            noteMap.get(key).push(n)
        })

        const ghostMap = new Map()
        noteMap.forEach(notes => {
            for (const note of notes) {
                this._getSubPositions(note, track, pattern).forEach(({ pos, type }) => {
                    const stepAbs = Math.floor(pos)
                    const beat = Math.floor(stepAbs / stepsPerBeat)
                    if (beat >= startBeat && beat < endBeatPage) {
                        if (!ghostMap.has(stepAbs)) ghostMap.set(stepAbs, [])
                        ghostMap.get(stepAbs).push({ offset: pos - stepAbs, type })
                    }
                })
            }
        })

        return { noteMap, ghostMap }
    }

    /**
     * @param {Array} tracks
     * @param {object} pattern
     * @param {object} opts  { startBeat, endBeatPage, selTrackIdx, selectedTrackNum, cachedPage, cachedVersion, trackDataDirty, trackDataCache }
     * @returns {string} tracks HTML (including toolbar row + waveform canvas)
     */
    render(tracks, pattern, opts) {
        const editor = this._editor
        const { startBeat, endBeatPage } = opts
        const totalSteps = (track) => (track.nbBeats ?? 4) * (track.stepsPerBeat ?? 4)

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
                if (b < (pattern.nbBeats ?? 4)) {
                    const trackBarCount = track.nbBeats ?? 4
                    for (let s = 0; s < stepsPerBeat; s++) {
                        const absPos = b * stepsPerBeat + s
                        const isBeyondTrack = b >= trackBarCount

                        const notesAtStep = cached.noteMap.get(`${b}:${s}`)

                        const cls = ['pp-cell']
                        if (isBeyondTrack) cls.push('pp-cell-out')

                        let trig = ''
                        let noteSlicesHtml = ''

                        if (notesAtStep && notesAtStep.length > 0) {
                            cls.push('filled')
                            if (notesAtStep.length > 1) cls.push('pp-cell-multi')

                            const slicePct = (100 / notesAtStep.length).toFixed(2)
                            noteSlicesHtml = notesAtStep.map((note, ni) => {
                                const vel = note.velocity ?? 0.8
                                const alpha = 0.25 + vel * 0.75
                                const pitch = note.pitch ?? 0
                                const pct = ((pitch + 24) / 48) * 100
                                return `<div class="pp-note-slice" data-note-idx="${ni}" style="width:${slicePct}%;opacity:${alpha.toFixed(2)}"><div class="pp-pitch-beat" style="bottom:${pct.toFixed(1)}%"></div></div>`
                            }).join('')

                            const firstNote = notesAtStep[0]
                            if ((firstNote.prob ?? 1) < 1) {
                                cls.push('pp-trig-rand')
                                trig = String(Math.round(firstNote.prob * 10))
                            } else if ((firstNote.every ?? 1) > 1) {
                                cls.push('pp-trig-fixed')
                                trig = String(firstNote.every)
                            }
                        }

                        const loopAt = track.loopAtStep ?? totalSteps(track)
                        if (loopAt > 0 && absPos === loopAt - 1) cls.push('pp-loop')

                        const ghosts = (cached.ghostMap.get(absPos) ?? []).map(({ type }) => {
                            const ghostCls = type === 'euclidian' ? 'pp-ghost pp-ghost-euclidian' : 'pp-ghost pp-ghost-retrigger'
                            return `<div class="${ghostCls}"></div>`
                        }).join('')

                        const cellHtml = `<div class="${cls.join(' ')}" data-track="${tIdx}" data-beat="${b}" data-step="${s}" data-pos="${absPos}" ${trig ? `data-trig="${trig}"` : ''}>${ghosts}${noteSlicesHtml}</div>`
                        cellsHtml += cellHtml
                    }
                }
                beatsHtml += `<div class="pp-beat" data-beat="${b}">${cellsHtml}</div>`
            }
            beatsHtml += '</div>'

            const currentTrackIdx = editor._selTrackIdx !== -1 ? editor._selTrackIdx : (editor._appState.selectedTrackNum ?? -1)
            const isSelected = currentTrackIdx === tIdx
            const isMuted = track.mute === true
            const isSolo = track.solo === true
            const soundUrl = track.soundId && track.soundId !== 'NOT_DEFINED'
                ? (soundRegistry.sounds[track.soundId]?.url ?? track.soundId)
                : ''
            html += `
                <div class="pp-track ${isMuted ? 'pp-muted' : ''} ${isSelected ? 'pp-selected' : ''}">
                    <div class="pp-vu ${isSelected ? 'selected' : ''}" data-track="${tIdx}"><div class="pp-vu-fill"></div></div>
                    <div class="pp-track-left">
                        <div class="pp-track-top">
                            <span class="pp-track-name ${isSelected ? 'selected' : ''}" data-track="${tIdx}">${editor.esc(nameOr(track.name, 'Track', 'PatternPanel', 'track name fallback'))}</span>
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

    _getSubPositions(note, track, pattern) {
        const stepsPerBeat = track.stepsPerBeat ?? 4
        const basePos = note.beat * stepsPerBeat + note.beatStep
        const retriggerNum = note.retriggerNum ?? 1
        const rate = note.rate ?? 1
        const euclidianFill = note.euclidianFill ?? 0
        const hasArp = note.arp && (typeof note.arp === 'string' || (typeof note.arp === 'object' && !Array.isArray(note.arp) && Array.isArray(note.arp.intervals) && note.arp.intervals.length > 0))
        const totalSteps = (track.nbBeats ?? 4) * stepsPerBeat

        const positions = []
        const stepSpacing = rate < 8 ? rate / 8 : rate - 7
        const count = hasArp || retriggerNum > 1 ? retriggerNum : 0

        for (let i = 1; i < count; i++) {
            const pos = Math.round(basePos + i * stepSpacing)
            if (pos < totalSteps) positions.push({ pos, type: 'retrigger' })
        }

        if (euclidianFill > 0) {
            const endStep = (() => {
                const currentPatternPos = basePos
                let nextNotePos = totalSteps
                for (const n of (track.notes ?? [])) {
                    const nPos = n.beat * stepsPerBeat + n.beatStep
                    if (nPos > currentPatternPos && nPos < nextNotePos) {
                        nextNotePos = nPos
                    }
                }
                return track.loopAtStep && track.loopAtStep > currentPatternPos && track.loopAtStep < nextNotePos
                    ? track.loopAtStep
                    : nextNotePos
            })()

            const stepsSpan = endStep - basePos
            for (let i = 1; i <= euclidianFill; i++) {
                const pos = Math.round(basePos + (i * stepsSpan) / (euclidianFill + 1))
                if (pos < totalSteps) positions.push({ pos, type: 'euclidian' })
            }
        }
        return positions
    }
}
