// src/ui/tools_panel/midi_section.js — Tools "Status" + "MIDI" tabs and MIDI sync.

import { serviceRegistry } from '../../state/service_registry.js'
import { escapeHtml, renderOptions } from '../components/panel_helpers.js'
import { showToast } from '../../core/notify.js'
import { nameOr } from '../../core/logger.js'
import MidiIndicatorView from '../midi_indicator_view.js'

export default class MidiSection {
    #panel
    #midiView

    /** @param {import('../tools_panel.js').default} panel */
    constructor(panel) {
        this.#panel = panel
        this.#midiView = null
    }

    htmlStatus() {
        return `
            <div class="ne-tab-panel ne-tab-panel-hidden" data-tab-panel="midi-status">
                <div class="ne-row no-cursor">
                    <button class="lfo-led" id="midiSupportLed"></button>
                    <label>Support:</label>
                    <span class="ne-val" id="midiSupportLabel">Checking...</span>
                </div>
                <div class="ne-row no-cursor">
                    <button class="lfo-led" id="midiReadyLed"></button>
                    <label>Ready:</label>
                    <span class="ne-val" id="midiReadyLabel">Locked</span>
                </div>
                <div class="ne-row no-cursor">
                    <button class="lfo-led" id="midiConnectedLed"></button>
                    <label>Inputs:</label>
                    <span class="ne-val" id="midiConnectedLabel">None</span>
                </div>
                <div class="ne-row no-cursor">
                    <button class="lfo-led" id="midiSyncLed"></button>
                    <label>Ext Sync:</label>
                    <span class="ne-val" id="midiSyncLabel">Internal</span>
                </div>
                <div class="ne-row no-cursor">
                    <button class="lfo-led" id="midiActivityLed"></button>
                    <label>Activity:</label>
                    <span class="ne-val" id="midiActivityLabel">Idle</span>
                </div>
            </div>
        `
    }

    html() {
        return `
            <div class="ne-tab-panel ne-tab-panel-hidden" data-tab-panel="midi">
                <div class="ne-row">
                    <label>Output:</label>
                    <select id="tp-midi-output-select"></select>
                </div>
                <div class="ne-row">
                    <button class="ne-btn" id="tp-midi-enable" title="Connect or disconnect the MIDI output device">Enable MIDI</button>
                </div>
                <div class="ne-row">
                    <button class="ne-btn" id="tp-midi-sync" title="Toggle between internal clock and external MIDI clock sync">Toggle Sync</button>
                </div>
            </div>
        `
    }

    bind() {
        const root = this.#panel.container

        root.querySelector('#tp-midi-enable').addEventListener('click', async () => {
            const btn = root.querySelector('#tp-midi-enable')
            if (!serviceRegistry.midiManager) {
                const { getMidiManagerService } = await import('../../state/service_loader.js')
                await getMidiManagerService()
            }

            if (serviceRegistry.midiManager.isReady) {
                serviceRegistry.midiManager.disable()
                btn.textContent = 'Enable MIDI'
            } else {
                await serviceRegistry.midiManager.init()
                btn.textContent = 'Disable MIDI'
            }
            this.#panel.sync()
        })

        root.querySelector('#tp-midi-sync').addEventListener('click', () => {
            if (serviceRegistry.midiManager) {
                serviceRegistry.midiManager.toggleExternalSync()
                this.#panel.sync()
            } else {
                showToast('Enable MIDI first', 'info')
            }
        })

        const outputSelect = root.querySelector('#tp-midi-output-select')
        outputSelect.addEventListener('change', () => {
            if (serviceRegistry.midiManager) {
                serviceRegistry.midiManager.setSelectedOutput(outputSelect.value)
            }
        })

        this.#midiView = new MidiIndicatorView(root)
    }

    sync() {
        const root = this.#panel.container
        const outputSelect = root.querySelector('#tp-midi-output-select')
        const enableBtn = root.querySelector('#tp-midi-enable')

        if (serviceRegistry.midiManager) {
            this.#midiView.connect(serviceRegistry.midiManager)
            this.#midiView.sync(serviceRegistry.midiManager)
            enableBtn.textContent = serviceRegistry.midiManager.isReady ? 'Disable MIDI' : 'Enable MIDI'

            const outputs = serviceRegistry.midiManager.outputs
            const currentOutputId = serviceRegistry.midiManager.selectedOutputId

            if (outputSelect.options.length !== outputs.length) {
                const values = outputs.map((o) => o.id)
                const labels = outputs.map((o) => nameOr(o.name, 'Unknown', 'ToolsPanel', 'name fallback'))
                outputSelect.innerHTML = renderOptions(values, currentOutputId, { labels, escape: escapeHtml })
            } else {
                outputSelect.value = nameOr(currentOutputId, '', 'ToolsPanel', 'outputId fallback')
            }
        } else {
            this.#midiView.disconnect()
            this.#midiView.sync(null)
            if (outputSelect) outputSelect.innerHTML = '<option value="">MIDI Not Enabled</option>'
        }
    }
}
