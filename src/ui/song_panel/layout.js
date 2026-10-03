// src/ui/song_panel/layout.js
// Geometry of the arrangement grid, in px.
//
// Lives on its own — no DOM, no imports — so the grid renderer, its unit tests and
// the Playwright specs all measure the same numbers instead of each keeping a copy
// that drifts when the layout is retuned.

/** Width of the frozen pattern-name column, in px. */
export const LABEL_WIDTH = 74
/** Width of one measure along X, in px. */
export const BAR_WIDTH = 24
/** Height of one pattern row, in px. */
export const ROW_HEIGHT = 22
/** Height of the bar ruler, in px. */
export const HEADER_HEIGHT = 18
/** Gap a clip leaves to its neighbours, in px (2 = 1px on each side). */
export const CLIP_INSET = 2
