/**
 * Lazy coverage metrics for Ideas Summary Overview.
 *
 * rq:["../../../reqlan rq/extension/module/ideas_summary/webview.rq".overview_coverage_scores]
 */
import { open, readdir, readFile, stat } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import { isSecretRqPath } from '../export/secret-rq.js';
import { resolveReferencedFilePath } from '../core/file-reference-resolve.js';
import {
    isIgnoredPath,
    loadRqIgnore,
    type RqIgnoreFilter
} from '../core/rqignore.js';
import { toWorkspaceRelativePath } from '../core/workspace-paths.js';
import type { SqliteIndexStore } from './sqlite-store.js';

const LOC_FILE_BYTE_CAP = 2 * 1024 * 1024;
const LOC_TOTAL_BYTE_CAP = 64 * 1024 * 1024;
const WALK_YIELD_EVERY = 64;
const LOC_YIELD_EVERY = 16;

export interface OverviewCoverageScores {
    ideaCount: number;
    rqFileCount: number;
    eligibleNonRqFileCount: number;
    referencedEligibleFileCount: number;
    /** 0–100; null when there are no eligible non-.rq files. */
    fileCoveragePct: number | null;
    distinctFileReferenceCount: number;
    totalLoc: number;
    /** Ideas per 1000 LOC; null when LOC is 0. */
    ideasPerKLoc: number | null;
    /** True when LOC counting hit size caps (totals are lower bounds). */
    locTruncated: boolean;
    calculatedAt: number;
}

export interface ComputeOverviewCoverageOptions {
    baseRoot: string;
    store: SqliteIndexStore;
    /** Optional abort check — return true to stop early. */
    shouldCancel?: () => boolean;
}

interface WalkResult {
    rqFiles: string[];
    eligibleNonRqFiles: string[];
}

function toPosixRelative(baseRoot: string, absPath: string): string {
    const rel = relative(resolve(baseRoot), resolve(absPath));
    if (!rel || rel === '.') {
        return '';
    }
    return rel.split(sep).join('/');
}

function normalizeRelPath(path: string): string {
    return path.replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '');
}

function yieldEventLoop(): Promise<void> {
    return new Promise(resolveYield => setImmediate(resolveYield));
}

async function walkEligibleFiles(
    baseRoot: string,
    filter: RqIgnoreFilter,
    shouldCancel?: () => boolean
): Promise<WalkResult> {
    const rqFiles: string[] = [];
    const eligibleNonRqFiles: string[] = [];
    let visited = 0;

    async function walk(directory: string): Promise<void> {
        if (shouldCancel?.()) {
            return;
        }
        let entries;
        try {
            entries = await readdir(directory, { withFileTypes: true });
        } catch {
            return;
        }
        for (const entry of entries) {
            if (shouldCancel?.()) {
                return;
            }
            visited += 1;
            if (visited % WALK_YIELD_EVERY === 0) {
                await yieldEventLoop();
            }
            const fullPath = join(directory, entry.name);
            if (entry.isDirectory()) {
                if (isIgnoredPath(filter, baseRoot, fullPath, true)) {
                    continue;
                }
                await walk(fullPath);
                continue;
            }
            if (!entry.isFile() || isIgnoredPath(filter, baseRoot, fullPath, false)) {
                continue;
            }
            const rel = toPosixRelative(baseRoot, fullPath);
            if (!rel) {
                continue;
            }
            if (entry.name.endsWith('.rq')) {
                if (!isSecretRqPath(entry.name)) {
                    rqFiles.push(rel);
                }
                continue;
            }
            eligibleNonRqFiles.push(rel);
        }
    }

    await walk(resolve(baseRoot));
    return { rqFiles, eligibleNonRqFiles };
}

async function listResolvedFileReferences(
    store: SqliteIndexStore,
    baseRoot: string
): Promise<Set<string>> {
    const rows = await store.listFileReferenceTargets();
    const resolved = new Set<string>();
    for (const row of rows) {
        const target = row.targetFile.trim();
        if (!target) {
            continue;
        }
        const joined = resolveReferencedFilePath(target, row.sourceId);
        const relativePath = toWorkspaceRelativePath(joined, baseRoot);
        const normalized = normalizeRelPath(relativePath);
        if (!normalized || normalized.includes('://') || normalized.startsWith('../')) {
            continue;
        }
        resolved.add(normalized);
    }
    return resolved;
}

function countCoveredEligibleFiles(
    eligible: readonly string[],
    referenced: ReadonlySet<string>
): number {
    if (eligible.length === 0 || referenced.size === 0) {
        return 0;
    }
    const eligibleSet = new Set(eligible);
    const covered = new Set<string>();
    for (const path of eligible) {
        if (referenced.has(path)) {
            covered.add(path);
        }
    }
    for (const ref of referenced) {
        if (eligibleSet.has(ref)) {
            continue;
        }
        const prefix = `${ref}/`;
        for (const path of eligible) {
            if (path.startsWith(prefix)) {
                covered.add(path);
            }
        }
    }
    return covered.size;
}

async function looksBinary(absPath: string): Promise<boolean> {
    try {
        const handle = await open(absPath, 'r');
        try {
            const buffer = Buffer.alloc(4096);
            const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
            for (let i = 0; i < bytesRead; i += 1) {
                if (buffer[i] === 0) {
                    return true;
                }
            }
            return false;
        } finally {
            await handle.close();
        }
    } catch {
        return true;
    }
}

function countLines(text: string): number {
    if (!text) {
        return 0;
    }
    let lines = 1;
    for (let i = 0; i < text.length; i += 1) {
        if (text.charCodeAt(i) === 10) {
            lines += 1;
        }
    }
    if (text.endsWith('\n')) {
        lines -= 1;
    }
    return Math.max(lines, 0);
}

async function countEligibleLoc(
    baseRoot: string,
    eligibleRelPaths: readonly string[],
    shouldCancel?: () => boolean
): Promise<{ totalLoc: number; locTruncated: boolean }> {
    let totalLoc = 0;
    let bytesRead = 0;
    let locTruncated = false;
    let processed = 0;

    for (const rel of eligibleRelPaths) {
        if (shouldCancel?.()) {
            break;
        }
        processed += 1;
        if (processed % LOC_YIELD_EVERY === 0) {
            await yieldEventLoop();
        }
        if (bytesRead >= LOC_TOTAL_BYTE_CAP) {
            locTruncated = true;
            break;
        }
        const absPath = resolve(baseRoot, rel);
        let size = 0;
        try {
            size = (await stat(absPath)).size;
        } catch {
            continue;
        }
        if (size <= 0) {
            continue;
        }
        if (size > LOC_FILE_BYTE_CAP) {
            locTruncated = true;
            continue;
        }
        if (bytesRead + size > LOC_TOTAL_BYTE_CAP) {
            locTruncated = true;
            break;
        }
        if (await looksBinary(absPath)) {
            continue;
        }
        try {
            const text = await readFile(absPath, 'utf8');
            bytesRead += size;
            totalLoc += countLines(text);
        } catch {
            // Unreadable / invalid utf8 — skip.
        }
    }

    return { totalLoc, locTruncated };
}

export async function computeOverviewCoverageScores(
    options: ComputeOverviewCoverageOptions
): Promise<OverviewCoverageScores> {
    const { baseRoot, store, shouldCancel } = options;
    const filter = loadRqIgnore(baseRoot);
    const [{ ideaCount }, walk, referenced] = await Promise.all([
        store.counts().then(counts => ({ ideaCount: counts.ideas })),
        walkEligibleFiles(baseRoot, filter, shouldCancel),
        listResolvedFileReferences(store, baseRoot)
    ]);

    if (shouldCancel?.()) {
        return emptyScores(ideaCount);
    }

    const referencedEligibleFileCount = countCoveredEligibleFiles(
        walk.eligibleNonRqFiles,
        referenced
    );
    const eligibleNonRqFileCount = walk.eligibleNonRqFiles.length;
    const fileCoveragePct = eligibleNonRqFileCount === 0
        ? null
        : Math.round((referencedEligibleFileCount / eligibleNonRqFileCount) * 1000) / 10;

    const { totalLoc, locTruncated } = await countEligibleLoc(
        baseRoot,
        walk.eligibleNonRqFiles,
        shouldCancel
    );

    const ideasPerKLoc = totalLoc <= 0
        ? null
        : Math.round((ideaCount / totalLoc) * 1000 * 100) / 100;

    return {
        ideaCount,
        rqFileCount: walk.rqFiles.length,
        eligibleNonRqFileCount,
        referencedEligibleFileCount,
        fileCoveragePct,
        distinctFileReferenceCount: referenced.size,
        totalLoc,
        ideasPerKLoc,
        locTruncated,
        calculatedAt: Date.now()
    };
}

function emptyScores(ideaCount: number): OverviewCoverageScores {
    return {
        ideaCount,
        rqFileCount: 0,
        eligibleNonRqFileCount: 0,
        referencedEligibleFileCount: 0,
        fileCoveragePct: null,
        distinctFileReferenceCount: 0,
        totalLoc: 0,
        ideasPerKLoc: null,
        locTruncated: false,
        calculatedAt: Date.now()
    };
}
