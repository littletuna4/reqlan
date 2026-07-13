import type { CurrentFileSlice, IdeaSummary, IdeaWithRange, OutlineNode, ReferenceListRow } from 'reqlan-analytical';
import type { ReferenceListsPayload } from './activity-bar-messages.js';

export function buildOutlineFromIdeas(ideas: IdeaWithRange[]): OutlineNode[] {
    const sorted = [...ideas].sort((left, right) => left.lineStart - right.lineStart);
    const roots: OutlineNode[] = [];
    const stack: OutlineNode[] = [];

    for (const idea of sorted) {
        const node: OutlineNode = {
            id: idea.id,
            name: idea.name,
            lineStart: idea.lineStart,
            lineEnd: idea.lineEnd,
            children: []
        };

        while (stack.length > 0 && stack[stack.length - 1].lineEnd < idea.lineStart) {
            stack.pop();
        }

        if (stack.length === 0) {
            roots.push(node);
        } else {
            stack[stack.length - 1].children.push(node);
        }
        stack.push(node);
    }

    return roots;
}

export function groupReferences(rows: ReferenceListRow[]): Record<string, ReferenceListRow[]> {
    const grouped: Record<string, ReferenceListRow[]> = {};
    for (const row of rows) {
        if (!grouped[row.kind]) {
            grouped[row.kind] = [];
        }
        grouped[row.kind].push(row);
    }
    return grouped;
}

export function filterReferences(
    rows: ReferenceListRow[],
    options?: { search?: string; brokenOnly?: boolean }
): ReferenceListRow[] {
    const search = options?.search?.trim().toLowerCase();
    return rows.filter(row => {
        if (options?.brokenOnly && row.isResolved) {
            return false;
        }
        if (!search) {
            return true;
        }
        const haystack = [
            row.label,
            row.targetName,
            row.targetPath,
            row.snippet ?? ''
        ].join(' ').toLowerCase();
        return haystack.includes(search);
    });
}

export function buildReferencesPayloadFromCurrentFile(
    focusId: string,
    slice: Partial<Pick<CurrentFileSlice, 'inboundReferencingIdeas' | 'referencedIdeas'>>
): ReferenceListsPayload {
    const rows: ReferenceListRow[] = [
        ...(slice.inboundReferencingIdeas ?? []).map(idea => inboundReferenceRow(focusId, idea)),
        ...(slice.referencedIdeas ?? []).map(idea => outboundReferenceRow(focusId, idea))
    ];
    return { ideaId: focusId, rows, grouped: groupReferences(rows) };
}

function inboundReferenceRow(focusId: string, idea: IdeaSummary): ReferenceListRow {
    return {
        edgeId: `preview:inbound:${idea.id}`,
        direction: 'inbound',
        kind: 'references',
        label: idea.name,
        targetName: idea.name,
        targetPath: idea.fileUri,
        targetLine: idea.lineStart,
        isResolved: true,
        sourceIdeaId: idea.id,
        targetIdeaId: focusId
    };
}

function outboundReferenceRow(focusId: string, idea: IdeaSummary): ReferenceListRow {
    return {
        edgeId: `preview:outbound:${idea.id}`,
        direction: 'outbound',
        kind: 'references',
        label: idea.name,
        targetName: idea.name,
        targetPath: idea.fileUri,
        targetLine: idea.lineStart,
        isResolved: true,
        sourceIdeaId: focusId,
        targetIdeaId: idea.id
    };
}

export function formatIdeaMarkdown(idea: IdeaSummary, relativePath: (uri: string) => string): string {
    const location = `${relativePath(idea.fileUri)}:${idea.lineStart + 1}`;
    const status = idea.status ? `Status: ${idea.status}\n` : '';
    const tags = idea.tags.length > 0 ? `Tags: ${idea.tags.join(', ')}\n` : '';
    return [
        `**${idea.name}**`,
        location,
        status + tags,
        idea.summary
    ].filter(Boolean).join('\n');
}
