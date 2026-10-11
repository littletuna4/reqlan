/**
 * One native directory walk. File bodies are not read here.
 * rq:["../../../../reqlan rq/indexer/cache-reuse.rq".single_sync_walk]
 * rq:["../../../../reqlan rq/indexer/sequencing.rq".scan_limits]
 */
import { clampScanLimits, type ScanLimits } from '../core/scan-limits.js';
import { loadNativeEngine } from './load-native.js';

export interface WorkspaceScan {
    bases: string[];
    rqFiles: string[];
    codeFiles: string[];
    truncated: boolean;
    truncationReason?: 'maxDepth' | 'maxEntries' | null;
}

interface NativeScanModule {
    scanWorkspace(
        roots: string[],
        maxDepth: number,
        maxEntries: number,
        stopAtChildBases: boolean
    ): Promise<string>;
}

export async function scanWorkspace(
    roots: string[],
    limits: ScanLimits,
    stopAtChildBases: boolean
): Promise<WorkspaceScan> {
    const engine = loadNativeEngine() as Partial<NativeScanModule>;
    if (typeof engine.scanWorkspace !== 'function') {
        throw new Error('scanWorkspace is missing from the native engine; rebuild reqlan-napi.');
    }
    const clamped = clampScanLimits(limits.maxDepth, limits.maxEntries);
    const raw = await engine.scanWorkspace(
        roots,
        clamped.maxDepth,
        clamped.maxEntries,
        stopAtChildBases
    );
    const parsed = JSON.parse(raw) as WorkspaceScan;
    return {
        bases: parsed.bases ?? [],
        rqFiles: parsed.rqFiles ?? [],
        codeFiles: parsed.codeFiles ?? [],
        truncated: parsed.truncated === true,
        truncationReason: parsed.truncationReason ?? null
    };
}
