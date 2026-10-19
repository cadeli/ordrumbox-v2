import Toolbar from '../ui/toolbar.js'
import PatternPanel from '../ui/pattern_panel.js'
import PianoRollPanel from '../ui/piano_roll_panel.js'
import NoteEditor from '../ui/note_editor.js'
import TrackEditor from '../ui/track_editor.js'
import ToolsPanel from '../ui/tools_panel.js'
import OutputPanel from '../ui/output_panel.js'
import AboutPanel from '../ui/about_panel.js'
import DrumkitManager from '../ui/drumkit_manager.js'
import SongPanel from '../ui/song_panel.js'
import ViewManager from '../ui/view_manager.js'
import MobileTabBar from '../ui/mobile_tab_bar.js'
import PatternSettingsPanel from '../ui/pattern_settings_panel.js'
import { getServices } from '../state/service_loader.js'

/**
 * Construct, init, and mount all app panels, then register the ViewManager.
 * Construction order matters: noteEditor/trackEditor cross-wiring requires
 * trackEditor.init() first so neContainer exists.
 */
/**
 * @returns {{
 *   toolbar: import('../ui/toolbar.js').default,
 *   patternPanel: import('../ui/pattern_panel.js').default,
 *   pianoRollPanel: import('../ui/piano_roll_panel.js').default,
 *   noteEditor: import('../ui/note_editor.js').default,
 *   trackEditor: import('../ui/track_editor.js').default,
 *   toolsPanel: import('../ui/tools_panel.js').default,
 *   outputPanel: import('../ui/output_panel.js').default,
 *   aboutPanel: import('../ui/about_panel.js').default,
 *   drumkitManager: import('../ui/drumkit_manager.js').default,
 *   songPanel: import('../ui/song_panel.js').default,
 *   mobileTabBar: import('../ui/mobile_tab_bar.js').default,
 *   patternSettingsPanel: import('../ui/pattern_settings_panel.js').default,
 *   viewManager: import('../ui/view_manager.js').default,
 * }}
 */
const services = getServices()

export function createAndInitPanels() {
    const toolbar = new Toolbar({ serviceRegistry: services })
    const patternPanel = new PatternPanel({ serviceRegistry: services })
    const pianoRollPanel = new PianoRollPanel({ serviceRegistry: services })
    const noteEditor = new NoteEditor({ serviceRegistry: services })
    const trackEditor = new TrackEditor({ serviceRegistry: services })
    const toolsPanel = new ToolsPanel({ serviceRegistry: services })
    const outputPanel = new OutputPanel({
        resourcesLoader: services.resourcesLoader,
        getAudioEngine: () => services.audioEngine,
    })
    const aboutPanel = new AboutPanel()
    const drumkitManager = new DrumkitManager({ serviceRegistry: services })
    const songPanel = new SongPanel({ serviceRegistry: services })

    toolbar.init()
    patternPanel.init()
    pianoRollPanel.init()
    trackEditor.init()
    noteEditor.setContainer(trackEditor.neContainer)
    noteEditor.init()
    trackEditor.setNoteEditor(noteEditor)
    toolsPanel.init()
    outputPanel.init()
    aboutPanel.init()
    drumkitManager.init()
    songPanel.init()

    const mobileTabBar = new MobileTabBar()
    mobileTabBar.init()
    const patternSettingsPanel = new PatternSettingsPanel({ getCmd: () => services.cmd, getPatternAutoGen: () => services.patternAutoGen })
    patternSettingsPanel.init()

    const appContent = document.createElement('div')
    appContent.id = 'app-content'
    appContent.appendChild(patternPanel.container)
    // The song view sits among the workspace panels, BEFORE the overlay ones.
    // #te-panel and the synth editor are position:fixed overlays; with equal
    // z-index the later sibling paints on top, so appending the song panel last
    // made it cover their controls (nothing in it was clickable).
    appContent.appendChild(songPanel.container)
    appContent.appendChild(pianoRollPanel.container)
    appContent.appendChild(trackEditor.container)
    appContent.appendChild(trackEditor.synthEditor.panel)

    const mountTarget = document.getElementById('app-main') ?? document.body
    mountTarget.appendChild(appContent)

    patternPanel.container.style.display = 'flex'

    const viewManager = new ViewManager({
        trackEditor,
        synthEditor: trackEditor.synthEditor,
        pianoRollPanel,
        noteEditor,
        toolsPanel,
        patternSettingsPanel,
        outputPanel,
        drumkitManager,
        songPanel,
        aboutPanel,
        getResourcesLoader: () => services.resourcesLoader,
    })
    services.viewManager = viewManager
    viewManager.init()

    return {
        toolbar,
        patternPanel,
        pianoRollPanel,
        noteEditor,
        trackEditor,
        toolsPanel,
        outputPanel,
        aboutPanel,
        drumkitManager,
        songPanel,
        mobileTabBar,
        patternSettingsPanel,
        viewManager,
    }
}
