/**
 * Discover reqlan bases: directories that own a `.reqlan` application-memory folder.
 * Nested bases are supported; parent indexing stops at child base boundaries.
 *
 * Walk pruning uses built-in `.rqignore` defaults (and the search root's `.reqlan/.rqignore`
 * when that root is already a base).
 *
 * rq:["../../../reqlan rq/extension/configuration.rq".configuration_rqignore]
 * rq:["../../../reqlan rq/extension/module/index.rq".rqignore]
 */
import { existsSync, readdirSync, statSync } from 'node:fs';
import { basename, join, relative, resolve, sep } from 'node:path';
import { APPLICATION_MEMORY_DIR } from './application-memory.js';
import { isIgnoredPath, loadRqIgnore, type RqIgnoreFilter } from './rqignore.js';

export interface BaseDescriptor {
    /** Stable id: absolute normalized base root (forward slashes). */
    id: string;
    /** Absolute filesystem path of the base root (directory that owns `.reqlan`). */
    root: string;
    /** Absolute path to the base's `.reqlan` directory. */
    memoryPath: string;
    /** Optional label relative to a discovery root (for UI). */
    label: string;
}

function normalizeRoot(path: string): string {
    return resolve(path).replace(/\\/g, '/');
}

/**
 * Recursively find directories under `root` that contain a `.reqlan` child.
 * `root` itself is included when it owns `.reqlan`.
 */
export function discoverBasesUnder(root: string): BaseDescriptor[] {
    const absRoot = resolve(root);
    if (!existsSync(absRoot)) {
        return [];
    }
    const found: string[] = [];
    // Prefer the search root's .rqignore when it is already a base; else built-in defaults.
    const walkFilter: RqIgnoreFilter = loadRqIgnore(absRoot);

    function visit(dir: string): void {
        let entries: string[];
        try {
            entries = readdirSync(dir);
        } catch {
            return;
        }
        if (entries.includes(APPLICATION_MEMORY_DIR)) {
            const marker = join(dir, APPLICATION_MEMORY_DIR);
            try {
                if (statSync(marker).isDirectory()) {
                    found.push(dir);
                }
            } catch {
                // ignore unreadable marker
            }
        }
        for (const name of entries) {
            const child = join(dir, name);
            if (isIgnoredPath(walkFilter, absRoot, child, true)) {
                continue;
            }
            try {
                if (statSync(child).isDirectory()) {
                    visit(child);
                }
            } catch {
                // skip unreadable
            }
        }
    }

    visit(absRoot);

    return found
        .map(baseRoot => toBaseDescriptor(baseRoot, absRoot))
        .sort((a, b) => a.root.localeCompare(b.root));
}

/**
 * Discover bases under one or more workspace / search roots.
 * Deduplicates by absolute base root.
 */
export function discoverBases(roots: string[]): BaseDescriptor[] {
    const byId = new Map<string, BaseDescriptor>();
    for (const root of roots) {
        for (const base of discoverBasesUnder(root)) {
            byId.set(base.id, base);
        }
    }
    return [...byId.values()].sort((a, b) => a.root.localeCompare(b.root));
}

export function toBaseDescriptor(baseRoot: string, labelRoot?: string): BaseDescriptor {
    const root = resolve(baseRoot);
    const id = normalizeRoot(root);
    const memoryPath = join(root, APPLICATION_MEMORY_DIR);
    let label: string;
    if (labelRoot) {
        const rel = relative(resolve(labelRoot), root).replace(/\\/g, '/');
        label = rel === '' ? basename(root) || root : rel;
    } else {
        label = basename(root) || root;
    }
    return { id, root, memoryPath, label };
}

/** Longest-matching base root that contains `absPath`, or undefined. */
export function baseForPath(bases: readonly BaseDescriptor[], absPath: string): BaseDescriptor | undefined {
    const target = resolve(absPath);
    let best: BaseDescriptor | undefined;
    let bestLen = -1;
    for (const base of bases) {
        if (isPathInsideOrEqual(target, base.root)) {
            const len = base.root.length;
            if (len > bestLen) {
                best = base;
                bestLen = len;
            }
        }
    }
    return best;
}

/** True if `filePath` is under `dir` (or equal). */
export function isPathInsideOrEqual(filePath: string, dir: string): boolean {
    const absFile = resolve(filePath);
    const absDir = resolve(dir);
    if (absFile === absDir) {
        return true;
    }
    const prefix = absDir.endsWith(sep) ? absDir : absDir + sep;
    return absFile.startsWith(prefix);
}

/**
 * Child bases of `parent` (strict descendants that are themselves bases).
 */
export function childBasesOf(
    parent: BaseDescriptor,
    allBases: readonly BaseDescriptor[]
): BaseDescriptor[] {
    return allBases.filter(
        b => b.id !== parent.id && isPathInsideOrEqual(b.root, parent.root)
    );
}

/**
 * Filter absolute file paths owned by `base`, excluding nested child bases.
 */
export function filesOwnedByBase(
    base: BaseDescriptor,
    allFiles: readonly string[],
    allBases: readonly BaseDescriptor[]
): string[] {
    const children = childBasesOf(base, allBases);
    return allFiles.filter(file => {
        const abs = resolve(file);
        if (!isPathInsideOrEqual(abs, base.root)) {
            return false;
        }
        for (const child of children) {
            if (isPathInsideOrEqual(abs, child.root)) {
                return false;
            }
        }
        return true;
    });
}

/**
 * Prefer the base containing `cwd`, else the first discovered base.
 * Returns undefined when `bases` is empty.
 */
export function selectDefaultBase(
    bases: readonly BaseDescriptor[],
    cwd?: string
): BaseDescriptor | undefined {
    if (bases.length === 0) {
        return undefined;
    }
    if (cwd) {
        const match = baseForPath(bases, cwd);
        if (match) {
            return match;
        }
    }
    return bases[0];
}

/** Ensure path uses forward slashes for stable ids. */
export function stableBaseId(root: string): string {
    return normalizeRoot(root);
}
