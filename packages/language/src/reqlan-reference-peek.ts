/**
 * Read a Langium cross-reference without triggering lazy linking.
 * Accessing `reference.ref` before ComputedScopes logs a warning, leaves `_ref`
 * unset on failure, and retries on every later access — which can storm the LSP
 * (especially for git: Diff buffers that stay at Parsed).
 */
import { DocumentState, isAstNode, type AstNode, type LangiumDocument, type Reference } from 'langium';
import type { DefaultReference } from 'langium';

/** True when DocumentBuilder has published local scopes (safe to resolve `.ref`). */
export function documentHasComputedScopes(document: LangiumDocument): boolean {
    return document.state >= DocumentState.ComputedScopes;
}

/**
 * Return the already-linked AST target, or undefined if linking has not produced one.
 * Does not call the `.ref` getter.
 */
export function peekResolvedRef<T extends AstNode = AstNode>(
    reference: Reference<T> | undefined
): T | undefined {
    if (!reference) {
        return undefined;
    }
    const stored = (reference as DefaultReference)._ref;
    return isAstNode(stored) ? (stored as T) : undefined;
}
