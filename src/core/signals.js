// src/core/signals.js — minimal reactive signals (~80 lines)
//
// createSignal(initial) → [get, set]
// effect(fn)           → runs fn, auto-re-runs when any signal read inside fn changes
// batch(fn)            → defers effect flush until fn returns

let _currentEffect = null
let _batchDepth = 0
const _pending = new Set()

/**
 * Creates a reactive signal.
 * @param {*} initial
 * @returns {[() => *, (* => *)]} [getter, setter]
 */
export function createSignal(initial) {
    let value = initial
    const deps = new Set()

    const get = () => {
        if (_currentEffect) {
            deps.add(_currentEffect)
            _currentEffect.deps.add(deps)
        }
        return value
    }

    const set = (next) => {
        const v = typeof next === 'function' ? next(value) : next
        if (v === value) return
        value = v
        for (const eff of deps) _pending.add(eff)
        _flush()
    }

    return [get, set]
}

/**
 * Creates an effect that auto-tracks signal dependencies.
 * @param {Function} fn
 * @returns {Function} dispose — call to stop the effect
 */
export function effect(fn) {
    const eff = { fn, deps: new Set(), _clean: null, _run: null }

    eff._run = () => {
        const prev = _currentEffect
        _currentEffect = eff
        if (eff._clean) eff._clean()
        eff._clean = null
        eff.deps.clear()

        try {
            const result = eff.fn()
            if (typeof result === 'function') eff._clean = result
        } finally {
            _currentEffect = prev
        }
    }

    eff._run()

    return () => {
        if (eff._clean) eff._clean()
        eff.fn = null
        for (const dep of eff.deps) dep.delete(eff)
        eff.deps.clear()
        _pending.delete(eff)
    }
}

/** Defers effect execution until the outermost batch() completes. */
export function batch(fn) {
    _batchDepth++
    try { fn() } finally {
        _batchDepth--
        if (_batchDepth === 0) _flush()
    }
}

/** @private */
function _flush() {
    if (_batchDepth > 0) return
    while (_pending.size > 0) {
        const eff = _pending.values().next().value
        _pending.delete(eff)
        if (eff.fn) eff._run()
    }
}
