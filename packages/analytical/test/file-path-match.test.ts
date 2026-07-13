import { describe, expect, test } from 'vitest';
import { matchFileReferenceTarget } from '../src/core/file-path-match.js';

describe('matchFileReferenceTarget', () => {
    test('matches exact file path', () => {
        expect(matchFileReferenceTarget('./apythonfile.py', 'a source folder/apythonfile.py', 'apythonfile.py')).toBe('file');
    });

    test('matches folder prefix', () => {
        expect(matchFileReferenceTarget('a source folder', 'a source folder/apythonfile.py', 'apythonfile.py')).toBe('folder');
    });

    test('returns undefined for unrelated paths', () => {
        expect(matchFileReferenceTarget('other/dir', 'a source folder/apythonfile.py', 'apythonfile.py')).toBeUndefined();
    });
});
