/** Shared export helpers used by markdown/JSON/CSV writers (not HTML rendering). */

/** Normalize an export mount prefix to a leading-slash path without a trailing slash. */
export function normalizeUrlBase(urlBase?: string): string | undefined {
    const trimmed = urlBase?.trim();
    if (!trimmed) {
        return undefined;
    }
    const withoutTrailing = trimmed.replace(/\/+$/, '');
    if (withoutTrailing.length === 0) {
        return undefined;
    }
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(withoutTrailing) || withoutTrailing.startsWith('/')) {
        return withoutTrailing;
    }
    return `/${withoutTrailing}`;
}

export function formatAttributeValue(value: unknown): string {
    if (value === true) {
        return 'true';
    }
    if (value === false) {
        return 'false';
    }
    if (Array.isArray(value)) {
        return value.map(String).join(', ');
    }
    if (value == null) {
        return '';
    }
    if (typeof value === 'object') {
        return JSON.stringify(value);
    }
    return String(value);
}

export function slugAttributeKey(key: string): string {
    return key.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'attribute';
}
