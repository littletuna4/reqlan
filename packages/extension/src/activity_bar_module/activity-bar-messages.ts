/**
 * Wire protocol for the activity bar context webview.
 * per ["../../../../reqlan rq/extension/module/activitybar.rq"]
 */
import type {
    AncestorChainResult,
    IdeaSummary,
    ReferenceListRow,
    ReqlanContextModel
} from 'reqlan-analytical';
import type { GraphViewQuery, GraphViewSlice, IdeasSummaryNavigateIntent, IndexStatusView } from '../webview_module/shared/messages.js';

export type IdeasSummaryIntent = IdeasSummaryNavigateIntent;

export interface ContextTrayState {
    pinned: IdeaSummary[];
}

export interface ReferenceListsPayload {
    ideaId: string;
    rows: ReferenceListRow[];
    grouped: Record<string, ReferenceListRow[]>;
}

export interface PhonebookLinkView {
    id: string;
    label: string;
    href: string;
}

export type ActivityBarToExtensionMessage =
    | { type: 'ready' }
    | { type: 'loadScope'; fileUri: string; line: number; requestId?: number }
    | { type: 'loadReferences'; ideaId: string; search?: string; brokenOnly?: boolean; requestId?: number }
    | { type: 'loadGraph'; query: GraphViewQuery; requestId?: number }
    | { type: 'loadAncestors'; ideaId: string; maxDepth?: number; requestId?: number }
    | { type: 'loadIndexHealth' }
    | { type: 'refreshIndex' }
    | { type: 'clearAndRebuildIndex' }
    | { type: 'pinIdea'; ideaId: string }
    | { type: 'unpinIdea'; ideaId: string }
    | { type: 'clearTray' }
    | { type: 'copyTrayMarkdown' }
    | { type: 'copyScopeMarkdown'; ideaId: string }
    | { type: 'copyContextMarkdown' }
    | { type: 'loadFileLens'; fileUri: string; requestId?: number }
    | { type: 'openIdeasSummary'; intent: IdeasSummaryIntent }
    | { type: 'openIdea'; fileUri: string; line: number; column?: number }
    | { type: 'setSyncWithEditor'; enabled: boolean }
    | { type: 'setPinnedFocus'; ideaId?: string }
    | { type: 'setIncludeIndirect'; enabled: boolean }
    | { type: 'toggleContextDimension'; dimension: import('reqlan-analytical').ContextDimensionId; enabled: boolean }
    | { type: 'setExpandedLens'; dimension?: import('reqlan-analytical').ContextDimensionId }
    | { type: 'openPhonebookLink'; linkId: string };

export type ExtensionToActivityBarMessage =
    | { type: 'context'; model: ReqlanContextModel; requestId?: number }
    | { type: 'scope'; scope: ReqlanContextModel['currentFile']; requestId?: number }
    | { type: 'references'; payload: ReferenceListsPayload; requestId?: number }
    | { type: 'graphSlice'; slice: GraphViewSlice; requestId?: number }
    | { type: 'ancestors'; result: AncestorChainResult; requestId?: number }
    | { type: 'indexHealth'; status: IndexStatusView }
    | { type: 'tray'; tray: ContextTrayState }
    | { type: 'trayMarkdown'; text: string }
    | { type: 'scopeMarkdown'; text: string }
    | { type: 'contextMarkdown'; text: string }
    | { type: 'fileLensDetail'; detail: import('reqlan-analytical').ContextFileLensDetail; requestId?: number }
    | { type: 'editorContext'; syncWithEditor: boolean; includeIndirect: boolean; pinnedFocusId?: string }
    | { type: 'phonebookLinks'; links: PhonebookLinkView[] }
    | { type: 'error'; message: string; requestId?: number };
