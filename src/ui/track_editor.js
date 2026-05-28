import { appState } from '../state/app_state.js'
import { playbackEvents } from '../state/playback_events.js'
import { serviceRegistry } from '../state/service_registry.js'
import { soundRegistry } from '../state/sound_registry.js'
import Utils from '../core/utils.js'
import LfoUpdater from '../patterns/lfo_updater.js'
import { TICK } from '../core/constants.js'
import InstrumentsManager from '../logic/services/instruments_manager.js'
import MfAutoAssign from '../logic/services/auto_assign.js'
import SynthEditor from './synth_editor.js'
const fmt = v => parseFloat(Number(v).toFixed(2))

const GROUPS = [
    {
        label: 'Basic / Transport',
        props: [
            { key: 'mute', label: 'Mute', type: 'boolean' },
            { key: 'mono', label: 'Mono', type: 'boolean' },
            { key: 'auto', label: 'Auto', type: 'boolean' },

        ]
    },
    {
        label: 'Levels / Pitch',
        props: [
            { key: 'velocity', label: 'Velo', min: 0, max: 1, step: 0.01, lfo: 'velocityLfo' },
            { key: 'pan', label: 'Pan', min: -1, max: 1, step: 0.01, lfo: 'panLfo' },
            { key: 'pitch', label: 'Pitch', min: -24, max: 24, step: 1, lfo: 'pitchLfo' },
            { key: 'sampleLength', label: 'Len', min: 0, max: 1, step: 0.01 }
        ]
    },
    {
        label: 'Filters',
        props: [
            { key: 'filterType', label: 'Type', type: 'select', options: Utils.filterTypeList },
            { key: 'filterFreq', label: 'Freq', min: 0, max: 1, step: 0.01, lfo: 'filterFreqLfo' },
            { key: 'filterQ', label: 'Q', min: 0, max: 1, step: 0.01, lfo: 'filterQLfo' }
        ]
    },
    {
        label: 'Effects',
        props: [
            { key: 'reverbAmount', label: 'RevV', min: 0, max: 1, step: 0.01 },
            { key: 'reverbType', label: 'RevT', type: 'select', options: ['none', 'room', 'hall', 'plate', 'spring', 'gated'] },
            { key: 'delayAmount', label: 'DelV', min: 0, max: 1, step: 0.01 },
            { key: 'delayTime', label: 'DelT', type: 'select', options: Utils.delayTimeValues, labels: Utils.delayTimeLabels },
            { key: 'delayType', label: 'DelTy', type: 'select', options: ['none', 'slap', 'tape', 'pingpong'] },
            { key: 'saturationAmount', label: 'SatV', min: 0, max: 1, step: 0.01 },
            { key: 'saturationType', label: 'SatT', type: 'select', options: ['soft', 'hard', 'tape'] }
        ]
    }
]

export default class TrackEditor {
    constructor() {
        this.container = null
        this._track = null
        this._trackIdx = -1
        this._selectedPropKey = null
        this._rafId = null
        this.synthEditor = new SynthEditor(this)
    }

    injectCSS() {
        if (document.getElementById('ui-styles')) return
        const link = document.createElement('link')
        link.id = 'ui-styles'
        link.rel = 'stylesheet'
        link.href = new URL('./styles.css', import.meta.url).href
        document.head.appendChild(link)
    }

    init() {
        this.injectCSS()
        this.createDOM()
        this.subscribe()
    }

    createDOM() {
        this.container = document.createElement('div')
        this.container.id = 'te-panel'
        this.container.style.display = 'none'
        document.body.appendChild(this.container)
        this.synthEditor.createDOM()
    }

    subscribe() {
        playbackEvents.onTrackSelect.push((data) => {
            if (!data) { this.hide(); return }
            playbackEvents.onNoteSelect.forEach(fn => fn(null))
            this.show(data)
        })
        playbackEvents.onNoteSelect.push((data) => {
            if (data) this.hide()
        })
        playbackEvents.onPlaybackStart.push(() => {
            this._startAnimation()
        })
        playbackEvents.onPlaybackStop.push(() => {
            if (this._rafId) {
                cancelAnimationFrame(this._rafId)
                this._rafId = null
            }
        })
    }

    _startAnimation() {
        if (this._rafId) return
        const animate = () => {
            const transport = serviceRegistry.transport
            if (!transport?.isRunning) {
                this._rafId = null
                return
            }
            this._rafId = requestAnimationFrame(animate)
            this._updateLfoSliders()
        }
        this._rafId = requestAnimationFrame(animate)
    }

    _updateLfoSliders() {
        if (!this._track || this.container.style.display === 'none') return
        const transport = serviceRegistry.transport
        if (!transport?.isRunning) return

        const pattern = appState.patterns[appState.selectedPatternNum]
        const nbTicks = TICK * (pattern?.nbBars ?? 4)
        const tick = transport.tick ?? 0

        GROUPS.forEach(g => {
            g.props.forEach(p => {
                if (p.lfo && this._track[p.lfo]) {
                    const slider = this.container.querySelector(`input[data-key="${p.key}"]`)
                    const valEl = this.container.querySelector(`.ne-val[data-key="${p.key}"]`)
                    if (slider && valEl) {
                        const lfoVal = LfoUpdater.computeLfoValue(this._track[p.lfo], tick, nbTicks)
                        slider.value = lfoVal
                        valEl.textContent = fmt(lfoVal)
                    }
                }
            })
        })
    }

    reposition() {
        const pp = document.getElementById('pattern-panel')
        if (pp) {
            this.container.style.top = (pp.offsetTop + pp.offsetHeight) + 'px'
        }
    }

    show({ track, trackIdx }) {
        this._track = track
        this._trackIdx = trackIdx
        this.sync()
        void this.synthEditor.ensureGeneratedSoundsLoaded()
        if (serviceRegistry.transport?.isRunning) {
            this._startAnimation()
        }
    }

    sync() {
        if (!this._track) return

        let html = `<div class="ne-header">
            <span class="ne-track">Track: ${this.esc(this._track.name)}</span>
            <button class="ne-close">&times;</button>
        </div><div class="ne-body">`

        GROUPS.forEach(g => {
                if (g.label === 'Effects') {
                    html += this._renderFxGroup()
                    return
                }
                html += `<div class="ne-group">
                <div class="ne-group-label">${g.label}</div>
                <div class="ne-grid">`
            g.props.forEach(p => {
                const val = this._track[p.key]
                const isSelected = this._selectedPropKey === p.key ? 'selected' : ''
                const hasLfo = p.lfo && this._track[p.lfo] ? 'has-lfo' : ''
                
                html += `<div class="ne-row ${isSelected} ${hasLfo}" data-prop="${p.key}">`
                
                if (p.type === 'boolean') {
                    const active = val ? 'active' : ''
                    html += `<label>${p.label}</label>
                             <button class="ne-btn ${active}" data-key="${p.key}">${val ? 'ON' : 'OFF'}</button>`
                } else if (p.type === 'select') {
                    html += `<label>${p.label}</label>
                             <select data-key="${p.key}">`
                    p.options.forEach((opt, idx) => {
                        const label = p.labels ? p.labels[idx] : opt
                        const sel = String(opt) === String(val) ? ' selected' : ''
                        html += `<option value="${opt}"${sel}>${label}</option>`
                    })
                    html += `</select>`
                } else {
                    html += `<label>${p.label}</label>
                             <input type="range" min="${p.min}" max="${p.max}" step="${p.step}"
                                value="${val ?? p.min}" data-key="${p.key}">
                             <span class="ne-val" data-key="${p.key}">${fmt(val ?? p.min)}</span>`
                }
                html += `</div>`
            })
            html += `</div></div>`
        })

        // LFO Sub-panel
        if (this._selectedPropKey) {
            const prop = this._findProp(this._selectedPropKey)
            if (prop && prop.lfo) {
                html += this._renderLfoPanel(prop)
            }
        }

        // Sound Sub-panel
        html += this._renderSoundPanel()

        // Loop / Pattern Sub-panel
        html += this._renderLoopPanel()

        html += '</div>'
        this.container.innerHTML = html
        this.container.style.display = 'block'
        this.reposition()
        this._bindEvents()
    }

    _renderLoopPanel() {
        const bars = this._track.bars ?? 4
        const barQuantize = this._track.barQuantize ?? 4
        const loopAtStep = this._track.loopAtStep ?? (bars * barQuantize)
        const maxSteps = bars * barQuantize
        const swing = this._track.swingAmount ?? 0

        return `<div class="ne-group" style="border-left:1px solid #444;padding-left:12px">
            <div class="ne-group-label">Loop / Pattern</div>
            <div class="ne-grid">
                <div class="ne-row">
                    <label>Steps/Bar</label>
                    <input type="range" min="1" max="8" step="1" value="${barQuantize}" data-loop="barQuantize">
                    <span class="ne-val">${barQuantize}</span>
                </div>
                <div class="ne-row">
                    <label>Bars</label>
                    <input type="range" min="1" max="8" step="1" value="${bars}" data-loop="bars">
                    <span class="ne-val">${bars}</span>
                </div>
                <div class="ne-row">
                    <label>Loop Point</label>
                    <input type="range" min="1" max="${maxSteps}" step="1" value="${loopAtStep}" data-loop="loopAtStep">
                    <span class="ne-val">${loopAtStep}</span>
                </div>
                <div class="ne-row">
                    <label>Swing</label>
                    <input type="range" min="0" max="1" step="0.01" value="${swing}" data-loop="swingAmount">
                    <span class="ne-val">${fmt(swing)}</span>
                </div>
            </div>
        </div>`
    }

    _renderFxGroup() {
        const fxDefs = [
            { key: 'reverbOn', label: 'Rev', controls: ['reverbAmount', 'reverbType'] },
            { key: 'delayOn', label: 'Del', controls: ['delayAmount', 'delayTime', 'delayType'] },
            { key: 'saturationOn', label: 'Sat', controls: ['saturationAmount', 'saturationType'] }
        ]

        let html = `<div class="ne-group"><div class="ne-group-label">Effects</div><div class="ne-grid">`

        fxDefs.forEach(fx => {
            const on = this._isFxOn(fx)
            const ledClass = on ? 'lfo-led on' : 'lfo-led'
            html += `<div class="ne-row">
                <button class="${ledClass}" data-fx-toggle="${fx.key}" title="${on ? 'Disable' : 'Enable'}"></button>
                <label>${fx.label}</label>
            </div>`
            if (on) {
                fx.controls.forEach(ck => {
                    const prop = GROUPS.flatMap(g => g.props).find(p => p.key === ck)
                    if (!prop) return
                    const val = this._track[ck]
                    if (prop.type === 'select') {
                        html += `<div class="ne-row" data-prop="${ck}">
                            <label style="min-width:20px">${prop.label}</label>
                            <select data-key="${ck}">`
                        prop.options.forEach((opt, idx) => {
                            const label = prop.labels ? prop.labels[idx] : opt
                            const sel = String(opt) === String(val) ? ' selected' : ''
                            html += `<option value="${opt}"${sel}>${label}</option>`
                        })
                        html += `</select></div>`
                    } else {
                        html += `<div class="ne-row" data-prop="${ck}">
                            <label style="min-width:20px">${prop.label}</label>
                            <input type="range" min="${prop.min}" max="${prop.max}" step="${prop.step}"
                                value="${val ?? prop.min}" data-key="${ck}">
                            <span class="ne-val" data-key="${ck}">${fmt(val ?? prop.min)}</span>
                        </div>`
                    }
                })
            }
        })

        html += `</div></div>`
        return html
    }

    _isFxOn(fx) {
        if (typeof this._track[fx.key] === 'boolean') return this._track[fx.key]
        const amount = Number(this._track[fx.controls[0]] ?? 0)
        return Number.isFinite(amount) && amount > 0
    }

    _renderSoundPanel() {
        const auto = this._track.useAutoAssignSound !== false
        const ledClass = auto ? 'lfo-led on' : 'lfo-led'
        const visibility = auto ? 'display:none' : ''
        const generatedSoundKeys = this.synthEditor.getGeneratedSoundKeys()
        const currentGeneratedSound = this._track.useSoftSynth === true
            ? (this._track.synthSoundKey || 'BASS1')
            : 'none'

        // only instrument IDs that have at least one sample across all kits
        const keysWithSamples = new Set(
            soundRegistry.drumkitList.flatMap(kit => kit.instruments.map(s => s.key))
        )
        const instrumentIds = InstrumentsManager.DATA.instruments
            .map(i => i.id)
            .filter(id => keysWithSamples.has(id))
            .sort()
        const currentName = this._getCurrentInstrumentName(instrumentIds, keysWithSamples)
        const currentSoundId = this._getCurrentSoundUrl()
        const matchingSounds = this._getSamplesForInstrument(currentName)

        const hideInstrSample = auto || this._track.useSoftSynth === true

        let html = `<div class="ne-group" style="border-left:1px solid #444;padding-left:12px">
            <div class="ne-group-label">
                <button class="${ledClass}" data-action="toggle-auto" title="${auto ? 'Disable' : 'Enable'} auto-assign"></button>
                Sound
            </div>
            <div class="ne-grid" style="${hideInstrSample ? 'display:none' : ''}">
                <div class="ne-row">
                    <label>Instr</label>
                    <select data-sound="instrument">`
        instrumentIds.forEach(id => {
            const sel = id === currentName ? ' selected' : ''
            html += `<option value="${id}"${sel}>${id}</option>`
        })
        html += `</select></div>
                <div class="ne-row">
                    <label>Sample</label>
                    <select data-sound="sample">`
        if (matchingSounds.length === 0) {
            html += `<option value="">— no samples —</option>`
        } else {
            matchingSounds.forEach(s => {
                const sel = s.url === currentSoundId ? ' selected' : ''
                const label = `${s.kitName} / ${s.display_name || s.url}`
                html += `<option value="${s.url}"${sel}>${label}</option>`
            })
        }
        html += `</select></div>
            </div>
            <div class="ne-grid" style="${auto ? 'display:none' : ''}">
                <div class="ne-row" style="border-top:1px solid #444;margin-top:6px;padding-top:6px">
                    <label>Gen</label>
                    <select data-sound="generated">
                        <option value="none"${currentGeneratedSound === 'none' ? ' selected' : ''}>none</option>`
        generatedSoundKeys.forEach(key => {
            const sel = key === currentGeneratedSound ? ' selected' : ''
            html += `<option value="${this.esc(key)}"${sel}>${this.esc(key)}</option>`
        })
        if (this._track.useSoftSynth === true && !generatedSoundKeys.includes(currentGeneratedSound)) {
            html += `<option value="${this.esc(currentGeneratedSound)}" selected>${this.esc(currentGeneratedSound)}</option>`
        }
        html += `</select></div>
                <div class="ne-row">
                    <label>Edit</label>
                    <button class="ne-btn" data-action="edit-synth" ${currentGeneratedSound === 'none' ? 'disabled' : ''}>Edit</button>
                </div>
            </div>
        </div>`
        return html
    }

    _getSelectedDrumkitName() {
        return soundRegistry.drumkitList[appState.selectedDrumkitNum]?.name ?? ''
    }

    _getAllKitSamples() {
        return soundRegistry.drumkitList.flatMap(kit =>
            kit.instruments.map(s => ({ ...s, kitName: kit.name }))
        )
    }

    _sortSamplesForCurrentKit(samples) {
        const selectedKitName = this._getSelectedDrumkitName()
        return [...samples].sort((a, b) => {
            const aSelected = a.kitName === selectedKitName ? 0 : 1
            const bSelected = b.kitName === selectedKitName ? 0 : 1
            if (aSelected !== bSelected) return aSelected - bSelected
            const kitCompare = String(a.kitName ?? '').localeCompare(String(b.kitName ?? ''))
            if (kitCompare !== 0) return kitCompare
            return (a.display_name || a.url).localeCompare(b.display_name || b.url)
        })
    }

    _getSamplesForInstrument(instrumentId) {
        return this._sortSamplesForCurrentKit(
            this._getAllKitSamples().filter(s => s.key === instrumentId)
        )
    }

    _getPreferredSampleForInstrument(instrumentId) {
        return this._getSamplesForInstrument(instrumentId)[0] ?? null
    }

    _getCurrentSoundUrl() {
        const soundId = this._track.soundId ?? ''
        return soundRegistry.sounds[soundId]?.url ?? soundId
    }

    _getCurrentInstrumentName(instrumentIds, keysWithSamples) {
        if (keysWithSamples.has(this._track.name)) return this._track.name
        const soundKey = soundRegistry.sounds[this._getCurrentSoundUrl()]?.key
        if (soundKey && keysWithSamples.has(soundKey)) return soundKey
        return instrumentIds[0] ?? 'KICK'
    }

    _findProp(key) {
        for (const g of GROUPS) {
            for (const p of g.props) {
                if (p.key === key) return p
            }
        }
        return null
    }

    _renderLfoPanel(prop) {
        const lfoKey = prop.lfo
        const lfo = this._track[lfoKey]
        
        const ledClass = lfo ? 'lfo-led on' : 'lfo-led'
        const ledTitle = lfo ? 'Disable LFO' : 'Enable LFO'
        let lfoHtml = `<div class="ne-group lfo-panel">
            <div class="lfo-header">
                <button class="${ledClass}" data-action="toggle-lfo" title="${ledTitle}"></button>
                <div class="ne-group-label">LFO: ${prop.label}</div>
            </div>
            <div class="ne-grid">`
        
        if (lfo) {
            const params = [
                { key: 'freq', label: 'Freq', min: 0.1, max: 16, step: 0.1 },
                { key: 'min', label: 'Min', min: prop.min, max: prop.max, step: prop.step },
                { key: 'max', label: 'Max', min: prop.min, max: prop.max, step: prop.step },
                { key: 'phase', label: 'Phas', min: 0, max: 1, step: 0.01 }
            ]

            params.forEach(p => {
                lfoHtml += `<div class="ne-row">
                    <label>${p.label}</label>
                    <input type="range" min="${p.min}" max="${p.max}" step="${p.step}"
                        value="${lfo[p.key]}" data-lfo-key="${p.key}">
                    <span class="ne-val">${fmt(lfo[p.key])}</span>
                </div>`
            })
        }
        
        lfoHtml += `</div></div>`
        return lfoHtml
    }

    _bindEvents() {
        this.container.querySelectorAll('input[type=range][data-key]').forEach(input => {
            input.addEventListener('input', () => this._onSlider(input))
        })
        this.container.querySelectorAll('select[data-key]').forEach(sel => {
            sel.addEventListener('change', () => this._onSelect(sel))
        })
        this.container.querySelectorAll('.ne-btn[data-key]').forEach(btn => {
            btn.addEventListener('click', () => this._onToggle(btn))
        })
        this.container.querySelectorAll('.ne-row[data-prop]').forEach(row => {
            row.addEventListener('click', (e) => {
                if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'BUTTON') return
                this._onRowClick(row.dataset.prop)
            })
        })
        
        // LFO Events
        const lfoPanel = this.container.querySelector('.lfo-panel')
        if (lfoPanel) {
            lfoPanel.querySelectorAll('input[type=range]').forEach(input => {
                input.addEventListener('input', () => this._onLfoSlider(input))
            })
            lfoPanel.querySelectorAll('select').forEach(sel => {
                sel.addEventListener('change', () => this._onLfoSelect(sel))
            })
            lfoPanel.querySelector('[data-action="toggle-lfo"]')?.addEventListener('click', () => this._toggleLfo())
        }

        // Loop panel events
        this.container.querySelectorAll('input[data-loop]').forEach(input => {
            input.addEventListener('input', () => this._onLoopSlider(input))
            // Re-sync fully on change to ensure structural consistency
            input.addEventListener('change', () => this.sync())
        })

        // FX toggle LEDs
        this.container.querySelectorAll('[data-fx-toggle]').forEach(btn => {
            btn.addEventListener('click', () => this._toggleFx(btn))
        })

        // Sound panel events
        this.container.querySelector('[data-action="toggle-auto"]')?.addEventListener('click', () => {
            this._track.useAutoAssignSound = this._track.useAutoAssignSound === false
            if (this._track.useAutoAssignSound) {
                this._track.useSoftSynth = false
                this._track.synthSoundKey = null
                const aa = new MfAutoAssign()
                aa.autoAssignTrackSounds(this._track)
            }
            this.sync()
            playbackEvents.onPatternChange.forEach(fn => fn())
        })
        this.container.querySelector('[data-sound="instrument"]')?.addEventListener('change', async (e) => {
            const newName = e.target.value
            serviceRegistry.mfCmd.changeTrackName(this._track, newName)
            // auto-select first sample for this instrument
            const firstSample = this._getPreferredSampleForInstrument(newName)
            if (firstSample) {
                if (!soundRegistry.sounds[firstSample.url]?.buffer) {
                    await serviceRegistry.mfResourcesLoader.loadSample(firstSample, firstSample.kitName)
                }
                serviceRegistry.mfCmd.changeTrackSound(this._track, firstSample.url)
            }
            this.sync()
            playbackEvents.onPatternChange.forEach(fn => fn())
        })
        this.container.querySelector('[data-sound="sample"]')?.addEventListener('change', async (e) => {
            const url = e.target.value
            if (!soundRegistry.sounds[url]?.buffer) {
                // find kit + sample info from drumkitList
                let foundKit, foundSample
                for (const kit of soundRegistry.drumkitList) {
                    const s = kit.instruments.find(i => i.url === url)
                    if (s) { foundKit = kit; foundSample = s; break }
                }
                if (foundSample && foundKit) {
                    await serviceRegistry.mfResourcesLoader.loadSample(foundSample, foundKit.name)
                }
            }
            serviceRegistry.mfCmd.changeTrackSound(this._track, url)
            playbackEvents.onPatternChange.forEach(fn => fn())
        })
        this.container.querySelector('[data-sound="generated"]')?.addEventListener('change', async (e) => {
            const key = e.target.value
            if (key === 'none') {
                this._track.useSoftSynth = false
            } else {
                if (!soundRegistry.generatedSounds[key]) {
                    await this.synthEditor.ensureGeneratedSoundsLoaded()
                }
                this._track.useSoftSynth = true
                this._track.useAutoAssignSound = false
                this._track.synthSoundKey = key
            }
            this.sync()
            playbackEvents.onPatternChange.forEach(fn => fn())
        })
        this.container.querySelector('[data-action="edit-synth"]')?.addEventListener('click', () => {
            this.synthEditor.openEditor()
        })

        this.container.querySelector('.ne-close').addEventListener('click', () => this.hide())
    }

    _onRowClick(propKey) {
        this._selectedPropKey = propKey
        this.sync()
    }

    _toggleFx(btn) {
        const key = btn.dataset.fxToggle
        const fx = [
            { key: 'reverbOn', controls: ['reverbAmount'] },
            { key: 'delayOn', controls: ['delayAmount'] },
            { key: 'saturationOn', controls: ['saturationAmount'] }
        ].find(def => def.key === key)
        this._track[key] = fx ? !this._isFxOn(fx) : !this._track[key]
        this.sync()
        playbackEvents.onPatternChange.forEach(fn => fn())
    }

    _toggleLfo() {
        const prop = this._findProp(this._selectedPropKey)
        if (!prop || !prop.lfo) return
        if (this._track[prop.lfo]) {
            delete this._track[prop.lfo]
        } else {
            this._track[prop.lfo] = {
                type: 'sine',
                freq: 1,
                min: prop.min,
                max: prop.max,
                phase: 0
            }
        }
        this.sync()
        playbackEvents.onPatternChange.forEach(fn => fn())
    }

    _onLfoSlider(input) {
        const prop = this._findProp(this._selectedPropKey)
        const lfo = this._track[prop.lfo]
        if (!lfo) return
        const key = input.dataset.lfoKey
        lfo[key] = parseFloat(input.value)
        input.nextElementSibling.textContent = fmt(input.value)
        playbackEvents.onPatternChange.forEach(fn => fn())
    }

    _onLfoSelect(sel) {
        const prop = this._findProp(this._selectedPropKey)
        const lfo = this._track[prop.lfo]
        if (!lfo) return
        lfo.type = sel.value
        playbackEvents.onPatternChange.forEach(fn => fn())
    }

    hide() {
        this.container.style.display = 'none'
        this.synthEditor.reset()
        document.getElementById('pattern-panel')?.classList.remove('ui-hidden')
        this._track = null
        this._trackIdx = -1
        this._selectedPropKey = null
    }

    _onLoopSlider(input) {
        if (!this._track) return
        const key = input.dataset.loop
        const val = key === 'swingAmount' ? parseFloat(input.value) : parseInt(input.value)
        const oldBarQuantize = this._track.barQuantize

        if (key === 'bars') {
            const pattern = appState.patterns[appState.selectedPatternNum]
            if (pattern) {
                pattern.nbBars = val
                pattern.tracks.forEach(t => {
                    t.bars = val
                    // Ensure loopAtStep is within new bounds for each track
                    const maxSteps = val * (t.barQuantize ?? 4)
                    if (t.loopAtStep > maxSteps) {
                        t.loopAtStep = maxSteps
                        t.loopPointBar = Math.floor(t.loopAtStep / t.barQuantize)
                        t.loopPointStep = t.loopAtStep % t.barQuantize
                    }
                })
            }
        } else {
            this._track[key] = val
        }

        if (key === 'barQuantize') {
            // Re-quantize notes to maintain relative position
            if (this._track.notes) {
                this._track.notes.forEach(note => {
                    const steppc = note.steppc ?? Math.round((note.barStep * 100) / (oldBarQuantize || 4))
                    note.barStep = Math.floor((steppc / 100) * val)
                })
            }
        }

        // Ensure current track loopAtStep is within bounds (already handled for bars above, but needed for barQuantize)
        const maxSteps = (this._track.bars ?? 4) * (this._track.barQuantize ?? 4)
        if (this._track.loopAtStep > maxSteps) {
            this._track.loopAtStep = maxSteps
        }

        // Update derived fields for current track
        this._track.loopPointBar = Math.floor(this._track.loopAtStep / this._track.barQuantize)
        this._track.loopPointStep = this._track.loopAtStep % this._track.barQuantize

        // Update local labels and dependent UI without full sync
        input.nextElementSibling.textContent = key === 'swingAmount' ? fmt(val) : val
        
        if (key === 'barQuantize' || key === 'bars') {
            const lpSlider = this.container.querySelector('input[data-loop="loopAtStep"]')
            if (lpSlider) {
                lpSlider.max = maxSteps
                lpSlider.value = this._track.loopAtStep
                lpSlider.nextElementSibling.textContent = this._track.loopAtStep
            }
        }
        
        playbackEvents.onPatternChange.forEach(fn => fn())
    }

    _onSlider(input) {
        if (!this._track) return
        const key = input.dataset.key
        const val = parseFloat(input.value)
        this._track[key] = val
        input.nextElementSibling.textContent = fmt(val)
        playbackEvents.onPatternChange.forEach(fn => fn())
    }

    _onSelect(sel) {
        if (!this._track) return
        const key = sel.dataset.key
        let val = sel.value
        if (key === 'delayTime') val = parseFloat(val)
        this._track[key] = val
        playbackEvents.onPatternChange.forEach(fn => fn())
    }

    _onToggle(btn) {
        if (!this._track) return
        const key = btn.dataset.key
        this._track[key] = !this._track[key]
        btn.textContent = this._track[key] ? 'ON' : 'OFF'
        btn.classList.toggle('active', this._track[key])
        playbackEvents.onPatternChange.forEach(fn => fn())
    }

    esc(str) {
        const d = document.createElement('div')
        d.textContent = str
        return d.innerHTML
    }
}
