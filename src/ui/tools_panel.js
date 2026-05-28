import { playbackEvents } from '../state/playback_events.js'

export default class ToolsPanel {
    constructor() {
        this.container = null
    }

    injectCSS() {
        if (document.getElementById('ui-styles')) return
        // CSS is usually already injected by other components, 
        // but we keep the pattern for consistency
    }

    init() {
        this.createDOM()
        this.subscribe()
    }

    createDOM() {
        this.container = document.createElement('div')
        this.container.id = 'tools-panel'
        this.container.style.display = 'none'
        
        this.container.innerHTML = `
            <div class="ne-header">
                <span class="ne-track">Tools</span>
                <button class="ne-close">&times;</button>
            </div>
            <div class="ne-body">
                <div class="ne-group">
                    <div class="ne-group-label">Pattern Tools</div>
                    <div class="ne-grid">
                        <div class="ne-row">
                            <button class="ne-btn" data-action="todo">Coming Soon...</button>
                        </div>
                    </div>
                </div>
            </div>
        `
        document.body.appendChild(this.container)
        
        this.container.querySelector('.ne-close').addEventListener('click', () => this.hide())
    }

    subscribe() {
        playbackEvents.onToolsToggle.push((show) => {
            if (show) this.show()
            else this.hide()
        })
        
        // Hide if other selections happen
        playbackEvents.onTrackSelect.push((data) => {
            if (data) this.hide()
        })
        playbackEvents.onNoteSelect.push((data) => {
            if (data) this.hide()
        })
    }

    show() {
        // Hide others
        document.getElementById('te-panel').style.display = 'none'
        document.getElementById('ne-panel').style.display = 'none'
        
        this.container.style.display = 'block'
        this.reposition()
    }

    hide() {
        this.container.style.display = 'none'
    }

    reposition() {
        const pp = document.getElementById('pattern-panel')
        if (pp) {
            this.container.style.top = (pp.offsetTop + pp.offsetHeight) + 'px'
        }
    }
}
