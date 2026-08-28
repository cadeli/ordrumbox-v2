import { appState } from '../../state/app_state.js'
import { playbackEvents } from '../../state/playback_events.js'
import { serviceRegistry } from '../../state/service_registry.js'
import { getAutoAssignService } from '../../state/service_loader.js'
import { soundRegistry } from '../../state/sound_registry.js'
import { instrumentsManager } from './instruments_manager.js'
import { analyzeSample, clearAnalysisCache } from '../../audio/sample_analyzer.js'
import { logger } from '../../core/logger.js'

const TAG = 'DrumkitService'

class DrumkitService {
    getCurrentKitSounds() {
        return Object.entries(soundRegistry.sounds)
            .map(([url, s]) => ({ url, ...s }))
    }

    currentKitName() {
        return soundRegistry.drumkitList[appState.selectedDrumkitNum]?.name ?? null
    }

    exportCurrentKit() {
        const name = this.currentKitName()
        if (!name) return null

        const instruments = Object.values(soundRegistry.sounds)
            .filter(sound => sound.kit_name === name)
            .map(sound => ({
                url: sound.url,
                display_name: sound.display_name,
                key: sound.key,
                rootMidi: sound.rootMidi ?? null,
                peakDb: sound.peakDb ?? null,
                decay: sound.decay ?? null,
                gainDb: sound.gainDb ?? 0,
                tune: sound.tune ?? 0,
            }))

        return { version: 1, name, instruments }
    }

    async restoreDrumkit(data) {
        if (!data || typeof data.name !== 'string' || !Array.isArray(data.instruments)) {
            throw new Error('Missing drumkit name or instruments')
        }

        const instruments = data.instruments
            .filter(sample => typeof sample?.url === 'string' && typeof sample?.key === 'string')
            .map(sample => ({
                url: sample.url,
                display_name: sample.display_name ?? sample.url,
                key: sample.key,
                rootMidi: sample.rootMidi ?? null,
                peakDb: sample.peakDb ?? null,
                decay: sample.decay ?? null,
                gainDb: sample.gainDb ?? 0,
                tune: sample.tune ?? 0,
            }))
        if (!instruments.length) throw new Error('No valid instruments')

        const kit = { name: data.name, instruments: structuredClone(instruments) }
        const existingIndex = soundRegistry.drumkitList.findIndex(entry => entry.name === kit.name)
        if (existingIndex === -1) soundRegistry.drumkitList.push(kit)
        else soundRegistry.drumkitList.splice(existingIndex, 1, kit)
        soundRegistry.drumkits[kit.name] = { name: kit.name, instruments: structuredClone(instruments) }

        for (const sample of instruments) {
            const sound = soundRegistry.sounds[sample.url]
            if (!sound) continue
            Object.assign(sound, sample, { kit_name: kit.name })
        }

        const kitIndex = soundRegistry.drumkitList.findIndex(entry => entry.name === kit.name)
        appState.selectedDrumkitNum = kitIndex
        appState.selectedDrumkit = kit.name
        try {
            await serviceRegistry.resourcesLoader?.loadMissingSamplesFromDrumkits([kit])
            await serviceRegistry.cmd?.autoAssignSoundsForNewDrumkit?.()
        } catch (err) {
            logger.warn(TAG, `Some samples could not be loaded for "${kit.name}": ${err.message}`)
            throw err
        }

        playbackEvents.emit("drumkitChange")
        return kit.name
    }

    moveToKit(soundKey, newKitName) {
        const sound = soundRegistry.sounds[soundKey]
        if (!sound) return null
        const oldKitName = sound.kit_name

        if (oldKitName === newKitName) return null

        sound.kit_name = newKitName

        const oldKit = soundRegistry.drumkits[oldKitName]
        if (oldKit?.instruments) {
            oldKit.instruments = oldKit.instruments.filter(i => i.url !== soundKey)
        }
        const oldListEntry = soundRegistry.drumkitList.find(d => d.name === oldKitName)
        if (oldListEntry?.instruments) {
            oldListEntry.instruments = oldListEntry.instruments.filter(i => i.url !== soundKey)
        }

        let newKit = soundRegistry.drumkits[newKitName]
        if (!newKit) {
            newKit = { name: newKitName, instruments: [] }
            soundRegistry.drumkits[newKitName] = newKit
        }
        const instEntry = { display_name: sound.display_name, key: sound.key, url: soundKey }
        newKit.instruments.push(instEntry)

        let newListEntry = soundRegistry.drumkitList.find(d => d.name === newKitName)
        if (!newListEntry) {
            newListEntry = { name: newKitName, instruments: [] }
            soundRegistry.drumkitList.push(newListEntry)
        }
        newListEntry.instruments.push(instEntry)

        playbackEvents.emit("drumkitChange")
        return sound.display_name
    }

    setInstrument(soundKey, instrumentKey) {
        const sound = soundRegistry.sounds[soundKey]
        if (!sound || !instrumentKey || sound.key === instrumentKey) return false

        sound.key = instrumentKey
        const kitName = sound.kit_name
        const updateInstrumentEntry = (kit) => {
            kit?.instruments?.forEach(entry => {
                if (entry.url === soundKey) entry.key = instrumentKey
            })
        }

        updateInstrumentEntry(soundRegistry.drumkits[kitName])
        updateInstrumentEntry(soundRegistry.drumkitList.find(kit => kit.name === kitName))

        playbackEvents.emit("drumkitChange")
        return sound.display_name
    }

    removeSample(soundKey) {
        const sound = soundRegistry.sounds[soundKey]
        if (!sound) return null

        const kitName = sound.kit_name
        delete soundRegistry.sounds[soundKey]

        const kit = soundRegistry.drumkits[kitName]
        if (kit?.instruments) {
            kit.instruments = kit.instruments.filter(i => i.url !== soundKey)
        }
        const listEntry = soundRegistry.drumkitList.find(d => d.name === kitName)
        if (listEntry?.instruments) {
            listEntry.instruments = listEntry.instruments.filter(i => i.url !== soundKey)
        }

        playbackEvents.emit("drumkitChange")
        return sound.display_name
    }

    async replaceSampleBuffer(soundKey, buffer, displayName) {
        const oldSound = soundRegistry.sounds[soundKey]
        if (!oldSound) return false

        clearAnalysisCache(oldSound.buffer)
        oldSound.buffer = buffer
        oldSound.display_name = displayName
        oldSound.duration = Math.floor(buffer.duration * 1000)

        playbackEvents.emit("drumkitChange")
        return true
    }

    async addSample(file, buffer) {
        const instrument = instrumentsManager.findInstrumentFromFileName(file.name)
        const key = instrument.id
        const kitName = soundRegistry.drumkitList[appState.selectedDrumkitNum]?.name ?? 'imported'

        soundRegistry.sounds[file.name] = {
            kit_name: kitName,
            url: file.name,
            key,
            index: Object.keys(soundRegistry.sounds).length + 1,
            display_name: file.name,
            buffer,
            duration: Math.floor(buffer.duration * 1000),
            isLoad: true,
            playStatus: false
        }

        const kit = soundRegistry.drumkits[kitName] ?? { instruments: [] }
        kit.instruments.push({ display_name: file.name, key, url: file.name })
        soundRegistry.drumkits[kitName] = kit

        const listEntry = soundRegistry.drumkitList.find(d => d.name === kitName)
        if (listEntry) {
            listEntry.instruments.push({ display_name: file.name, key, url: file.name })
        }

        playbackEvents.emit("drumkitChange")
        return { fileName: file.name, kitName }
    }

    normalizeAll() {
        const sounds = this.getCurrentKitSounds()
        const ctx = serviceRegistry.audioCtx
        let count = 0

        for (const s of sounds) {
            if (!s.buffer || !ctx) continue
            const analysis = analyzeSample(s.buffer)
            if (!analysis?.peakLinear || analysis.peakLinear <= 0) continue

            const gainDb = -analysis.peakDb
            const gainLinear = Math.pow(10, gainDb / 20)

            const newBuffer = ctx.createBuffer(
                s.buffer.numberOfChannels,
                s.buffer.length,
                s.buffer.sampleRate
            )
            for (let ch = 0; ch < s.buffer.numberOfChannels; ch++) {
                const input = s.buffer.getChannelData(ch)
                const output = newBuffer.getChannelData(ch)
                for (let i = 0; i < input.length; i++) {
                    output[i] = input[i] * gainLinear
                }
            }

            clearAnalysisCache(s.buffer)
            soundRegistry.sounds[s.url].buffer = newBuffer
            count++
        }

        return count
    }

    async autoDetectAll() {
        const pattern = appState.patterns[appState.selectedPatternNum]
        if (!pattern) return false
        const autoAssign = await getAutoAssignService()
        autoAssign.autoAssignSounds(pattern)
        return true
    }

    getAnalysisInfo(sound) {
        if (!sound?.buffer) return null
        return analyzeSample(sound.buffer)
    }
}

export default new DrumkitService()
