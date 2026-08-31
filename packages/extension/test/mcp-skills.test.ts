/**
 * rq:["../../../reqlan rq/extension/features-skills-and-mcp.rq".mcp_click_retrieval]
 * rq:["../../../reqlan rq/extension/features-skills-and-mcp.rq".mcp_tools]
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

const extensionRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const skillsRoot = join(extensionRoot, 'skills');
const promptsRoot = join(extensionRoot, 'prompts');

const removedMcpTools = [
    'search_requirements',
    'list_requirements',
    'file_context',
    'local_graph',
    'summarize_subtree',
    'requirement_reference',
    'file_reference',
    'list_interactions'
] as const;

function readSkillAndPromptSources(): Array<{ path: string; source: string }> {
    const skills = readdirSync(skillsRoot, { withFileTypes: true })
        .filter(entry => entry.isDirectory())
        .map(entry => {
            const path = join(skillsRoot, entry.name, 'SKILL.md');
            return { path, source: readFileSync(path, 'utf8') };
        });
    const prompts = readdirSync(promptsRoot)
        .filter(name => name.endsWith('.prompt.md'))
        .map(name => {
            const path = join(promptsRoot, name);
            return { path, source: readFileSync(path, 'utf8') };
        });
    return [...skills, ...prompts];
}

describe('agent skills MCP retrieval', () => {
    test('skills prefer MCP click and do not recommend removed retrieval tools', () => {
        const files = readSkillAndPromptSources();
        const searchSkill = files.find(file => file.path.endsWith('rq-search/SKILL.md'));
        expect(searchSkill).toBeDefined();
        expect(searchSkill?.source).toMatch(/MCP `click`/);

        for (const file of files) {
            const withoutNegation = file.source.replace(/Do not call MCP[^\n]*/g, '');
            for (const tool of removedMcpTools) {
                expect(withoutNegation, file.path).not.toMatch(
                    new RegExp(`MCP \`${tool}\``)
                );
            }
        }
    });
});
