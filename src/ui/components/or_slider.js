/**
 * OrSlider — composant slider unifié pour ordrumbox-v2
 *
 * Regroupe toutes les caractéristiques communes des sliders de l'app :
 *   - label + input[type=range] + affichage de la valeur
 *   - unité et format d'affichage configurable
 *   - normalisation/dénormalisation (ex: filterFreq en Hz)
 *   - indicateur LFO (classe CSS has-lfo)
 *   - contrôle clavier : Arrow ±step, Shift+Arrow ±step×10, Alt+Arrow ±step÷10
 *   - mise à jour programmatique via setValue()
 *   - callback onChange avec la valeur dénormalisée
 *
 * Usage — génération HTML (zones template literal) :
 *   const s = new OrSlider({ key:'velocity', label:'Velo', min:0, max:1, step:0.01, value:0.8,
 *                             onChange: v => track.velocity = v })
 *   rowDiv.innerHTML = s.toHTML()
 *   s.mount(rowDiv)     // bind les événements sur le DOM injecté
 *
 * Usage — création DOM impérative :
 *   const s = new OrSlider({ ... })
 *   const el = s.createElement()   // retourne le div.ne-row prêt
 *   container.appendChild(el)
 *
 * API publique :
 *   s.setValue(val)       — met à jour le slider et l'affichage (valeur dénormalisée)
 *   s.getValue()          — retourne la valeur courante dénormalisée
 *   s.setHasLfo(bool)     — active/désactive la classe CSS has-lfo
 *   s.setDisabled(bool)   — active/désactive le contrôle
 *   s.destroy()           — retire les event listeners
 *   s.el                  — référence à l'élément DOM (après mount/createElement)
 */

const _defaultFmt = v => parseFloat(Number(v).toFixed(2))

export class OrSlider {
    /**
     * @param {Object}   cfg
     * @param {string}   cfg.key            Identifiant (data-key sur l'input)
     * @param {string}   cfg.label          Texte du label
     * @param {number}   cfg.min            Valeur minimale (espace normalisé)
     * @param {number}   cfg.max            Valeur maximale (espace normalisé)
     * @param {number}   cfg.step           Pas de base
     * @param {number}   cfg.value          Valeur initiale (dénormalisée)
     * @param {string}   [cfg.unit]         Unité affichée après la valeur (ex: 'Hz', 'ms')
     * @param {Function} [cfg.format]       (valDenorm) => string — format d'affichage
     * @param {Function} [cfg.normalize]    (valDenorm) => valNorm — pour l'espace de l'input
     * @param {Function} [cfg.denormalize]  (valNorm)   => valDenorm — inverse
     * @param {boolean}  [cfg.hasLfo]       Ajoute la classe CSS has-lfo
     * @param {boolean}  [cfg.noCursor]     Ajoute la classe CSS no-cursor
     * @param {string}   [cfg.dataAttr]     Nom de l'attribut data-* (défaut: 'data-key')
     * @param {Function} [cfg.onChange]     (valDenorm, key) => void
     */
    constructor(cfg) {
        this._key        = cfg.key
        this._label      = cfg.label
        this._min        = cfg.min
        this._max        = cfg.max
        this._step       = cfg.step
        this._unit       = cfg.unit      ?? ''
        this._format     = cfg.format    ?? _defaultFmt
        this._normalize  = cfg.normalize   ?? null
        this._denormalize = cfg.denormalize ?? null
        this._hasLfo     = cfg.hasLfo    ?? false
        this._noCursor   = cfg.noCursor  ?? false
        this._dataAttr   = cfg.dataAttr  ?? 'data-key'
        this._onChange   = cfg.onChange  ?? null

        // Valeur courante dans l'espace dénormalisé
        this._value = cfg.value ?? cfg.min

        this.el       = null   // div.ne-row — disponible après mount() / createElement()
        this._input   = null
        this._valSpan = null

        this._boundOnInput   = this._onInput.bind(this)
        this._boundOnKeydown = this._onKeydown.bind(this)
    }

    // ─── Helpers internes ────────────────────────────────────────────────────

    /** Convertit une valeur dénormalisée en valeur pour l'input range */
    _toNorm(v) {
        return this._normalize ? this._normalize(v) : v
    }

    /** Convertit une valeur de l'input range en valeur applicative */
    _toDenorm(v) {
        return this._denormalize ? this._denormalize(v) : v
    }

    /** Formate la valeur dénormalisée pour l'affichage */
    _fmt(v) {
        const str = String(this._format(v))
        return this._unit ? `${str} ${this._unit}` : str
    }

    /** Classes CSS de la row */
    _rowClasses() {
        const classes = ['ne-row']
        if (this._hasLfo)   classes.push('has-lfo')
        if (this._noCursor) classes.push('no-cursor')
        return classes.join(' ')
    }

    // ─── Génération HTML (mode template literal) ─────────────────────────────

    /**
     * Retourne le HTML de la row (label + input + span).
     * Appeler ensuite mount(rowEl) pour binder les événements.
     */
    toHTML() {
        const normVal    = this._toNorm(this._value)
        const displayVal = this._fmt(this._value)
        return `<div class="${this._rowClasses()}" data-or-slider="${this._key}">
            <label>${this._escHtml(this._label)}</label>
            <input type="range"
                   min="${this._min}" max="${this._max}" step="${this._step}"
                   value="${normVal}"
                   ${this._dataAttr}="${this._key}">
            <span class="ne-val" ${this._dataAttr}="${this._key}">${displayVal}</span>
        </div>`
    }

    /**
     * Bind les événements sur un div.ne-row déjà injecté dans le DOM.
     * @param {HTMLElement} rowEl  L'élément retourné par toHTML(), déjà dans le DOM.
     */
    mount(rowEl) {
        this.el       = rowEl
        this._input   = rowEl.querySelector(`input[type=range]`)
        this._valSpan = rowEl.querySelector(`.ne-val`)
        this._bind()
    }

    // ─── Création DOM impérative ──────────────────────────────────────────────

    /**
     * Crée et retourne l'élément div.ne-row complet, prêt à être appendé.
     * Les événements sont déjà bindés.
     */
    createElement() {
        const div = document.createElement('div')
        div.className = this._rowClasses()
        div.dataset.orSlider = this._key

        const label = document.createElement('label')
        label.textContent = this._label

        const input = document.createElement('input')
        input.type  = 'range'
        input.min   = this._min
        input.max   = this._max
        input.step  = this._step
        input.value = this._toNorm(this._value)
        input.setAttribute(this._dataAttr, this._key)

        const span = document.createElement('span')
        span.className = 'ne-val'
        span.setAttribute(this._dataAttr, this._key)
        span.textContent = this._fmt(this._value)

        div.appendChild(label)
        div.appendChild(input)
        div.appendChild(span)

        this.el       = div
        this._input   = input
        this._valSpan = span

        this._bind()
        return div
    }

    // ─── Event binding ────────────────────────────────────────────────────────

    _bind() {
        this._input.addEventListener('input',   this._boundOnInput)
        this._input.addEventListener('keydown', this._boundOnKeydown)
    }

    _onInput() {
        const norm    = parseFloat(this._input.value)
        const denorm  = this._toDenorm(norm)
        this._value   = denorm
        this._valSpan.textContent = this._fmt(denorm)
        this._onChange?.(denorm, this._key)
    }

    /**
     * Contrôle clavier enrichi sur l'input range :
     *   Arrow Up/Right        → +step
     *   Arrow Down/Left       → -step
     *   Shift + Arrow         → ±step × 10  (grands sauts)
     *   Alt/Option + Arrow    → ±step ÷ 10  (réglage fin)
     */
    _onKeydown(e) {
        const isUp   = e.key === 'ArrowUp'   || e.key === 'ArrowRight'
        const isDown = e.key === 'ArrowDown' || e.key === 'ArrowLeft'
        if (!isUp && !isDown) return

        e.preventDefault()

        let multiplier = 1
        if (e.shiftKey) multiplier = 10
        if (e.altKey)   multiplier = 0.1

        const delta    = (isUp ? 1 : -1) * this._step * multiplier
        const norm     = parseFloat(this._input.value)
        const newNorm  = Math.min(this._max, Math.max(this._min, norm + delta))
        const denorm   = this._toDenorm(newNorm)

        this._input.value         = newNorm
        this._value               = denorm
        this._valSpan.textContent = this._fmt(denorm)
        this._onChange?.(denorm, this._key)
    }

    // ─── API publique ─────────────────────────────────────────────────────────

    /**
     * Met à jour le slider et l'affichage.
     * @param {number} val  Valeur dénormalisée
     */
    setValue(val) {
        this._value = val
        if (this._input)   this._input.value         = this._toNorm(val)
        if (this._valSpan) this._valSpan.textContent = this._fmt(val)
    }

    /** Retourne la valeur courante dénormalisée */
    getValue() {
        return this._value
    }

    /**
     * Active ou désactive l'indicateur LFO (classe CSS has-lfo).
     * @param {boolean} bool
     */
    setHasLfo(bool) {
        this._hasLfo = bool
        this.el?.classList.toggle('has-lfo', bool)
    }

    /**
     * Active ou désactive le contrôle.
     * @param {boolean} bool
     */
    setDisabled(bool) {
        if (this._input) this._input.disabled = bool
    }

    /** Retire les event listeners. Appeler avant de supprimer l'élément du DOM. */
    destroy() {
        this._input?.removeEventListener('input',   this._boundOnInput)
        this._input?.removeEventListener('keydown', this._boundOnKeydown)
        this.el       = null
        this._input   = null
        this._valSpan = null
    }

    // ─── Utilitaires ─────────────────────────────────────────────────────────

    _escHtml(str) {
        const d = document.createElement('div')
        d.textContent = str
        return d.innerHTML
    }
}
