import { logger } from './core/logger.js'
import { showToast } from './ui/toast.js'

export function initServiceWorker() {
    if (!('serviceWorker' in navigator)) return

    window.addEventListener('load', async () => {
        const swPath = './sw.js'

        try {
            const registration = await navigator.serviceWorker.register(swPath)
            logger.info('Main', 'orDrumbox SW registered with scope:', registration.scope)

            setInterval(() => {
                registration.update()
            }, 1000 * 60 * 60)

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
    })

    let refreshing = false
    navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!refreshing) {
            window.location.reload()
            refreshing = true
        }
    })
}

function showUpdateNotification(worker) {
    const isPWA = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true
    const label = isPWA ? 'Nouvelle version disponible !' : 'Mise à jour disponible !'
    showToast(label, 'info', {
        actions: [{ label: 'Installer', onClick: () => worker.postMessage('SKIP_WAITING') }],
        dismissible: true,
    })
}
