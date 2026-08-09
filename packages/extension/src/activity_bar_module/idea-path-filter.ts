/**
 * Path filter + search seed helpers for wildcard reference traversal.
 * rq:["../../../../reqlan rq/language/imports.rq".wildcard_references_webview]
 * rq:["../../../../reqlan rq/language/imports.rq".idea_path_filter]
 */
import { globToRegExp } from '@reqlan/language';

export function matchesIdeaPathFilter(
    relativePath: string,
    fileUri: string,
    pathFilter: string
): boolean {
    const filter = normalize(pathFilter);
    if (!filter) {
        return true;
    }
    const haystacks = [
        normalize(relativePath),
        normalize(fileUri),
        normalize(fileUri.replace(/^file:\/\//i, ''))
    ].filter(Boolean);

    if (!/[*?]/.test(filter)) {
        const needle = stripDotSegments(filter);
        return haystacks.some(hay => hay.includes(needle) || hay.endsWith(needle));
    }

    const patterns = [
        globToRegExp(filter, 'path'),
        globToRegExp(filter.startsWith('**/') ? filter : `**/${stripDotSegments(filter)}`, 'path')
    ];
    return haystacks.some(hay => patterns.some(pattern => pattern.test(hay)));
}

/** Soften glob meta for fuzzy search query while keeping distinctive tokens. */
export function globPatternToSearchQuery(ideaPattern: string): string {
    return ideaPattern
        .replace(/[*?]+/g, ' ')
        .replace(/[_\s-]+/g, ' ')
        .trim()
        || ideaPattern;
}

/** Pure seed payload for activity-bar search from a wildcard reference. */
export function wildcardSearchSeed(args: { pathPattern: string; ideaPattern: string }): {
    query: string;
    pathFilter: string;
} {
    return {
        query: globPatternToSearchQuery(args.ideaPattern),
        pathFilter: args.pathPattern
    };
}

function normalize(path: string): string {
    return path.replace(/\\/g, '/');
}

function stripDotSegments(path: string): string {
    return path
        .split('/')
        .filter(segment => segment !== '.' && segment !== '..')
        .join('/');
}
