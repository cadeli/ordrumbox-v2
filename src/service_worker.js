import { logger } from './core/logger.js'
import { showToast } from './core/notify.js'

export function initServiceWorker() {
    if (!('serviceWorker' in navigator)) return

    const register = async () => {
        const swPath = './sw.js'

        try {
            const registration = await navigator.serviceWorker.register(swPath)
            logger.info('Main', 'orDrumbox SW registered with scope:', registration.scope)

            setInterval(
                () => {
                    registration.update()
                },
                1000 * 60 * 60,
            )

            if (registration.waiting) {
                showUpdateNotification(registration.waiting)
            }

            registration.addEventListener('updatefound', () => {
                const newWorker = registration.installing
                newWorker.addEventListener('statechange', () => {
                    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                        showUpdateNotification(newWorker)
                    }
                })
            })
        } catch (error) {
            logger.error('Main', 'orDrumbox SW registration failed:', error)
        }
    }

    // main.js is imported after the Start click, which usually happens once the
    // load event already fired — a listener added here would never run.
    if (document.readyState === 'complete') {
        register()
    } else {
        window.addEventListener('load', register, { once: true })
    }

    let refreshing = false
    // The first install claims the page that is already open: reloading there
    // would throw away what the user just started, so only a later worker
    // change (update installed / SKIP_WAITING) reloads the app.
    let hadController = navigator.serviceWorker.controller !== null
    navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!hadController) {
            hadController = true
            return
        }
        if (!refreshing) {
            refreshing = true
            window.location.reload()
        }
    })
}

function showUpdateNotification(worker) {
    const isPWA =
        window.matchMedia('(display-mode: standalone)').matches ||
        /** @type {{standalone?: boolean}} */ (window.navigator).standalone === true
    const label = isPWA ? 'New version available!' : 'Update available!'
    showToast(label, 'info', {
        actions: [{ label: 'Install', onClick: () => worker.postMessage('SKIP_WAITING') }],
        dismissible: true,
    })
}
