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
import { serviceRegistry } from '../state/service_registry.js'

/**
 * Construct, init, and mount all app panels, then register the ViewManager.
 * Construction order matters: noteEditor/trackEditor cross-wiring requires
 * trackEditor.init() first so _neContainer exists.
 */
export function createAndInitPanels() {
    const toolbar = new Toolbar()
    const patternPanel = new PatternPanel()
    const pianoRollPanel = new PianoRollPanel()
    const noteEditor = new NoteEditor()
    const trackEditor = new TrackEditor()
    const toolsPanel = new ToolsPanel()
    const outputPanel = new OutputPanel()
    const aboutPanel = new AboutPanel()
    const drumkitManager = new DrumkitManager()
    const songPanel = new SongPanel()

    toolbar.init()
    patternPanel.init()
    pianoRollPanel.init()
    trackEditor.init()
    noteEditor.setContainer(trackEditor._neContainer)
    noteEditor.init()
    trackEditor.setNoteEditor(noteEditor)
    toolsPanel.init()
    outputPanel.init()
    aboutPanel.init()
    drumkitManager.init()
    songPanel.init()

    const mobileTabBar = new MobileTabBar()
    mobileTabBar.init()
    const patternSettingsPanel = new PatternSettingsPanel()
    patternSettingsPanel.init()

    const appContent = document.createElement('div')
    appContent.id = 'app-content'
    appContent.appendChild(patternPanel.container)
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
        patternsPanel: songPanel,
        aboutPanel,
    })
    serviceRegistry.viewManager = viewManager
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
