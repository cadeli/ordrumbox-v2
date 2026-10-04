/**
 * Fake appState for `vi.mock('../src/state/app_state.js')`.
 *
 * `selectedPattern` is a prototype GETTER on the real AppState: it derives
 * patterns[selectedPatternIdx] on every read. A plain object literal mock has no
 * such getter, so code reading appState.selectedPattern gets undefined and
 * silently takes an early-return path — that is how 6 tests in
 * view_switch.test.js failed when the getter was introduced. Spreading a plain
 * object over a mock does not help either; it must be an accessor.
 *
 * @param {object} [fields] - fields to initialise on the mock
 * @returns {object} mock appState whose selectedPattern follows selectedPatternIdx
 */
export function makeAppStateMock(fields = {}) {
    return {
        patterns: [],
        selectedPatternIdx: 0,
        selectedTrackIdx: 0,
        selectedDrumkitIdx: 0,
        selectedDrumkit: 'real',
        selectedLfo: 'pitchLfo',
        currentPage: 0,
        currentView: 'edit',
        autoMode: false,
        textInput: false,
        secondsPerTick: 0.5,
        flatNotes: null,
        workletStatus: 'unknown',
        showVus: true,
        songInfos: { name: '', description: '', date: '' },
        songs: [],
        ...fields,
        get selectedPattern() {
            return this.patterns[this.selectedPatternIdx]
        },
    }
}
