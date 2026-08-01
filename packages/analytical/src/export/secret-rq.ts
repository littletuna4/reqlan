/** Matches gitignored `*.secret.rq` requirement files. */
export function isSecretRqPath(fileUriOrPath: string): boolean {
    const normalized = fileUriOrPath.replace(/\\/g, '/');
    const fileName = normalized.includes('/')
        ? normalized.slice(normalized.lastIndexOf('/') + 1)
        : normalized;
    return fileName.toLowerCase().endsWith('.secret.rq');
}
