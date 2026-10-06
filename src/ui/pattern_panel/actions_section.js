// src/ui/pattern_panel/actions_section.js
// Pattern toolbar actions: new/delete/duplicate/rename/clean/save/import.

import { showToast } from '../../core/notify.js'
import { logger } from '../../core/logger.js'
import { validatePatternJson } from '../../logic/commands/pattern_import.js'
import { downloadJson } from '../components/ui_utils.js'

export default class ActionsSection {
    #editor

    /** @param {import('../pattern_panel.js').default} editor */
    constructor(editor) {
        this.#editor = editor
    }

    async run(action) {
        const editor = this.#editor
        const idx = editor.appState.selectedPatternIdx
        const pattern = editor.appState.patterns[idx]
        if (!pattern && action !== 'replace' && action !== 'new') return
        const cmd = editor.serviceRegistry.cmd
        const patterns = editor.serviceRegistry.flatNotes

        switch (action) {
            case 'new': {
                const newIdx = editor.appState.patterns.length
                cmd.addPattern()
                cmd.setSelectedPatternIdx(newIdx)
                cmd.resetPage()
                editor.emitStructureChange()
                showToast('Pattern added', 'success')
                break
            }
            case 'delete': {
                if (editor.appState.patterns.length <= 1) return
                if (!confirm('Delete pattern "' + (pattern.name ?? '') + '"?')) return
                cmd.removePattern(idx)
                editor.emitStructureChange()
                break
            }
            case 'clean': {
                if (!confirm('Clear all notes in "' + (pattern.name ?? '') + '"?')) return
                cmd.cleanPattern(pattern)
                patterns?.applyFlatNotes(pattern)
                break
            }
            case 'duplicate': {
                const clone = cmd.addPattern((pattern.name ?? 'Pattern') + ' copy')
                Object.assign(clone, structuredClone(pattern))
                clone.name = (pattern.name ?? 'Pattern') + ' copy'
                // Object.assign copied the source id too — two patterns sharing
                // one would make arrangement references ambiguous.
                cmd.refreshPatternId(clone)
                const newIdx = editor.appState.patterns.length - 1
                await cmd.setSelectedPatternIdx(newIdx)
                editor.emitStructureChange()
                break
            }
            case 'rename': {
                const newName = prompt('Rename pattern:', pattern.name ?? '')
                if (newName === null || newName.trim() === '') return
                cmd.renamePattern(idx, newName.trim())
                editor.emitStructureChange()
                break
            }
            case 'save': {
                const { Exporter } = await import('../../patterns/exporter.js')
                const data = Exporter.export(pattern)
                downloadJson(data, `ordrumbox-${pattern.name ?? 'pattern'}.json`)
                break
            }
            case 'replace': {
                const input = document.createElement('input')
                input.type = 'file'
                input.accept = '.json'
                input.onchange = async (e) => {
                    const file = /** @type {HTMLInputElement} */ (e.target).files?.[0]
                    if (!file) return
                    try {
                        const text = await file.text()
                        const data = JSON.parse(text)
                        const validation = validatePatternJson(data)
                        if (!validation.ok) {
                            showToast(`Invalid pattern: ${validation.error}`, 'error')
                            return
                        }
                        cmd.recordTransaction('Import pattern', () => cmd.importPatternFromJson(data))
                        editor.emitStructureChange()
                    } catch (err) {
                        logger.error('PatternPanel', 'Import failed', err)
                        showToast('Import failed: ' + err.message, 'error')
                    }
                }
                input.click()
                break
            }
        }
    }
}
