// src/ui/toolbar/view_switch.js
// View switch: view buttons, generation buttons, undo/redo.

import { appState } from '../../state/app_state.js'
import { serviceRegistry } from '../../state/service_registry.js'
import { playbackEvents } from '../../state/playback_events.js'
import Utils from '../../core/utils.js'

export default class ViewSwitch {
    /** @param {import('../toolbar.js').default} toolbar */
    constructor(toolbar) { this._tb = toolbar }

    createDOM() {
        const tb = this._tb

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
        viewRow.appendChild(tb.synthBtn)
        viewRow.appendChild(tb.editBtn)
        viewRow.appendChild(tb.prollBtn)
        viewWrap.appendChild(viewLabel)
        viewWrap.appendChild(viewRow)

        return { genWrap, undoWrap, viewWrap }
    }

    bindEvents() {
        const tb = this._tb

        tb.synthBtn.addEventListener('click', () => {
            playbackEvents.emit('synthToggle')
        })
        tb.editBtn.addEventListener('click', () => {
            playbackEvents.emit('editToggle')
        })
        tb.prollBtn.addEventListener('click', () => {
            playbackEvents.emit('prollToggle')
        })

        tb.undoBtn.addEventListener('click', () => {
            serviceRegistry.history?.undo()
        })
        tb.redoBtn.addEventListener('click', () => {
            serviceRegistry.history?.redo()
        })

        tb.drumBtn.addEventListener('click', async () => {
            await this._toggleAutoGen(Utils.DRUM_TYPES, async (pattern, autoGen) => {
                serviceRegistry.cmd.beginGenerationUndo(pattern)
                await autoGen.generatePattern()

                if (pattern.tracks) {
                    pattern.tracks = pattern.tracks.filter(t => {
                        const type = Utils.detectTrackType(t.name)
                        const isMelodic = type === 'BASS' || type === 'PIANO' || type === 'ORGAN'
                        return !isMelodic || (t.notes && t.notes.length > 0)
                    })
                }
                for (const track of pattern.tracks) {
                    if (Utils.DRUM_TYPES.has(Utils.detectTrackType(track.name))) {
                        track.auto = true
                        track._toolbarAuto = true
                    }
                }
                serviceRegistry.cmd.commitGenerationUndo()
            })
        })

        tb.bassBtn.addEventListener('click', async () => {
            await this._toggleAutoGen('BASS', async (pattern, autoGen) => {
                let bassTrack = pattern.tracks?.find(t => Utils.detectTrackType(t.name) === 'BASS')

                serviceRegistry.cmd.beginGenerationUndo(pattern)
                if (!bassTrack) {
                    if (!pattern._autoGenGenre) pattern._autoGenGenre = autoGen.structureGen.getRandomGenre()
                    const genre = pattern._autoGenGenre
                    const firstElement = autoGen.structureGen.getElement(0)
                    const harmony = autoGen.structureGen.resolveHarmony(genre, firstElement.name, firstElement.loopInElement)
                    const structure = autoGen.structureGen.generateStructure(genre)
                    const bassVariant = structure.BASS ?? 'basic'

                    bassTrack = serviceRegistry.cmd.addTrack(pattern, 'BASS')
                    bassTrack.useSoftSynth = true
                    bassTrack.useAutoAssignSound = false
                    bassTrack.synthSoundKey = 'BASS1'
                    bassTrack.velocity = 0.8
                    await autoGen.generateTrack(bassTrack, bassVariant, 1, pattern, harmony)
                    serviceRegistry.patterns.computeFlatNotesFromPattern(pattern)
                }
                bassTrack.auto = true
                bassTrack._toolbarAuto = true
                serviceRegistry.cmd.commitGenerationUndo()
            })
        })

        tb.chordsBtn.addEventListener('click', async () => {
            await this._toggleAutoGen('PIANO', async (pattern, autoGen) => {
                let pianoTrack = pattern.tracks?.find(t => Utils.detectTrackType(t.name) === 'PIANO')

                serviceRegistry.cmd.beginGenerationUndo(pattern)
                if (!pianoTrack) {
                    if (!pattern._autoGenGenre) pattern._autoGenGenre = autoGen.structureGen.getRandomGenre()
                    const genre = pattern._autoGenGenre
                    const firstElement = autoGen.structureGen.getElement(0)
                    const harmony = autoGen.structureGen.resolveHarmony(genre, firstElement.name, firstElement.loopInElement)
                    const structure = autoGen.structureGen.generateStructure(genre)
                    const pianoVariant = structure.PIANO ?? 'chordStab'

                    pianoTrack = serviceRegistry.cmd.addTrack(pattern, 'PIANO')
                    pianoTrack.useSoftSynth = true
                    pianoTrack.useAutoAssignSound = false
                    pianoTrack.synthSoundKey = 'PIANO'
                    pianoTrack.velocity = 0.8
                    await autoGen.generateTrack(pianoTrack, pianoVariant, 1, pattern, harmony)
                    serviceRegistry.patterns.computeFlatNotesFromPattern(pattern)
                }
                pianoTrack.auto = true
                pianoTrack._toolbarAuto = true
                serviceRegistry.cmd.commitGenerationUndo()
            })
        })
    }

    async _toggleAutoGen(typeOrTypes, generateFn) {
        const pattern = appState.patterns[appState.selectedPatternNum]
        if (!pattern) return

        const types = typeOrTypes instanceof Set
            ? typeOrTypes
            : new Set(Array.isArray(typeOrTypes) ? typeOrTypes : [typeOrTypes])
        const hasAuto = (pattern.tracks ?? []).some(t =>
            t._toolbarAuto && types.has(Utils.detectTrackType(t.name))
        )

        if (hasAuto) {
            for (const track of pattern.tracks) {
                if (types.has(Utils.detectTrackType(track.name))) {
                    track.auto = false
                    track._toolbarAuto = false
                }
            }
        } else {
            const { getAutoGenerateService } = await import('../../state/service_loader.js')
            const autoGen = await getAutoGenerateService()
            await generateFn(pattern, autoGen)
        }

        playbackEvents.batch(() => {
            playbackEvents.emit('noteChange')
            playbackEvents.emit('patternChange')
        })
    }
}
