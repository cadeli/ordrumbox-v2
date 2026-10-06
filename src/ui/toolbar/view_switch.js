// src/ui/toolbar/view_switch.js
// View switch: view buttons, generation buttons, undo/redo.

import { appState } from '../../state/app_state.js'
import { serviceRegistry } from '../../state/service_registry.js'
import { showToast } from '../../core/notify.js'
import { playbackEvents } from '../../state/event_bus.js'
import { DRUM_TYPES, detectTrackType } from '../../core/drum_taxonomy.js'
import { filterEmptyMelodicTracks } from '../../core/tracks.js'
import { EVENTS } from '../../core/events.js'

export default class ViewSwitch {
    #tb
    /** Owns every DOM listener bound through listen() — aborted by destroy(). */
    #abortController = new AbortController()

    /** @param {import('../toolbar.js').default} toolbar */
    constructor(toolbar) {
        this.#tb = toolbar
    }

    /**
     * addEventListener tied to the toolbar lifetime: destroy() aborts them all,
     * so no handler reference is kept for removeEventListener.
     * @param {EventTarget} target
     * @param {string} type
     * @param {EventListener} handler
     * @param {AddEventListenerOptions} [options]
     */
    listen(target, type, handler, options) {
        target?.addEventListener(type, handler, { ...options, signal: this.#abortController.signal })
    }

    /** Aborts every listener bound through listen(). */
    destroy() {
        this.#abortController.abort()
    }

    createDOM() {
        const tb = this.#tb

        // ── Generation buttons ──────────────────────────────────
        const genWrap = document.createElement('div')
        genWrap.className = 'tb-group tb-gen-group'
        const genLabel = document.createElement('span')
        genLabel.className = 'tb-label'
        genLabel.textContent = 'Generation'
        const genRow = document.createElement('div')
        genRow.className = 'tb-view-row'
        tb.drumBtn = document.createElement('button')
        tb.drumBtn.className = 'tb-view-btn tb-gen-btn'
        tb.drumBtn.dataset.gen = 'drum'
        tb.drumBtn.textContent = '↻ Drum'
        tb.drumBtn.title = 'Generate drum pattern'
        tb.bassBtn = document.createElement('button')
        tb.bassBtn.className = 'tb-view-btn tb-gen-btn'
        tb.bassBtn.dataset.gen = 'bass'
        tb.bassBtn.textContent = '↻ Bass'
        tb.bassBtn.title = 'Generate bass line'
        tb.chordsBtn = document.createElement('button')
        tb.chordsBtn.className = 'tb-view-btn tb-gen-btn'
        tb.chordsBtn.dataset.gen = 'chords'
        tb.chordsBtn.textContent = '↻ Chords'
        tb.chordsBtn.title = 'Generate chords'
        genRow.appendChild(tb.drumBtn)
        genRow.appendChild(tb.bassBtn)
        genRow.appendChild(tb.chordsBtn)
        genWrap.appendChild(genLabel)
        genWrap.appendChild(genRow)

        // ── Undo/Redo buttons ────────────────────────────────────
        const undoWrap = document.createElement('div')
        undoWrap.className = 'tb-group tb-undo-group tb-hide-mobile'
        const undoLabel = document.createElement('span')
        undoLabel.className = 'tb-label'
        undoLabel.textContent = 'History'
        const undoRow = document.createElement('div')
        undoRow.className = 'tb-undo-row'
        tb.undoBtn = document.createElement('button')
        tb.undoBtn.className = 'tb-undo-btn'
        tb.undoBtn.textContent = '↶'
        tb.undoBtn.title = 'Undo (Ctrl+Z)'
        tb.undoBtn.disabled = true
        tb.redoBtn = document.createElement('button')
        tb.redoBtn.className = 'tb-undo-btn'
        tb.redoBtn.textContent = '↷'
        tb.redoBtn.title = 'Redo (Ctrl+Y)'
        tb.redoBtn.disabled = true
        undoRow.appendChild(tb.undoBtn)
        undoRow.appendChild(tb.redoBtn)
        undoWrap.appendChild(undoLabel)
        undoWrap.appendChild(undoRow)

        // ── View buttons ────────────────────────────────────────
        const viewWrap = document.createElement('div')
        viewWrap.className = 'tb-group tb-hide-mobile'
        const viewLabel = document.createElement('span')
        viewLabel.className = 'tb-label'
        viewLabel.textContent = 'View'
        const viewRow = document.createElement('div')
        viewRow.className = 'tb-view-row'
        tb.synthBtn = document.createElement('button')
        tb.synthBtn.className = 'tb-view-btn'
        tb.synthBtn.dataset.view = 'synth'
        tb.synthBtn.textContent = 'Synth'
        tb.synthBtn.title = 'Toggle Soft Synth'
        tb.editBtn = document.createElement('button')
        tb.editBtn.className = 'tb-view-btn'
        tb.editBtn.dataset.view = 'edit'
        tb.editBtn.textContent = 'Grid'
        tb.editBtn.title = 'Toggle Track Editor'
        tb.prollBtn = document.createElement('button')
        tb.prollBtn.className = 'tb-view-btn'
        tb.prollBtn.dataset.view = 'proll'
        tb.prollBtn.textContent = 'proll'
        tb.prollBtn.title = 'Toggle Proll'
        tb.songBtn = document.createElement('button')
        tb.songBtn.className = 'tb-view-btn'
        tb.songBtn.dataset.view = 'song'
        tb.songBtn.textContent = 'Song'
        tb.songBtn.title = 'Toggle Song'
        viewRow.appendChild(tb.synthBtn)
        viewRow.appendChild(tb.editBtn)
        viewRow.appendChild(tb.prollBtn)
        viewRow.appendChild(tb.songBtn)
        viewWrap.appendChild(viewLabel)
        viewWrap.appendChild(viewRow)

        return { genWrap, undoWrap, viewWrap }
    }

    bindEvents() {
        const tb = this.#tb

        this.listen(tb.synthBtn, 'click', () => {
            playbackEvents.emit(EVENTS.SYNTH_TOGGLE)
        })
        this.listen(tb.editBtn, 'click', () => {
            playbackEvents.emit(EVENTS.EDIT_TOGGLE)
        })
        this.listen(tb.prollBtn, 'click', () => {
            playbackEvents.emit(EVENTS.PROLL_TOGGLE)
        })
        this.listen(tb.songBtn, 'click', () => {
            playbackEvents.emit(EVENTS.SONG_TOGGLE)
        })

        this.listen(tb.undoBtn, 'click', () => {
            serviceRegistry.history?.undo()
        })
        this.listen(tb.redoBtn, 'click', () => {
            serviceRegistry.history?.redo()
        })

        this.listen(tb.drumBtn, 'click', async () => {
            await this.toggleAutoGen(DRUM_TYPES, async (pattern, autoGen) => {
                if (!serviceRegistry.cmd.beginGenerationUndo(pattern)) return
                await autoGen.generatePattern()

                if (pattern.tracks) {
                    pattern.tracks = filterEmptyMelodicTracks(pattern.tracks)
                }
                for (const track of pattern.tracks) {
                    if (DRUM_TYPES.has(detectTrackType(track.name))) {
                        track.auto = true
                        track._toolbarAuto = true
                    }
                }
                serviceRegistry.cmd.commitGenerationUndo()
            })
        })

        this.listen(tb.bassBtn, 'click', async () => {
            await this.toggleAutoGen('BASS', async (pattern, autoGen) => {
                let bassTrack = pattern.tracks?.find((t) => detectTrackType(t.name) === 'BASS')

                if (!serviceRegistry.cmd.beginGenerationUndo(pattern)) return
                if (!bassTrack) {
                    if (!pattern._autoGenGenre) pattern._autoGenGenre = autoGen.structureGen.getRandomGenre()
                    const genre = pattern._autoGenGenre
                    const firstElement = autoGen.structureGen.getElement(0)
                    const harmony = autoGen.structureGen.resolveHarmony(
                        genre,
                        firstElement.name,
                        firstElement.loopInElement,
                    )
                    const structure = autoGen.structureGen.generateStructure(genre)
                    const bassVariant = structure.BASS ?? 'basic'

                    bassTrack = serviceRegistry.cmd.addTrack(pattern, 'BASS')
                    bassTrack.useSoftSynth = true
                    bassTrack.useAutoAssignSound = false
                    bassTrack.synthSoundKey = 'BASS1'
                    bassTrack.velocity = 0.8
                    await autoGen.generateTrack(bassTrack, bassVariant, 1, pattern, harmony)
                    serviceRegistry.flatNotes.applyFlatNotes(pattern)
                }
                bassTrack.auto = true
                bassTrack._toolbarAuto = true
                serviceRegistry.cmd.commitGenerationUndo()
            })
        })

        this.listen(tb.chordsBtn, 'click', async () => {
            await this.toggleAutoGen('PIANO', async (pattern, autoGen) => {
                let pianoTrack = pattern.tracks?.find((t) => detectTrackType(t.name) === 'PIANO')

                if (!serviceRegistry.cmd.beginGenerationUndo(pattern)) return
                if (!pianoTrack) {
                    if (!pattern._autoGenGenre) pattern._autoGenGenre = autoGen.structureGen.getRandomGenre()
                    const genre = pattern._autoGenGenre
                    const firstElement = autoGen.structureGen.getElement(0)
                    const harmony = autoGen.structureGen.resolveHarmony(
                        genre,
                        firstElement.name,
                        firstElement.loopInElement,
                    )
                    const structure = autoGen.structureGen.generateStructure(genre)
                    const pianoVariant = structure.PIANO ?? 'chordStab'

                    pianoTrack = serviceRegistry.cmd.addTrack(pattern, 'PIANO')
                    pianoTrack.useSoftSynth = true
                    pianoTrack.useAutoAssignSound = false
                    pianoTrack.synthSoundKey = 'PIANO'
                    pianoTrack.velocity = 0.8
                    await autoGen.generateTrack(pianoTrack, pianoVariant, 1, pattern, harmony)
                    serviceRegistry.flatNotes.applyFlatNotes(pattern)
                }
                pianoTrack.auto = true
                pianoTrack._toolbarAuto = true
                serviceRegistry.cmd.commitGenerationUndo()
            })
        })
    }

    async toggleAutoGen(typeOrTypes, generateFn) {
        const pattern = appState.selectedPattern
        if (!pattern) return

        const types =
            typeOrTypes instanceof Set ? typeOrTypes : new Set(Array.isArray(typeOrTypes) ? typeOrTypes : [typeOrTypes])
        const hasAuto = (pattern.tracks ?? []).some((t) => t._toolbarAuto && types.has(detectTrackType(t.name)))

        if (hasAuto) {
            for (const track of pattern.tracks) {
                if (types.has(detectTrackType(track.name))) {
                    track.auto = false
                    track._toolbarAuto = false
                }
            }
        } else {
            const { getAutoGeneratorService } = await import('../../state/service_loader.js')
            const autoGen = await getAutoGeneratorService()
            try {
                await generateFn(pattern, autoGen)
            } catch (err) {
                serviceRegistry.cmd.cancelGenerationUndo?.()
                showToast('Auto-generation failed: ' + err.message, 'error')
            }
        }

        playbackEvents.batch(() => {
            playbackEvents.emit(EVENTS.NOTE_CHANGE)
            playbackEvents.emit(EVENTS.PATTERN_CHANGE)
        })
    }
}
