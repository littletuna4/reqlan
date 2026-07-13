/**
 * Parses file path strings from bracket references, including L# line suffixes and :test name suffixes.
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
    let colonIndex = -1;
    for (let index = file.length - 1; index >= 0; index--) {
        if (file[index] !== ':') {
            continue;
        }
        if (index > 0 && file[index - 1] === '/' && index > 1 && file[index - 2] === '/') {
            continue;
        }
        colonIndex = index;
        break;
    }
    if (colonIndex < 0) {
        return { filePath: file };
    }
    const testName = file.slice(colonIndex + 1);
    if (!testName) {
        return { filePath: file };
    }
    return {
        filePath: file.slice(0, colonIndex),
        testName
    };
}

const FILE_REFERENCE_LIKE = /(?:\.\w[\w.]*|\/)/;

/**
 * True when a bracketed quoted path is an arbitrary file reference, not an inline .rq import path.
 */
export function isOpaqueFileReferencePath(path: string): boolean {
    const parsed = parseFileReferenceString(path);
    if (parsed.testName !== undefined || parsed.lineStart !== undefined) {
        return true;
    }
    if (/\.rq$/i.test(parsed.filePath)) {
        return false;
    }
    return FILE_REFERENCE_LIKE.test(parsed.filePath);
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
