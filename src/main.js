import './ui/styles.css'
import './bootstrap/services.js'
import { createAndInitPanels } from './bootstrap/panels.js'
import { initGlobalListeners } from './bootstrap/global_listeners.js'
import { startAfterFirstPaint } from './bootstrap/startup.js'

export function init() {
    initGlobalListeners()
    createAndInitPanels()
    startAfterFirstPaint()
}
