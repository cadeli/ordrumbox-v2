// src/ui/select_dropdown.js
//
// Themed replacement for the OS-drawn <select> popup. The native control stays
// in the DOM (and stays programmable: .value, selectOption(), input/change
// events) — only the popup list is ours, so every dropdown matches the shell.
//
// Pointer handling: canceling pointerdown/mousedown on a <select> stops the
// native popup from opening; focus is restored manually.

const POPUP_CLASS = 'od-select-popup'
const OPTION_CLASS = 'od-select-option'
const GROUP_CLASS = 'od-select-group'
const MARGIN = 8
const MAX_HEIGHT = 264

let bound = false
let popup = null
let currentSelect = null
/** @type {HTMLOptionElement[]} */
let optionRefs = []
let activeIndex = -1

/** Install the global delegated handlers. Safe to call more than once. */
export function initSelectDropdown() {
    if (bound || typeof document === 'undefined') return
    bound = true
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('mousedown', suppressNativePopup, true)
    document.addEventListener('keydown', onKeyDown, true)
    document.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', close)
}

/** Cancel the native popup (compatibility path — pointerdown may already do it). */
function suppressNativePopup(e) {
    const t = e.target
    if (t instanceof Element && t.closest('select')) e.preventDefault()
}

function onPointerDown(e) {
    const t = e.target
    if (!(t instanceof Element)) return

    const optEl = t.closest(`.${OPTION_CLASS}`)
    if (optEl && popup?.contains(optEl)) {
        e.preventDefault()
        e.stopPropagation()
        const opt = optionRefs[Number(/** @type {HTMLElement} */ (optEl).dataset.index)]
        if (opt && !opt.disabled) commit(opt)
        return
    }

    const select = t.closest('select')
    if (select instanceof HTMLSelectElement) {
        if (select.disabled || select.multiple) return
        e.preventDefault()
        if (currentSelect === select) {
            // preventDefault() kills the native focus transfer — restore it so
            // the keyboard keeps driving this select, without scrolling (our
            // own scroll listener would close the popup right away).
            select.focus({ preventScroll: true })
            close()
            return
        }
        close()
        open(select)
        select.focus({ preventScroll: true })
        return
    }

    close()
}

function onKeyDown(e) {
    const t = e.target
    if (!(t instanceof HTMLSelectElement)) {
        if (popup && e.key === 'Escape') close()
        return
    }
    if (t.disabled || t.multiple) return

    if (popup && currentSelect === t) {
        switch (e.key) {
            case 'Escape':
                e.preventDefault()
                close()
                t.focus({ preventScroll: true })
                return
            case 'ArrowDown':
                e.preventDefault()
                moveActive(1)
                return
            case 'ArrowUp':
                e.preventDefault()
                moveActive(-1)
                return
            case 'Home':
                e.preventDefault()
                setActive(nearestSelectable(0, 1))
                return
            case 'End':
                e.preventDefault()
                setActive(nearestSelectable(optionRefs.length - 1, -1))
                return
            case 'Enter':
            case ' ':
                e.preventDefault()
                if (activeIndex >= 0) commit(optionRefs[activeIndex])
                return
            default:
                return
        }
    }

    if (
        e.key === 'Enter' ||
        e.key === ' ' ||
        e.key === 'ArrowDown' ||
        e.key === 'ArrowUp' ||
        (e.altKey && e.key === 'ArrowDown')
    ) {
        e.preventDefault()
        close()
        open(t)
        t.focus({ preventScroll: true })
    }
}

function onScroll(e) {
    if (!popup) return
    const target = e.target
    if (target instanceof Node && popup.contains(target)) return
    close()
}

function open(select) {
    close()
    const el = document.createElement('div')
    el.className = POPUP_CLASS
    el.setAttribute('role', 'listbox')
    const label = select.getAttribute('aria-label') || select.title
    if (label) el.setAttribute('aria-label', label)

    optionRefs = []
    let lastGroup = null
    for (const opt of select.options) {
        const group = opt.parentElement instanceof HTMLOptGroupElement ? opt.parentElement : null
        if (group && group !== lastGroup) {
            const head = document.createElement('div')
            head.className = GROUP_CLASS
            head.textContent = group.label
            el.appendChild(head)
            lastGroup = group
        }
        const row = document.createElement('div')
        row.className = OPTION_CLASS
        row.textContent = opt.label || opt.text
        row.setAttribute('role', 'option')
        row.dataset.index = String(optionRefs.length)
        if (opt.disabled) {
            row.classList.add('is-disabled')
            row.setAttribute('aria-disabled', 'true')
        }
        if (opt.selected) {
            row.classList.add('is-selected')
            row.setAttribute('aria-selected', 'true')
        }
        el.appendChild(row)
        optionRefs.push(opt)
    }

    popup = el
    currentSelect = select
    document.body.appendChild(el)

    const rect = select.getBoundingClientRect()
    el.style.minWidth = `${Math.ceil(rect.width)}px`
    el.style.maxHeight = `${MAX_HEIGHT}px`

    const ph = el.offsetHeight
    let top = rect.bottom + 4
    if (top + ph > window.innerHeight - MARGIN && rect.top - ph - 4 >= MARGIN) {
        top = rect.top - ph - 4
    }
    let left = rect.left
    if (left + el.offsetWidth > window.innerWidth - MARGIN) {
        left = Math.max(MARGIN, window.innerWidth - el.offsetWidth - MARGIN)
    }
    el.style.top = `${Math.max(MARGIN, Math.round(top))}px`
    el.style.left = `${Math.max(MARGIN, Math.round(left))}px`

    setActive(optionRefs.findIndex((o) => o.selected))
}

function close() {
    popup?.remove()
    popup = null
    currentSelect = null
    optionRefs = []
    activeIndex = -1
}

function commit(opt) {
    const select = currentSelect
    if (!select) {
        close()
        return
    }
    if (select.value !== opt.value) {
        select.value = opt.value
        select.dispatchEvent(new Event('input', { bubbles: true }))
        select.dispatchEvent(new Event('change', { bubbles: true }))
    }
    close()
    select.focus({ preventScroll: true })
}

function moveActive(step) {
    const next = nearestSelectable(activeIndex + step, step)
    if (next >= 0) setActive(next)
}

function nearestSelectable(from, step) {
    for (let i = from; i >= 0 && i < optionRefs.length; i += step) {
        if (!optionRefs[i].disabled) return i
    }
    return -1
}

function setActive(index) {
    activeIndex = index
    if (!popup) return
    const rows = popup.querySelectorAll(`.${OPTION_CLASS}`)
    rows.forEach((row, i) => row.classList.toggle('is-active', i === index))
    const row = rows[index]
    if (!row) return
    // Manual scroll (no scrollIntoView: it would scroll the page and it is
    // unimplemented in jsdom).
    const pr = popup.getBoundingClientRect()
    const rr = row.getBoundingClientRect()
    if (rr.bottom > pr.bottom) popup.scrollTop += rr.bottom - pr.bottom
    else if (rr.top < pr.top) popup.scrollTop -= pr.top - rr.top
}
