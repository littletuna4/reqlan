/**
 * Install rq-* Agent Skills and MCP config into the active workspace for Cursor.
 */
import * as vscode from 'vscode';

const SYNC_MARKER = '<!-- synced by reqlan extension; edit packages/extension instead -->\n';
const SKILL_PREFIX = 'rq-';

export interface CursorSkillsInstallResult {
    workspacePath: string;
    skillNames: string[];
    mcpConfigured: boolean;
    mcpSkippedReason?: string;
}

export async function installCursorSkills(
    context: vscode.ExtensionContext
): Promise<CursorSkillsInstallResult | undefined> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        void vscode.window.showWarningMessage('Open a workspace folder before installing Cursor skills.');
        return undefined;
    }

    const skillsRoot = vscode.Uri.joinPath(workspaceFolder.uri, '.cursor', 'skills');
    await vscode.workspace.fs.createDirectory(skillsRoot);

    const installed = new Set<string>();
    await installBundledSkills(context, skillsRoot, installed);
    await installPromptSkills(context, skillsRoot, installed);

    const mcpResult = await configureMcp(workspaceFolder.uri);

    return {
        workspacePath: workspaceFolder.uri.fsPath,
        skillNames: [...installed].sort(),
        mcpConfigured: mcpResult.configured,
        mcpSkippedReason: mcpResult.reason
    };
}

export async function workspaceHasCursorSkills(workspaceFolder: vscode.WorkspaceFolder): Promise<boolean> {
    try {
        await vscode.workspace.fs.stat(
            vscode.Uri.joinPath(workspaceFolder.uri, '.cursor', 'skills', `${SKILL_PREFIX}requirements`, 'SKILL.md')
        );
        return true;
    } catch {
        return false;
    }
}

async function installBundledSkills(
    context: vscode.ExtensionContext,
    skillsRoot: vscode.Uri,
    installed: Set<string>
): Promise<void> {
    const sourceRoot = vscode.Uri.joinPath(context.extensionUri, 'skills');
    let entries: [string, vscode.FileType][];
    try {
        entries = await vscode.workspace.fs.readDirectory(sourceRoot);
    } catch {
        return;
    }

    for (const [name, type] of entries) {
        if (type !== vscode.FileType.Directory) {
            continue;
        }
        const skillName = cursorSkillName(name);
        const source = vscode.Uri.joinPath(sourceRoot, name, 'SKILL.md');
        const targetDir = vscode.Uri.joinPath(skillsRoot, skillName);
        await vscode.workspace.fs.createDirectory(targetDir);
        const content = await vscode.workspace.fs.readFile(source);
        await vscode.workspace.fs.writeFile(
            vscode.Uri.joinPath(targetDir, 'SKILL.md'),
            content
        );
        installed.add(skillName);
    }
}

async function installPromptSkills(
    context: vscode.ExtensionContext,
    skillsRoot: vscode.Uri,
    installed: Set<string>
): Promise<void> {
    const promptsRoot = vscode.Uri.joinPath(context.extensionUri, 'prompts');
    let entries: [string, vscode.FileType][];
    try {
        entries = await vscode.workspace.fs.readDirectory(promptsRoot);
    } catch {
        return;
    }

    for (const [fileName, type] of entries) {
        if (type !== vscode.FileType.File || !fileName.endsWith('.prompt.md')) {
            continue;
        }
        const source = vscode.Uri.joinPath(promptsRoot, fileName);
        const raw = Buffer.from(await vscode.workspace.fs.readFile(source)).toString('utf8');
        const { frontmatter, body } = splitFrontmatter(raw);
        const metadata = parseSimpleYaml(frontmatter);
        const skillName = cursorSkillName(String(metadata.name ?? fileName.replace(/\.prompt\.md$/, '')));
        const targetDir = vscode.Uri.joinPath(skillsRoot, skillName);
        await vscode.workspace.fs.createDirectory(targetDir);

        const cursorFrontmatter: Record<string, string | boolean> = {
            name: skillName,
            description: String(metadata.description ?? `Reqlan prompt: ${skillName}`),
            'disable-model-invocation': true
        };
        if (metadata['argument-hint']) {
            cursorFrontmatter['argument-hint'] = String(metadata['argument-hint']);
        }

        const output = `${SYNC_MARKER}---\n${serializeSimpleYaml(cursorFrontmatter)}\n---\n\n${adaptPromptBody(body).trim()}\n`;
        await vscode.workspace.fs.writeFile(
            vscode.Uri.joinPath(targetDir, 'SKILL.md'),
            Buffer.from(output, 'utf8')
        );
        installed.add(skillName);
    }
}

async function configureMcp(workspaceUri: vscode.Uri): Promise<{ configured: boolean; reason?: string }> {
    const localMcp = vscode.Uri.joinPath(workspaceUri, 'packages', 'mcp', 'bin', 'mcp.js');
    try {
        await vscode.workspace.fs.stat(localMcp);
    } catch {
        return {
            configured: false,
            reason: 'No packages/mcp/bin/mcp.js in this workspace; skills installed without MCP config.'
        };
    }

    const mcpUri = vscode.Uri.joinPath(workspaceUri, '.cursor', 'mcp.json');
    await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(workspaceUri, '.cursor'));

    let config: { mcpServers?: Record<string, unknown> } = {};
    try {
        const existing = await vscode.workspace.fs.readFile(mcpUri);
        config = JSON.parse(Buffer.from(existing).toString('utf8')) as { mcpServers?: Record<string, unknown> };
    } catch {
        // new file
    }

    config.mcpServers ??= {};
    config.mcpServers.reqlan = {
        command: 'node',
        args: ['${workspaceFolder}/packages/mcp/bin/mcp.js'],
        env: {
            REQLAN_WORKSPACE: '${workspaceFolder}'
        }
    };

    await vscode.workspace.fs.writeFile(
        mcpUri,
        Buffer.from(`${JSON.stringify(config, null, 2)}\n`, 'utf8')
    );
    return { configured: true };
}

function cursorSkillName(name: string): string {
    const normalized = name.replace(/\.prompt$/, '');
    return normalized.startsWith(SKILL_PREFIX) ? normalized : `${SKILL_PREFIX}${normalized}`;
}

function splitFrontmatter(content: string): { frontmatter: string; body: string } {
    const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
    if (!match) {
        return { frontmatter: '', body: content };
    }
    return { frontmatter: match[1], body: match[2] };
}

function parseSimpleYaml(text: string): Record<string, string | boolean> {
    const result: Record<string, string | boolean> = {};
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

function serializeSimpleYaml(record: Record<string, string | boolean>): string {
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

function adaptPromptBody(body: string): string {
    return body
        .replace(/\$\{input:[^}]+\}/g, '(use text the user typed after the slash command, or ask briefly if missing)')
        .replace(/^agent: \w+\n/gm, '')
        .replace(/^tools: \[[^\]]*\]\n/gm, '');
}
