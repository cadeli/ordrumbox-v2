// src/ui/track_editor/SoundSection.js
// Sound tab — instrument/sample/synth selects, mono toggle, auto-assign.

import { renderOptions } from '../components/ui_utils.js'
import InstrumentsManager from '../../logic/services/instrument_manager/index.js'
import AutoAssign from '../../logic/services/auto_assign.js'
import { emitTrackChanged } from '../../state/playback_events.js'
import {
    getCurrentInstrumentId,
    getCurrentSoundUrl,
    getPreferredSampleForInstrument,
    getSamplesForInstrument,
} from './sound_queries.js'

export default class SoundSection {
    #editor

    /** @param {import('../track_editor.js').default} editor */
    constructor(editor) {
        this.#editor = editor
    }

    // ── Render ─────────────────────────────────────────────────────

    render() {
        const editor = this.#editor
        const track = editor.track
        if (!track) return ''

        const sr = editor.soundRegistry
        const auto = track.useAutoAssignSound !== false
        const ledClass = auto ? 'lfo-led on' : 'lfo-led'
        const generatedSoundKeys = editor.synthEditor.getGeneratedSoundKeys()
        const currentGeneratedSound = track.useSoftSynth === true ? (track.synthSoundKey ?? 'BASS1') : 'none'

        const keysWithSamples = new Set(sr.drumkitList.flatMap((kit) => kit.instruments.map((s) => s.key)))
        const instrumentIds = InstrumentsManager.DATA.instruments
            .map((i) => i.id)
            .filter((id) => keysWithSamples.has(id))
            .sort()
        const currentInstrumentId = getCurrentInstrumentId(editor, instrumentIds, keysWithSamples)
        const currentSoundId = getCurrentSoundUrl(editor)
        const matchingSounds = getSamplesForInstrument(editor, currentInstrumentId)

        const NL = '&#10;'
        const esc = editor.esc
        const currentSound = sr.sounds[currentSoundId]
        // Kit/sample names come from user-imported drumkits: escape them so a
        // quote inside a name cannot break out of the title attribute.
        const sampleTooltip = currentSound
            ? [
                  `Kit: ${esc(currentSound.kit_name ?? '?')}`,
                  `URL: ${esc(currentSound.url ?? '?')}`,
                  `Instrument: ${esc(currentSound.key ?? '?')}`,
                  `Synth: ${track.useSoftSynth === true ? 'yes' : 'no'}`,
                  `Size: ${currentSound.buffer?.length != null ? currentSound.buffer.length.toLocaleString() + ' samples' : '?'}`,
                  `Length: ${currentSound.duration != null ? currentSound.duration + ' ms' : '?'}`,
              ].join(NL)
            : ''

        let content = ''
        content += `<div class="ne-row"><label>Instr</label><select data-sound="instrument">${renderOptions(instrumentIds, currentInstrumentId, { escape: esc })}</select></div>
        <div class="ne-row"><label title="${sampleTooltip}">Sample</label><select data-sound="sample">`
        if (matchingSounds.length === 0) {
            content += `<option value="">— no samples —</option>`
        } else {
            const sampleValues = matchingSounds.map((s) => s.url)
            const sampleLabels = matchingSounds.map((s) => {
                const kit = s.kitName ?? ''
                const name = s.display_name ?? s.url ?? '??'
                return kit ? `${kit}/${name}` : name
            })
            content += renderOptions(sampleValues, currentSoundId, { labels: sampleLabels, escape: esc })
        }
        const synthOpts = ['none', ...generatedSoundKeys]
        if (track.useSoftSynth === true && !generatedSoundKeys.includes(currentGeneratedSound)) {
            synthOpts.push(currentGeneratedSound)
        }
        content += `</select></div>
                <div class="ne-row ne-row-separator">
                    <label>Synth</label>
                    <select data-sound="generated">${renderOptions(synthOpts, currentGeneratedSound, { escape: editor.esc })}</select></div>`

        const monoActive = track.mono ? 'active' : ''
        const monoLabel = track.mono ? 'ON' : 'OFF'
        return (
            `<div class="ne-row"><label>Mono</label><button class="ne-btn ${monoActive}" data-key="mono">${monoLabel}</button></div>
        <div class="ne-row"><button class="${ledClass}" data-action="toggle-auto" title="${auto ? 'Disable' : 'Enable'} auto-assign"></button> <label>auto</label></div>` +
            content
        )
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
        const sound = this.#editor.soundRegistry.sounds[track.soundId]
        if (!sound) return null
        const kit = sound.kit_name ?? ''
        const name = sound.display_name ?? sound.key ?? sound.url ?? ''
        return kit ? `${kit}/${name}` : name
    }
}
