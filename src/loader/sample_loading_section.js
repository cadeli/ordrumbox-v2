// src/loader/sample_loading_section.js
// Sample loading helpers extracted from ResourcesLoader.

import { soundRegistry } from '../state/sound_registry.js'
import { logger } from '../core/logger.js'
import { getCachedSample, cacheSample } from '../cache/idb_cache.js'
import { getUnloadedSamplesFromDrumkits as _getUnloaded } from '../patterns/fixer.js'

export default class SampleLoadingSection {
    #loader
    #sampleLoadPromises

    /** @param {import('./resources_loader.js').default} loader */
    constructor(loader) {
        this.#loader = loader
        this.#sampleLoadPromises = new Map()
    }

    get sampleLoadPromises() {
        return this.#sampleLoadPromises
    }

    getUnloadedSamplesFromDrumkits(drumkits) {
        return _getUnloaded(drumkits, soundRegistry.sounds)
    }

    async loadMissingSamplesFromDrumkits(drumkits) {
        return this.#loadSampleEntries(this.getUnloadedSamplesFromDrumkits(drumkits))
    }

    loadSamplesFromDrumkit(drumkit) {
        return this.loadMissingSamplesFromDrumkits([drumkit])
    }

    async loadSamplesForPatterns(patterns) {
        const wanted = new Set()
        const one = /** @type {{tracks?: object}} */ (patterns)
        const patternList = one?.tracks ? [one] : Object.values(one ?? {})
        for (const pattern of patternList) {
            const tracks = /** @type {{tracks?: object}} */ (pattern)?.tracks
            for (const track of Object.values(tracks ?? {})) {
                const sampleId = track?.sampleId
                if (sampleId && sampleId !== 'NOT_DEFINED' && !soundRegistry.sounds[sampleId]?.buffer) {
                    wanted.add(sampleId)
                }
            }
        }
        if (wanted.size === 0) return []

        const samplesToLoad = []
        for (const drumkit of soundRegistry.drumkitList) {
            for (const sample of Object.values(drumkit?.instruments ?? {})) {
                if (wanted.delete(sample.url)) {
                    samplesToLoad.push({ sample, kitName: drumkit.name })
                }
            }
        }
        return this.#loadSampleEntries(samplesToLoad)
    }

    async #loadSampleEntries(samplesToLoad) {
        let loadedCount = 0
        const totalCount = samplesToLoad.length

        if (totalCount === 0) {
            return []
        }

        const updateProgress = () => {
            this.#loader.onSoundsProgress(Math.floor((loadedCount * 100) / totalCount))
        }

        const results = await Promise.all(
            samplesToLoad.map(async ({ sample, kitName }) => {
                try {
                    return await this.loadSample(sample, kitName)
                } catch (error) {
                    logger.error('ResourcesLoader', 'ResourcesLoader::loadSample error ' + sample.url, error)
                    return null
                } finally {
                    loadedCount++
                    updateProgress()
                }
            }),
        )
        return results.filter(Boolean)
    }

    async loadSample(sample, kitName) {
        const inFlight = this.#sampleLoadPromises.get(sample.url)
        if (inFlight) return inFlight
        const build = (async () => {
            let arrayBuffer = await getCachedSample(sample.url)
            if (!arrayBuffer) {
                const response = await fetch(this.#loader.constructor.KITS_PATH + sample.url)
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`)
                }
                arrayBuffer = await response.arrayBuffer()
                await cacheSample(sample.url, arrayBuffer)
            } else {
                logger.debug('ResourcesLoader', `Sample "${sample.url}" loaded from IDB cache`)
            }
            const buffer = await this.#loader.audioCtx.decodeAudioData(arrayBuffer)
            const sound = {
                kitName: kitName,
                url: sample.url,
                key: sample.key,
                index: Object.keys(soundRegistry.sounds).length + 1,
                display_name: sample.display_name,
                buffer: buffer,
                duration: Math.floor(buffer.duration * 1000),
                isLoad: true,
                playStatus: false,
                rootMidi: sample.rootMidi ?? null,
                peakDb: sample.peakDb ?? null,
                decay: sample.decay ?? null,
                gainDb: sample.gainDb ?? 0,
                tune: sample.tune ?? 0,
            }
            soundRegistry.sounds[sample.url] = sound
            return sound
        })()
        this.#sampleLoadPromises.set(sample.url, build)
        try {
            return await build
        } finally {
            this.#sampleLoadPromises.delete(sample.url)
        }
    }
}

