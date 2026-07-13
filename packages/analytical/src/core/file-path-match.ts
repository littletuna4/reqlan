/**
 * Match indexed file paths against reqlan file_reference targets (files or folders).
 */
export type FileReferenceMatchKind = 'file' | 'folder';

export function normalizePath(path: string): string {
    return path.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/^\.\//, '');
}

export function parentDirectories(fileUri: string): string[] {
    const normalized = normalizePath(fileUri);
    const parts = normalized.split('/');
    const dirs: string[] = [];
    for (let index = 0; index < parts.length - 1; index++) {
        dirs.push(parts.slice(0, index + 1).join('/'));
    }
    return dirs;
}

export function matchFileReferenceTarget(
    targetFile: string,
    fileUri: string,
    fileName: string
): FileReferenceMatchKind | undefined {
    const target = normalizePath(targetFile).replace(/\/$/, '');
    const file = normalizePath(fileUri);
    if (!target) {
        return undefined;
    }

    if (target === file || target.endsWith(`/${fileName}`) || file.endsWith(`/${target}`)) {
        return 'file';
    }
    if (fileName && target.endsWith(`/${fileName}`)) {
        return 'file';
    }

    const targetLooksLikeFolder = !target.includes('.') || targetFile.endsWith('/');
    if (targetLooksLikeFolder && (file === target || file.startsWith(`${target}/`))) {
        return 'folder';
    }

    for (const directory of parentDirectories(file)) {
        if (directory === target || directory.endsWith(`/${target}`)) {
            return 'folder';
        }
    }

    if (file.includes(target) || target.includes(file)) {
        return 'file';
    }

    return undefined;
}
