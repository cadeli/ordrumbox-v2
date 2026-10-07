import './ui/styles.css'
import './bootstrap/services.js'
import { createAndInitPanels } from './bootstrap/panels.js'
import { initGlobalListeners } from './bootstrap/global_listeners.js'
import { startAfterFirstPaint } from './bootstrap/startup.js'
import { initSelectDropdown } from './ui/select_dropdown.js'
import { applyColorScheme } from './ui/theme.js'
import { serviceRegistry } from './state/service_registry.js'
import { soundRegistry } from './state/sound_registry.js'
import { playbackEvents } from './state/event_bus.js'
import { EVENTS } from './core/events.js'

/**
 * Kicks the settings fetch before anything else (loadSettings is single-flight,
 * so startAfterFirstPaint() joins this very call) and lands the stored color
 * scheme on <html> as soon as it resolves — the first painted app frame then
 * shows the right palette instead of flashing the default one. applyColorScheme
 * lives in ui/theme.js; bootstrap and loader layers must not import ui/, so the
 * application point sits here in the orchestrator. Failures are reported (with
 * a toast) by loadStartupResources(); without settings, scheme 1 applies.
 */
function primeColorScheme() {
    void serviceRegistry.resourcesLoader
        .loadSettings()
        .then(() => {
            applyColorScheme(soundRegistry.settings.colorScheme)
        })
        .catch(() => {
            // loadSettings() logs its own failures and falls back to defaults;
            // this only keeps a hypothetical rejection from going unhandled —
            // with no attribute set, the document stays on scheme 1.
        })
}

export function init() {
    primeColorScheme()
    // The 'c' shortcut cycles soundRegistry.settings.colorScheme and emits;
    // keyboard_shortcuts.js must not import ui/, so the scheme is applied
    // here, next to primeColorScheme().
    playbackEvents.on(EVENTS.COLOR_SCHEME_CHANGE, (scheme) => {
        applyColorScheme(scheme)
    })
    initGlobalListeners()
    createAndInitPanels()
    initSelectDropdown()
    startAfterFirstPaint()
}
