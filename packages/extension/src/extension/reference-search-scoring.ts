/**
 * Fuzzy/partial scoring for reference search results.
 * rq:["../../../../reqlan rq/extension/features-commands.rq".search_code_actions]
 */
import type { IdeaSummary } from '@reqlan/analytical';

export interface SearchHit {
    name: string;
    kind: IdeaSummary['kind'];
    fileUri: string;
    summary: string;
    score: number;
}

export function filterAndScoreIdeas(ideas: IdeaSummary[], query: string): SearchHit[] {
    const needle = query.trim().toLowerCase();
    const scored: SearchHit[] = [];
    for (const idea of ideas) {
        if (idea.kind === 'ideaset') {
            continue;
        }
        const score = needle ? scoreIdeaMatch(idea, needle) : 1;
        if (score <= 0) {
            continue;
        }
        scored.push({
            name: idea.name,
            kind: idea.kind,
            fileUri: idea.fileUri,
            summary: idea.summary,
            score
        });
    }
    return scored.sort(
        (left, right) =>
            right.score - left.score
            || left.name.localeCompare(right.name)
            || left.fileUri.localeCompare(right.fileUri)
    );
}

function scoreIdeaMatch(idea: IdeaSummary, needle: string): number {
    const name = idea.name.toLowerCase();
    const summary = idea.summary.toLowerCase();
    let score = 0;
    if (name === needle) {
        score = 100;
    } else if (name.startsWith(needle)) {
        score = 80;
    } else if (name.includes(needle)) {
        score = 50;
    } else if (fuzzySubsequence(name, needle)) {
        score = 30;
    }
    if (summary.includes(needle)) {
        score = Math.max(score, 20) + 5;
    }
    for (const tag of idea.tags) {
        if (tag.toLowerCase().includes(needle)) {
            score = Math.max(score, 15) + 2;
        }
    }
    return score;
}

/** True when needle characters appear in order inside hay (simple fuzzy). */
function fuzzySubsequence(hay: string, needle: string): boolean {
    let index = 0;
    for (const char of hay) {
        if (char === needle[index]) {
            index += 1;
            if (index >= needle.length) {
                return true;
            }
        }
    }
    return false;
}
