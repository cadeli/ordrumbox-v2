/**
 * Count common alphanumeric words between two strings (case-insensitive).
 * Used for fuzzy filename → instrument matching.
 */
export function countCommonWords(s1, s2) {
    if (!s1 || !s2) return 0
    const getWords = (s) =>
        new Set(
            s
                .toUpperCase()
                .split(/[^a-zA-Z0-9]+/)
                .filter((w) => w.length > 0),
        )
    const words1 = getWords(s1)
    const words2 = getWords(s2)
    let common = 0
    for (const word of words1) {
        if (words2.has(word)) common++
    }
    return common
}
