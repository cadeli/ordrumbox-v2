const CONTAINER_ID = 'odbox-toast-container'

const TOAST_STYLES = {
    info:    { bg: 'var(--bg-elevated)', border: 'var(--border)' },
    success: { bg: 'var(--bg-success)', border: 'var(--color-success)' },
    error:   { bg: 'var(--bg)', border: 'var(--color-danger)' },
    warning: { bg: 'var(--bg)', border: 'var(--color-warning)' },
}

const DURATIONS = { info: 3000, success: 3000, error: 4500, warning: 3500 }

function ensureContainer() {
    let c = document.getElementById(CONTAINER_ID)
    if (c) return c
    c = document.createElement('div')
    c.id = CONTAINER_ID
    c.style.cssText = `
        position:fixed; bottom:20px; right:20px; z-index:var(--z-toast);
        display:flex; flex-direction:column-reverse; gap:8px;
        pointer-events:none; font-family:var(--font);
    `
    document.body.appendChild(c)
    ensureStyles()
    return c
}

function ensureStyles() {
    if (document.getElementById('odbox-toast-keyframes')) return
    const s = document.createElement('style')
    s.id = 'odbox-toast-keyframes'
    s.textContent = `@keyframes odbox-toast-in{from{transform:translateY(40px);opacity:0}to{transform:translateY(0);opacity:1}}`
    document.head.appendChild(s)
}

/**
 * Shows a toast notification.
 * @param {string} message  Text to display
 * @param {string} [type]   'info' | 'success' | 'error' | 'warning'
 * @param {Object} [opts]
 * @param {Array<{label:string, onClick:Function}>} [opts.actions]  Action buttons (disables auto-dismiss)
 * @param {boolean} [opts.dismissible]  Show a × close button (disables auto-dismiss)
 */
export function showToast(message, type = 'info', { actions, dismissible } = {}) {
    const container = ensureContainer()
    const { bg, border } = TOAST_STYLES[type] ?? TOAST_STYLES.info

    const el = document.createElement('div')
    el.style.cssText = `
        background:${bg}; color:var(--text); padding:12px 20px;
        border-radius:8px; border:1px solid ${border};
        box-shadow:0 4px 12px var(--toast-shadow);
        pointer-events:auto; max-width:400px; word-break:break-word;
        display:flex; align-items:center; gap:12px;
        animation:odbox-toast-in 0.3s ease-out;
        font-size:var(--fs-base);
    `

    const msgSpan = document.createElement('span')
    msgSpan.style.flex = '1'
    msgSpan.textContent = message
    el.appendChild(msgSpan)

    if (actions) {
        for (const { label, onClick } of actions) {
            const btn = document.createElement('button')
            btn.textContent = label
            btn.style.cssText = `
                background:var(--bg-accent); color:var(--text); border:1px solid var(--border);
                padding:6px 14px; border-radius:4px; cursor:pointer;
                font-weight:600; font-size:var(--fs-sm); white-space:nowrap;
            `
            btn.addEventListener('click', () => {
                onClick()
                dismiss()
            })
            el.appendChild(btn)
        }
    }

    if (dismissible) {
        const closeBtn = document.createElement('button')
        closeBtn.textContent = '\u00d7'
        closeBtn.style.cssText = `
            background:transparent; color:var(--text-tertiary); border:none;
            cursor:pointer; font-size:18px; padding:0 4px; line-height:1;
        `
        closeBtn.addEventListener('click', dismiss)
        el.appendChild(closeBtn)
    }

    container.appendChild(el)

    function dismiss() {
        el.style.transition = 'opacity 0.25s'
        el.style.opacity = '0'
        setTimeout(() => el.remove(), 250)
    }

    if (!actions && !dismissible) {
        setTimeout(dismiss, DURATIONS[type] ?? DURATIONS.info)
    }
}
