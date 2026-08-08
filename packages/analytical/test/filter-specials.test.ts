import { describe, expect, test } from 'vitest';
import {
    FILTER_EMPTY,
    FILTER_EMPTY_LABEL,
    FILTER_NOT_PRESENT,
    FILTER_NOT_PRESENT_LABEL,
    FILTER_UNSPECIFIED,
    attributePresence,
    filterDisplayLabel,
    isFilterEmpty,
    isFilterNotPresent,
    isFilterUnspecified,
    isSpecialFilterValue,
    statusFilterKeyFromAttributes,
    tagsFilterKeysFromAttributes,
    todoNoteFromAttributes
} from '../src/core/filter-specials.js';

describe('filter-specials', () => {
    test('distinguishes missing, empty, and valued status attributes', () => {
        expect(attributePresence({}, 'status')).toBe('missing');
        expect(attributePresence({ status: true }, 'status')).toBe('empty');
        expect(attributePresence({ status: '' }, 'status')).toBe('empty');
        expect(attributePresence({ status: '  ' }, 'status')).toBe('empty');
        expect(attributePresence({ status: 'done' }, 'status')).toBe('valued');

        expect(statusFilterKeyFromAttributes({})).toBe(FILTER_NOT_PRESENT);
        expect(statusFilterKeyFromAttributes({ status: true })).toBe(FILTER_EMPTY);
        expect(statusFilterKeyFromAttributes({ status: '' })).toBe(FILTER_EMPTY);
        expect(statusFilterKeyFromAttributes({ status: 'unspecified' })).toBe(FILTER_UNSPECIFIED);
        expect(statusFilterKeyFromAttributes({ status: 'done' })).toBe('done');

        expect(isFilterNotPresent(FILTER_NOT_PRESENT)).toBe(true);
        expect(isFilterEmpty(FILTER_EMPTY)).toBe(true);
        expect(isFilterUnspecified('Unspecified')).toBe(true);
        expect(isSpecialFilterValue(FILTER_EMPTY)).toBe(true);
        expect(isSpecialFilterValue('done')).toBe(false);

        expect(filterDisplayLabel(FILTER_NOT_PRESENT)).toBe(FILTER_NOT_PRESENT_LABEL);
        expect(filterDisplayLabel(FILTER_EMPTY)).toBe(FILTER_EMPTY_LABEL);
    });

    test('distinguishes missing, empty, and valued tags attributes', () => {
        expect(tagsFilterKeysFromAttributes({})).toEqual([FILTER_NOT_PRESENT]);
        expect(tagsFilterKeysFromAttributes({ tags: true })).toEqual([FILTER_EMPTY]);
        expect(tagsFilterKeysFromAttributes({ tags: [] })).toEqual([FILTER_EMPTY]);
        expect(tagsFilterKeysFromAttributes({ tags: ['', ' '] })).toEqual([FILTER_EMPTY]);
        expect(tagsFilterKeysFromAttributes({ tags: ['core', 'ui'] })).toEqual(['core', 'ui']);
    });

    test('todoNoteFromAttributes omits bare flags and returns notes', () => {
        expect(todoNoteFromAttributes({})).toBeUndefined();
        expect(todoNoteFromAttributes({ todo: true })).toBeUndefined();
        expect(todoNoteFromAttributes({ todo: '' })).toBeUndefined();
        expect(todoNoteFromAttributes({ todo: 'ship host query' })).toBe('ship host query');
        expect(todoNoteFromAttributes({ todo: ['a', 'b'] })).toBe('a, b');
    });
});
