/**
 * Build wildcard-matches panel payload from the idea catalog.
 * rq:["../../../../reqlan rq/language/imports.rq".wildcard_references_webview]
 */
import { globToRegExp, type WildcardReferenceArgs } from '@reqlan/language';
import type { IdeaSummary } from '@reqlan/analytical';
import { matchesIdeaPathFilter } from './idea-path-filter.js';

export interface WildcardMatchHit {
    name: string;
    kind: string;
    path: string;
    summary: string;
    status: string;
    fileUri: string;
    lineStart: number;
}

export interface WildcardMatchesStats {
    ideaCount: number;
    fileCount: number;
    pathPattern: string;
    ideaPattern: string;
    statusCounts: Array<{ status: string; count: number }>;
}

export interface WildcardMatchesPayload {
    stats: WildcardMatchesStats;
    ideas: WildcardMatchHit[];
    files: Array<{ path: string; fileUri: string; ideaCount: number }>;
}

export function buildWildcardMatchesPayload(
    args: Pick<WildcardReferenceArgs, 'pathPattern' | 'ideaPattern'>,
    ideas: readonly IdeaSummary[],
    relativePathOf: (fileUri: string) => string
): WildcardMatchesPayload {
    const ideaRegex = globToRegExp(args.ideaPattern, 'name');
    const hits: WildcardMatchHit[] = [];
    for (const idea of ideas) {
        if (!ideaRegex.test(idea.name)) {
            continue;
        }
        const path = relativePathOf(idea.fileUri);
        if (!matchesIdeaPathFilter(path, idea.fileUri, args.pathPattern)) {
            continue;
        }
        hits.push({
            name: idea.name,
            kind: idea.kind,
            path,
            summary: idea.summary ?? '',
            status: idea.status ?? idea.statusKey ?? '',
            fileUri: idea.fileUri,
            lineStart: idea.lineStart
        });
    }
    hits.sort((left, right) => {
        const byPath = left.path.localeCompare(right.path);
        return byPath !== 0 ? byPath : left.name.localeCompare(right.name);
    });

    const fileMap = new Map<string, { path: string; fileUri: string; ideaCount: number }>();
    const statusMap = new Map<string, number>();
    for (const hit of hits) {
        const existing = fileMap.get(hit.fileUri);
        if (existing) {
            existing.ideaCount += 1;
        } else {
            fileMap.set(hit.fileUri, { path: hit.path, fileUri: hit.fileUri, ideaCount: 1 });
        }
        const status = hit.status || '(none)';
        statusMap.set(status, (statusMap.get(status) ?? 0) + 1);
    }

    return {
        stats: {
            ideaCount: hits.length,
            fileCount: fileMap.size,
            pathPattern: args.pathPattern,
            ideaPattern: args.ideaPattern,
            statusCounts: [...statusMap.entries()]
                .map(([status, count]) => ({ status, count }))
                .sort((a, b) => b.count - a.count || a.status.localeCompare(b.status))
        },
        ideas: hits,
        files: [...fileMap.values()].sort((a, b) => a.path.localeCompare(b.path))
    };
}
