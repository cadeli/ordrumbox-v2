// src/ui/track_editor/SoundSection.js
// Sound tab — instrument/sample/synth selects, mono toggle, auto-assign.

import { renderOptions } from '../components/panel_helpers.js'
import InstrumentsManager from '../../logic/services/instruments_manager.js'
import MfAutoAssign from '../../logic/services/auto_assign.js'

export default class SoundSection {
    /** @param {import('./track_editor.js').default} co */
    constructor(co) { this._co = co }

    // ── Render ─────────────────────────────────────────────────────

    render() {
        const co = this._co
        const track = co._track
        if (!track) return ''

        const sr = co._soundRegistry
        const auto = track.useAutoAssignSound !== false
        const ledClass = auto ? 'lfo-led on' : 'lfo-led'
        const generatedSoundKeys = co.synthEditor.getGeneratedSoundKeys()
        const currentGeneratedSound = track.useSoftSynth === true
            ? (track.synthSoundKey ?? 'BASS1')
            : 'none'

        const keysWithSamples = new Set(
            sr.drumkitList.flatMap(kit => kit.instruments.map(s => s.key))
        )
        const instrumentIds = InstrumentsManager.DATA.instruments
            .map(i => i.id)
            .filter(id => keysWithSamples.has(id))
            .sort()
        const currentName = this._getCurrentInstrumentName(instrumentIds, keysWithSamples)
        const currentSoundId = this._getCurrentSoundUrl()
        const matchingSounds = this._getSamplesForInstrument(currentName)

        const NL = '&#10;'
        const currentSound = sr.sounds[currentSoundId]
        const sampleTooltip = currentSound
            ? [
                `Kit: ${currentSound.kit_name ?? '?'}`,
                `URL: ${currentSound.url ?? '?'}`,
                `Instrument: ${currentSound.key ?? '?'}`,
                `Synth: ${track.useSoftSynth === true ? 'yes' : 'no'}`,
                `Size: ${currentSound.buffer?.length != null ? currentSound.buffer.length.toLocaleString() + ' samples' : '?'}`,
                `Length: ${currentSound.duration != null ? currentSound.duration + ' ms' : '?'}`
            ].join(NL)
            : ''

        let content = ''
        content += `<div class="ne-row"><label>Instr</label><select data-sound="instrument">${renderOptions(instrumentIds, currentName)}</select></div>
        <div class="ne-row"><label title="${sampleTooltip}">Sample</label><select data-sound="sample">`
        if (matchingSounds.length === 0) {
            content += `<option value="">— no samples —</option>`
        } else {
            const sampleValues = matchingSounds.map(s => s.url)
            const sampleLabels = matchingSounds.map(s => {
                const kit = s.kitName ?? ''
                const name = s.display_name ?? s.url ?? '??'
                return kit ? `${kit}/${name}` : name
            })
            content += renderOptions(sampleValues, currentSoundId, { labels: sampleLabels })
        }
        const synthOpts = ['none', ...generatedSoundKeys]
        if (track.useSoftSynth === true && !generatedSoundKeys.includes(currentGeneratedSound)) {
            synthOpts.push(currentGeneratedSound)
        }
        content += `</select></div>
                <div class="ne-row ne-row-separator">
                    <label>Synth</label>
                    <select data-sound="generated">${renderOptions(synthOpts, currentGeneratedSound, { escape: co.esc })}</select></div>
                <div class="ne-row ${currentGeneratedSound === 'none' ? 'ne-row-hidden' : ''}" data-sound-edit-row>
                    <label>Edit</label>
                    <button class="ne-btn" data-action="edit-synth">Edit</button>
                </div>`

        const monoActive = track.mono ? 'active' : ''
        const monoLabel = track.mono ? 'ON' : 'OFF'
        return `<div class="ne-row"><label>Mono</label><button class="ne-btn ${monoActive}" data-key="mono">${monoLabel}</button></div>
        <div class="ne-row"><button class="${ledClass}" data-action="toggle-auto" title="${auto ? 'Disable' : 'Enable'} auto-assign"></button> <label>auto</label></div>` + content
    }

    // ── Event handlers ─────────────────────────────────────────────

    async onInstrumentChange(target) {
        const co = this._co
        const track = co._track
        const newName = target.value
        co._serviceRegistry.cmd.changeTrackName(track, newName)
        const firstSample = this._getPreferredSampleForInstrument(newName)
        if (firstSample) {
            if (!co._soundRegistry.sounds[firstSample.url]?.buffer) {
                await co._serviceRegistry.resourcesLoader.loadSample(firstSample, firstSample.kitName)
            }
            co._serviceRegistry.cmd.changeTrackSound(track, firstSample.url)
        }
        co.sync()
        co._playbackEvents.dispatchPatternChange([track])
    }

    async onSampleChange(target) {
        const co = this._co
        const track = co._track
        const url = target.value
        if (!co._soundRegistry.sounds[url]?.buffer) {
            let foundKit, foundSample
            for (const kit of co._soundRegistry.drumkitList) {
                const s = kit.instruments.find(i => i.url === url)
                if (s) { foundKit = kit; foundSample = s; break }
            }
            if (foundSample && foundKit) {
                await co._serviceRegistry.resourcesLoader.loadSample(foundSample, foundKit.name)
            }
        }
        co._serviceRegistry.cmd.changeTrackSound(track, url)
        co._playbackEvents.dispatchPatternChange([track])
    }

    async onGeneratedChange(target) {
        const co = this._co
        const track = co._track
        const key = target.value
        if (key === 'none') {
            track.useSoftSynth = false
        } else {
            if (!co._soundRegistry.generatedSounds[key]) {
                await co.synthEditor.ensureGeneratedSoundsLoaded()
            }
            track.useSoftSynth = true
            track.useAutoAssignSound = false
            track.synthSoundKey = key
        }
        co.sync()
        co._playbackEvents.dispatchPatternChange([track])
    }

    toggleAuto() {
        const co = this._co
        const track = co._track
        track.useAutoAssignSound = track.useAutoAssignSound === false
        if (track.useAutoAssignSound) {
            track.useSoftSynth = false
            track.synthSoundKey = null
            const aa = new MfAutoAssign()
            aa.autoAssignTrackSounds(track)
        }
        co.sync()
        co._playbackEvents.dispatchPatternChange([track])
    }

    // ── Helpers (also exposed on coordinator for backward compat) ──

    _getSelectedDrumkitName() {
        return this._co._soundRegistry.drumkitList[this._co._appState.selectedDrumkitNum]?.name ?? ''
    }

    _getAllKitSamples() {
        return this._co._soundRegistry.drumkitList.flatMap(kit =>
            kit.instruments.map(s => ({ ...s, kitName: kit.name }))
        )
    }

    _sortSamplesForCurrentKit(samples) {
        const selectedKitName = this._getSelectedDrumkitName()
        return [...samples].sort((a, b) => {
            const aSelected = a.kitName === selectedKitName ? 0 : 1
            const bSelected = b.kitName === selectedKitName ? 0 : 1
            if (aSelected !== bSelected) return aSelected - bSelected
            const kitCompare = String(a.kitName ?? '').localeCompare(String(b.kitName ?? ''))
            if (kitCompare !== 0) return kitCompare
            const sortKeyA = a.display_name || a.url || ''
            const sortKeyB = b.display_name || b.url || ''
            return sortKeyA.localeCompare(sortKeyB)
        })
    }

    _getSamplesForInstrument(instrumentId) {
        return this._sortSamplesForCurrentKit(
            this._getAllKitSamples().filter(s => s.key === instrumentId)
        )
    }

    _getPreferredSampleForInstrument(instrumentId) {
        return this._getSamplesForInstrument(instrumentId)[0] ?? null
    }

    _getCurrentSoundUrl() {
        const track = this._co._track
        const soundId = track.soundId ?? ''
        return this._co._soundRegistry.sounds[soundId]?.url ?? soundId
    }

    _getSoundInfo() {
        const track = this._co._track
        if (track.useSoftSynth === true) {
            return track.synthSoundKey ?? null
        }
        const sound = this._co._soundRegistry.sounds[track.soundId]
        if (!sound) return null
        const kit = sound.kit_name ?? ''
        const name = sound.display_name ?? sound.key ?? sound.url ?? ''
        return kit ? `${kit}/${name}` : name
    }

    _getCurrentInstrumentName(instrumentIds, keysWithSamples) {
        const track = this._co._track
        const sr = this._co._soundRegistry
        if (keysWithSamples.has(track.name)) return track.name
        const soundKey = sr.sounds[this._getCurrentSoundUrl()]?.key
        if (soundKey && keysWithSamples.has(soundKey)) return soundKey
        return instrumentIds[0] ?? 'KICK'
    }
}
