export function attributeKeyFromChipItem(item: string): string {
    const separator = item.indexOf(': ');
    return separator >= 0 ? item.slice(0, separator) : item;
}

export function longestCommonPrefix(values: string[]): string {
    if (values.length === 0) {
        return '';
    }
    let prefix = values[0];
    for (let index = 1; index < values.length; index += 1) {
        while (!values[index].startsWith(prefix)) {
            prefix = prefix.slice(0, -1);
            if (!prefix) {
                return '';
            }
        }
    }
    return prefix;
}

export function chipPrefix(items: string[]): string {
    const prefix = longestCommonPrefix(items);
    const separator = Math.max(prefix.lastIndexOf('.'), prefix.lastIndexOf('_'), prefix.lastIndexOf(':'));
    return separator >= 0 ? prefix.slice(0, separator + 1) : prefix;
}

export function chipLabels(items: string[]): string[] {
    const prefix = chipPrefix(items);
    if (!prefix) {
        return [...items];
    }
    return items.map(item => {
        if (item.startsWith(prefix)) {
            const trimmed = item.slice(prefix.length).trim();
            return trimmed || item;
        }
        return item;
    });
}
