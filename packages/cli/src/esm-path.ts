/**
 * Convert a filesystem path into an ESM import specifier.
 * Node's ESM loader on Windows rejects absolute paths like `C:\...`
 * (protocol `c:`) and requires `file://` URLs.
 */
import { pathToFileURL } from 'node:url';

const WINDOWS_DRIVE_ABS = /^[A-Za-z]:[\\/]/;

export function fsPathToEsmSpecifier(fsPath: string): string {
    if (fsPath.startsWith('file:')) {
        return fsPath;
    }
    if (WINDOWS_DRIVE_ABS.test(fsPath)) {
        return `file:///${fsPath.replace(/\\/g, '/')}`;
    }
    if (fsPath.startsWith('\\\\')) {
        return `file:${fsPath.replace(/\\/g, '/')}`;
    }
    return pathToFileURL(fsPath).href;
}
