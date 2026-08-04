/**
 * Shared filter sentinels for nullable status/tags.
 * Distinguishes:
 * - Not present — attribute key absent
 * - Empty — attribute declared with no value (`@status`, `@tags`, `@status ""`, …)
 * - unspecified — literal authored value "unspecified"
 */

import type { IdeaAttributeMap } from './types.js';

/** Sentinel when the attribute key is absent. */
export const FILTER_NOT_PRESENT = '__not_present__';
export const FILTER_NOT_PRESENT_LABEL = 'Not present';

/** Sentinel when the attribute is declared but empty / bare flag. */
export const FILTER_EMPTY = '__empty__';
export const FILTER_EMPTY_LABEL = 'Empty';

/** Literal attribute value that should be styled as a special case. */
export const FILTER_UNSPECIFIED = 'unspecified';

export type AttributePresence = 'missing' | 'empty' | 'valued';

export function isFilterNotPresent(value: string | undefined | null): boolean {
    return value === FILTER_NOT_PRESENT;
}

export function isFilterEmpty(value: string | undefined | null): boolean {
    return value === FILTER_EMPTY;
}

export function isFilterUnspecified(value: string | undefined | null): boolean {
    return String(value ?? '').trim().toLowerCase() === FILTER_UNSPECIFIED;
}

export function isSpecialFilterValue(value: string | undefined | null): boolean {
    return isFilterNotPresent(value) || isFilterEmpty(value) || isFilterUnspecified(value);
}

/** Human-readable label for filter/rollup keys. */
export function filterDisplayLabel(value: string): string {
    if (isFilterNotPresent(value)) {
        return FILTER_NOT_PRESENT_LABEL;
    }
    if (isFilterEmpty(value)) {
        return FILTER_EMPTY_LABEL;
    }
    return value;
}

export function attributePresence(attributes: IdeaAttributeMap, key: string): AttributePresence {
    if (!Object.prototype.hasOwnProperty.call(attributes, key)) {
        return 'missing';
    }
    const value = attributes[key];
    if (value === true) {
        return 'empty';
    }
    if (typeof value === 'string') {
        return value.trim() ? 'valued' : 'empty';
    }
    if (Array.isArray(value)) {
        return value.some(entry => String(entry).trim()) ? 'valued' : 'empty';
    }
    return 'empty';
}

/** Rollup/filter key for @status from raw attributes. */
export function statusFilterKeyFromAttributes(attributes: IdeaAttributeMap): string {
    const presence = attributePresence(attributes, 'status');
    if (presence === 'missing') {
        return FILTER_NOT_PRESENT;
    }
    if (presence === 'empty') {
        return FILTER_EMPTY;
    }
    const status = attributes.status;
    return typeof status === 'string' ? status.trim() : FILTER_EMPTY;
}

/**
 * Filter keys for @tags.
 * Missing/empty → single special sentinel; valued → concrete tag strings.
 */
export function tagsFilterKeysFromAttributes(attributes: IdeaAttributeMap): string[] {
    const presence = attributePresence(attributes, 'tags');
    if (presence === 'missing') {
        return [FILTER_NOT_PRESENT];
    }
    if (presence === 'empty') {
        return [FILTER_EMPTY];
    }
    const tags = attributes.tags;
    if (Array.isArray(tags)) {
        return tags.map(tag => String(tag).trim()).filter(Boolean);
    }
    if (typeof tags === 'string') {
        return tags.split(/[,\s]+/).map(tag => tag.trim()).filter(Boolean);
    }
    return [FILTER_EMPTY];
}

/** @deprecated Prefer statusFilterKeyFromAttributes — treats empty and missing the same. */
export function statusFilterKey(status: string | undefined | null): string {
    const trimmed = status?.trim();
    return trimmed ? trimmed : FILTER_NOT_PRESENT;
}

export function statusIsNotPresent(status: string | undefined | null): boolean {
    return !status?.trim();
}

export function tagsAreNotPresent(tags: readonly string[] | undefined | null): boolean {
    return !tags || tags.length === 0 || tags.every(tag => !String(tag).trim());
}
