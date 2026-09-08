// src/waiting_screen.js — Functional bootstrap without habitual class abstraction

const screenEl = document.getElementById('waiting-screen')
const startBtn = document.getElementById('waiting-screen-start-btn')

let isStarted = false

/**
 * Boots the main application and hides the waiting screen.
 */
export async function startApp() {
    if (isStarted) return
    isStarted = true

    if (screenEl) {
        screenEl.style.display = 'none'
    }

    try {
        const mainModule = await import('./main.js')
        if (typeof mainModule.init === 'function') {
            mainModule.init()
        }
    } catch (error) {
        const { logger } = await import('./core/logger.js')
        logger.error('WaitingScreen', 'Failed to load main application:', error)
    }
}

export function initWaitingScreen() {
    if (startBtn) {
        startBtn.classList.add('ready')
        startBtn.addEventListener('click', () => {
            startApp()
        })
    }

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !isStarted) {
            startApp()
        }
    })
}

// Auto-initialize when loaded in browser
if (typeof document !== 'undefined') {
    initWaitingScreen()
}