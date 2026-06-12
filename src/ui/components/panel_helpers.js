export function injectUiCss() {
    if (document.getElementById('ui-styles')) return
    const link = document.createElement('link')
    link.id = 'ui-styles'
    link.rel = 'stylesheet'
    link.href = new URL('./styles.css', import.meta.url).href
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
    const div = document.createElement('div')
    div.textContent = value
    return div.innerHTML
}

/**
 * AccordionGroup — reusable accordion section for all panels.
 *
 * Usage:
 *   const g = new AccordionGroup({ key: 'master', label: 'Master', shortLabel: 'M' })
 *   html += g.open() + '<div>content</div>' + g.close()
 *
 *   // or inline:
 *   html += new AccordionGroup({ ... }).render('<div>content</div>')
 */
export class AccordionGroup {
    constructor({
        key,
        label,
        shortLabel,
        expanded = true,
        dataAttr   = 'data-group',
        cssPrefix  = 'ne',
        gridClass,
        gridId,
        labelClass,
        groupClass = '',
        toggleExtraClass = 'ne-toggle',
        extraAttrs = '',
    } = {}) {
        this.key         = key
        this.label       = label
        this.shortLabel  = shortLabel || label
        this.expanded    = expanded
        this.dataAttr    = dataAttr
        this.cssPrefix   = cssPrefix
        this.gridClass   = gridClass || `${cssPrefix}-grid`
        this.gridId      = gridId
        this.labelClass  = labelClass || `${cssPrefix}-group-label`
        this.groupClass  = groupClass
        this.toggleExtraClass = toggleExtraClass
        this.extraAttrs  = extraAttrs
    }

    open() {
        const cls = [
            `${this.cssPrefix}-group`,
            this.expanded ? 'expanded' : 'collapsed',
            this.groupClass,
        ].filter(Boolean).join(' ')

        const activeCls = this.expanded ? ' active' : ''
        const icon = this.expanded ? '&minus;' : '+'

        return `<div class="${cls}" ${this.dataAttr}="${this.key}"${this.extraAttrs ? ' ' + this.extraAttrs : ''}>` +
            `<button class="ne-group-accordion-toggle${this.toggleExtraClass ? ' ' + this.toggleExtraClass : ''}${activeCls}" data-toggle="${this.key}" title="${this.label}">` +
                `<span class="ne-group-accordion-icon">${icon}</span>` +
                `<span class="ne-group-accordion-label">${this.shortLabel}</span>` +
            `</button>` +
            `<div class="ne-group-content">` +
            `<div class="${this.labelClass}">${this.label}</div>` +
            `<div class="${this.gridClass}"${this.gridId ? ` id="${this.gridId}"` : ''}>`
    }

    close() {
        return '</div></div></div>'
    }

    render(content) {
        return this.open() + (content || '') + this.close()
    }
}
