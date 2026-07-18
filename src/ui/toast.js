const CONTAINER_ID = 'odbox-toast-container'

const TOAST_STYLES = {
    info:    { bg: '#2c3e50', border: '#34495e' },
    success: { bg: '#27ae60', border: '#2ecc71' },
    error:   { bg: '#c0392b', border: '#e74c3c' },
}

const DURATIONS = { info: 3000, success: 3000, error: 4500 }

function ensureContainer() {
    let c = document.getElementById(CONTAINER_ID)
    if (c) return c
    c = document.createElement('div')
    c.id = CONTAINER_ID
    c.style.cssText = `
        position:fixed; bottom:20px; right:20px; z-index:10000;
        display:flex; flex-direction:column-reverse; gap:8px;
        pointer-events:none; font-family:sans-serif;
    `
    document.body.appendChild(c)
    return c
}

export function showToast(message, type = 'info') {
    const container = ensureContainer()
    const { bg, border } = TOAST_STYLES[type] ?? TOAST_STYLES.info

    const el = document.createElement('div')
    el.style.cssText = `
        background:${bg}; color:white; padding:12px 20px;
        border-radius:8px; border:1px solid ${border};
        box-shadow:0 4px 12px rgba(0,0,0,0.5);
        pointer-events:auto; max-width:400px; word-break:break-word;
        animation:odbox-toast-in 0.3s ease-out;
    `
    el.textContent = message

    const style = document.createElement('style')
    style.textContent = `@keyframes odbox-toast-in{from{transform:translateY(40px);opacity:0}to{transform:translateY(0);opacity:1}}`
    el.appendChild(style)

    container.appendChild(el)

    const dismiss = () => {
        el.style.transition = 'opacity 0.25s'
        el.style.opacity = '0'
        setTimeout(() => el.remove(), 250)
    }

    setTimeout(dismiss, DURATIONS[type] ?? DURATIONS.info)
}
