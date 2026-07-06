export type Tab = 'index' | 'ideas' | 'ideasets' | 'references' | 'graph';

export interface TabConfig {
    id: Tab;
    label: string;
}

export const TABS: TabConfig[] = [
    { id: 'index', label: 'Index' },
    { id: 'ideas', label: 'Ideas' },
    { id: 'ideasets', label: 'Ideasets' },
    { id: 'references', label: 'References' },
    { id: 'graph', label: 'Graph' }
];
