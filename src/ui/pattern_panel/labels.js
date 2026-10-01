// src/ui/pattern_panel/labels.js
// Shared toast label helpers for clipboard and context menu messages.

/** Human readable note count ("1 note" / "3 notes"). */
export function notesLabel(count) {
    return `${count} note${count === 1 ? '' : 's'}`
}

/** Human readable cursor position ("beat 2.3"). */
export function stepLabel(beat, beatStep) {
    return `beat ${beat + 1}.${beatStep + 1}`
}
