// src/ui/track_editor/sound_section.js
// Sound tab — instrument/sample/synth selects, mono toggle, auto-assign.
// The rows are built once by mount(); sync() only updates values in place.

import { renderOptions } from '../components/ui_utils.js'
import InstrumentsManager from '../../logic/services/instruments_manager/index.js'
import AutoAssign from '../../logic/services/auto_assign.js'
import { emitTrackChanged } from '../../state/event_bus.js'
import {
    getCurrentInstrumentId,
    getCurrentSoundUrl,
    getPreferredSampleForInstrument,
    getSamplesForInstrument,
} from './sound_queries.js'

export default class SoundSection {
    #editor
    #instrumentSel
    #sampleSel
    #sampleLabel
    #generatedSel
    #monoBtn
    #autoBtn

    /** @param {import('../track_editor.js').default} editor */
    constructor(editor) {
        this.#editor = editor
    }

    /**
     * Build the sound rows once. Called by TrackEditor.createDOM().
     * @param {HTMLElement} container
     */
    mount(container) {
        const monoRow = document.createElement('div')
        monoRow.className = 'ne-row'
        const monoLabel = document.createElement('label')
        monoLabel.textContent = 'Mono'
        this.#monoBtn = document.createElement('button')
        this.#monoBtn.className = 'ne-btn'
        this.#monoBtn.dataset.key = 'mono'
        monoRow.append(monoLabel, this.#monoBtn)
        container.appendChild(monoRow)

        const autoRow = document.createElement('div')
        autoRow.className = 'ne-row'
        this.#autoBtn = document.createElement('button')
        this.#autoBtn.className = 'lfo-led'
        this.#autoBtn.dataset.action = 'toggle-auto'
        this.#autoBtn.title = 'Enable auto-assign'
        const autoLabel = document.createElement('label')
        autoLabel.textContent = 'auto'
        autoRow.append(this.#autoBtn, autoLabel)
        container.appendChild(autoRow)

        const instr = this.#buildSelectRow('Instr', 'instrument')
        this.#instrumentSel = instr.sel
        container.appendChild(instr.row)

        const sample = this.#buildSelectRow('Sample', 'sample')
        this.#sampleSel = sample.sel
        this.#sampleLabel = sample.label
        container.appendChild(sample.row)

        const synthRow = document.createElement('div')
        synthRow.className = 'ne-row ne-row-separator'
        const synthLabel = document.createElement('label')
        synthLabel.textContent = 'Synth'
        this.#generatedSel = document.createElement('select')
        this.#generatedSel.dataset.sound = 'generated'
        synthRow.append(synthLabel, this.#generatedSel)
        container.appendChild(synthRow)
    }

    /** Update values in place. */
    sync(track) {
        if (!track) return
        const editor = this.#editor
        const sr = editor.soundRegistry

        const auto = track.useAutoAssignSound !== false
        this.#autoBtn.classList.toggle('on', auto)
        this.#autoBtn.title = auto ? 'Disable auto-assign' : 'Enable auto-assign'

        this.#monoBtn.textContent = track.mono ? 'ON' : 'OFF'
        this.#monoBtn.classList.toggle('active', !!track.mono)

        const keysWithSamples = new Set(sr.drumkitList.flatMap((kit) => kit.instruments.map((s) => s.key)))
        const instrumentIds = InstrumentsManager.DATA.instruments
            .map((i) => i.id)
            .filter((id) => keysWithSamples.has(id))
            .sort()
        const currentInstrumentId = getCurrentInstrumentId(editor, instrumentIds, keysWithSamples)
        this.#setOptions(this.#instrumentSel, instrumentIds, currentInstrumentId)

        const currentSampleId = getCurrentSoundUrl(editor)
        const matchingSounds = getSamplesForInstrument(editor, currentInstrumentId)
        if (matchingSounds.length === 0) {
            this.#setOptions(this.#sampleSel, [''], currentSampleId, ['— no samples —'])
        } else {
            const sampleValues = matchingSounds.map((s) => s.url)
            const sampleLabels = matchingSounds.map((s) => {
                const kit = s.kitName ?? ''
                const name = s.display_name ?? s.url ?? '??'
                return kit ? `${kit}/${name}` : name
            })
            this.#setOptions(this.#sampleSel, sampleValues, currentSampleId, sampleLabels)
        }

        // Kit/sample names come from user-imported drumkits: the title is set
        // as a property, so the serializer escapes quotes that could break out
        // of the attribute.
        const currentSound = sr.sounds[currentSampleId]
        this.#sampleLabel.title = currentSound ? this.#sampleTooltip(track, currentSound) : ''

        const generatedSoundKeys = editor.synthEditor.getGeneratedSoundKeys()
        const currentGeneratedSound = track.useSoftSynth === true ? (track.synthSoundKey ?? 'BASS1') : 'none'
        const synthOpts = ['none', ...generatedSoundKeys]
        if (track.useSoftSynth === true && !generatedSoundKeys.includes(currentGeneratedSound)) {
            synthOpts.push(currentGeneratedSound)
        }
        this.#setOptions(this.#generatedSel, synthOpts, currentGeneratedSound)
    }

    /** Tail shared by every sound-row handler: redraw + announce the change. */
    #afterSoundChange() {
        this.#editor.sync()
        emitTrackChanged(this.#editor.track, this.#editor.playbackEvents)
    }

    // ── Event handlers ─────────────────────────────────────────────

    async onInstrumentChange(target) {
        const editor = this.#editor
        const track = editor.track
        const newName = target.value
        editor.serviceRegistry.cmd.changeTrackName(track, newName)
        const firstSample = getPreferredSampleForInstrument(editor, newName)
        if (firstSample) {
            if (!editor.soundRegistry.sounds[firstSample.url]?.buffer) {
                await editor.serviceRegistry.resourcesLoader.loadSample(firstSample, firstSample.kitName)
            }
            editor.serviceRegistry.cmd.changeTrackSound(track, firstSample.url)
        }
        this.#afterSoundChange()
    }

    async onSampleChange(target) {
        const editor = this.#editor
        const track = editor.track
        const url = target.value
        if (!editor.soundRegistry.sounds[url]?.buffer) {
            let foundKit, foundSample
            for (const kit of editor.soundRegistry.drumkitList) {
                const s = kit.instruments.find((i) => i.url === url)
                if (s) {
                    foundKit = kit
                    foundSample = s
                    break
                }
            }
            if (foundSample && foundKit) {
                await editor.serviceRegistry.resourcesLoader.loadSample(foundSample, foundKit.name)
            }
        }
        editor.serviceRegistry.cmd.changeTrackSound(track, url)
        emitTrackChanged(track, editor.playbackEvents)
    }

    async onGeneratedChange(target) {
        const editor = this.#editor
        const track = editor.track
        const key = target.value
        if (key === 'none') {
            track.useSoftSynth = false
        } else {
            if (!editor.soundRegistry.generatedSounds[key]) {
                await editor.synthEditor.ensureGeneratedSoundsLoaded()
            }
            track.useSoftSynth = true
            track.useAutoAssignSound = false
            track.synthSoundKey = key
        }
        this.#afterSoundChange()
    }

    toggleAuto() {
        const editor = this.#editor
        const track = editor.track
        track.useAutoAssignSound = track.useAutoAssignSound === false
        if (track.useAutoAssignSound) {
            track.useSoftSynth = false
            track.synthSoundKey = null
            const aa = new AutoAssign()
            aa.autoAssignTrackSounds(track)
        }
        this.#afterSoundChange()
    }

    // ── Helpers ──

    getSoundInfo() {
        const track = this.#editor.track
        if (track.useSoftSynth === true) {
            return track.synthSoundKey ?? null
        }
        const sound = this.#editor.soundRegistry.sounds[track.sampleId]
        if (!sound) return null
        const kit = sound.kitName ?? ''
        const name = sound.display_name ?? sound.key ?? sound.url ?? ''
        return kit ? `${kit}/${name}` : name
    }

    /** Rebuild a select's options and restore a valid selection. */
    #setOptions(sel, values, current, labels) {
        sel.innerHTML = renderOptions(values, current, { labels, escape: this.#editor.esc })
        if (sel.selectedIndex === -1 && sel.options.length) sel.selectedIndex = 0
    }

    /** Sample tooltip: kit / url / instrument / synth / size / length. */
    #sampleTooltip(track, sound) {
        return [
            `Kit: ${sound.kitName ?? '?'}`,
            `URL: ${sound.url ?? '?'}`,
            `Instrument: ${sound.key ?? '?'}`,
            `Synth: ${track.useSoftSynth === true ? 'yes' : 'no'}`,
            `Size: ${sound.buffer?.length != null ? sound.buffer.length.toLocaleString() + ' samples' : '?'}`,
            `Length: ${sound.duration != null ? sound.duration + ' ms' : '?'}`,
        ].join('\n')
    }

    /** Build a label + select row for a sound select. */
    #buildSelectRow(labelText, soundType) {
        const row = document.createElement('div')
        row.className = 'ne-row'
        const label = document.createElement('label')
        label.textContent = labelText
        const sel = document.createElement('select')
        sel.dataset.sound = soundType
        row.append(label, sel)
        return { row, label, sel }
    }
}
