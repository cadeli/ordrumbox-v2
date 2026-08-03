import { OrSlider } from './or_slider.js'
import { OrKnob } from './or_knob.js'

export { fmt, escapeHtml, pitchToNoteName } from './ui_utils.js'

/** Canonical set of all overlay panel IDs (pattern-panel is never hidden by other panels). */
export const ALL_PANEL_IDS = [
    'te-panel', 'tools-panel', 'output-panel',
    'about-panel', 'dm-panel', 'soft-synth-panel'
]

/**
 * Factory for building and mounting groups of OrSlider or OrKnob controls.
 */
export function createControlGroup(defs, targetModel, onChange, options = {}) {
    const isKnobGroup = options.type === 'knob'
    const controls = []
    let html = ''

    defs.forEach(def => {
        const val = targetModel[def.key] ?? def.value ?? def.min ?? 0
        const cfg = {
            key: def.key,
            label: def.label,
            min: def.min ?? 0,
            max: def.max ?? 1,
            step: def.step ?? 0.01,
            value: val,
            defaultValue: def.defaultValue ?? val,
            unit: def.unit ?? '',
            format: def.format,
            normalize: def.normalize,
            denormalize: def.denormalize,
            hasLfo: def.lfo ? !!targetModel[def.lfo] : false,
            onChange: (newVal, key) => {
                targetModel[key] = newVal
                onChange?.(newVal, key)
            }
        }
        const ctrl = isKnobGroup ? new OrKnob(cfg) : new OrSlider(cfg)
        controls.push(ctrl)
        html += ctrl.toHTML()
    })

    const mount = (container) => {
        controls.forEach(ctrl => {
            const row = container.querySelector(`[data-or-slider="${ctrl._key}"]`) ?? container.querySelector(`[data-prop="${ctrl._key}"]`)
            if (row) ctrl.mount(row)
        })
    }

    return { controls, html, mount }
}

export function injectUiCss() {
    if (document.getElementById('ui-styles')) return
    const link = document.createElement('link')
    link.id = 'ui-styles'
    link.rel = 'stylesheet'
    link.href = new URL('../styles.css', import.meta.url).href
    document.head.appendChild(link)
}



const PANEL_GAP_PX = 4

export function positionBelowPatternPanel(container) {
    if (window.innerWidth <= 768 || window.innerHeight <= 480) return
    const patternPanel = document.getElementById('pattern-panel')
    if (patternPanel) {
        container.style.top = (patternPanel.offsetTop + patternPanel.offsetHeight + PANEL_GAP_PX) + 'px'
    }
}

const SYNC_WIDTH_SKIP_IDS = ['pattern-panel', 'te-panel', 'piano-roll-panel']

export function syncWidthWithPatternPanel(container) {
    if (SYNC_WIDTH_SKIP_IDS.includes(container.id)) return
    const pp = document.getElementById('pattern-panel')
    if (!pp || pp.classList.contains('ui-hidden')) return
    const rect = pp.getBoundingClientRect()
    container.style.left = rect.left + 'px'
    container.style.width = rect.width + 'px'
}

export function bindCloseButton(container, onClose) {
    container.querySelector('.ne-close')?.addEventListener('click', onClose)
}

export function bindVisibilityToggles(container, visibilityState, onChange) {
    container.querySelectorAll('.ne-toggle[data-toggle]').forEach(btn => {
        btn.addEventListener('click', (event) => {
            const key = btn.dataset.toggle
            visibilityState[key] = !visibilityState[key]
            onChange?.(key, btn)
            event.stopPropagation()
        })
    })
}

export function bindPanelToggles(container, getTarget) {
    container.querySelectorAll('.ne-toggle[data-toggle]').forEach(btn => {
        btn.addEventListener('click', () => {
            btn.classList.toggle('active')
            const target = getTarget(btn.dataset.toggle)
            if (target) {
                target.style.display = btn.classList.contains('active') ? '' : 'none'
            }
        })
    })
}

export function hidePanelsById(ids) {
    ids.forEach(id => {
        const panel = document.getElementById(id)
        if (panel) panel.style.display = 'none'
    })
}



/**
 * Binds click handlers on `.ne-tab-btn` elements to toggle `.ne-tab-panel` visibility.
 * @param {HTMLElement} container
 * @param {function(string): void} [onChange]  – called with the newly activated tab id
 */
export function bindTabToggles(container, onChange) {
    container.querySelectorAll('.ne-tab-btn[data-ne-tab]').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = btn.dataset.neTab
            container.querySelectorAll('.ne-tab-btn').forEach(b => b.classList.toggle('active', b.dataset.neTab === id))
            container.querySelectorAll('.ne-tab-panel').forEach(p => p.classList.toggle('ne-tab-panel-hidden', p.dataset.tabPanel !== id))
            onChange?.(id)
        })
    })
}

/**
 * Sets the active state of a toolbar view button.
 * @param {'synth' | 'edit' | 'proll'} name
 * @param {boolean} active
 */
export function setViewBtn(name, active) {
    document.querySelector(`.tb-view-btn[data-view="${name}"]`)?.classList.toggle('active', active)
}
