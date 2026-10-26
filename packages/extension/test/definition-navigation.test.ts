/**
 * rq:["../../../reqlan rq/extension/language/syntax/features-syntax-highlighting.rq".editor_reference_activation]
 * rq:["../../../reqlan rq/extension/language/comment-references/functional-code-comment-references.rq".comment_reference_navigate_back]
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

const extensionRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('definition navigation', () => {
    // rq:["../../../reqlan rq/extension/language/syntax/features-syntax-highlighting.rq".editor_reference_activation]
    // rq:["../../../reqlan rq/extension/language/comment-references/functional-code-comment-references.rq".comment_reference_navigate_back]
    test('package.json leaves go back and go forward to the editor', () => {
        const pkg = JSON.parse(readFileSync(join(extensionRoot, 'package.json'), 'utf8')) as {
            contributes: {
                keybindings?: Array<{ command?: string; key?: string; mac?: string }>;
                commands?: Array<{ command?: string }>;
            };
        };
        const bindings = pkg.contributes.keybindings ?? [];
        const commands = pkg.contributes.commands ?? [];
        expect(bindings.some(item => item.command === 'reqlan.navigateBack')).toBe(false);
        expect(commands.some(item => item.command === 'reqlan.navigateBack')).toBe(false);
        expect(bindings.some(item => item.key === 'alt+left' || item.mac === 'ctrl+-')).toBe(false);
    });
});
