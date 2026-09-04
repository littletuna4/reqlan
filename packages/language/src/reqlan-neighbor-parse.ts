/**
 * Depth-1 native parse of a neighbor `.rq` file for outbound idea confirmation.
 * Does not load the neighbor into LangiumDocuments (that starts workspace linking).
 * Does not populate a Langium AST for the neighbor.
 * Does not follow the neighbor's own outbound references.
 * Loaded-buffer lookup is by URI only (no basename fallback).
 * rq:["../../../reqlan rq/extension/language-support/open-file-sequencing.rq".outbound_one_hop]
 * rq:["../../../reqlan rq/extension/language-support/open-file-sequencing.rq".ast_lifecycle]
 * rq:["../../../reqlan rq/extension/language-support/open-file-sequencing.rq".open_file_hot_path]
 * rq:["../../../reqlan rq/language/syntax.rq".open_file_reference_sequencing]
 */
import type { FileSystemProvider, LangiumDocument, LangiumDocuments } from 'langium';
import { URI } from 'langium';
import type { Range } from 'vscode-languageserver';
import { analyzeLocalSymbolic } from '@reqlan/analytical/core';

export interface NeighborIdea {
    readonly name: string;
    readonly lineStart: number;
    readonly lineEnd: number;
}

export interface NeighborParse {
    readonly uri: string;
    readonly contentHash: string;
    readonly ideas: readonly NeighborIdea[];
}

interface NeighborCacheEntry extends NeighborParse {
    readonly fingerprint: string;
}

const cache = new Map<string, NeighborCacheEntry>();
let parseCount = 0;

export function clearNeighborParseCache(): void {
    cache.clear();
    parseCount = 0;
}

export function neighborParseCount(): number {
    return parseCount;
}

export function parseNeighborDocument(
    targetUri: URI,
    documents: LangiumDocuments | undefined,
    fileSystem: FileSystemProvider | undefined
): NeighborParse | undefined {
    const uriKey = targetUri.toString();
    const text = readNeighborText(targetUri, documents, fileSystem);
    if (text === undefined) {
        cache.delete(uriKey);
        return undefined;
    }
    const fingerprint = fingerprintText(text);
    const cached = cache.get(uriKey);
    if (cached && cached.fingerprint === fingerprint) {
        return cached;
    }
    let extracted;
    try {
        extracted = analyzeLocalSymbolic(uriKey, text);
    } catch {
        cache.delete(uriKey);
        return undefined;
    }
    parseCount += 1;
    const parsed: NeighborCacheEntry = {
        uri: uriKey,
        contentHash: extracted.contentHash,
        fingerprint,
        ideas: extracted.ideas.map(idea => ({
            name: idea.name,
            lineStart: idea.lineStart,
            lineEnd: idea.lineEnd
        }))
    };
    cache.set(uriKey, parsed);
    return parsed;
}

export function neighborIdea(parsed: NeighborParse, ideaName: string): NeighborIdea | undefined {
    return parsed.ideas.find(idea => idea.name === ideaName);
}

export function neighborHasIdea(parsed: NeighborParse, ideaName: string): boolean {
    return neighborIdea(parsed, ideaName) !== undefined;
}

export function ideaRangeFromNeighbor(idea: NeighborIdea): Range {
    const lineStart = Math.max(0, idea.lineStart);
    const lineEnd = Math.max(lineStart, idea.lineEnd);
    return {
        start: { line: lineStart, character: 0 },
        end: { line: lineEnd, character: 0 }
    };
}

/**
 * Look up a loaded document by URI only.
 * Do not match on basename — two `lib.rq` files must not share a hit.
 */
export function findLoadedDocument(
    documents: LangiumDocuments | undefined,
    targetUri: string
): LangiumDocument | undefined {
    if (!documents) {
        return undefined;
    }
    for (const candidate of loadedDocumentUriCandidates(targetUri)) {
        const found = documents.getDocument(candidate);
        if (found) {
            return found;
        }
    }
    return undefined;
}

/** URI forms that `LangiumDocuments.getDocument` may have used as the map key. */
export function loadedDocumentUriCandidates(targetUri: string): URI[] {
    const seen = new Set<string>();
    const candidates: URI[] = [];
    const add = (uri: URI): void => {
        const key = uri.toString();
        if (seen.has(key)) {
            return;
        }
        seen.add(key);
        candidates.push(uri);
    };
    try {
        add(URI.parse(targetUri));
    } catch {
        // not a URI string
    }
    const hasScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(targetUri);
    if (!hasScheme) {
        try {
            add(URI.file(targetUri));
        } catch {
            // not a file path
        }
        return candidates;
    }
    try {
        const parsed = URI.parse(targetUri);
        if (parsed.scheme === 'file' && parsed.fsPath.length > 0) {
            add(URI.file(parsed.fsPath));
        }
    } catch {
        // keep parse candidates only
    }
    return candidates;
}

function readNeighborText(
    targetUri: URI,
    documents: LangiumDocuments | undefined,
    fileSystem: FileSystemProvider | undefined
): string | undefined {
    const loaded = findLoadedDocument(documents, targetUri.toString());
    if (loaded) {
        return loaded.textDocument.getText();
    }
    if (!fileSystem) {
        return undefined;
    }
    try {
        if (!fileSystem.existsSync(targetUri)) {
            return undefined;
        }
        if (fileSystem.statSync(targetUri).isDirectory) {
            return undefined;
        }
        return fileSystem.readFileSync(targetUri);
    } catch {
        return undefined;
    }
}

/** FNV-1a plus length so unchanged text skips a second native parse. */
export function fingerprintText(text: string): string {
    let hash = 2166136261;
    for (let index = 0; index < text.length; index++) {
        hash ^= text.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return `${text.length}:${hash >>> 0}`;
}
