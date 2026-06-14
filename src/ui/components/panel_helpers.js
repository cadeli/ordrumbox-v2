export function injectUiCss() {
    if (document.getElementById('ui-styles')) return
    const link = document.createElement('link')
    link.id = 'ui-styles'
    link.rel = 'stylesheet'
    link.href = new URL('./styles.css', import.meta.url).href
    document.head.appendChild(link)
}

export const fmt = v => parseFloat(Number(v).toFixed(2))

const PANEL_GAP_PX = 4

export function positionBelowPatternPanel(container) {
    if (window.innerWidth <= 768 || window.innerHeight <= 480) return
    const patternPanel = document.getElementById('pattern-panel')
    if (patternPanel) {
        container.style.top = (patternPanel.offsetTop + patternPanel.offsetHeight + PANEL_GAP_PX) + 'px'
    }
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

export function bindAccordionToggles(container, getTarget, onChange) {
    container.querySelectorAll('.ne-toggle[data-toggle], .ne-toggle[data-about-toggle], .ne-group-accordion-toggle[data-toggle]').forEach(btn => {
        btn.addEventListener('click', (event) => {
            const key = btn.dataset.toggle || btn.dataset.aboutToggle
            btn.classList.toggle('active')
            const isExpanded = btn.classList.contains('active')
            
            let group = btn.closest('.ne-group, .ss-group')
            if (!group) {
                group = container.querySelector(`[data-group="${key}"], [data-synth-group="${key}"]`)
            }
            
            if (group) {
                group.classList.toggle('expanded', isExpanded)
                group.classList.toggle('collapsed', !isExpanded)
                const icon = group.querySelector('.ne-group-accordion-icon')
                if (icon) icon.innerHTML = isExpanded ? '&minus;' : '+'
            }
            
            if (getTarget) {
                const target = getTarget(key)
                if (target) {
                    target.style.display = isExpanded ? '' : 'none'
                }
            }
            
            onChange?.(key, isExpanded)
            event.stopPropagation()
        })
    })
}

export function hidePanelsById(ids) {
    ids.forEach(id => {
        const panel = document.getElementById(id)
        if (panel) panel.style.display = 'none'
    })
}

export function escapeHtml(value) {
    const str = String(value ?? '')
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/**
 * Generate a complete accordion group HTML string.
 *
 * @param {string} key        – data-group value
 * @param {string} label      – full label (shown inside content)
 * @param {string} shortLabel – abbreviated label on toggle button
 * @param {boolean} expanded  – initial state
 * @param {string} content    – inner HTML of the group (grid rows, sliders…)
 * @param {object} [opts]     – cssPrefix, dataAttr, gridClass, labelClass, groupClass, gridId, extraAttrs
 */
export function buildAccordionGroup(key, label, shortLabel, expanded, content, opts = {}) {
    const {
        cssPrefix  = 'ne',
        dataAttr   = 'data-group',
        gridClass  = `${cssPrefix}-grid`,
        labelClass = `${cssPrefix}-group-label`,
        labelHtml,
        groupClass = '',
        gridId,
        extraAttrs = '',
    } = opts

    const cls = [`${cssPrefix}-group`, expanded ? 'expanded' : 'collapsed', groupClass]
        .filter(Boolean).join(' ')
    const active = expanded ? ' active' : ''
    const icon   = expanded ? '&minus;' : '+'

    return `<div class="${cls}" ${dataAttr}="${key}"${extraAttrs ? ' ' + extraAttrs : ''}>` +
        `<button class="ne-group-accordion-toggle ne-toggle${active}" data-toggle="${key}" title="${label}">` +
            `<span class="ne-group-accordion-icon">${icon}</span>` +
            `<span class="ne-group-accordion-label">${shortLabel || label}</span>` +
        `</button>` +
        `<div class="ne-group-content">` +
            `<div class="${labelClass}">${labelHtml || label}</div>` +
            `<div class="${gridClass}"${gridId ? ` id="${gridId}"` : ''}>` +
            (content || '') +
        `</div></div></div>`
}

/**
 * Wrap groups HTML in the standard panel shell (header + body).
 *
 * @param {string} title      – panel title shown in the header
 * @param {string} groupsHtml – all accordion groups concatenated
 */
export function buildPanelShell(title, groupsHtml) {
    return `<div class="ne-header">` +
        `<span class="ne-track">${title}</span>` +
        `<button class="ne-close">&times;</button>` +
        `</div><div class="ne-body">${groupsHtml}</div>`
}

/**
 * Create OrSlider instances and mount them into the container.
 * Handles the full destroy → create → replace cycle.
 *
 * @param {HTMLElement} container
 * @param {Array} configs          – OrSlider config objects (must include `key`)
 * @param {object} [opts]
 * @param {string} [opts.placeholderAttr] – data-attr to find placeholders (default: data-or-slider)
 * @param {Array}  [opts.existingSliders] – sliders to destroy first
 * @returns {Array} created slider instances
 */
export function mountSliders(container, configs, opts = {}) {
    const { placeholderAttr = 'data-or-slider', existingSliders = [] } = opts
    existingSliders.forEach(s => s.destroy?.())

    // Lazy-import OrSlider to avoid circular deps at module load time
    return import('./or_slider.js').then(({ OrSlider }) =>
        configs.map(cfg => {
            const slider = new OrSlider(cfg)
            const el = container.querySelector(`[${placeholderAttr}="${cfg.key}"]`)
            if (el) el.replaceWith(slider.createElement())
            return slider
        })
    )
}
