/**
 * Workspace-relative path helpers with no Langium / @reqlan/language imports.
 * Used by the `@reqlan/analytical/core` entry so headless commands do not load the LSP parser.
 * rq:["../../../reqlan rq/core_analysis/rust_port.rq".native_bridge]
 * rq:["../../../reqlan rq/core_analysis/rust_port.rq".cutover]
 */
import { isAbsolute, relative } from 'node:path';

function normalizeSlashes(filePath: string): string {
    return filePath.replace(/\\/g, '/');
}

/**
 * Convert a `file://` URI to an fsPath that still understands Windows drive
 * URIs when running on POSIX (Langium `URI.fsPath` behaviour).
 */
export function fsPathFromFileUri(fileUri: string): string {
    const url = new URL(fileUri);
    let pathname = decodeURIComponent(url.pathname);
    if (url.protocol === 'file:' && /^\/[A-Za-z]:/.test(pathname)) {
        return pathname.slice(1).replace(/\//g, '\\');
    }
    if (url.protocol === 'file:' && url.hostname) {
        const hostPath = pathname.replace(/\//g, '\\');
        return `\\\\${url.hostname}${hostPath}`;
    }
    return pathname;
}

export function relativeWindowsDrivePath(filePath: string, workspaceRoot: string): string | undefined {
    const normalizedFile = normalizeSlashes(filePath);
    const normalizedRoot = normalizeSlashes(workspaceRoot).replace(/\/+$/, '');

    const fileMatch = normalizedFile.match(/^([A-Za-z]:)(\/.*)?$/);
    const rootMatch = normalizedRoot.match(/^([A-Za-z]:)(\/.*)?$/);
    if (!fileMatch || !rootMatch || fileMatch[1].toLowerCase() !== rootMatch[1].toLowerCase()) {
        return undefined;
    }

    const fileRest = (fileMatch[2] ?? '').replace(/^\/+/, '');
    const rootRest = (rootMatch[2] ?? '').replace(/^\/+/, '');
    if (fileRest.toLowerCase() === rootRest.toLowerCase()) {
        return '';
    }
    const rootPrefix = rootRest ? `${rootRest}/` : '';
    if (!rootRest || fileRest.toLowerCase().startsWith(rootPrefix.toLowerCase())) {
        return rootRest ? fileRest.slice(rootPrefix.length) : fileRest;
    }
    return undefined;
}

export function toWorkspaceRelativePath(fileUri: string, workspaceRoot: string): string {
    if (!workspaceRoot) {
        return normalizeSlashes(fileUri);
    }

    const filePath = fileUri.startsWith('file://') ? fsPathFromFileUri(fileUri) : fileUri;
    const driveRelative = relativeWindowsDrivePath(filePath, workspaceRoot);
    if (driveRelative !== undefined) {
        return driveRelative;
    }

    if (!isAbsolute(filePath)) {
        return normalizeSlashes(filePath);
    }

    const rel = relative(workspaceRoot, filePath);
    if (rel.startsWith('..')) {
        return normalizeSlashes(fileUri);
    }
    return normalizeSlashes(rel);
}
