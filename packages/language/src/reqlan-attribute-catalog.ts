/**
 * Endorsed attribute keys and workspace-wide attribute value catalog for completion.
 */

/** Common attributes from reqlan rq/language/syntax.rq attribute_forms. */
export const ENDORSED_ATTRIBUTE_KEYS = [
    'plan',
    'status',
    'priority',
    'criticality',
    'confirmation',
    'owner',
    'log',
    'tags',
    'references',
    'refs',
    'required',
    'deprecated',
    'tests'
] as const;

export interface AttributeCatalog {
    keys: string[];
    valuesByKey: Record<string, string[]>;
}

export class AttributeCatalogStore {
    private catalog: AttributeCatalog = {
        keys: [...ENDORSED_ATTRIBUTE_KEYS],
        valuesByKey: {}
    };

    get(): AttributeCatalog {
        return this.catalog;
    }

    update(catalog: AttributeCatalog): void {
        this.catalog = mergeAttributeCatalogs(this.catalog, catalog);
    }

    reset(): void {
        this.catalog = {
            keys: [...ENDORSED_ATTRIBUTE_KEYS],
            valuesByKey: {}
        };
    }

    mergeWorkspaceKeys(keys: Iterable<string>, valuesByKey: Record<string, Iterable<string>>): void {
        const mergedKeys = new Set<string>([...ENDORSED_ATTRIBUTE_KEYS, ...this.catalog.keys]);
        for (const key of keys) {
            mergedKeys.add(key);
        }
        const mergedValues: Record<string, string[]> = { ...this.catalog.valuesByKey };
        for (const [key, values] of Object.entries(valuesByKey)) {
            mergedKeys.add(key);
            const existing = new Set(mergedValues[key] ?? []);
            for (const value of values) {
                if (value) {
                    existing.add(value);
                }
            }
            mergedValues[key] = [...existing].sort((left, right) => left.localeCompare(right));
        }
        this.catalog = {
            keys: [...mergedKeys].sort((left, right) => left.localeCompare(right)),
            valuesByKey: mergedValues
        };
    }
}

export const REQLAN_ATTRIBUTE_CATALOG_NOTIFICATION = 'reqlan/attributeCatalog';

export const sharedAttributeCatalog = new AttributeCatalogStore();

export function mergeAttributeCatalogs(...catalogs: AttributeCatalog[]): AttributeCatalog {
    const keys = new Set<string>(ENDORSED_ATTRIBUTE_KEYS);
    const valuesByKey = new Map<string, Set<string>>();
    for (const catalog of catalogs) {
        for (const key of catalog.keys) {
            keys.add(key);
        }
        for (const [key, values] of Object.entries(catalog.valuesByKey)) {
            keys.add(key);
            if (!valuesByKey.has(key)) {
                valuesByKey.set(key, new Set());
            }
            for (const value of values) {
                if (value) {
                    valuesByKey.get(key)!.add(value);
                }
            }
        }
    }
    return {
        keys: [...keys].sort((left, right) => left.localeCompare(right)),
        valuesByKey: Object.fromEntries(
            [...valuesByKey.entries()].map(([key, values]) => [key, [...values].sort()])
        )
    };
}
