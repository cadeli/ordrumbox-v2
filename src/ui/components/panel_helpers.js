// Re-export everything from ui_utils.js for backward compatibility.
// New code should import from './ui_utils.js' directly.
export {
    fmt,
    escapeHtml,
    pitchToNoteName,
    formatNoteTooltip,
    promptNumericInput,
    injectUiCss,
    bindCloseButton,
    bindTabToggles,
    setViewBtn,
    setViewMode,
    downloadJson,
    knobFormat,
    renderOptions,
    renderIconChoices,
    setPatternPanelHidden,
} from './ui_utils.js'
