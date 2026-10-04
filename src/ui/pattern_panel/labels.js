// src/ui/pattern_panel/labels.js
// Shared toast label helpers for clipboard and context menu messages.

/** Human readable note count ("1 note" / "3 notes"). */
export function notesLabel(count) {
    return `${count} note${count === 1 ? '' : 's'}`
}

/**
 * Human readable cursor position ("beat 2.3") — a BEAT label: beat 2, step 3.
 * It used to be called stepLabel while returning a beat, which is why call sites
 * in context_menu_section.js re-implemented the same string inline — three were
 * converted, two still build it by hand (the menu header and the add-note toast).
 */
export function beatLabel(beat, beatStep) {
    return `beat ${beat + 1}.${beatStep + 1}`
}
