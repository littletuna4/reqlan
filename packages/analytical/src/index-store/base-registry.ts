/**
 * Multi-base index registry: one WorkspaceIndex per base. The index lifecycle
 * state now lives in the native runtime, not a per-base Zustand store.
 */
import {
    baseForPath,
    basesFromMarkerPaths,
    discoverBases,
    filesOwnedByBase,
    isBaseMarkerPresent,
    selectDefaultBase,
    type BaseDescriptor
} from '../core/base-discovery.js';
import { resolveApplicationMemoryPath } from '../core/application-memory.js';
import { loadNativeEngine } from '../native/load-native.js';
import type { IndexStatusSnapshot } from './index-status.js';
import { WorkspaceIndex } from './workspace-index.js';

export interface RegisteredBase {
    descriptor: BaseDescriptor;
    index: WorkspaceIndex;
}

export interface BaseStatusEntry {
    base: BaseDescriptor;
    status: IndexStatusSnapshot;
}

/**
 * Result of a bases refresh pass ({@link BaseRegistry.refreshBases}) or full
 * tree rediscover ({@link BaseRegistry.rediscover}).
 */
export interface BaseRegistryRefreshResult {
    bases: BaseDescriptor[];
    activeId: string | undefined;
    synced: boolean;
}

export class BaseRegistry {
    private readonly entries = new Map<string, RegisteredBase>();

    get size(): number {
        return this.entries.size;
    }

    list(): BaseDescriptor[] {
        return [...this.entries.values()]
            .map(e => e.descriptor)
            .sort((a, b) => a.root.localeCompare(b.root));
    }

    get(baseId: string): RegisteredBase | undefined {
        return this.entries.get(baseId);
    }

    getByRoot(root: string): RegisteredBase | undefined {
        for (const entry of this.entries.values()) {
            if (entry.descriptor.root === root || entry.descriptor.id === root) {
                return entry;
            }
        }
        return undefined;
    }

    baseForFilePath(absPath: string): RegisteredBase | undefined {
        const match = baseForPath(this.list(), absPath);
        return match ? this.entries.get(match.id) : undefined;
    }

    /** Replace registry contents from discovered descriptors (does not open indexes). */
    replaceDescriptors(bases: BaseDescriptor[]): void {
        loadNativeEngine();
        const keep = new Set(bases.map(b => b.id));
        for (const id of [...this.entries.keys()]) {
            if (!keep.has(id)) {
                const entry = this.entries.get(id);
                void entry?.index.deactivate();
                this.entries.delete(id);
            }
        }
        for (const descriptor of bases) {
            if (this.entries.has(descriptor.id)) {
                continue;
            }
            const storagePath = resolveApplicationMemoryPath(descriptor.root);
            const index = new WorkspaceIndex(storagePath, descriptor.root);
            this.entries.set(descriptor.id, { descriptor, index });
        }
    }

    /**
     * Discover bases under `roots` via a full tree walk and register them.
     * Prefer {@link refreshBases} in the editor host (marker paths from `findFiles`).
     * Returns the discovered descriptors (may be empty).
     */
    rediscover(roots: string[]): BaseDescriptor[] {
        const bases = discoverBases(roots);
        this.replaceDescriptors(bases);
        return bases;
    }

    /**
     * Drop registered bases whose `.reqlan` marker is gone (cheap O(known) probe).
     * rq:["../../../../reqlan rq/bases/base.rq".refresh_bases_pass]
     */
    pruneMissingBases(): BaseDescriptor[] {
        for (const id of [...this.entries.keys()]) {
            const entry = this.entries.get(id);
            if (!entry) {
                continue;
            }
            if (!isBaseMarkerPresent(entry.descriptor.root)) {
                void entry.index.deactivate();
                this.entries.delete(id);
            }
        }
        return this.list();
    }

    /**
     * Bases refresh: prune missing markers, then merge descriptors built from
     * host-supplied `.reqlan` marker paths. Does **not** walk the workspace tree.
     * Optional soft-sync of the preferred / default active base when `allRqFiles`
     * is provided and `syncActive` is not false.
     * rq:["../../../../reqlan rq/bases/base.rq".refresh_bases_pass]
     */
    async refreshBases(
        markerPaths: readonly string[],
        options?: {
            preferredActiveId?: string;
            cwd?: string;
            labelRoot?: string;
            allRqFiles?: string[];
            /** Soft-sync preferred/default active after merge (default true when allRqFiles set). */
            syncActive?: boolean;
        }
    ): Promise<BaseRegistryRefreshResult> {
        this.pruneMissingBases();
        const fromMarkers = basesFromMarkerPaths(markerPaths, options?.labelRoot);
        const byId = new Map<string, BaseDescriptor>();
        for (const descriptor of this.list()) {
            byId.set(descriptor.id, descriptor);
        }
        for (const descriptor of fromMarkers) {
            byId.set(descriptor.id, descriptor);
        }
        this.replaceDescriptors([...byId.values()]);
        return this.finishRefresh(options);
    }

    /**
     * Full-tree rediscover then optional active soft-sync.
     * Headless / tests without a host `findFiles` may use this; the editor host
     * uses {@link refreshBases} instead.
     * rq:["../../../../reqlan rq/bases/base.rq".refresh_bases_pass]
     */
    async refresh(
        roots: string[],
        options?: {
            preferredActiveId?: string;
            cwd?: string;
            allRqFiles?: string[];
            syncActive?: boolean;
        }
    ): Promise<BaseRegistryRefreshResult> {
        this.rediscover(roots);
        return this.finishRefresh(options);
    }

    private async finishRefresh(options?: {
        preferredActiveId?: string;
        cwd?: string;
        allRqFiles?: string[];
        syncActive?: boolean;
    }): Promise<BaseRegistryRefreshResult> {
        const bases = this.list();
        if (bases.length === 0) {
            return { bases, activeId: undefined, synced: false };
        }

        const preferred = options?.preferredActiveId;
        const preferredStillPresent = preferred ? this.entries.has(preferred) : false;
        const selected =
            (preferredStillPresent ? preferred : undefined) ??
            selectDefaultBase(bases, options?.cwd)?.id;
        const activeId = selected ?? bases[0]?.id;

        let synced = false;
        if (options?.syncActive !== false && activeId && options?.allRqFiles) {
            synced = await this.ensureBaseReady(activeId, options.allRqFiles);
        }

        return { bases, activeId, synced };
    }

    /**
     * Open every registered index. Failures are isolated so one bad base cannot
     * leave siblings stranded in `uninitialized`.
     */
    async activateAll(): Promise<void> {
        for (const entry of this.entries.values()) {
            try {
                await entry.index.open();
            } catch {
                // Per-base store already recorded the open error.
            }
        }
    }

    /**
     * Open + soft-sync one base when it is not ready (pin / idle catch-up).
     * Joins an in-flight sync; no-op when already ready.
     */
    async ensureBaseReady(baseId: string, allRqFiles: string[]): Promise<boolean> {
        const entry = this.entries.get(baseId);
        if (!entry) {
            return false;
        }
        const owned = filesOwnedByBase(entry.descriptor, allRqFiles, this.list());
        return entry.index.ensureReady(owned);
    }

    async deactivateAll(): Promise<void> {
        for (const entry of this.entries.values()) {
            await entry.index.deactivate();
        }
        this.entries.clear();
    }

    /**
     * Close every open SQLite handle while keeping base descriptors registered.
     * The next ensureBaseReady / open event can reopen the same entries.
     * rq:["../../../../reqlan rq/extension/sqlite-artifact-lifecycle.rq".release_when_idle]
     */
    async releaseArtifacts(): Promise<void> {
        for (const entry of this.entries.values()) {
            await entry.index.deactivate();
        }
    }

    async syncBase(baseId: string, allRqFiles: string[]): Promise<boolean> {
        const entry = this.entries.get(baseId);
        if (!entry) {
            return false;
        }
        const owned = filesOwnedByBase(entry.descriptor, allRqFiles, this.list());
        return entry.index.syncWorkspace(owned);
    }

    async syncAll(allRqFiles: string[]): Promise<boolean> {
        let ok = true;
        for (const entry of this.entries.values()) {
            const result = await this.syncBase(entry.descriptor.id, allRqFiles);
            if (!result) {
                ok = false;
            }
        }
        return ok;
    }

    async clearAndRebuildBase(baseId: string, allRqFiles: string[]): Promise<boolean> {
        const entry = this.entries.get(baseId);
        if (!entry) {
            return false;
        }
        const owned = filesOwnedByBase(entry.descriptor, allRqFiles, this.list());
        return entry.index.clearAndRebuildIndex(owned);
    }

    cancelSync(baseId?: string): void {
        if (baseId) {
            this.entries.get(baseId)?.index.cancelSync();
            return;
        }
        for (const entry of this.entries.values()) {
            entry.index.cancelSync();
        }
    }

    async checkStaleAll(allRqFiles: string[]): Promise<{ checked: number; indexed: number; removed: number }> {
        let checked = 0;
        let indexed = 0;
        let removed = 0;
        for (const entry of this.entries.values()) {
            const owned = filesOwnedByBase(entry.descriptor, allRqFiles, this.list());
            // Unopened / never-synced bases cannot idle-diff — catch them up first.
            if (!entry.index.isReady && entry.index.state !== 'syncing' && entry.index.state !== 'opening') {
                const ok = await entry.index.ensureReady(owned);
                if (ok) {
                    checked += owned.length;
                    indexed += owned.length;
                }
                continue;
            }
            const result = await entry.index.checkStaleFiles(owned);
            checked += result.checked;
            indexed += result.indexed;
            removed += result.removed;
        }
        return { checked, indexed, removed };
    }

    statusByBase(relativePath?: (uri: string) => string): BaseStatusEntry[] {
        return this.list().map(base => {
            const entry = this.entries.get(base.id)!;
            return {
                base,
                status: entry.index.getStatusSnapshot(relativePath)
            };
        });
    }

    /** Aggregate glance: ready only if every base is ready (or no bases). */
    aggregateReady(): boolean {
        if (this.entries.size === 0) {
            return false;
        }
        for (const entry of this.entries.values()) {
            if (!entry.index.isReady) {
                return false;
            }
        }
        return true;
    }

    selectDefault(cwd?: string): RegisteredBase | undefined {
        const desc = selectDefaultBase(this.list(), cwd);
        return desc ? this.entries.get(desc.id) : undefined;
    }

    subscribeCatalogUpdates(listener: () => void): () => void {
        const unsubs = [...this.entries.values()].map(e => e.index.subscribeCatalogUpdates(listener));
        return () => {
            for (const u of unsubs) {
                u();
            }
        };
    }

    subscribeStatusUpdates(listener: () => void): () => void {
        const unsubs = [...this.entries.values()].map(e => e.index.subscribeStatusUpdates(listener));
        return () => {
            for (const u of unsubs) {
                u();
            }
        };
    }
}
