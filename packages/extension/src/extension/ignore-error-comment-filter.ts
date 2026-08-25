/**
 * Which diagnostics in a code file the ignore-error Quick Fix may target.
 * rq:["../../../../reqlan rq/extension/features-commands.rq".code_actions_ignore_error]
 */
import { isCommentReferenceDiagnosticCode } from '@reqlan/language';

export function isReqlanCommentDiagnostic(diagnostic: {
    source?: string;
    code?: unknown;
}): boolean {
    return diagnostic.source === 'reqlan' || isCommentReferenceDiagnosticCode(diagnostic.code);
}
