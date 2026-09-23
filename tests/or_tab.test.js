/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { OrTab } from '../src/ui/components/or_tab.js'

const defaultTabs = [
    { id: 'drum', label: 'Drums' },
    { id: 'fx', label: 'FX' },
    { id: 'snd', label: 'Sound' },
]

describe('OrTab', () => {
    describe('constructor', () => {
        it('sets default tabs from options', () => {
            const tab = new OrTab({ tabs: defaultTabs })
            expect(tab.tabs).toEqual(defaultTabs)
        })

        it('defaults activeTab to first tab id when defaultTab is omitted', () => {
            const tab = new OrTab({ tabs: defaultTabs })
            expect(tab.active).toBe('drum')
        })

        it('uses defaultTab when provided', () => {
            const tab = new OrTab({ tabs: defaultTabs, defaultTab: 'fx' })
            expect(tab.active).toBe('fx')
        })

        it('stores onChange callback', () => {
            const cb = vi.fn()
            const tab = new OrTab({ tabs: defaultTabs, onChange: cb })
            tab.setActive('fx')
            expect(cb).toHaveBeenCalledWith('fx')
        })

        it('accepts css overrides', () => {
            const tab = new OrTab({
                tabs: defaultTabs,
                css: { bar: 'my-bar', btn: 'my-btn' },
            })
            const html = tab.renderBar()
            expect(html).toContain('class="my-bar"')
            expect(html).toContain('class="my-btn"')
        })

        it('handles empty options', () => {
            const tab = new OrTab()
            expect(tab.tabs).toEqual([])
            expect(tab.active).toBe('')
        })

        it('handles tabs array with no entries gracefully', () => {
            const tab = new OrTab({ tabs: [] })
            expect(tab.active).toBe('')
        })
    })

    describe('setActive', () => {
        it('changes the active tab', () => {
            const tab = new OrTab({ tabs: defaultTabs })
            tab.setActive('fx')
            expect(tab.active).toBe('fx')
        })

        it('calls onChange when tab changes', () => {
            const cb = vi.fn()
            const tab = new OrTab({ tabs: defaultTabs, onChange: cb })
            tab.setActive('snd')
            expect(cb).toHaveBeenCalledWith('snd')
        })

        it('does nothing when setting same tab', () => {
            const cb = vi.fn()
            const tab = new OrTab({ tabs: defaultTabs, defaultTab: 'drum', onChange: cb })
            tab.setActive('drum')
            expect(cb).not.toHaveBeenCalled()
            expect(tab.active).toBe('drum')
        })

        it('does not throw when onChange is not provided', () => {
            const tab = new OrTab({ tabs: defaultTabs })
            expect(() => tab.setActive('fx')).not.toThrow()
        })

        it('can switch tabs multiple times', () => {
            const tab = new OrTab({ tabs: defaultTabs })
            tab.setActive('fx')
            tab.setActive('snd')
            tab.setActive('drum')
            expect(tab.active).toBe('drum')
        })
    })

    describe('isHidden', () => {
        it('returns true for inactive tab', () => {
            const tab = new OrTab({ tabs: defaultTabs, defaultTab: 'drum' })
            expect(tab.isHidden('fx')).toBe(true)
        })

        it('returns false for active tab', () => {
            const tab = new OrTab({ tabs: defaultTabs, defaultTab: 'drum' })
            expect(tab.isHidden('drum')).toBe(false)
        })

        it('returns true for nonexistent tab', () => {
            const tab = new OrTab({ tabs: defaultTabs, defaultTab: 'drum' })
            expect(tab.isHidden('nope')).toBe(true)
        })

        it('reflects changes after setActive', () => {
            const tab = new OrTab({ tabs: defaultTabs, defaultTab: 'drum' })
            expect(tab.isHidden('fx')).toBe(true)
            tab.setActive('fx')
            expect(tab.isHidden('fx')).toBe(false)
        })
    })

    describe('renderBar', () => {
        it('renders a div with the bar class', () => {
            const tab = new OrTab({ tabs: defaultTabs })
            const html = tab.renderBar()
            expect(html).toMatch(/^<div class="ne-tab-bar">/)
            expect(html).toMatch(/<\/div>$/)
        })

        it('renders a button for each tab', () => {
            const tab = new OrTab({ tabs: defaultTabs })
            const html = tab.renderBar()
            expect(html).toContain('<button')
            const matches = html.match(/<button/g)
            expect(matches).toHaveLength(3)
        })

        it('marks active tab button with active class', () => {
            const tab = new OrTab({ tabs: defaultTabs, defaultTab: 'fx' })
            const html = tab.renderBar()
            expect(html).toContain('class="ne-tab-btn active" data-ne-tab="fx"')
        })

        it('does not add active class to non-active tabs', () => {
            const tab = new OrTab({ tabs: defaultTabs, defaultTab: 'fx' })
            const html = tab.renderBar()
            expect(html).toContain('class="ne-tab-btn" data-ne-tab="drum"')
            expect(html).toContain('class="ne-tab-btn" data-ne-tab="snd"')
        })

        it('includes correct data attribute for each button', () => {
            const tab = new OrTab({ tabs: defaultTabs })
            const html = tab.renderBar()
            expect(html).toContain('data-ne-tab="drum"')
            expect(html).toContain('data-ne-tab="fx"')
            expect(html).toContain('data-ne-tab="snd"')
        })

        it('includes escaped label text', () => {
            const tabs = [
                { id: 'a', label: 'Hello' },
                { id: 'b', label: 'World' },
            ]
            const tab = new OrTab({ tabs })
            const html = tab.renderBar()
            expect(html).toContain('>Hello<')
            expect(html).toContain('>World<')
        })

        it('escapes ampersands in tab id via escapeAttr', () => {
            const tabs = [{ id: 'a&b', label: 'X' }]
            const tab = new OrTab({ tabs })
            const html = tab.renderBar()
            expect(html).toContain('data-ne-tab="a&amp;b"')
        })

        it('escapes double quotes in tab id via escapeAttr', () => {
            const tabs = [{ id: 'a"b', label: 'X' }]
            const tab = new OrTab({ tabs })
            const html = tab.renderBar()
            expect(html).toContain('data-ne-tab="a&quot;b"')
        })

        it('uses custom CSS classes from css option', () => {
            const tab = new OrTab({
                tabs: defaultTabs,
                css: { bar: 'custom-bar', btn: 'custom-btn', dataAttr: 'custom-tab' },
            })
            const html = tab.renderBar()
            expect(html).toContain('class="custom-bar"')
            expect(html).toContain('class="custom-btn"')
            expect(html).toContain('data-custom-tab="drum"')
        })
    })

    describe('createElement', () => {
        it('returns an HTMLElement', () => {
            const tab = new OrTab({ tabs: defaultTabs })
            const el = tab.createElement()
            expect(el).toBeInstanceOf(HTMLElement)
        })

        it('creates a div with bar class', () => {
            const tab = new OrTab({ tabs: defaultTabs })
            const el = tab.createElement()
            expect(el.tagName).toBe('DIV')
            expect(el.className).toBe('ne-tab-bar')
        })

        it('creates correct number of button children', () => {
            const tab = new OrTab({ tabs: defaultTabs })
            const el = tab.createElement()
            expect(el.children.length).toBe(3)
        })

        it('creates buttons with correct class names', () => {
            const tab = new OrTab({ tabs: defaultTabs, defaultTab: 'fx' })
            const el = tab.createElement()
            const btns = [...el.children]
            expect(btns[0].className).toBe('ne-tab-btn')
            expect(btns[1].className).toBe('ne-tab-btn active')
            expect(btns[2].className).toBe('ne-tab-btn')
        })

        it('sets data attributes on buttons using camelCase key', () => {
            const tab = new OrTab({ tabs: defaultTabs })
            const el = tab.createElement()
            const btns = [...el.children]
            expect(btns[0].dataset.neTab).toBe('drum')
            expect(btns[1].dataset.neTab).toBe('fx')
            expect(btns[2].dataset.neTab).toBe('snd')
        })

        it('sets button text content from label', () => {
            const tab = new OrTab({ tabs: defaultTabs })
            const el = tab.createElement()
            const btns = [...el.children]
            expect(btns[0].textContent).toBe('Drums')
            expect(btns[1].textContent).toBe('FX')
            expect(btns[2].textContent).toBe('Sound')
        })

        it('calls setActive when a button is clicked', () => {
            const tab = new OrTab({ tabs: defaultTabs, defaultTab: 'drum' })
            const el = tab.createElement()
            const btns = [...el.children]
            btns[1].click()
            expect(tab.active).toBe('fx')
        })

        it('calls onChange when a button is clicked via DOM event', () => {
            const cb = vi.fn()
            const tab = new OrTab({ tabs: defaultTabs, defaultTab: 'drum', onChange: cb })
            const el = tab.createElement()
            const btns = [...el.children]
            btns[2].click()
            expect(cb).toHaveBeenCalledWith('snd')
        })

        it('does not change active tab when clicking same tab', () => {
            const cb = vi.fn()
            const tab = new OrTab({ tabs: defaultTabs, defaultTab: 'drum', onChange: cb })
            const el = tab.createElement()
            const btns = [...el.children]
            btns[0].click()
            expect(tab.active).toBe('drum')
            expect(cb).not.toHaveBeenCalled()
        })

        it('ignores clicks on non-button children', () => {
            const tab = new OrTab({ tabs: defaultTabs, defaultTab: 'drum' })
            const el = tab.createElement()
            el.click()
            expect(tab.active).toBe('drum')
        })

        it('uses custom dataAttr from css option', () => {
            const tab = new OrTab({
                tabs: defaultTabs,
                css: { dataAttr: 'my-tab' },
            })
            const el = tab.createElement()
            const btns = [...el.children]
            expect(btns[0].dataset.myTab).toBe('drum')
        })

        it('converts kebab-case dataAttr to camelCase for dataset', () => {
            const tab = new OrTab({
                tabs: defaultTabs,
                css: { dataAttr: 'fx-tab' },
            })
            const el = tab.createElement()
            const btns = [...el.children]
            expect(btns[0].dataset.fxTab).toBe('drum')
        })
    })

    describe('bindTo', () => {
        let container

        beforeEach(() => {
            container = document.createElement('div')
        })

        it('binds click handler to bar element found in root', () => {
            container.innerHTML =
                '<div class="ne-tab-bar"><button class="ne-tab-btn" data-ne-tab="drum">D</button><button class="ne-tab-btn" data-ne-tab="fx">F</button></div>'
            const tab = new OrTab({ tabs: defaultTabs, defaultTab: 'drum' })
            tab.bindTo(container)
            const btn = container.querySelector('[data-ne-tab="fx"]')
            btn.click()
            expect(tab.active).toBe('fx')
        })

        it('calls onChange after binding', () => {
            const cb = vi.fn()
            container.innerHTML =
                '<div class="ne-tab-bar"><button class="ne-tab-btn" data-ne-tab="drum">D</button><button class="ne-tab-btn" data-ne-tab="fx">F</button></div>'
            const tab = new OrTab({ tabs: defaultTabs, defaultTab: 'drum', onChange: cb })
            tab.bindTo(container)
            container.querySelector('[data-ne-tab="fx"]').click()
            expect(cb).toHaveBeenCalledWith('fx')
        })

        it('sets orTabBound guard on the bar element', () => {
            container.innerHTML = '<div class="ne-tab-bar"></div>'
            const tab = new OrTab({ tabs: defaultTabs })
            tab.bindTo(container)
            expect(container.querySelector('.ne-tab-bar').dataset.orTabBound).toBe('1')
        })

        it('does not double-bind when called twice', () => {
            container.innerHTML =
                '<div class="ne-tab-bar"><button class="ne-tab-btn" data-ne-tab="drum">D</button><button class="ne-tab-btn" data-ne-tab="fx">F</button></div>'
            const tab = new OrTab({ tabs: defaultTabs, defaultTab: 'drum' })
            tab.bindTo(container)
            tab.bindTo(container)
            container.querySelector('[data-ne-tab="fx"]').click()
            expect(tab.active).toBe('fx')
        })

        it('binds to root if root itself has the bar class', () => {
            container.className = 'ne-tab-bar'
            container.innerHTML =
                '<button class="ne-tab-btn" data-ne-tab="drum">D</button><button class="ne-tab-btn" data-ne-tab="fx">F</button>'
            const tab = new OrTab({ tabs: defaultTabs, defaultTab: 'drum' })
            tab.bindTo(container)
            container.querySelector('[data-ne-tab="fx"]').click()
            expect(tab.active).toBe('fx')
        })

        it('falls back to any descendant .ne-tab-bar if not direct child', () => {
            container.innerHTML =
                '<div><div class="ne-tab-bar"><button class="ne-tab-btn" data-ne-tab="drum">D</button><button class="ne-tab-btn" data-ne-tab="fx">F</button></div></div>'
            const tab = new OrTab({ tabs: defaultTabs, defaultTab: 'drum' })
            tab.bindTo(container)
            container.querySelector('[data-ne-tab="fx"]').click()
            expect(tab.active).toBe('fx')
        })

        it('returns without binding if no bar element found', () => {
            container.innerHTML = '<div class="other"></div>'
            const tab = new OrTab({ tabs: defaultTabs, defaultTab: 'drum' })
            expect(() => tab.bindTo(container)).not.toThrow()
        })

        it('ignores clicks on non-button elements inside bar', () => {
            container.innerHTML = '<div class="ne-tab-bar"><span>text</span></div>'
            const tab = new OrTab({ tabs: defaultTabs, defaultTab: 'drum' })
            tab.bindTo(container)
            container.querySelector('.ne-tab-bar span').click()
            expect(tab.active).toBe('drum')
        })

        it('uses custom dataAttr from css option', () => {
            container.innerHTML = '<div class="ne-tab-bar"><button class="ne-tab-btn" data-my-tab="fx">F</button></div>'
            const tab = new OrTab({
                tabs: defaultTabs,
                defaultTab: 'drum',
                css: { dataAttr: 'my-tab' },
            })
            tab.bindTo(container)
            container.querySelector('[data-my-tab]').click()
            expect(tab.active).toBe('fx')
        })
    })

    describe('togglePanels', () => {
        let container

        beforeEach(() => {
            container = document.createElement('div')
        })

        it('hides panels that do not match active tab', () => {
            container.innerHTML = `
        <div class="ne-tab-panel" data-tab-panel="drum"></div>
        <div class="ne-tab-panel" data-tab-panel="fx"></div>
        <div class="ne-tab-panel" data-tab-panel="snd"></div>
      `
            const tab = new OrTab({ tabs: defaultTabs, defaultTab: 'drum' })
            tab.togglePanels(container)
            const panels = container.querySelectorAll('.ne-tab-panel')
            expect(panels[0].classList.contains('ne-tab-panel-hidden')).toBe(false)
            expect(panels[1].classList.contains('ne-tab-panel-hidden')).toBe(true)
            expect(panels[2].classList.contains('ne-tab-panel-hidden')).toBe(true)
        })

        it('shows the panel matching active tab', () => {
            container.innerHTML = `
        <div class="ne-tab-panel" data-tab-panel="drum"></div>
        <div class="ne-tab-panel" data-tab-panel="fx"></div>
      `
            const tab = new OrTab({ tabs: defaultTabs, defaultTab: 'fx' })
            tab.togglePanels(container)
            const panels = container.querySelectorAll('.ne-tab-panel')
            expect(panels[0].classList.contains('ne-tab-panel-hidden')).toBe(true)
            expect(panels[1].classList.contains('ne-tab-panel-hidden')).toBe(false)
        })

        it('updates visibility after setActive changes', () => {
            container.innerHTML = `
        <div class="ne-tab-panel" data-tab-panel="drum"></div>
        <div class="ne-tab-panel" data-tab-panel="fx"></div>
      `
            const tab = new OrTab({ tabs: defaultTabs, defaultTab: 'drum' })
            tab.togglePanels(container)
            tab.setActive('fx')
            tab.togglePanels(container)
            const panels = container.querySelectorAll('.ne-tab-panel')
            expect(panels[0].classList.contains('ne-tab-panel-hidden')).toBe(true)
            expect(panels[1].classList.contains('ne-tab-panel-hidden')).toBe(false)
        })

        it('toggles hidden class off for active panel that was previously hidden', () => {
            container.innerHTML = `
        <div class="ne-tab-panel ne-tab-panel-hidden" data-tab-panel="drum"></div>
        <div class="ne-tab-panel" data-tab-panel="fx"></div>
      `
            const tab = new OrTab({ tabs: defaultTabs, defaultTab: 'drum' })
            tab.togglePanels(container)
            const panels = container.querySelectorAll('.ne-tab-panel')
            expect(panels[0].classList.contains('ne-tab-panel-hidden')).toBe(false)
            expect(panels[1].classList.contains('ne-tab-panel-hidden')).toBe(true)
        })

        it('uses custom css classes from options', () => {
            container.innerHTML = `
        <div class="my-panel" data-my-panel="drum"></div>
        <div class="my-panel" data-my-panel="fx"></div>
      `
            const tab = new OrTab({
                tabs: defaultTabs,
                defaultTab: 'fx',
                css: { panel: 'my-panel', hidden: 'my-hidden', panelData: 'my-panel' },
            })
            tab.togglePanels(container)
            const panels = container.querySelectorAll('.my-panel')
            expect(panels[0].classList.contains('my-hidden')).toBe(true)
            expect(panels[1].classList.contains('my-hidden')).toBe(false)
        })

        it('handles no panels in container', () => {
            container.innerHTML = '<div>nothing</div>'
            const tab = new OrTab({ tabs: defaultTabs, defaultTab: 'drum' })
            expect(() => tab.togglePanels(container)).not.toThrow()
        })

        it('converts kebab-case panelData to camelCase for dataset', () => {
            container.innerHTML = `
        <div class="ne-tab-panel" data-fx-panel="drum"></div>
        <div class="ne-tab-panel" data-fx-panel="fx"></div>
      `
            const tab = new OrTab({
                tabs: defaultTabs,
                defaultTab: 'fx',
                css: { panelData: 'fx-panel' },
            })
            tab.togglePanels(container)
            const panels = container.querySelectorAll('.ne-tab-panel')
            expect(panels[0].classList.contains('ne-tab-panel-hidden')).toBe(true)
            expect(panels[1].classList.contains('ne-tab-panel-hidden')).toBe(false)
        })
    })

    describe('#toCamel (tested indirectly via createElement/bindTo)', () => {
        it('converts multi-hyphen kebab-case dataAttr to camelCase dataset keys', () => {
            const tab = new OrTab({
                tabs: [{ id: 'a', label: 'A' }],
                css: { dataAttr: 'fx-panel-tab' },
            })
            const el = tab.createElement()
            const btn = el.querySelector('button')
            expect(btn.dataset.fxPanelTab).toBe('a')
        })

        it('works with single hyphen kebab-case dataAttr', () => {
            const tab = new OrTab({
                tabs: [{ id: 'a', label: 'A' }],
                css: { dataAttr: 'ne-tab' },
            })
            const el = tab.createElement()
            const btn = el.querySelector('button')
            expect(btn.dataset.neTab).toBe('a')
        })

        it('works with single word (no hyphen) dataAttr', () => {
            const tab = new OrTab({
                tabs: [{ id: 'x', label: 'X' }],
                css: { dataAttr: 'tab' },
            })
            const el = tab.createElement()
            const btn = el.querySelector('button')
            expect(btn.dataset.tab).toBe('x')
        })
    })
})
