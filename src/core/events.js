/**
 * Canonical playbackEvents event names.
 * Values are the exact wire strings — do not rename them.
 */
export const EVENTS = Object.freeze({
    // Transport / engine
    PLAYBACK_START: 'playbackStart',
    PLAYBACK_STOP: 'playbackStop',
    BPM_CHANGE: 'bpmChange',
    STALL: 'stall',
    STALL_RESUME: 'stallResume',
    WORKLET_STATUS_CHANGE: 'workletStatusChange',

    // Pattern / data
    PATTERN_CHANGE: 'patternChange',
    PATTERN_STRUCTURE_CHANGE: 'patternStructureChange',
    PATTERN_META_CHANGE: 'patternMetaChange',
    SELECTED_PATTERN_CHANGE: 'selectedPatternChange',
    NOTE_CHANGE: 'noteChange',
    NOTE_SELECT: 'noteSelect',
    NOTE_TRIGGER: 'noteTrigger',
    TRACK_SELECT: 'trackSelect',
    TRACK_PARAM_CHANGE: 'trackParamChange',
    LOOP_POINT_CHANGE: 'loopPointChange',
    HISTORY_CHANGE: 'historyChange',
    DRUMKIT_CHANGE: 'drumkitChange',

    // View / panel toggles
    EDIT_TOGGLE: 'editToggle',
    SYNTH_TOGGLE: 'synthToggle',
    PROLL_TOGGLE: 'prollToggle',
    TOOLS_TOGGLE: 'toolsToggle',
    MASTER_TOGGLE: 'masterToggle',
    ABOUT_TOGGLE: 'aboutToggle',
    SONG_TOGGLE: 'songToggle',
    DRUMKIT_MANAGER_TOGGLE: 'drumkitManagerToggle',
    PATTERN_SETTINGS_TOGGLE: 'patternSettingsToggle',
    MOBILE_SEQ_TOGGLE: 'mobileSeqToggle',
    MOBILE_TRACK_TOGGLE: 'mobileTrackToggle',
})

/** Maps appState.currentView (incl. 'output' alias) to its toggle event. */
export const VIEW_TOGGLE = Object.freeze({
    synth: EVENTS.SYNTH_TOGGLE,
    edit: EVENTS.EDIT_TOGGLE,
    proll: EVENTS.PROLL_TOGGLE,
    master: EVENTS.MASTER_TOGGLE,
    output: EVENTS.MASTER_TOGGLE,
})
