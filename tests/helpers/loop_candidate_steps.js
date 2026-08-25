/**
 * Finds candidate loop step lengths for a given track step count.
 * @param {number} trackSteps
 * @param {number} [minLoopSteps=1]
 * @returns {number[]}
 */
export function getLoopCandidateSteps(trackSteps, minLoopSteps = 1) {
    const candidates = []
    for (let loopAtStep = minLoopSteps; loopAtStep < trackSteps; loopAtStep++) {
        if (trackSteps % loopAtStep === 0) {
            candidates.push(loopAtStep)
        }
    }
    return candidates
}
