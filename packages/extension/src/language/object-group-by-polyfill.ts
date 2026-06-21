/**
 * Extension-host Node runtimes (Cursor/VS Code) can lag system Node and omit ES2024 builtins.
 * Langium's grammar validation groups Chevrotain productions via Object.groupBy during LSP initialize.
 */

type GroupByCallback<T, K extends PropertyKey> = (item: T, index: number) => K;

declare global {
    interface ObjectConstructor {
        groupBy?<K extends PropertyKey, T>(
            items: Iterable<T>,
            keySelector: GroupByCallback<T, K>
        ): Partial<Record<K, T[]>>;
    }
}

if (typeof Object.groupBy !== 'function') {
    Object.groupBy = <K extends PropertyKey, T>(
        items: Iterable<T>,
        keySelector: GroupByCallback<T, K>
    ): Partial<Record<K, T[]>> => {
        const result = Object.create(null) as Partial<Record<K, T[]>>;
        let index = 0;
        for (const item of items) {
            const key = keySelector(item, index++);
            const group = result[key];
            if (group) {
                group.push(item);
            } else {
                result[key] = [item];
            }
        }
        return result;
    };
}

export {};
