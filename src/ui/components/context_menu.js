// src/ui/components/context_menu.js
// Shared context menu, used by the pattern panel, the piano roll and the song
// view (hence the neutral `cm-` class prefix).
// Builds a menu on document.body, clamped to the viewport, dismissed by
// outside click / right-click / Escape (capture phase).

export default class ContextMenu {
    #el = null
    #unbindDismiss = null

    /** True while a menu is open. */
    get isOpen() {
        return this.#el !== null
    }

    /**
     * Open the menu (replaces any open one).
     * @param {string} headerText  Header line (e.g. "KICK @ 1.1")
     * @param {Array<{label: string, disabled?: boolean, run: () => void}>} actions
     * @param {number} x  Client X position
     * @param {number} y  Client Y position
     */
    show(headerText, actions, x, y) {
        this.hide()
        const menu = document.createElement('div')
        menu.className = 'cm-menu'
        menu.setAttribute('role', 'menu')
        menu.style.left = `${x}px`
        menu.style.top = `${y}px`

        const header = document.createElement('div')
        header.className = 'cm-menu-header'
        header.textContent = headerText
        menu.appendChild(header)

        const sep = document.createElement('div')
        sep.className = 'cm-menu-sep'
        menu.appendChild(sep)

        for (const item of actions) {
            const btn = document.createElement('button')
            btn.type = 'button'
            btn.className = 'cm-menu-item'
            btn.setAttribute('role', 'menuitem')
            btn.textContent = item.label
            if (item.disabled) {
                btn.disabled = true
                btn.setAttribute('aria-disabled', 'true')
            } else {
                btn.addEventListener('click', () => {
                    this.hide()
                    item.run()
                })
            }
            menu.appendChild(btn)
        }

        document.body.appendChild(menu)
        this.#el = menu
        this.#clamp()
        this.#bindDismiss()
    }

    /** Close the menu (no-op when none is open). */
    hide() {
        if (this.#unbindDismiss) {
            this.#unbindDismiss()
            this.#unbindDismiss = null
        }
        if (this.#el) {
            this.#el.remove()
            this.#el = null
        }
    }

    #clamp() {
        const rect = this.#el.getBoundingClientRect()
        const maxLeft = Math.max(0, window.innerWidth - rect.width - 4)
        const maxTop = Math.max(0, window.innerHeight - rect.height - 4)
        const left = Math.min(parseFloat(this.#el.style.left) || 0, maxLeft)
        const top = Math.min(parseFloat(this.#el.style.top) || 0, maxTop)
        this.#el.style.left = `${left}px`
        this.#el.style.top = `${top}px`
    }

    #bindDismiss() {
        const dismiss = (e) => {
            if (this.#el && !this.#el.contains(e.target)) this.hide()
        }
        const onKey = (e) => {
            if (e.key === 'Escape') this.hide()
        }
        document.addEventListener('click', dismiss, true)
        document.addEventListener('contextmenu', dismiss, true)
        document.addEventListener('keydown', onKey, true)
        this.#unbindDismiss = () => {
            document.removeEventListener('click', dismiss, true)
            document.removeEventListener('contextmenu', dismiss, true)
            document.removeEventListener('keydown', onKey, true)
        }
    }
}
