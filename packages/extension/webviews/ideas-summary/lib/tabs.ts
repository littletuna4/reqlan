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
