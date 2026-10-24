/**
 * Plan idea move and delete edits through the native engine.
 * The planner is pure text. The caller supplies file texts and applies the edits.
 *
 * rq:["../../../../reqlan rq/extension/mutation/refactor_support.rq".refactor_symbol_move]
 * rq:["../../../../reqlan rq/extension/mutation/refactor_support.rq".refactor_symbol_delete]
 * rq:["../../../../reqlan rq/extension/mutation/refactor_native_planner.rq".refactor_native_planner]
 * rq:["../../../../reqlan rq/core_analysis/rust_port.rq".native_bridge]
 */
import { loadNativeEngine } from '../native/load-native.js';

export interface PlannerFileText {
    uri: string;
    text: string;
}

export interface PlannerTextEdit {
    range: {
        start: { line: number; character: number };
        end: { line: number; character: number };
    };
    newText: string;
}

export interface PlannerDocumentEdits {
    uri: string;
    edits: PlannerTextEdit[];
}

interface PlannerResult {
    documents?: PlannerDocumentEdits[];
}

export interface PlanIdeaMoveOptions {
    leaveStub?: boolean;
    files?: readonly PlannerFileText[];
}

export function planIdeaDelete(
    sourceUri: string,
    source: string,
    ideaName: string,
    files: readonly PlannerFileText[] = []
): PlannerDocumentEdits[] {
    const engine = loadNativeEngine();
    if (typeof engine.planIdeaDelete !== 'function') {
        throw new Error(
            'Native planIdeaDelete is missing; rebuild crates/reqlan-napi (cargo build -p reqlan-napi).'
        );
    }
    const plan = engine.planIdeaDelete(sourceUri, source, ideaName, JSON.stringify(files)) as PlannerResult;
    return plan.documents ?? [];
}

export function planIdeaMove(
    sourceUri: string,
    source: string,
    destUri: string,
    dest: string,
    ideaName: string,
    options: PlanIdeaMoveOptions = {}
): PlannerDocumentEdits[] {
    const engine = loadNativeEngine();
    if (typeof engine.planIdeaMove !== 'function') {
        throw new Error(
            'Native planIdeaMove is missing; rebuild crates/reqlan-napi (cargo build -p reqlan-napi).'
        );
    }
    const plan = engine.planIdeaMove(
        sourceUri,
        source,
        destUri,
        dest,
        ideaName,
        options.leaveStub === true,
        JSON.stringify(options.files ?? [])
    ) as PlannerResult;
    return plan.documents ?? [];
}
