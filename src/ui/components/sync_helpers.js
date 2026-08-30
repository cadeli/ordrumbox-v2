import { OrKnob } from './or_knob.js'
import { fmt } from './panel_helpers.js'

/**
 * syncComponentMap — keep-alive helper for Knob / Slider / etc.
 *
 * Reuses existing component instances where keys match, creates new ones
 * for fresh keys, and destroys orphans that no longer appear in configs.
 *
 * @param {Object}   opts
 * @param {HTMLElement} opts.container  DOM root to query placeholders from
 * @param {Array}    opts.configs       Array of config objects, each must have a `key` string
 * @param {string}   opts.selector      Data-attribute name (e.g. "or-knob" → [data-or-knob="..."])
 * @param {Map}      opts.prev          Snapshot of previous instances Map<key, instance>
 * @param {Function} opts.create        (config) => instance   — called for brand-new keys
 * @param {Function} opts.update        (instance, config) => void — called to rebind/setValue existing
 * @param {Function} [opts.postMount]   (el, config) => void   — hook after createElement, before replaceWith
 * @returns {Map<string, object>}       Map of live instances keyed by config.key
 */
export function syncComponentMap({ container, configs, selector, prev, create, update, postMount }) {
    const next = new Map()

    for (const config of configs) {
        const placeholder = container.querySelector(`[data-${selector}="${config.key}"]`)
        if (!placeholder) continue

        const existing = prev.get(config.key)
        if (existing) {
            update(existing, config)
            next.set(config.key, existing)
        } else {
            next.set(config.key, create(config))
        }

        const el = next.get(config.key).createElement()
        if (postMount) postMount(el, config)
        placeholder.replaceWith(el)
    }

    for (const [key, inst] of prev) {
        if (!next.has(key) && typeof inst.destroy === 'function') inst.destroy()
    }

    return next
}

/**
 * syncKnobs — keep-alive pattern for OrKnob instances.
 *
 * Reference implementation of the diff-by-key / reuse / destroy-orphans pattern.
 * Looks up metadata from `paramMeta` when provided, falls back to auto-derived
 * min/max/step from the config value.
 *
 * @param {Object}   opts
 * @param {HTMLElement} opts.container     DOM root to query placeholders from
 * @param {Array}    opts.configs          Array of { key, val, label, ... } objects
 * @param {string}   opts.selector         Data-attribute name for placeholders
 * @param {Map}      opts.prev             Snapshot of previous OrKnob instances
 * @param {Function} opts.onChange         (key, value) => void — value change callback
 * @param {Object}   [opts.paramMeta]      Map of key → { min, max, step, unit } metadata
 * @param {string}   [opts.defaultUnit]    Unit string for knobs without metadata
 * @returns {Map<string, OrKnob>}          Map of live OrKnob instances
 */
export function syncKnobs({ container, configs, selector, prev, onChange, paramMeta, defaultUnit = '' }) {
    return syncComponentMap({
        container,
        configs,
        selector,
        prev,
        create: (cfg) => {
            const meta = paramMeta?.[cfg.key] ?? {
                min: 0, max: Math.max(1, Math.ceil(cfg.val ?? 1)),
                step: Number.isInteger(cfg.val) ? 1 : 0.001,
            }
            return new OrKnob({
                key:      cfg.key,
                label:    cfg.label,
                min:      meta.min,
                max:      meta.max,
                step:     meta.step,
                value:    cfg.val,
                format:   fmt,
                unit:     meta.unit ?? defaultUnit,
                onChange: v => onChange(cfg.key, v),
            })
        },
        update: (inst, cfg) => {
            inst.onChange = v => onChange(cfg.key, v)
            inst.setValue(cfg.val)
        },
    })
}
