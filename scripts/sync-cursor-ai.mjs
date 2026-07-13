#!/usr/bin/env node
/**
 * Sync extension skills and prompts into .cursor/skills for Cursor Agent chat.
 * Source of truth: packages/extension/skills and packages/extension/prompts
 */
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const workspaceArgIndex = process.argv.indexOf('--workspace');
const workspaceRoot = workspaceArgIndex >= 0 && process.argv[workspaceArgIndex + 1]
    ? process.argv[workspaceArgIndex + 1]
    : root;
const extensionRoot = join(root, 'packages', 'extension');
const skillsSource = join(extensionRoot, 'skills');
const promptsSource = join(extensionRoot, 'prompts');
const cursorSkillsRoot = join(workspaceRoot, '.cursor', 'skills');
const skipSync = process.env.CI === 'true' || process.env.REQLAN_SKIP_CURSOR_SYNC === '1';

const SYNC_MARKER = '<!-- synced by scripts/sync-cursor-ai.mjs; edit packages/extension instead -->\n';

async function main() {
    if (skipSync) {
        console.log('Skipping Cursor skills sync in CI/non-workspace packaging context');
        return;
    }

    try {
        await rm(cursorSkillsRoot, { recursive: true, force: true });
        await mkdir(cursorSkillsRoot, { recursive: true });
    } catch (error) {
        if (error && typeof error === 'object' && 'code' in error && (error.code === 'EROFS' || error.code === 'EPERM')) {
            console.log(`Skipping Cursor skills sync because ${cursorSkillsRoot} is not writable`);
            return;
        }
        throw error;
    }

    await syncSkillDirectories();
    await syncPromptFiles();

    console.log(`Synced Cursor skills to ${relative(root, cursorSkillsRoot)}`);
}

const installedSkillNames = new Set();

function assertUniqueSkillName(skillName, source) {
    if (installedSkillNames.has(skillName)) {
        throw new Error(`Duplicate Cursor skill name "${skillName}" from ${source}`);
    }
    installedSkillNames.add(skillName);
}

async function syncSkillDirectories() {
    const entries = await readdir(skillsSource, { withFileTypes: true });
    for (const entry of entries) {
        if (!entry.isDirectory()) {
            continue;
        }
        const sourceDir = join(skillsSource, entry.name);
        const targetDir = join(cursorSkillsRoot, cursorSkillName(entry.name));
        assertUniqueSkillName(cursorSkillName(entry.name), `bundled skill directory ${entry.name}`);
        await mkdir(targetDir, { recursive: true });
        const skillContent = await readFile(join(sourceDir, 'SKILL.md'), 'utf8');
        await writeFile(join(targetDir, 'SKILL.md'), skillContent, 'utf8');
    }
}

function cursorSkillName(name) {
    const normalized = name.replace(/\.prompt$/, '');
    return normalized.startsWith('rq-') ? normalized : `rq-${normalized}`;
}

async function syncPromptFiles() {
    const entries = await readdir(promptsSource, { withFileTypes: true });
    for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith('.prompt.md')) {
            continue;
        }
        const sourcePath = join(promptsSource, entry.name);
        const content = await readFile(sourcePath, 'utf8');
        const { frontmatter, body } = splitFrontmatter(content);
        const metadata = parseSimpleYaml(frontmatter);
        const name = cursorSkillName(metadata.name ?? basename(entry.name, '.prompt.md'));
        assertUniqueSkillName(name, `prompt file ${entry.name}`);
        const targetDir = join(cursorSkillsRoot, name);
        await mkdir(targetDir, { recursive: true });

        const cursorFrontmatter = {
            name,
            description: metadata.description ?? `Reqlan prompt: ${name}`,
            'disable-model-invocation': true
        };
        if (metadata['argument-hint']) {
            cursorFrontmatter['argument-hint'] = metadata['argument-hint'];
        }

        const adaptedBody = adaptPromptBody(body);
        const output = `${SYNC_MARKER}---\n${serializeSimpleYaml(cursorFrontmatter)}\n---\n\n${adaptedBody.trim()}\n`;
        await writeFile(join(targetDir, 'SKILL.md'), output, 'utf8');
    }
}

function splitFrontmatter(content) {
    const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
    if (!match) {
        return { frontmatter: '', body: content };
    }
    return { frontmatter: match[1], body: match[2] };
}

function parseSimpleYaml(text) {
    const result = {};
    for (const line of text.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) {
            continue;
        }
        const colon = trimmed.indexOf(':');
        if (colon === -1) {
            continue;
        }
        const key = trimmed.slice(0, colon).trim();
        let value = trimmed.slice(colon + 1).trim();
        if ((value.startsWith("'") && value.endsWith("'")) || (value.startsWith('"') && value.endsWith('"'))) {
            value = value.slice(1, -1);
        }
        if (value === 'true') {
            result[key] = true;
        } else if (value === 'false') {
            result[key] = false;
        } else {
            result[key] = value;
        }
    }
    return result;
}

function serializeSimpleYaml(record) {
    return Object.entries(record)
        .map(([key, value]) => {
            if (typeof value === 'boolean') {
                return `${key}: ${value}`;
            }
            const escaped = String(value).replace(/'/g, "''");
            return `${key}: '${escaped}'`;
        })
        .join('\n');
}

function adaptPromptBody(body) {
    return body
        .replace(/\$\{input:[^}]+\}/g, '(use text the user typed after the slash command, or ask briefly if missing)')
        .replace(/agent: \w+\n/g, '')
        .replace(/tools: \[[^\]]*\]\n/g, '');
}

await main();
