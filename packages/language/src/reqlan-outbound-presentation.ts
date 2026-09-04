/**
 * Open-file outbound presentation: 1-hop idea confirmation, links vs error underlines.
 * rq:["../../../reqlan rq/extension/language-support/open-file-sequencing.rq".open_file_algorithm]
 * rq:["../../../reqlan rq/extension/language-support/open-file-sequencing.rq".missing_reference_colour_sequence]
 * rq:["../../../reqlan rq/language/syntax.rq".open_file_reference_sequencing]
 */
import type { LangiumDocument } from 'langium';
import { DocumentState, GrammarUtils, URI } from 'langium';
import type { Diagnostic, Range } from 'vscode-languageserver';
import { DiagnosticSeverity } from 'vscode-languageserver';
import {
    isFromImport,
    isInvalidFromImport,
    isModel,
    isQualifiedImport,
    type Model
} from './generated/ast.js';
import {
    importPathOf,
    isWellFormedFromImport
} from './reqlan-import-bindings.js';
import { isResolvableImportPath, resolveExistingImportUri } from './reqlan-imports.js';
import {
    analyzeDocumentLocalSymbolic,
    ideaNameRangeFromEdge,
    isSameIndexedUri
} from './reqlan-local-symbolic-links.js';
import type { ReqlanServices } from './reqlan-module.js';
import {
    neighborHasIdea,
    parseNeighborDocument
} from './reqlan-neighbor-parse.js';
import { pathResolveContextFromServices, resolveDocumentPathUri } from './reqlan-path-resolve.js';
import { unquoteReqlanString } from './reqlan-quoted-strings.js';

export const OUTBOUND_IDEA_MISSING = 'unresolved-idea-reference';

export function unresolvedIdeaMessage(name: string): string {
    return `Could not resolve reference to IdeaDeclaration named '${name}'.`;
}

export function isUnresolvedIdeaMessage(message: string): boolean {
    return message.includes('Could not resolve reference to IdeaDeclaration named ');
}

interface OutboundIdeaDecision {
    range: Range;
    name: string;
    confirmed: boolean;
}

export function collectOutboundIdeaDecisions(
    document: LangiumDocument,
    services: ReqlanServices
): OutboundIdeaDecision[] {
    const pathContext = pathResolveContextFromServices(services);
    const documents = services.shared.workspace.LangiumDocuments;
    const fileSystem = services.shared.workspace.FileSystemProvider;
    const decisions: OutboundIdeaDecision[] = [];
    let extracted;
    try {
        extracted = analyzeDocumentLocalSymbolic(document, pathContext);
    } catch {
        extracted = undefined;
    }
    if (extracted) {
        for (const edge of extracted.edges) {
            if (edge.kind !== 'references') {
                continue;
            }
            const range = ideaNameRangeFromEdge(document, edge);
            const name = edge.label;
            if (!range || !name) {
                continue;
            }
            if (edge.isResolved === false) {
                decisions.push({ range, name, confirmed: false });
                continue;
            }
            const targetId = edge.targetId;
            if (!targetId) {
                decisions.push({ range, name, confirmed: false });
                continue;
            }
            const hash = targetId.lastIndexOf('#');
            const filePart = hash >= 0 ? targetId.slice(0, hash) : targetId;
            const ideaName = hash >= 0 ? targetId.slice(hash + 1) : name;
            if (!filePart || isSameIndexedUri(filePart, document.uri)) {
                const local = extracted.ideas.some(idea => idea.name === ideaName);
                decisions.push({ range, name: ideaName, confirmed: local });
                continue;
            }
            let targetUri: URI;
            try {
                targetUri = resolveDocumentPathUri(filePart, document, pathContext);
            } catch {
                decisions.push({ range, name: ideaName, confirmed: false });
                continue;
            }
            const neighbor = parseNeighborDocument(targetUri, documents, fileSystem);
            if (!neighbor || !neighborHasIdea(neighbor, ideaName)) {
                decisions.push({ range, name: ideaName, confirmed: false });
                continue;
            }
            decisions.push({ range, name: ideaName, confirmed: true });
        }
    }
    const model = document.parseResult.value;
    if (isModel(model)) {
        decisions.push(...importSpecifierDecisions(document, model, services));
    }
    return decisions;
}

export function applyOutboundDiagnosticAuthority(document: LangiumDocument, services: ReqlanServices): void {
    const decisions = collectOutboundIdeaDecisions(document, services);
    const confirmed = decisions.filter(decision => decision.confirmed);
    const existing = document.diagnostics ?? [];
    const kept = existing.filter(diagnostic => !isConfirmedUnresolved(diagnostic, confirmed));
    const seen = new Set(kept.map(diagnostic => `${rangeKey(diagnostic.range)}:${diagnostic.message}`));
    for (const decision of decisions) {
        if (decision.confirmed) {
            continue;
        }
        const message = unresolvedIdeaMessage(decision.name);
        const key = `${rangeKey(decision.range)}:${message}`;
        if (seen.has(key) || alreadyReportedUnresolved(kept, decision, message)) {
            continue;
        }
        seen.add(key);
        kept.push(outboundIdeaDiagnostic(decision.range, decision.name));
    }
    document.diagnostics = kept;
}

export function registerOutboundDiagnosticAuthority(services: ReqlanServices): void {
    services.shared.workspace.DocumentBuilder.onDocumentPhase(DocumentState.Validated, document => {
        applyOutboundDiagnosticAuthority(document, services);
    });
}

function isConfirmedUnresolved(diagnostic: Diagnostic, confirmed: OutboundIdeaDecision[]): boolean {
    if (!isUnresolvedIdeaMessage(diagnostic.message)) {
        return false;
    }
    return confirmed.some(decision =>
        diagnostic.message.includes(`'${decision.name}'`)
        && (
            rangeKey(diagnostic.range) === rangeKey(decision.range)
            || diagnostic.range.start.line === decision.range.start.line
        )
    );
}

function alreadyReportedUnresolved(
    diagnostics: readonly Diagnostic[],
    decision: OutboundIdeaDecision,
    message: string
): boolean {
    return diagnostics.some(diagnostic =>
        diagnostic.message === message
        && (
            rangeKey(diagnostic.range) === rangeKey(decision.range)
            || diagnostic.range.start.line === decision.range.start.line
        )
    );
}

function importSpecifierDecisions(
    document: LangiumDocument,
    model: Model,
    services: ReqlanServices
): OutboundIdeaDecision[] {
    const documents = services.shared.workspace.LangiumDocuments;
    const fileSystem = services.shared.workspace.FileSystemProvider;
    const pathContext = pathResolveContextFromServices(services);
    const decisions: OutboundIdeaDecision[] = [];
    for (const importDecl of model.imports) {
        if (isInvalidFromImport(importDecl)) {
            continue;
        }
        const rawPath = importPathOf(importDecl);
        const path = rawPath ? unquoteReqlanString(rawPath) : undefined;
        if (!path) {
            continue;
        }
        if (!isResolvableImportPath(path, document, documents, fileSystem, pathContext)) {
            continue;
        }
        const targetUri = resolveExistingImportUri(path, document, documents, fileSystem, pathContext);
        const neighbor = parseNeighborDocument(targetUri, documents, fileSystem);
        if (!neighbor) {
            continue;
        }
        if (isFromImport(importDecl) && isWellFormedFromImport(importDecl)) {
            for (const specifier of importDecl.specifiers) {
                const name = specifier.idea.$refText;
                const range = GrammarUtils.findNodeForProperty(specifier.$cstNode, 'idea')?.range;
                if (!name || !range) {
                    continue;
                }
                decisions.push({ range, name, confirmed: neighborHasIdea(neighbor, name) });
            }
        }
        if (isQualifiedImport(importDecl)) {
            const name = importDecl.idea.$refText;
            const range = GrammarUtils.findNodeForProperty(importDecl.$cstNode, 'idea')?.range;
            if (!name || !range) {
                continue;
            }
            decisions.push({ range, name, confirmed: neighborHasIdea(neighbor, name) });
        }
    }
    return decisions;
}

function outboundIdeaDiagnostic(range: Range, name: string): Diagnostic {
    return {
        severity: DiagnosticSeverity.Error,
        range,
        message: unresolvedIdeaMessage(name),
        source: 'reqlan',
        code: OUTBOUND_IDEA_MISSING
    };
}

function rangeKey(range: Range): string {
    return `${range.start.line}:${range.start.character}-${range.end.line}:${range.end.character}`;
}
