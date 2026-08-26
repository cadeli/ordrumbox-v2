import { isMobileViewport } from '../core/constants.js'

/**
 * Mobile landscape 3-column layout for track editor + note editor.
 *
 * Layout is achieved entirely via CSS Grid on a class applied to #te-panel.
 * No DOM nodes are moved — .track-editor uses display:contents to promote
 * its children as grid items alongside #ne-container.
 *
 * Column 1 (.mtl-knobs area): Track knobs + Note knobs
 * Column 2 (.mtl-track-tabs area): Track tab content (active tab panel)
 * Column 3 (.mtl-note-tabs area): Note tab content (active tab panel)
 */

/**
 * Check if the current viewport qualifies for mobile landscape 3-column layout.
 * @returns {boolean}
 */
export function isMobileLandscape() {
    return isMobileViewport() && window.innerWidth > window.innerHeight
}

/**
 * Activate 3-column CSS Grid layout by adding a class to #te-panel.
 * No DOM nodes are moved — CSS Grid areas + display:contents handle placement.
 *
 * @param {HTMLElement} teContainer  — #te-panel
 */
export function applyLayout(teContainer) {
    teContainer?.classList.add('te-mobile-landscape')
}

/**
 * Remove 3-column CSS Grid layout by removing the class from #te-panel.
 *
 * @param {HTMLElement} teContainer
 */
export function removeLayout(teContainer) {
    teContainer?.classList.remove('te-mobile-landscape')
}
