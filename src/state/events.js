// src/state/events.js
// Centralised event name constants — no more magic strings on playbackEvents.

export const EVENT = Object.freeze({
    TRACK_SELECT:        'trackSelect',
    TRACK_PARAM_CHANGE:  'trackParamChange',
    PATTERN_CHANGE:      'patternChange',
    DRUMKIT_CHANGE:      'drumkitChange',
    DRUMKIT_NAME_CHANGE: 'drumkitNameChange',
    PLAYBACK_START:      'playbackStart',
    PLAYBACK_STOP:       'playbackStop',
    LOOP_POINT_CHANGE:   'loopPointChange',
    GEN_TOGGLE:          'genToggle',
    VARIATION_CHANGE:    'variationChange',
    GEN_PRESET_CHANGE:   'genPresetChange',
    NOTE_TRIGGER:        'noteTrigger',
    NOTE_SELECT:         'noteSelect',
})
