//@ts-check
/**
 * Keeps extension TextMate grammar aligned with the language package output produced
 * by Langium generation. Interacts with build:prepare and the extension contributes.grammars path.
 */
import { execSync } from 'node:child_process';
import { watch } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const extensionRoot = path.dirname(fileURLToPath(import.meta.url));
const syntaxSource = path.resolve(extensionRoot, '../language/syntaxes/reqlan.tmLanguage.json');

function syncSyntax() {
    execSync('pnpm run build:prepare', { cwd: extensionRoot, stdio: 'inherit' });
}

console.log(`Watching ${syntaxSource} for TextMate grammar updates...`);
syncSyntax();
watch(syntaxSource, () => syncSyntax());
