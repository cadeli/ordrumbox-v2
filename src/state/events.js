// src/state/events.js
// Centralised event name constants — no more magic strings on playbackEvents.
// NOTE: EVENT constants are DEAD CODE - not used in production. Kept for documentation only.
// If needed in future, re-add and import from this module.

export const EVENT = Object.freeze({
    TRACK_SELECT:            'trackSelect',
    TRACK_PARAM_CHANGE:      'trackParamChange',
    NOTE_CHANGE:             'noteChange',
    PATTERN_CHANGE:          'patternChange',
    PATTERN_STRUCTURE_CHANGE:'patternStructureChange',
    PATTERN_META_CHANGE:     'patternMetaChange',
    DRUMKIT_CHANGE:          'drumkitChange',
    DRUMKIT_NAME_CHANGE:     'drumkitNameChange',
    PLAYBACK_START:          'playbackStart',
    PLAYBACK_STOP:           'playbackStop',
    LOOP_POINT_CHANGE:       'loopPointChange',
    GEN_TOGGLE:              'genToggle',
    VARIATION_CHANGE:        'variationChange',
    GEN_PRESET_CHANGE:       'genPresetChange',
    NOTE_TRIGGER:            'noteTrigger',
    NOTE_SELECT:             'noteSelect',
})
