/**
 * Wire protocol for the activity bar context webview.
 * per ["../../../../reqlan rq/extension/module/activitybar.rq"]
 */
import type {
    AncestorChainResult,
    IdeaSummary,
    ReferenceListRow,
    ReqlanContextModel
} from '@reqlan/analytical';
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

export interface IdeaSearchHitView {
    id: string;
    name: string;
    kind: string;
    path: string;
    summary: string;
    fileUri: string;
    lineStart: number;
}

export interface IdeaSearchResultsPayload {
    query: string;
    total: number;
    truncated: boolean;
    results: IdeaSearchHitView[];
}

/** Phased status while idea search catalog load / scoring is in flight. */
export type IdeaSearchProgressPhase = 'catalog' | 'search';

export interface IdeaSearchProgressPayload {
    phase: IdeaSearchProgressPhase;
    /** Human-readable status shown in the search pane. */
    message: string;
    /** Optional detail (e.g. idea count once the catalog is loaded). */
    detail?: string;
}

export interface TodoIdeaHitView {
    id: string;
    name: string;
    kind: string;
    path: string;
    summary: string;
    fileUri: string;
    lineStart: number;
    todoNote?: string;
}

export interface TodoListPayload {
    total: number;
    truncated: boolean;
    results: TodoIdeaHitView[];
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
    | { type: 'searchIdeas'; query: string; requestId?: number }
    | { type: 'loadTodos'; requestId?: number }
    | { type: 'insertReference'; fileUri: string; name: string; kind: string }
    | {
          type: 'addToChat';
          name: string;
          path: string;
          summary: string;
          lineStart: number;
      }
    | { type: 'loadIndexHealth' }
    | { type: 'refreshIndex' }
    | { type: 'cancelIndexSync' }
    | { type: 'clearAndRebuildIndex' }
    | { type: 'createBase' }
    | { type: 'selectBase'; baseId: string }
    | { type: 'pinIdea'; ideaId: string }
    | { type: 'unpinIdea'; ideaId: string }
    | { type: 'clearTray' }
    | { type: 'copyTrayMarkdown' }
    | { type: 'copyScopeMarkdown'; ideaId: string }
    | { type: 'copyContextMarkdown' }
    | { type: 'loadFileLens'; fileUri: string; requestId?: number }
    | { type: 'openIdeasSummary'; intent: IdeasSummaryIntent }
    | { type: 'openIdea'; fileUri: string; line: number; column?: number }
    | { type: 'createStubIdea'; sourceIdeaId: string; refText: string }
    | { type: 'setSyncWithEditor'; enabled: boolean }
    | { type: 'setPinnedFocus'; ideaId?: string }
    | { type: 'setIncludeIndirect'; enabled: boolean }
    | { type: 'adjustGlobalHopDepth'; delta: number }
    | {
          type: 'adjustDimensionHopDepth';
          dimension: import('@reqlan/analytical').ContextDimensionId;
          delta: number;
      }
    | { type: 'toggleContextDimension'; dimension: import('@reqlan/analytical').ContextDimensionId; enabled: boolean }
    | { type: 'setExpandedLens'; dimension?: import('@reqlan/analytical').ContextDimensionId }
    | { type: 'openPhonebookLink'; linkId: string };

export type ExtensionToActivityBarMessage =
    | { type: 'context'; model: ReqlanContextModel; requestId?: number }
    | { type: 'scope'; scope: ReqlanContextModel['currentFile']; requestId?: number }
    | { type: 'references'; payload: ReferenceListsPayload; requestId?: number }
    | { type: 'graphSlice'; slice: GraphViewSlice; requestId?: number }
    | { type: 'ancestors'; result: AncestorChainResult; requestId?: number }
    | { type: 'ideaSearchResults'; payload: IdeaSearchResultsPayload; requestId?: number }
    | {
          type: 'ideaSearchProgress';
          payload: IdeaSearchProgressPayload;
          requestId?: number;
      }
    | { type: 'todoList'; payload: TodoListPayload; requestId?: number }
    | { type: 'indexHealth'; status: IndexStatusView }
    | { type: 'tray'; tray: ContextTrayState }
    | { type: 'trayMarkdown'; text: string }
    | { type: 'scopeMarkdown'; text: string }
    | { type: 'contextMarkdown'; text: string }
    | { type: 'fileLensDetail'; detail: import('@reqlan/analytical').ContextFileLensDetail; requestId?: number }
    | {
          type: 'editorContext';
          syncWithEditor: boolean;
          globalHopDepth: number;
          minHopDepth: number;
          maxHopDepth: number;
          dimensionHopDepth: Partial<Record<import('@reqlan/analytical').ContextDimensionId, number>>;
          pinnedFocusId?: string;
      }
    | { type: 'phonebookLinks'; links: PhonebookLinkView[] }
    | { type: 'bootstrapComplete' }
    | {
          type: 'error';
          message: string;
          requestId?: number;
          scope?: ActivityBarErrorScope;
      };

/** Where an activity-bar error should surface in the UI. */
export type ActivityBarErrorScope =
    | 'bootstrap'
    | 'index'
    | 'context'
    | 'graph'
    | 'references'
    | 'ancestors'
    | 'search'
    | 'todos';
