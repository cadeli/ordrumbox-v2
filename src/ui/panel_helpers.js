export function injectUiCss() {
    if (document.getElementById('ui-styles')) return
    const link = document.createElement('link')
    link.id = 'ui-styles'
    link.rel = 'stylesheet'
    link.href = new URL('./styles.css', import.meta.url).href
    document.head.appendChild(link)
}

export function positionBelowPatternPanel(container) {
    const patternPanel = document.getElementById('pattern-panel')
    if (patternPanel) {
        container.style.top = (patternPanel.offsetTop + patternPanel.offsetHeight) + 'px'
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
