/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import SongPanel from '../src/ui/song_panel.js'
import { appState } from '../src/state/app_state.js'
import { serviceRegistry } from '../src/state/service_registry.js'
import { playbackEvents } from '../src/state/playback_events.js'

describe('SongPanel', () => {
    let panel

    beforeEach(() => {
        document.body.innerHTML = ''
        appState.reset()
        serviceRegistry.reset()
        serviceRegistry.cmd = {
            setSelectedPatternNum: vi.fn(),
            renamePattern: vi.fn(),
            removePattern: vi.fn(),
            resetPage: vi.fn(() => {
                appState.currentPage = 0
            }),
        }
        appState.patterns = [
            { name: 'Pattern 1', tracks: [{ name: 'KICK', notes: [] }] },
            { name: 'Pattern 2', tracks: [{ name: 'SNARE', notes: [] }] },
        ]
        appState.selectedPatternNum = 0
        appState.songInfos = { name: 'Test Song', date: '2024-01-01', description: 'desc' }

        panel = new SongPanel()
        panel.createDOM()
        document.body.appendChild(panel.container)
    })

    it('creates DOM with correct elements', () => {
        expect(panel.container.querySelector('#sg-list')).not.toBeNull()
        expect(panel.container.querySelector('#sg-song-name')).not.toBeNull()
        expect(panel.container.querySelector('#sg-song-date')).not.toBeNull()
        expect(panel.container.querySelector('#sg-song-desc')).not.toBeNull()
    })

    it('sync renders pattern list and metadata', () => {
        panel.sync()

        const items = panel.container.querySelectorAll('.sg-item')
        expect(items.length).toBe(2)

        expect(panel.container.querySelector('#sg-song-name').textContent).toBe('Test Song')
        expect(panel.container.querySelector('#sg-song-date').textContent).toBe('2024-01-01')
    })

    it('sync highlights the selected pattern', () => {
        panel.sync()
        const items = panel.container.querySelectorAll('.sg-item')
        expect(items[0].classList.contains('sg-selected')).toBe(true)
        expect(items[1].classList.contains('sg-selected')).toBe(false)
    })

    it('clicking a pattern selects it', () => {
        panel.sync()
        const items = panel.container.querySelectorAll('.sg-item')
        items[1].click()

        expect(serviceRegistry.cmd.setSelectedPatternNum).toHaveBeenCalledWith(1)
    })

    it('rename button triggers inline rename on selected pattern', () => {
        panel.sync()
        const renameBtn = panel.container.querySelector('#sg-rename')
        renameBtn.click()

        const input = panel.container.querySelector('.sg-rename-input')
        expect(input).not.toBeNull()
        expect(input.value).toBe('Pattern 1')
    })

    it('renaming commits new name on blur', async () => {
        panel.sync()
        const items = panel.container.querySelectorAll('.sg-item')
        const nameEl = items[0].querySelector('.sg-name')
        nameEl.dispatchEvent(new Event('dblclick', { bubbles: true }))

        const input = panel.container.querySelector('.sg-rename-input')
        input.value = 'New Name'
        input.dispatchEvent(new Event('blur'))

        expect(serviceRegistry.cmd.renamePattern).toHaveBeenCalledWith(0, 'New Name')
    })

    it('rename cancels on Escape', async () => {
        panel.sync()
        const items = panel.container.querySelectorAll('.sg-item')
        const nameEl = items[0].querySelector('.sg-name')
        nameEl.dispatchEvent(new Event('dblclick', { bubbles: true }))

        const input = panel.container.querySelector('.sg-rename-input')
        input.value = 'Should Not Save'
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))

        expect(serviceRegistry.cmd.renamePattern).not.toHaveBeenCalled()
    })

    it('delete button removes selected pattern', () => {
        vi.spyOn(window, 'confirm').mockReturnValue(true)
        panel.sync()
        const deleteBtn = panel.container.querySelector('#sg-delete')
        deleteBtn.click()

        expect(serviceRegistry.cmd.removePattern).toHaveBeenCalledWith(0)
    })

    it('delete button does nothing when no pattern selected', () => {
        appState.selectedPatternNum = null
        panel.sync()
        const deleteBtn = panel.container.querySelector('#sg-delete')
        deleteBtn.click()

        expect(serviceRegistry.cmd.removePattern).not.toHaveBeenCalled()
    })

    it('shows "No patterns" when patterns list is empty', () => {
        appState.patterns = []
        panel.sync()
        const empty = panel.container.querySelector('.pp-empty')
        expect(empty).not.toBeNull()
        expect(empty.textContent).toBe('No patterns')
    })

    it('sync updates song description', () => {
        panel.sync()
        const descEl = panel.container.querySelector('#sg-song-desc')
        expect(descEl.textContent).toBe('desc')
    })

    it('dblclick on song name triggers rename input', () => {
        panel.sync()
        const nameEl = panel.container.querySelector('#sg-song-name')
        nameEl.dispatchEvent(new Event('dblclick', { bubbles: true }))

        const input = panel.container.querySelector('.sg-rename-input')
        expect(input).not.toBeNull()
        expect(input.value).toBe('Test Song')
    })

    it('song rename commits on blur', () => {
        panel.sync()
        const nameEl = panel.container.querySelector('#sg-song-name')
        nameEl.dispatchEvent(new Event('dblclick', { bubbles: true }))

        const input = panel.container.querySelector('.sg-rename-input')
        input.value = 'Renamed Song'
        input.dispatchEvent(new Event('blur'))

        expect(appState.songInfos.name).toBe('Renamed Song')
    })

    it('subscribe listens for patternStructureChange', () => {
        panel.subscribe()
        panel.show()
        const syncSpy = vi.spyOn(panel, 'sync')
        playbackEvents.emit('patternStructureChange')
        expect(syncSpy).toHaveBeenCalled()
    })
})
