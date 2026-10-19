import { playbackEvents } from '../state/event_bus.js'

import { OrTab } from './components/or_tab.js'
import BasePanel from './base_panel.js'
import { EVENTS } from '../core/events.js'

import SyncSection, { TAB_DEFS } from './note_editor/sync_section.js'

export default class NoteEditor extends BasePanel {
    #externalContainer
    #note
    #track
    #beat
    #beatStep
    #knobs
    #sliders
    #tab
    #sync

    constructor() {
        super('ne-panel')
        this.#externalContainer = null
        this.#note = null
        this.#track = null
        this.#beat = 0
        this.#beatStep = 0
        this.#knobs = []
        this.#sliders = []
        this.#tab = new OrTab({
            tabs: TAB_DEFS,
            defaultTab: 'triggers',
            onChange: () => this.sync(),
        })
        this.#sync = new SyncSection(this)
    }

    get note() {
        return this.#note
    }
    set note(v) {
        this.#note = v
    }
    get track() {
        return this.#track
    }
    set track(v) {
        this.#track = v
    }
    get beat() {
        return this.#beat
    }
    set beat(v) {
        this.#beat = v
    }
    get beatStep() {
        return this.#beatStep
    }
    set beatStep(v) {
        this.#beatStep = v
    }
    get knobs() {
        return this.#knobs
    }
    set knobs(v) {
        this.#knobs = v
    }
    get sliders() {
        return this.#sliders
    }
    set sliders(v) {
        this.#sliders = v
    }
    get tab() {
        return this.#tab
    }
    get externalContainer() {
        return this.#externalContainer
    }

    setContainer(el) {
        this.#externalContainer = el
        this.container = el
    }

    init() {
        this.beginInit()
        this.injectCSS()
        if (!this.#externalContainer) {
            this.createDOM()
            this.sync()
        } else {
            this.container.style.display = 'none'
        }
        this.subscribe()
    }

    onDestroy() {
        this.#knobs.forEach((k) => k.destroy())
        this.#knobs = []
        this.#sliders.forEach((s) => s.destroy())
        this.#sliders = []
    }

    createDOM() {
        if (this.#externalContainer) {
            this.container = this.#externalContainer
            return
        }
        super.createDOM()
    }

    subscribe() {
        this.sub(playbackEvents, EVENTS.NOTE_SELECT, (data) => {
            if (!data) return
            if (data.note) {
                if (this.isVisible) this.show(data)
            } else {
                this.#track = data.track
                this.#beat = data.beat
                this.#beatStep = data.beatStep
                this.#note = null
                if (this.isVisible) this.sync()
            }
        })
    }

    get isVisible() {
        if (this.#externalContainer) {
            return this.container.style.display !== 'none'
        }
        return super.isVisible
    }

    async show(data) {
        await this.#sync.initData(data)
        super.show()
    }

    async showInline(data) {
        await this.#sync.initData(data)
        this.container.style.display = 'block'
        this.sync()
    }

    async showDefaultNoteInline(data) {
        await this.#sync.initEmptyData(data)
        this.container.style.display = 'block'
        this.sync()
    }

    sync() {
        this.#sync.sync()
    }

    hide() {
        if (this.#externalContainer) {
            this.container.style.display = 'none'
        } else {
            super.hide()
        }
        this.#knobs.forEach((k) => k.destroy())
        this.#knobs = []
        this.#sliders.forEach((s) => s.destroy())
        this.#sliders = []
        this.#note = null
        this.#track = null
    }
}
