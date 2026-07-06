import type { GraphLoadPhase } from '../../../src/webview_module/shared/messages.js';

const GRAPH_LOAD_PHASE_LABELS: Record<GraphLoadPhase | 'rendering' | 'idle', string> = {
    idle: 'Ready',
    queued: 'Queued',
    'checking-index': 'Checking index',
    'waiting-for-index': 'Waiting for index',
    'resolving-focus': 'Resolving focus',
    'querying-slice': 'Querying graph slice',
    'packaging-slice': 'Packaging slice',
    rendering: 'Rendering graph',
    failed: 'Failed'
};

export function graphLoadPhaseLabel(phase: GraphLoadPhase | 'rendering' | 'idle' | undefined): string {
    if (!phase || phase === 'idle') {
        return '';
    }
    return GRAPH_LOAD_PHASE_LABELS[phase] ?? phase;
}
