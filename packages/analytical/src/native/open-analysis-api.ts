/**
 * Headless AnalysisApi over the core native engine.
 * rq:["../../../../reqlan rq/core_analysis/rust_port.rq".cutover]
 * rq:["../../../../reqlan rq/core_analysis/rust_port.rq".native_bridge]
 */
import {
    NativeAnalysisApi,
    type AnalysisRuntimeOptions
} from './native-analysis-api.js';
import { loadNativeEngine } from './load-native.js';

export type HeadlessAnalysisApi = NativeAnalysisApi;

export interface OpenedAnalysisApi {
    api: HeadlessAnalysisApi;
    engine: 'native';
    dispose: () => Promise<void>;
}

/**
 * Open a headless AnalysisApi via the required core native engine.
 */
export async function openAnalysisApi(options: AnalysisRuntimeOptions): Promise<OpenedAnalysisApi> {
    loadNativeEngine();
    const api = new NativeAnalysisApi(options);
    await api.ensureReady();
    return {
        api,
        engine: 'native',
        dispose: async () => undefined
    };
}
