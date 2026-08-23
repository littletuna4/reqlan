/**
 * Parses file path strings from bracket references, including L# line suffixes and :test name suffixes.
 * rq:["../../../reqlan rq/language/syntax.rq".reference_file]
 */

export interface ParsedFileReference {
    filePath: string;
    lineStart?: number;
    lineEnd?: number;
    testName?: string;
}

const LINE_SUFFIX_PATTERN = /^(.*?)L#(\d+)(?:-(\d+))?$/;

export function parseFileReferenceString(file: string): ParsedFileReference {
    const lineMatch = LINE_SUFFIX_PATTERN.exec(file);
    const lineParsed = lineMatch
        ? {
            filePath: lineMatch[1],
            lineStart: Number.parseInt(lineMatch[2], 10),
            lineEnd: lineMatch[3] ? Number.parseInt(lineMatch[3], 10) : Number.parseInt(lineMatch[2], 10)
        }
        : { filePath: file };
    const testParsed = parseTestNameSuffix(lineParsed.filePath);
    return {
        filePath: testParsed.filePath,
        lineStart: lineParsed.lineStart,
        lineEnd: lineParsed.lineEnd,
        testName: testParsed.testName
    };
}

function parseTestNameSuffix(file: string): { filePath: string; testName?: string } {
    for (let index = 0; index < file.length; index++) {
        if (file[index] !== ':') {
            continue;
        }
        if (isUriSchemeColon(file, index) || isWindowsDriveColon(file, index)) {
            continue;
        }
        const testName = file.slice(index + 1);
        if (!testName) {
            return { filePath: file };
        }
        return {
            filePath: file.slice(0, index),
            testName
        };
    }
    return { filePath: file };
}

/** `https://` / `file://` — the colon that starts `://`. */
function isUriSchemeColon(file: string, index: number): boolean {
    return file[index + 1] === '/' && file[index + 2] === '/';
}

/** Drive letter in `C:\…` or `file://C:/…`. */
function isWindowsDriveColon(file: string, index: number): boolean {
    const previous = file[index - 1];
    const next = file[index + 1];
    return previous !== undefined
        && /[A-Za-z]/.test(previous)
        && (next === '\\' || next === '/');
}

const NON_RQ_FILE_EXTENSION = /\.[^./\\]+$/;

/**
 * True when a bracketed quoted path is an arbitrary file reference, not an inline .rq import path.
 */
export function isOpaqueFileReferencePath(path: string): boolean {
    const parsed = parseFileReferenceString(path);
    if (parsed.testName !== undefined || parsed.lineStart !== undefined) {
        return true;
    }
    const filePath = parsed.filePath;
    if (/\.rq$/i.test(filePath)) {
        return false;
    }
    return NON_RQ_FILE_EXTENSION.test(filePath);
}

export function findTestLineInText(text: string, testName: string): number | undefined {
    const escaped = testName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`\\b(?:test|it)\\(\\s*['\`]${escaped}['\`]`);
    const lines = text.split(/\r?\n/);
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
        if (pattern.test(lines[lineIndex])) {
            return lineIndex;
        }
    }
    return undefined;
}
