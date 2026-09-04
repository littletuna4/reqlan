import type { AstNode, ValidationAcceptor, ValidationChecks } from 'langium';
import { AstUtils } from 'langium';
import type { reqlanAstType } from './generated/ast.js';
import {
    isFromImport,
    isIdeaDeclaration,
    isInvalidFromImport,
    isModel,
    isWildcardReference,
    type AnonymousBlock,
    type Model
} from './generated/ast.js';
import { collectCommentReferenceIssues } from './reqlan-comment-diagnostics.js';
import {
    collectFileLinks,
    FILE_REFERENCE_MISSING,
    fileLinkMissingMessage,
    fileLinkTargetIssueMessage
} from './reqlan-file-link-resolver.js';
import {
    importBindings,
    importPathOf,
    isWellFormedFromImport
} from './reqlan-import-bindings.js';
import { isResolvableImportPath } from './reqlan-imports.js';
import type { ReqlanServices } from './reqlan-module.js';
import { pathResolveContextFromServices } from './reqlan-path-resolve.js';
import { unquoteReqlanString } from './reqlan-quoted-strings.js';
import {
    resolveWildcardReferenceMatches,
    parseWildcardPathPattern,
    wildcardReferenceLabel
} from './reqlan-wildcard-resolve.js';

/**
 * Registers validation hooks for the requirement graph AST.
 * rq:["../../../reqlan rq/extension/language-support/features-imports.rq".import_does_not_exist_error]
 * rq:["../../../reqlan rq/extension/language-support/language-server-errors.rq".file_reference_errors]
 * rq:["../../../reqlan rq/language/imports.rq".import_error_recovery]
 * rq:["../../../reqlan rq/language/imports.rq".import_tokenisation]
 * rq:["../../../reqlan rq/language/syntax.rq".no_name_idea_safe_warning]
 * rq:["../../../reqlan rq/language/syntax.rq".comment_reference_resolution_error]
 * rq:["../../../reqlan rq/extension/features-non-rq-code-comment/functional-code-comment-references.rq".comment_reference_resolution_error_state]
 * rq:["../../../reqlan rq/extension/language-support/open-file-sequencing.rq".missing_reference_colour_sequence]
 */
export function registerValidationChecks(services: ReqlanServices) {
    const registry = services.validation.ValidationRegistry;
    const validator = services.validation.ReqlanValidator;
    const checks: ValidationChecks<reqlanAstType> = {
        Model: validator.checkModelDuplicates,
        AnonymousBlock: validator.checkNamelessIdeaBlock
    };
    registry.register(checks, validator);
}

/**
 * Custom validations for Reqlan documents.
 * rq:["../../../reqlan rq/extension/language-support/features-imports.rq".import_does_not_exist_error]
 * rq:["../../../reqlan rq/extension/language-support/features-imports.rq".import_folder_targets]
 * rq:["../../../reqlan rq/extension/language-support/language-server-errors.rq".file_reference_errors]
 * rq:["../../../reqlan rq/language/imports.rq".import_error_recovery]
 * rq:["../../../reqlan rq/language/imports.rq".import_tokenisation]
 * rq:["../../../reqlan rq/language/syntax.rq".no_name_idea_safe_warning]
 * rq:["../../../reqlan rq/language/syntax.rq".comment_reference_resolution_error]
 * rq:["../../../reqlan rq/core_analysis/check.rq".check_wildcard_sparse]
 * rq:["../../../reqlan rq/extension/features-non-rq-code-comment/functional-code-comment-references.rq".comment_reference_resolution_error_state]
 */
export class ReqlanValidator {

    constructor(private readonly services: ReqlanServices) {}

    checkModelDuplicates(model: Model, accept: ValidationAcceptor): void {
        this.checkDuplicateImportBindings(model, accept);
        this.checkDuplicateIdeaNames(model, accept);
        this.checkImportSyntax(model, accept);
        this.checkImportTargets(model, accept);
        this.checkFileReferenceTargets(model, accept);
        this.checkCommentReferences(model, accept);
        this.checkWildcardReferences(model, accept);
    }

    /**
     * Top-level nameless `{ ... }` blocks parse so the rest of the file stays alive,
     * but they need a name to be addressable ideas.
     * List-item anonymous blocks remain valid (see lists).
     */
    checkNamelessIdeaBlock(block: AnonymousBlock, accept: ValidationAcceptor): void {
        if (!isModel(block.$container)) {
            return;
        }
        accept(
            'warning',
            'Nameless idea block: add a name before `{` (for example `my_idea { ... }`). The block was kept so the rest of the file still parses.',
            { node: block }
        );
    }

    /**
     * Local diagnostics for recoverable but invalid import shapes.
     * Keeps the rest of the file parseable — see import_error_recovery.
     */
    checkImportSyntax(model: Model, accept: ValidationAcceptor): void {
        for (const importDecl of model.imports) {
            if (isInvalidFromImport(importDecl)) {
                accept('error', 'Invalid from-import: expected a quoted path, then `import <idea>`.', {
                    node: importDecl
                });
                continue;
            }
            if (!isFromImport(importDecl) || isWellFormedFromImport(importDecl)) {
                continue;
            }
            if (importDecl.alias) {
                accept(
                    'error',
                    `Invalid syntax: use \`import "${unquoteReqlanString(importDecl.path)}" as ${importDecl.alias}\` for a namespace import, or \`from "${unquoteReqlanString(importDecl.path)}" import <idea>\`.`,
                    { node: importDecl }
                );
                continue;
            }
            accept(
                'error',
                `Invalid from-import: expected \`from "${unquoteReqlanString(importDecl.path)}" import <idea>\`.`,
                { node: importDecl }
            );
        }
    }

    checkDuplicateImportBindings(model: Model, accept: ValidationAcceptor): void {
        const seen = new Map<string, ImportBindingSource>();
        for (const importDecl of model.imports) {
            for (const binding of importBindings(importDecl)) {
                if (seen.has(binding.name)) {
                    accept('error', `'${binding.name}' is already defined in this file.`, {
                        node: binding.node,
                        property: binding.property
                    });
                } else {
                    seen.set(binding.name, binding);
                }
            }
        }
    }

    /**
     * Duplicate check uses import *bindings* only (alias when present, otherwise the idea name).
     * An aliased import does not reserve the imported base name for local ideas.
     * Ideasets share the same name space as ideas in the file.
     * rq:["../../../reqlan rq/language/syntax.rq".idea_name]
     */
    checkDuplicateIdeaNames(model: Model, accept: ValidationAcceptor): void {
        const seen = new Map<string, AstNode>();
        for (const importDecl of model.imports) {
            for (const binding of importBindings(importDecl)) {
                seen.set(binding.name, importDecl);
            }
        }
        for (const element of model.elements) {
            if (!isIdeaDeclaration(element)) {
                continue;
            }
            const name = element.name;
            if (seen.has(name)) {
                accept('error', `'${name}' is already defined in this file.`, {
                    node: element,
                    property: 'name'
                });
                continue;
            }
            seen.set(name, element);
        }
    }

    /**
     * Error underline when an `import` / `from` path does not resolve to a file or folder.
     * Missing imported ideas are reported by the linker as unresolved references.
     */
    checkImportTargets(model: Model, accept: ValidationAcceptor): void {
        const document = AstUtils.getDocument(model);
        const { shared } = this.services;
        const pathContext = pathResolveContextFromServices(this.services);
        for (const importDecl of model.imports) {
            if (isInvalidFromImport(importDecl)) {
                continue;
            }
            if (isFromImport(importDecl) && !isWellFormedFromImport(importDecl)) {
                continue;
            }
            const rawPath = importPathOf(importDecl);
            const path = rawPath ? unquoteReqlanString(rawPath) : undefined;
            if (!path || isRemoteImportPath(path)) {
                continue;
            }
            if (isResolvableImportPath(
                path,
                document,
                shared.workspace.LangiumDocuments,
                shared.workspace.FileSystemProvider,
                pathContext
            )) {
                continue;
            }
            accept('error', `Could not resolve import '${path}'.`, {
                node: importDecl,
                property: 'path'
            });
        }
    }

    checkFileReferenceTargets(model: Model, accept: ValidationAcceptor): void {
        const document = AstUtils.getDocument(model);
        const { shared } = this.services;
        for (const link of collectFileLinks(
            document,
            shared.workspace.LangiumDocuments,
            shared.workspace.FileSystemProvider,
            pathResolveContextFromServices(this.services)
        )) {
            if (link.resolution === 'missing') {
                accept('error', fileLinkMissingMessage(link.authoredPath ?? ''), {
                    node: model,
                    range: link.sourceRange,
                    code: FILE_REFERENCE_MISSING
                });
                continue;
            }
            if (!link.targetIssue) {
                continue;
            }
            accept('warning', fileLinkTargetIssueMessage(link.targetIssue), {
                node: model,
                range: link.sourceRange
            });
        }
    }

    checkCommentReferences(model: Model, accept: ValidationAcceptor): void {
        const document = AstUtils.getDocument(model);
        const { shared } = this.services;
        for (const issue of collectCommentReferenceIssues(
            document,
            shared.workspace.LangiumDocuments,
            shared.workspace.FileSystemProvider,
            pathResolveContextFromServices(this.services)
        )) {
            accept('error', issue.message, {
                node: model,
                range: issue.range,
                code: issue.code
            });
        }
    }

    checkWildcardReferences(model: Model, accept: ValidationAcceptor): void {
        const { shared } = this.services;
        const context = pathResolveContextFromServices(this.services);
        for (const node of AstUtils.streamAst(model)) {
            if (!isWildcardReference(node)) {
                continue;
            }
            const path = parseWildcardPathPattern(node.pathPattern);
            if (!path.trim()) {
                accept('warning', 'Wildcard path pattern is empty.', { node, property: 'pathPattern' });
                continue;
            }
            const matches = resolveWildcardReferenceMatches(
                node,
                shared.workspace.LangiumDocuments,
                context
            );
            if (matches.length === 0) {
                accept(
                    'warning',
                    `No ideas match wildcard reference [${wildcardReferenceLabel(path, node.ideaPattern)}].`,
                    { node }
                );
            } else if (matches.length === 1) {
                accept(
                    'warning',
                    `Wildcard reference [${wildcardReferenceLabel(path, node.ideaPattern)}] matches only 1 idea.`,
                    { node }
                );
            }
        }
    }
}

type ImportBindingSource = ReturnType<typeof importBindings>[number];

function isRemoteImportPath(path: string): boolean {
    return /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(path);
}
