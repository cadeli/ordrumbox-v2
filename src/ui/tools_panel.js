// src/ui/tools_panel.js — Coordinator
//
// Thin coordinator that delegates tab rendering/binding to section modules.

import { playbackEvents } from '../state/playback_events.js'
import { bindCloseButton, bindTabToggles } from './components/panel_helpers.js'
import BasePanel from './base_panel.js'
import PatternSection from './tools_panel/pattern_section.js'
import ExportSection from './tools_panel/export_section.js'
import ImportSection from './tools_panel/import_section.js'
import MidiSection from './tools_panel/midi_section.js'
import CacheSection from './tools_panel/cache_section.js'
import { EVENTS } from '../core/events.js'

export default class ToolsPanel extends BasePanel {
    #pattern
    #export
    #import
    #midi
    #cache

    get _wavLoops() {
        return this.#export.wavLoops
    }

    get exportWavBtn() {
        return this.#export.wavBtn
    }

    constructor() {
        super('tools-panel')
        this.#pattern = new PatternSection(this)
        this.#export = new ExportSection(this)
        this.#import = new ImportSection(this)
        this.#midi = new MidiSection(this)
        this.#cache = new CacheSection(this)
    }

    createDOM() {
        super.createDOM()

        this.container.innerHTML = `
            <div class="ne-header">
                <span class="ne-track">Tools</span>
            </div>
            <div class="ne-tab-bar">
                <button class="ne-tab-btn active" data-ne-tab="pattern">Pattern</button>
                <button class="ne-tab-btn" data-ne-tab="export">Export</button>
                <button class="ne-tab-btn" data-ne-tab="import">Import</button>
                <button class="ne-tab-btn" data-ne-tab="midi-status">Status</button>
                <button class="ne-tab-btn" data-ne-tab="midi">MIDI</button>
                <button class="ne-tab-btn" data-ne-tab="cache">Cache</button>
            </div>
            ${this.#pattern.html()}
            ${this.#export.html()}
            ${this.#import.html()}
            ${this.#midi.htmlStatus()}
            ${this.#midi.html()}
            ${this.#cache.html()}
        `

        this.#pattern.bind()
        this.#export.bind()
        this.#import.bind()
        this.#midi.bind()
        this.#cache.bind()

        bindCloseButton(this.container, () => playbackEvents.emit(EVENTS.TOOLS_TOGGLE, false))
        bindTabToggles(this.container)
    }

    subscribe() {}

    sync() {
        this.#midi.sync()
        if (this.isVisible) {
            this.#cache.refresh()
        }
    }

    async exportMidi() {
        return this.#export.exportMidi()
    }
}
