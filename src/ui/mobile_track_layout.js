import { isMobileViewport } from '../core/constants.js'


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
