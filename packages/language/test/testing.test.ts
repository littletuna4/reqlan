import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { findTestsMissingRequirementReferences } from './test-requirement-refs.js';

const testDir = dirname(fileURLToPath(import.meta.url));

describe('Testing requirements', () => {
    // rq:["../../../reqlan rq/development/core.rq".testing]
    test('each test file includes rq comment references to its requirements', () => {
        const testFiles = readdirSync(testDir)
            .filter(name => name.endsWith('.test.ts') && name !== 'testing.test.ts');
        const violations: string[] = [];
        for (const fileName of testFiles) {
            const text = readFileSync(join(testDir, fileName), 'utf8');
            const missing = findTestsMissingRequirementReferences(text);
            for (const testName of missing) {
                violations.push(`${fileName}: ${testName}`);
            }
        }
        expect(violations).toEqual([]);
    });
});
