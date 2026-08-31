// src/ui/synth_editor/GroupsSection.js
// Renders synth parameter groups: VCOs, filter, FM, LFO, noise, envelope.
// Manages knob placeholders and icon rows.

import Utils from '../../core/utils.js'
import { escapeHtml, renderOptions, renderIconChoices } from '../components/panel_helpers.js'
import {
    WAVE_ICONS, FILTER_ICONS, FM_ALGO_ICONS,
    SYNTH_PARAM_META, SYNTH_LFO_TARGETS, SYNTH_GROUP_MERGE,
    SYNTH_GROUP_LABELS, SYNTH_GROUP_ORDER, VCO_RE, LFO_RE,
    LFO_SYNC_OPTIONS, MOD_ENV_TARGETS,
} from './constants.js'

const TAB_DEFS = [
    { id: 'osc',  label: 'OSC' },
    { id: 'flt',  label: 'FLT' },
    { id: 'mod',  label: 'MOD' },
    { id: 'env',  label: 'ENV' },
]

const GROUP_TAB = {
    vco1: 'osc', vco2: 'osc', vco3: 'osc', fm: 'osc',
    filter: 'flt', modEnvelope: 'flt',
    lfo: 'mod', lfo2: 'mod', noise: 'mod',
    enveloppe: 'env', master: 'env',
}

export default class GroupsSection {
    /** @param {import('./synth_editor.js').default} editor */
    constructor(editor) { this._editor = editor }

    /** Ordered group names derived from draft keys. */
    getOrderedGroupNames() {
        const draft = this._editor._draft
        if (!draft) return SYNTH_GROUP_ORDER.slice()

        const mergedKeys = new Set(Object.values(SYNTH_GROUP_MERGE).flat())
        const draftKeys = Object.keys(draft)
        const allGroups = new Set(SYNTH_GROUP_ORDER)

        for (const [group, keys] of Object.entries(SYNTH_GROUP_MERGE)) {
            if (keys.some(k => draftKeys.includes(k))) allGroups.add(group)
        }
        for (const name of draftKeys) {
            if (!mergedKeys.has(name)) allGroups.add(name)
        }

        return [...allGroups].sort((a, b) => {
            const ai = SYNTH_GROUP_ORDER.indexOf(a)
            const bi = SYNTH_GROUP_ORDER.indexOf(b)
            if (ai !== -1 && bi !== -1) return ai - bi
            if (ai !== -1) return -1
            if (bi !== -1) return 1
            return a.localeCompare(b)
        })
    }

    /** @returns {string} display label for a group. */
    getGroupLabel(groupName) {
        return SYNTH_GROUP_LABELS[groupName] ?? (VCO_RE.test(groupName) ? groupName.toUpperCase() : groupName)
    }

    /**
     * Renders all groups. Pushes knob configs to the array.
     * @param {Array} knobConfigs — mutated, knob paths are pushed here
     * @returns {string} HTML
     */
    render(knobConfigs) {
        const editor = this._editor
        const draft = editor._draft
        if (!draft) return ''

        const groupNames = this.getOrderedGroupNames()

        const tabGroups = new Map(TAB_DEFS.map(t => [t.id, []]))
        for (const groupName of groupNames) {
            const tabId = GROUP_TAB[groupName] ?? TAB_DEFS[0].id
            tabGroups.get(tabId)?.push(groupName)
        }

        let tabBar = '<div class="ne-tab-bar ss-tab-bar">'
        for (let i = 0; i < TAB_DEFS.length; i++) {
            const t = TAB_DEFS[i]
            tabBar += `<button class="ne-tab-btn${i === 0 ? ' active' : ''}" data-ne-tab="${t.id}">${t.label}</button>`
        }
        tabBar += '</div>'

        let body = '<div class="ss-body">'
        let first = true
        for (const t of TAB_DEFS) {
            const names = tabGroups.get(t.id)
            if (!names?.length) continue
            const hidden = first ? '' : ' ne-tab-panel-hidden'
            body += `<div class="ne-tab-panel${hidden}" data-tab-panel="${t.id}">`
            for (const groupName of names) {
                body += this._renderGroupCard(groupName, knobConfigs, draft, editor)
            }
            body += '</div>'
            first = false
        }
        body += '</div>'

        return tabBar + body
    }

    _renderGroupCard(groupName, knobConfigs, draft, editor) {
        const content = this._buildGroupContent(groupName, knobConfigs)
        const label = this.getGroupLabel(groupName)
        const isBypassed = editor._cardBypassed[groupName] ?? false

        const isVco = VCO_RE.test(groupName)
        const isLfo = LFO_RE.test(groupName)
        const isFilter = groupName === 'filter'
        const isNoise = groupName === 'noise'
        let waveRowHtml = ''
        if (isVco || isLfo) {
            const waveVal = draft?.[groupName]?.wave ?? 'sine'
            const pathStr = `${groupName}.wave`
            waveRowHtml = `<span class="ss-group-wave-row">${renderIconChoices(Utils.waveList, waveVal, WAVE_ICONS, {
                cssClass: 'ss-wave-icon', valueDataAttr: 'data-wave-val', escape: escapeHtml,
                extraAttrs: (v) => ` data-synth-path="${escapeHtml(pathStr)}"`
            })}</span>`
        } else if (isFilter || isNoise) {
            const filterKey = isFilter ? 'type' : 'filterType'
            const filterVal = draft?.[groupName]?.[filterKey] ?? 'lowpass'
            const pathStr = `${groupName}.${filterKey}`
            waveRowHtml = `<span class="ss-group-wave-row">${renderIconChoices(Utils.filterTypeList, filterVal, FILTER_ICONS, {
                cssClass: 'ss-ft-icon', valueDataAttr: 'data-wave-val', escape: escapeHtml,
                extraAttrs: (v) => ` data-synth-path="${escapeHtml(pathStr)}"`
            })}</span>`
        } else if (groupName === 'fm') {
            const algoVal = draft?.fm?.algo ?? 0
            const algoOpts = Object.keys(FM_ALGO_ICONS).map(Number)
            waveRowHtml = `<span class="ss-group-wave-row">${renderIconChoices(algoOpts, algoVal, FM_ALGO_ICONS, {
                cssClass: 'ss-fm-icon', valueDataAttr: 'data-wave-val', escape: escapeHtml,
                extraAttrs: (v) => ` data-synth-path="fm.algo"`
            })}</span>`
        }

        let extraHtml = ''
        if (groupName === 'master') {
            extraHtml = `<canvas class="ss-waveform" width="320" height="64"></canvas>`
        }

        return `<div class="ss-group${isBypassed ? ' bypassed' : ''}" data-ss-card="${groupName}">
            <span class="ss-group-label">${escapeHtml(label)}</span>
            ${waveRowHtml}
            <button class="ss-bypass-btn${isBypassed ? '' : ' active'}" data-power-card="${groupName}" title="Bypass">
                <svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.5"/><line x1="4" y1="4" x2="12" y2="12" stroke="currentColor" stroke-width="1.5"/></svg>
            </button>
            ${extraHtml}
            <div class="ss-card-body">${content}</div>
        </div>`
    }

    /** Builds inner content for a single group. */
    _buildGroupContent(groupName, knobConfigs) {
        const editor = this._editor
        const draft = editor._draft
        const merged = SYNTH_GROUP_MERGE[groupName]
        const fields = merged
            ? merged.map(key => ({ path: [key], key, val: draft[key] }))
            : this._isPlainObject(draft[groupName])
                ? Object.entries(draft[groupName]).map(([key, val]) => ({ path: [groupName, key], key, val }))
                : [{ path: [groupName], key: groupName, val: draft[groupName] }]

        const fieldsHtml = fields.map(({ path, key, val }) => {
            const pathStr = path.join('.')
            const paramLabel = SYNTH_PARAM_META[pathStr]?.label ?? key
            return this._buildField(path, key, val, pathStr, paramLabel, knobConfigs, groupName)
        }).join('')

        if (groupName === 'enveloppe') {
            return `<canvas class="ss-env-canvas" width="320" height="64"></canvas>${fieldsHtml}`
        }
        return fieldsHtml
    }

    /** Builds HTML for a single field (knob placeholder, icon row, select, or boolean). */
    _buildField(path, key, val, pathStr, paramLabel, knobConfigs, groupName) {
        const options = this._getOptions(path, key, path)

        if (key === 'wave' && options) {
            if (groupName && (VCO_RE.test(groupName) || LFO_RE.test(groupName))) return ''
            return this._buildIconRow(paramLabel, pathStr, val, 'ss-wave-icon', WAVE_ICONS)
        }
        if ((pathStr === 'filter.type' || pathStr === 'noise.filterType') && options) {
            return ''
        }
        if (pathStr === 'fm.algo' && options) {
            return ''
        }
        if (options) {
            return this._buildSelectRow(paramLabel, pathStr, val, options)
        }
        if (typeof val === 'number') {
            knobConfigs.push({ path, val, key: pathStr, label: paramLabel })
            return `<div class="ne-row" data-ss-knob-placeholder="${escapeHtml(pathStr)}"></div>`
        }
        if (typeof val === 'boolean') {
            return `<div class="ne-row">
                <span class="ss-param-label">${escapeHtml(paramLabel)}</span>
                <button class="ss-tb-btn ss-tb-btn-boolean ${val ? 'active' : ''}" data-synth-path="${escapeHtml(pathStr)}" data-synth-type="boolean">${val ? 'ON' : 'OFF'}</button>
            </div>`
        }
        return ''
    }

    /** @returns {string} icon button row HTML. */
    _buildIconRow(paramLabel, pathStr, val, cssClass, icons) {
        const options = this._getIconOptions(pathStr)
        const isVcoWave = pathStr.startsWith('vco') && pathStr.endsWith('.wave')
        return `<div class="ne-row ss-icon-row">
            ${isVcoWave ? '' : `<span class="ss-param-label">${escapeHtml(paramLabel)}</span>`}
            ${this._renderIconRow(options, pathStr, val, cssClass, icons)}
        </div>`
    }

    /** Resolves icon options from path. */
    _getIconOptions(pathStr) {
        if (pathStr.startsWith('vco') && pathStr.endsWith('.wave')) return Utils.waveList
        if (pathStr === 'filter.type' || pathStr === 'noise.filterType') return Utils.filterTypeList
        if (pathStr === 'fm.algo') return [0, 1, 2, 3, 4]
        return []
    }

    /** @returns {string} select dropdown row HTML. */
    _buildSelectRow(paramLabel, pathStr, val, options) {
        return `<div class="ne-row">
            <span class="ss-param-label">${escapeHtml(paramLabel)}</span>
            <select data-synth-path="${escapeHtml(pathStr)}">${renderOptions(options, val, { escape: escapeHtml })}</select>
        </div>`
    }

    /** Renders icon buttons (wave shapes, filter types). */
    _renderIconRow(options, pathStr, val, cssClass, icons) {
        return renderIconChoices(options, val, icons, {
            cssClass, valueDataAttr: 'data-wave-val', escape: escapeHtml,
            extraAttrs: (v) => ` data-synth-path="${escapeHtml(pathStr)}"`
        })
    }

    /**
     * Returns option list for a given path/key, or null if it's a direct value.
     * @returns {Array|null}
     */
    _getOptions(path, key, pathArr) {
        const isLfo = pathArr[0] === 'lfo' || pathArr[0] === 'lfo2'
        if (key === 'wave') return Utils.waveList
        if (pathArr[0] === 'filter' && key === 'type') return Utils.filterTypeList
        if (pathArr[0] === 'noise' && key === 'filterType') return Utils.filterTypeList
        if (pathArr[0] === 'fm' && key === 'algo') return [0, 1, 2, 3, 4]
        if (pathArr[0] === 'modEnvelope' && key === 'target') return MOD_ENV_TARGETS
        if (isLfo && key === 'target') {
            return SYNTH_LFO_TARGETS.map(target => ({ value: target, label: target === 'NOT' ? 'off' : target }))
        }
        if (isLfo && key === 'sync') return LFO_SYNC_OPTIONS
        return null
    }

    /** @returns {boolean} true if value is a plain object (not array, not null). */
    _isPlainObject(val) {
        return val != null && typeof val === 'object' && !Array.isArray(val)
    }
}
