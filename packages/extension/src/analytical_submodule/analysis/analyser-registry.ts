/**
 * Registry and contracts for graph analysers.
 */
import type { AnalyticalStore } from '../core/analytical-store.js';
import type { SqliteIndexStore } from '../index-store/sqlite-store.js';

export interface AnalyserContext {
    store: SqliteIndexStore;
    analytical: AnalyticalStore;
    workspaceRoot?: string;
}

export interface Analyser<TParams = unknown, TResult = unknown> {
    readonly id: string;
    run(context: AnalyserContext, params: TParams): Promise<TResult> | TResult;
}

export class AnalyserRegistry {
    private readonly analysers = new Map<string, Analyser<unknown, unknown>>();

    register<TParams, TResult>(analyser: Analyser<TParams, TResult>): void {
        this.analysers.set(analyser.id, analyser as Analyser<unknown, unknown>);
    }

    get(id: string): Analyser | undefined {
        return this.analysers.get(id);
    }

    async run<TParams, TResult>(context: AnalyserContext, id: string, params: TParams): Promise<TResult> {
        const analyser = this.analysers.get(id);
        if (!analyser) {
            throw new Error(`Unknown analyser: ${id}`);
        }
        const { startAnalysis, completeAnalysis, failAnalysis } = context.analytical.getState();
        startAnalysis(id, params);
        try {
            const result = await analyser.run(context, params) as TResult;
            completeAnalysis(id, result);
            return result;
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            failAnalysis(id, message);
            throw error;
        }
    }

    list(): string[] {
        return [...this.analysers.keys()];
    }
}
