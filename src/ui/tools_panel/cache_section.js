// src/ui/tools_panel/cache_section.js — Tools "Cache" tab (stats, clear, JSON viewer).

import { showToast } from '../../core/notify.js'
import { logger } from '../../core/logger.js'
import { escapeHtml } from '../components/panel_helpers.js'
import { idbGet } from '../../core/idb.js'
import { isMobileViewport } from '../../core/constants.js'
import {
    getCacheStats,
    getCachedDrumkits,
    clearPatternsCache,
    clearDrumkitsCache,
    clearSamplesCache,
    clearAllCache,
    removeCacheEntry,
    formatBytes,
    formatDate,
} from '../../cache/idb_cache.js'

export default class CacheSection {
    #panel
    #jsonModalCleanup

    /** @param {import('../tools_panel.js').default} panel */
    constructor(panel) {
        this.#panel = panel
        this.#jsonModalCleanup = null
    }

    html() {
        return `
            <div class="ne-tab-panel ne-tab-panel-hidden" data-tab-panel="cache">
                <div class="ne-row no-cursor tp-cache-header">
                    <label>Total:</label>
                    <span class="ne-val" id="cache-total-size">-</span>
                    <span class="ne-val tp-cache-count" id="cache-total-count"></span>
                </div>
                <div id="tp-cache-list" class="tp-cache-list"></div>
                <div id="tp-cache-btns">
                    <button class="ne-btn" id="tp-cache-refresh" title="Refresh cache list">Refresh</button>
                    <button class="ne-btn" id="tp-cache-clear-patterns" title="Clear cached patterns from IDB">Clear Patterns</button>
                    <button class="ne-btn" id="tp-cache-clear-drumkits" title="Clear cached drumkits from IDB">Clear Drumkits</button>
                    <button class="ne-btn" id="tp-cache-clear-samples" title="Clear cached samples from IDB">Clear Samples</button>
                    <button class="ne-btn tp-cache-danger" id="tp-cache-clear-all" title="Clear all cached data">Factory Reset</button>
                </div>
            </div>
        `
    }

    bind() {
        const root = this.#panel.container

        root.querySelector('#tp-cache-refresh').addEventListener('click', () => this.refresh())
        root.querySelector('#tp-cache-clear-patterns').addEventListener('click', async () => {
            await clearPatternsCache()
            showToast('Patterns cache cleared', 'success')
            this.refresh()
        })
        root.querySelector('#tp-cache-clear-drumkits').addEventListener('click', async () => {
            await clearDrumkitsCache()
            showToast('Drumkits cache cleared', 'success')
            this.refresh()
        })
        root.querySelector('#tp-cache-clear-samples').addEventListener('click', async () => {
            await clearSamplesCache()
            showToast('Samples cache cleared', 'success')
            this.refresh()
        })
        root.querySelector('#tp-cache-clear-all').addEventListener('click', async () => {
            await clearAllCache()
            showToast('All cache cleared', 'success')
            this.refresh()
        })
        root.querySelector('#tp-cache-list').addEventListener('click', async (e) => {
            const viewBtn = e.target.closest('.tp-cache-item-view')
            if (viewBtn) {
                const { cacheType, cacheKey } = viewBtn.dataset
                await this.showJson(cacheType, cacheKey)
                return
            }
            const delBtn = e.target.closest('.tp-cache-item-del')
            if (!delBtn) return
            const { cacheType, cacheKey } = delBtn.dataset
            if (!window.confirm(`Remove "${cacheKey}" from ${cacheType} cache?`)) return
            await removeCacheEntry(cacheType, cacheKey)
            this.refresh()
        })
    }

    async refresh() {
        try {
            const stats = await getCacheStats()
            const root = this.#panel.container
            const q = (sel) => root.querySelector(sel)

            q('#cache-total-size').textContent = formatBytes(stats.totalBytes)
            q('#cache-total-count').textContent = `${stats.entries.length} file(s)`

            const listEl = q('#tp-cache-list')
            if (stats.entries.length === 0) {
                listEl.innerHTML = '<div class="tp-cache-empty">No cached files</div>'
                return
            }

            const drumkits = await getCachedDrumkits()
            const urlToKit = {}
            if (drumkits && typeof drumkits === 'object') {
                for (const [kitName, kit] of Object.entries(drumkits)) {
                    const instruments = kit?.instruments ?? []
                    for (const inst of instruments) {
                        if (inst.url) urlToKit[inst.url] = kitName
                    }
                }
            }

            const sorted = [...stats.entries].sort((a, b) => (b.savedAt ?? 0) - (a.savedAt ?? 0))
            const TYPE_LABELS = {
                patterns: 'PAT',
                drumkits: 'DK',
                samples: 'SMP',
                settings: 'SET',
                songs: 'SONG',
                generated_sounds: 'SYN',
            }
            const isDesktop = !isMobileViewport()

            listEl.innerHTML = sorted
                .map((e) => {
                    const label = TYPE_LABELS[e.type] ?? e.type
                    const date = formatDate(e.savedAt)
                    const size = formatBytes(e.size)
                    const kitName = e.type === 'samples' ? (urlToKit[e.key] ?? '') : ''
                    const tooltip = e.type === 'samples' && kitName ? `${e.key}\nDrumkit: ${kitName}` : e.key
                    const canView = isDesktop && e.type !== 'samples'
                    return (
                        `<div class="tp-cache-item" title="${escapeHtml(tooltip)}">` +
                        `<span class="tp-cache-item-label">${label}</span>` +
                        `<span class="tp-cache-item-key">${escapeHtml(e.key)}</span>` +
                        (kitName
                            ? `<span class="tp-cache-item-kit" title="${escapeHtml(kitName)}">${escapeHtml(kitName)}</span>`
                            : `<span class="tp-cache-item-kit"></span>`) +
                        `<span class="tp-cache-item-size">${size}</span>` +
                        `<span class="tp-cache-item-date">${date}</span>` +
                        (canView
                            ? `<button class="tp-cache-item-view" data-cache-type="${e.type}" data-cache-key="${escapeHtml(e.key)}" title="View JSON">&#x1F441;</button>`
                            : '') +
                        `<button class="tp-cache-item-del" data-cache-type="${e.type}" data-cache-key="${escapeHtml(e.key)}" title="Remove">&#x2715;</button>` +
                        `</div>`
                    )
                })
                .join('')
        } catch (e) {
            logger.error('ToolsPanel', 'Failed to refresh cache stats', e)
        }
    }

    async showJson(type, key) {
        const storeMap = {
            patterns: 'patterns',
            drumkits: 'drumkits',
            settings: 'settings',
            songs: 'songs',
            generated_sounds: 'generated_sounds',
        }
        const store = storeMap[type]
        if (!store) return
        try {
            const raw = await idbGet(store, key)
            if (!raw) {
                showToast('Entry not found in cache', 'info')
                return
            }
            const data = raw?.data ?? raw
            const json = JSON.stringify(data, null, 2)
            this.#openJsonModal(key, json)
        } catch (e) {
            logger.error('ToolsPanel', 'Failed to read cache entry', e)
            showToast('Failed to read cache entry', 'error')
        }
    }

    #openJsonModal(title, json) {
        this.#closeJsonModal()
        const overlay = document.createElement('div')
        overlay.className = 'tp-json-modal-overlay'
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) this.#closeJsonModal()
        })

        const modal = document.createElement('div')
        modal.className = 'tp-json-modal'

        const header = document.createElement('div')
        header.className = 'tp-json-modal-header'
        const titleSpan = document.createElement('span')
        titleSpan.className = 'tp-json-modal-title'
        titleSpan.textContent = title
        const closeBtn = document.createElement('button')
        closeBtn.className = 'tp-json-modal-close'
        closeBtn.innerHTML = '&#x2715;'
        closeBtn.addEventListener('click', () => this.#closeJsonModal())
        header.append(titleSpan, closeBtn)

        const pre = document.createElement('pre')
        pre.className = 'tp-json-modal-body'
        pre.textContent = json

        modal.append(header, pre)
        overlay.appendChild(modal)
        document.body.appendChild(overlay)

        const onKey = (e) => {
            if (e.key === 'Escape') {
                this.#closeJsonModal()
                document.removeEventListener('keydown', onKey)
            }
        }
        document.addEventListener('keydown', onKey)
        this.#jsonModalCleanup = () => document.removeEventListener('keydown', onKey)
    }

    #closeJsonModal() {
        this.#jsonModalCleanup?.()
        this.#jsonModalCleanup = null
        document.querySelector('.tp-json-modal-overlay')?.remove()
    }
}
