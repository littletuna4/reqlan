/** Minimal hit shape returned by native fuzzySearch (no JS ranking module). */
export interface FuzzySearchHit {
    id: string;
    name: string;
    kind: string;
    fileUri: string;
    summary: string;
    lineStart: number;
    score: number;
}
