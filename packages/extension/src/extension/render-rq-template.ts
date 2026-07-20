export function renderRqTemplate(
    template: string,
    values: Record<string, string>,
): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
        const value = values[key];
        if (value === undefined) {
            throw new Error(`Missing template value for {{${key}}}`);
        }
        return value;
    });
}
