import {
    FILTER_EMPTY,
    FILTER_NOT_PRESENT,
    filterDisplayLabel,
    isFilterEmpty,
    isFilterNotPresent,
    isFilterUnspecified
} from '../../shared/filter/filter-specials.js';

export interface CheckboxFilterOption {
    value: string;
    label: string;
    kind: 'not-present' | 'empty' | 'unspecified' | 'concrete';
    special: boolean;
    count?: number;
}

export const GRAPH_FILTER_SPECIALS = [FILTER_NOT_PRESENT, FILTER_EMPTY] as const;

const SCD_OPEN_EVENT = 'reqlan-scd-open';

export function optionKind(value: string): CheckboxFilterOption['kind'] {
    if (isFilterNotPresent(value)) {
        return 'not-present';
    }
    if (isFilterEmpty(value)) {
        return 'empty';
    }
    if (isFilterUnspecified(value)) {
        return 'unspecified';
    }
    return 'concrete';
}

export function toCheckboxFilterOption(
    value: string,
    counts?: Readonly<Record<string, number>>
): CheckboxFilterOption {
    const kind = optionKind(value);
    const count = counts?.[value];
    return {
        value,
        label: filterDisplayLabel(value),
        kind,
        special: kind !== 'concrete',
        ...(typeof count === 'number' ? { count } : {})
    };
}

export function partitionFilterOptions(
    values: readonly string[],
    counts?: Readonly<Record<string, number>>
): {
    specials: CheckboxFilterOption[];
    concretes: CheckboxFilterOption[];
} {
    const specials: CheckboxFilterOption[] = [];
    const concretes: CheckboxFilterOption[] = [];
    for (const value of values) {
        const option = toCheckboxFilterOption(value, counts);
        if (option.special) {
            specials.push(option);
        } else {
            concretes.push(option);
        }
    }
    specials.sort((left, right) => {
        const rank = (kind: CheckboxFilterOption['kind']) =>
            kind === 'not-present' ? 0 : kind === 'empty' ? 1 : kind === 'unspecified' ? 2 : 3;
        return rank(left.kind) - rank(right.kind) || left.label.localeCompare(right.label);
    });
    concretes.sort((left, right) => left.label.localeCompare(right.label));
    return { specials, concretes };
}

export function filterOptionsByQuery(
    options: readonly CheckboxFilterOption[],
    query: string
): CheckboxFilterOption[] {
    const needle = query.trim().toLowerCase();
    if (!needle) {
        return [...options];
    }
    return options.filter(option => option.label.toLowerCase().includes(needle));
}

export function summarizeFilterSelection(label: string, selected: readonly string[]): string {
    if (selected.length === 0) {
        return label;
    }
    if (selected.length === 1) {
        return filterDisplayLabel(selected[0]!);
    }
    return `${selected.length} selected`;
}

export function optionClassName(kind: CheckboxFilterOption['kind']): string {
    const classes = ['scd-option'];
    if (kind !== 'concrete') {
        classes.push('is-special', `is-${kind}`);
    }
    return classes.join(' ');
}

/** Close other SCD instances when one opens (avoids overlapping panels). */
export function announceScdOpened(source: EventTarget): void {
    if (typeof document === 'undefined') {
        return;
    }
    document.dispatchEvent(
        new CustomEvent(SCD_OPEN_EVENT, {
            detail: { source }
        })
    );
}

export function subscribeScdOpened(
    handler: (source: EventTarget | null) => void
): () => void {
    if (typeof document === 'undefined') {
        return () => undefined;
    }
    const listener = (event: Event): void => {
        const detail = (event as CustomEvent<{ source?: EventTarget }>).detail;
        handler(detail?.source ?? null);
    };
    document.addEventListener(SCD_OPEN_EVENT, listener);
    return () => document.removeEventListener(SCD_OPEN_EVENT, listener);
}

export function bumpCount(
    counts: Map<string, number>,
    key: string,
    by = 1
): void {
    counts.set(key, (counts.get(key) ?? 0) + by);
}
