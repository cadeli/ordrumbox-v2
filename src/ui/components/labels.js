// src/ui/components/labels.js
// Shared toast label helpers: clipboard, context menu and piano roll messages.

/** Human readable note count ("1 note" / "3 notes"). */
export function notesLabel(count) {
    return `${count} note${count === 1 ? '' : 's'}`
}

/**
 * Human readable cursor position ("beat 2.3") — a BEAT label: beat 2, step 3.
 */
export function beatLabel(beat, beatStep) {
    return `beat ${beat + 1}.${beatStep + 1}`
}
