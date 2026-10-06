/**
 * The audio layer never touches appState directly: the selected pattern index
 * reaches it as an injected resolver, which is what keeps an offline export and
 * the unit tests free of the store (see the note on appState.selectedPattern).
 *
 * Both AudioEngine and Player resolve it here so the injection shape lives in
 * one place instead of being copied per constructor. Every caller passes the
 * getter, so the numeric `selectedPatternIdx` config key is gone: a constructor
 * that forgets the resolver falls back to pattern 0 rather than crashing.
 *
 * @param {{getSelectedPatternIdx?: () => number}} config engine/player config
 * @returns {() => number} the selected pattern index resolver
 */
export function resolveSelectedPatternIdxGetter(config) {
    return config.getSelectedPatternIdx ?? (() => 0)
}
