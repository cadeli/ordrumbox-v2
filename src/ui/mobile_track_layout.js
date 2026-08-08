import { isMobileViewport } from '../core/constants.js'

/**
 * Mobile landscape 3-column layout for track editor + note editor.
 *
 * Column 1: Track knobs + Note knobs (always visible)
 * Column 2: Track tab content (active tab panel)
 * Column 3: Note tab content (active tab panel)
 *
 * Each column scrolls independently. The tab bar from each editor
 * is placed at the top of its respective column.
 */

/**
 * Check if the current viewport qualifies for mobile landscape 3-column layout.
 * @returns {boolean}
 */
export function isMobileLandscape() {
    return isMobileViewport() && window.innerWidth > window.innerHeight
}

/**
 * Create the 3-column wrapper element.
 * @returns {HTMLElement}
 */
export function createLayout() {
    const wrapper = document.createElement('div')
    wrapper.className = 'mobile-track-3col'

    const col1 = document.createElement('div')
    col1.className = 'mtl-col mtl-knobs'

    const col2 = document.createElement('div')
    col2.className = 'mtl-col mtl-track-tabs'

    const col3 = document.createElement('div')
    col3.className = 'mtl-col mtl-note-tabs'

    wrapper.appendChild(col1)
    wrapper.appendChild(col2)
    wrapper.appendChild(col3)

    return wrapper
}

/**
 * Rearrange track editor + note editor DOM into 3-column layout.
 *
 * Called after trackEditor.sync() and noteEditor.sync() on mobile landscape.
 * Moves existing DOM elements (no cloning) so tab interactions keep working.
 *
 * @param {HTMLElement} teContainer  — #te-panel
 * @param {HTMLElement} neContainer  — #ne-container (inside te-panel)
 */
export function applyLayout(teContainer, neContainer) {
    const trackEditor = teContainer.querySelector('.track-editor')
    if (!trackEditor) return

    let wrapper = teContainer.querySelector('.mobile-track-3col')
    if (!wrapper) {
        wrapper = createLayout()
        teContainer.insertBefore(wrapper, trackEditor)
    }

    const colKnobs = wrapper.querySelector('.mtl-knobs')
    const colTrackTabs = wrapper.querySelector('.mtl-track-tabs')
    const colNoteTabs = wrapper.querySelector('.mtl-note-tabs')

    // Move header + knob bar + sample bar → col1
    const header = trackEditor.querySelector('.ne-header')
    const sampleBar = trackEditor.querySelector('.te-sample-bar')
    const knobBar = trackEditor.querySelector('.te-knob-bar')

    if (header && !colKnobs.contains(header)) colKnobs.appendChild(header)
    if (sampleBar && !colKnobs.contains(sampleBar)) colKnobs.appendChild(sampleBar)
    if (knobBar && !colKnobs.contains(knobBar)) colKnobs.appendChild(knobBar)

    // Move tab bar + tab panels → col2
    const teTabBar = trackEditor.querySelector('.ne-tab-bar')
    const teScroll = trackEditor.querySelector('.te-scroll')
    if (teTabBar && !colTrackTabs.contains(teTabBar)) colTrackTabs.appendChild(teTabBar)
    if (teScroll && !colTrackTabs.contains(teScroll)) colTrackTabs.appendChild(teScroll)

    // Move note editor content → col3
    if (neContainer) {
        if (!colNoteTabs.contains(neContainer)) colNoteTabs.appendChild(neContainer)
        neContainer.style.display = 'block'
    }

    // Hide original track-editor wrapper (now empty)
    trackEditor.style.display = 'none'
}

/**
 * Restore original layout (unwrap 3-column back to normal flow).
 * @param {HTMLElement} teContainer
 */
export function removeLayout(teContainer) {
    const wrapper = teContainer.querySelector('.mobile-track-3col')
    if (!wrapper) return

    const trackEditor = teContainer.querySelector('.track-editor')
    if (!trackEditor) return

    // Move elements back to track-editor
    const colKnobs = wrapper.querySelector('.mtl-knobs')
    const colTrackTabs = wrapper.querySelector('.mtl-track-tabs')
    const colNoteTabs = wrapper.querySelector('.mtl-note-tabs')

    if (colKnobs) {
        while (colKnobs.firstChild) trackEditor.appendChild(colKnobs.firstChild)
    }
    if (colTrackTabs) {
        while (colTrackTabs.firstChild) trackEditor.appendChild(colTrackTabs.firstChild)
    }

    // Move ne-container back to #te-panel
    if (colNoteTabs) {
        const neContainer = colNoteTabs.querySelector('#ne-container')
        if (neContainer) teContainer.appendChild(neContainer)
    }

    trackEditor.style.display = ''
    wrapper.remove()
}
