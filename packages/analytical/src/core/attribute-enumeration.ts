/**
 * Attribute enumeration utilities.
 * rq:["../../../../reqlan rq/extension/workspace-summary/ideas_summary/webview.rq".attributes_tab]
 */
import type { AttributeAggregate } from '../index-store/webview-table-queries.js';
import { aggregateAttributesFromRows } from '../index-store/webview-table-queries.js';

/**
 * Get all unique attribute keys used across all indexed ideas in the project.
 * @param listAttributeIdeaRows Function that returns all idea rows with attributes_json from the database
 * @returns Array of unique attribute keys (sorted)
 */
export async function enumerateProjectAttributes(
    listAttributeIdeaRows: () => Array<{ id: string; attributes_json: string }>
): Promise<string[]> {
    const rows = listAttributeIdeaRows();
    const aggregates = aggregateAttributesFromRows(rows);
    return aggregates.map((agg: AttributeAggregate) => agg.key).sort();
}

/**
 * Type-safe wrapper for SqliteIndexStore usage.
 * @param getAllIdeaRows Function to get all idea rows (e.g., from SqliteIndexStore)
 * @returns Function that can enumerate project attributes
 */
export function createEnumerateProjectAttributes(
    getAllIdeaRows: () => Array<{ id: string; attributes_json: string }>
): () => Promise<string[]> {
    return () => enumerateProjectAttributes(() => getAllIdeaRows());
}