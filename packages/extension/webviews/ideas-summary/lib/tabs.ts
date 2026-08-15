/**
 * Tab order per ontology_aligned_tabs — Index last (index health).
 * rq:["../../../../../reqlan rq/ontology.rq".idea]
 * rq:["../../../../../reqlan rq/ontology.rq".ideaset]
 * rq:["../../../../../reqlan rq/ontology.rq".attribute]
 * rq:["../../../../../reqlan rq/ontology.rq".reference]
 * rq:["../../../../../reqlan rq/ontology.rq".base]
 * rq:["../../../../../reqlan rq/ontology.rq".cartographic_map]
 * rq:["../../../../../reqlan rq/extension/module/ideas_summary/webview.rq".ontology_aligned_tabs]
 */
export type Tab =
    | 'overview'
    | 'bases'
    | 'ideas'
    | 'ideasets'
    | 'attributes'
    | 'references'
    | 'graph'
    | 'timeline'
    | 'index';

export interface TabConfig {
    id: Tab;
    label: string;
}

/** Tab order per ontology_aligned_tabs — Index last (index health). */
export const TABS: TabConfig[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'bases', label: 'Bases' },
    { id: 'ideas', label: 'Ideas' },
    { id: 'ideasets', label: 'Ideasets' },
    { id: 'attributes', label: 'Attributes' },
    { id: 'references', label: 'References' },
    { id: 'graph', label: 'Graph' },
    { id: 'timeline', label: 'Timeline' },
    { id: 'index', label: 'Index' }
];
