const CONTAINER_ID = 'odbox-toast-container'

const TOAST_STYLES = {
    info: { bg: 'var(--surface)', border: 'var(--line)' },
    success: { bg: 'var(--bg-success)', border: 'var(--color-success)' },
    error: { bg: 'var(--bg)', border: 'var(--color-danger)' },
    warning: { bg: 'var(--bg)', border: 'var(--color-warning)' },
}

const DURATIONS = { info: 3000, success: 3000, error: 4500, warning: 3500 }
const DISMISS_FADE_MS = 250

function ensureContainer() {
    let c = document.getElementById(CONTAINER_ID)
    if (c) return c
    c = document.createElement('div')
    c.id = CONTAINER_ID
    // Bottom-centre band, full width so it can never fall outside the window:
    // the stack grows upward from the bottom edge (the page never scrolls) and
    // clampStack() drops the oldest toast if it would reach the top of the view.
    c.style.cssText = `
        position:fixed; left:0; right:0;
        bottom:calc(20px + env(safe-area-inset-bottom, 0px) + var(--toast-bottom-offset, 0px));
        z-index:var(--z-toast);
        display:flex; flex-direction:column-reverse; align-items:center; gap:8px;
        padding-inline:16px;
        pointer-events:none; font-family:var(--font);
    `
    document.body.appendChild(c)
    ensureStyles()
    return c
}

/**
 * Keeps the toast stack inside the viewport: toasts are appended upward from
 * the bottom edge and the page cannot scroll, so a long stack would leave the
 * top of the window. Drops the oldest toasts (bottom of the column) until the
 * remaining ones fit.
 * @param {HTMLElement} container
 */
function clampStack(container) {
    if (typeof window === 'undefined' || !container) return
    const offset = parseFloat(getComputedStyle(container).bottom) || 20
    const maxHeight = Math.max(120, window.innerHeight - offset - 16)
    let guard = 0
    while (container.childElementCount > 1 && container.getBoundingClientRect().height > maxHeight && guard++ < 30) {
        container.firstElementChild.remove()
    }
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
 * @param {number} [opts.duration]  Auto-dismiss delay in ms (overrides the type default)
 */
export function showToast(message, type = 'info', { actions, dismissible, duration } = {}) {
    if (typeof document === 'undefined') return
    const container = ensureContainer()
    const { bg, border } = TOAST_STYLES[type] ?? TOAST_STYLES.info

    const el = document.createElement('div')
    el.style.cssText = `
        background:${bg}; color:var(--text); padding:12px 20px;
        border-radius:8px; border:1px solid ${border};
        box-shadow:0 4px 12px var(--toast-shadow);
        pointer-events:auto; width:480px; max-width:100%;
        box-sizing:border-box; word-break:break-word;
        display:flex; align-items:center; gap:12px;
        animation:odbox-toast-in 0.3s ease-out;
        font-size:var(--fs-base);
    `

    const msgSpan = document.createElement('span')
    msgSpan.style.flex = '1'
    // Multi-line messages (undo/redo reports) keep their newlines; single-line
    // toasts contain no \n so this is a no-op for them.
    msgSpan.style.whiteSpace = 'pre-line'
    msgSpan.textContent = message
    el.appendChild(msgSpan)

    if (actions) {
        for (const { label, onClick } of actions) {
            const btn = document.createElement('button')
            btn.textContent = label
            btn.style.cssText = `
                background:var(--accent); color:var(--text); border:1px solid var(--line);
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
                background:transparent; color:var(--muted); border:none;
            cursor:pointer; font-size:18px; padding:0 4px; line-height:1;
        `
        closeBtn.addEventListener('click', dismiss)
        el.appendChild(closeBtn)
    }

    container.appendChild(el)
    clampStack(container)

    function dismiss() {
        el.style.transition = 'opacity 0.25s'
        el.style.opacity = '0'
        setTimeout(() => el.remove(), DISMISS_FADE_MS)
    }

    if (!actions && !dismissible) {
        setTimeout(dismiss, duration ?? DURATIONS[type] ?? DURATIONS.info)
    }
}

/**
 * Keys already reported in this session — a degraded path that fires per tick
 * or per note must not spam the user with identical toasts.
 * @type {Set<string>}
 */
const reportedOnce = new Set()

/**
 * Single user-visible channel for degraded/failed paths.
 *
 * Production builds drop `console.*` (vite.config.js `drop_console`), so a
 * logger call alone is invisible to users: every "keep playing but something is
 * wrong" branch must go through here instead.
 *
 * @param {string} context   stable identifier, used as dedup key (e.g. 'Mixer.worklet')
 * @param {string} message   user-facing text (no technical detail)
 * @param {Object} [opts]
 * @param {string} [opts.type]       'info' | 'success' | 'error' | 'warning' (default 'warning')
 * @param {boolean} [opts.once]      report only the first time per session (default true)
 * @param {Error} [opts.cause]       logged for developers (dev builds only)
 * @param {Array<{label:string, onClick:Function}>} [opts.actions]
 * @returns {boolean} true when a report was actually emitted
 */
export function reportUserError(context, message, { type = 'warning', once = true, cause, actions } = {}) {
    if (once) {
        if (reportedOnce.has(context)) return false
        reportedOnce.add(context)
    }
    if (cause && import.meta.env?.MODE !== 'production') {
        console.warn(`[${context}]`, cause)
    }
    showToast(message, type, actions ? { actions } : {})
    return true
}

/** Test helper: forget which contexts were already reported. */
export function resetUserErrorReports() {
    reportedOnce.clear()
}
