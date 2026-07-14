/**
 * Compact name index pushed from the extension host for unresolved-reference quick fixes.
 * rq:["../../../reqlan rq/extension/language-support/features-imports.rq".import_error]
 */

export type NameCatalogKind = 'idea' | 'oneliner' | 'ideaset' | 'file';

export interface NameCatalogEntry {
    name: string;
    kind: NameCatalogKind;
    fileUri: string;
}

export interface NameCatalog {
    entries: NameCatalogEntry[];
}

export class NameCatalogStore {
    private catalog: NameCatalog = { entries: [] };

    get(): NameCatalog {
        return this.catalog;
    }

    update(catalog: NameCatalog): void {
        this.catalog = {
            entries: catalog.entries.map(entry => ({ ...entry }))
        };
    }

    reset(): void {
        this.catalog = { entries: [] };
    }

    findExact(name: string): NameCatalogEntry[] {
        return this.catalog.entries.filter(entry => entry.name === name);
    }

    findMatching(query: string, limit = 25): NameCatalogEntry[] {
        const needle = query.trim().toLowerCase();
        if (!needle) {
            return [];
        }
        const scored = this.catalog.entries
            .map(entry => ({ entry, score: scoreNameMatch(entry.name, needle) }))
            .filter(item => item.score > 0)
            .sort((left, right) => right.score - left.score || left.entry.name.localeCompare(right.entry.name));
        const seen = new Set<string>();
        const results: NameCatalogEntry[] = [];
        for (const item of scored) {
            const key = `${item.entry.kind}:${item.entry.fileUri}:${item.entry.name}`;
            if (seen.has(key)) {
                continue;
            }
            seen.add(key);
            results.push(item.entry);
            if (results.length >= limit) {
                break;
            }
        }
        return results;
    }
}

export const REQLAN_NAME_CATALOG_NOTIFICATION = 'reqlan/nameCatalog';

export const sharedNameCatalog = new NameCatalogStore();

function scoreNameMatch(name: string, needle: string): number {
    const hay = name.toLowerCase();
    if (hay === needle) {
        return 100;
    }
    if (hay.startsWith(needle)) {
        return 80;
    }
    if (hay.includes(needle)) {
        return 50;
    }
    return 0;
}
