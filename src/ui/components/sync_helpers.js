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
