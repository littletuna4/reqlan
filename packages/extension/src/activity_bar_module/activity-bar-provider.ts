import * as vscode from 'vscode';
import type { AnalyserContext, AnalyserRegistry, GraphSlice, IdeaSummary } from 'reqlan-analytical';
import type { IndexService } from '../analytical_submodule/index-store/index-service.js';
import { toIndexFileUri } from '../analytical_submodule/index-store/resolve-index-file-uri.js';

type SectionId = 'current-file' | 'current-idea' | 'referencing-ideas' | 'local-graph';

type ItemKind = 'section' | 'subsection' | 'file' | 'idea' | 'graph-node' | 'graph-edge' | 'placeholder';

export class ActivityBarItem extends vscode.TreeItem {
    constructor(
        label: string,
        collapsibleState: vscode.TreeItemCollapsibleState,
        readonly itemKind: ItemKind,
        readonly sectionId?: SectionId,
        readonly idea?: IdeaSummary
    ) {
        super(label, collapsibleState);
        this.contextValue = itemKind;

        if (idea) {
            this.description = vscode.workspace.asRelativePath(idea.fileUri);
            this.tooltip = idea.summary || idea.name;
            this.iconPath = new vscode.ThemeIcon('symbol-class');
            this.command = {
                command: 'reqlan.openIdeaFromActivityBar',
                title: 'Open Idea',
                arguments: [idea.fileUri, idea.lineStart]
            };
        } else if (itemKind === 'file') {
            this.iconPath = new vscode.ThemeIcon('file');
        } else if (itemKind === 'section' || itemKind === 'subsection') {
            this.iconPath = new vscode.ThemeIcon('folder');
        } else if (itemKind === 'graph-node') {
            this.iconPath = new vscode.ThemeIcon('circle-outline');
        } else if (itemKind === 'graph-edge') {
            this.iconPath = new vscode.ThemeIcon('arrow-right');
        } else if (itemKind === 'placeholder') {
            this.iconPath = new vscode.ThemeIcon('info');
        }
    }
}

interface ActivityBarSnapshot {
    indexReady: boolean;
    fileUri?: string;
    fileLabel: string;
    currentIdea?: IdeaSummary;
    referencingIdeas: IdeaSummary[];
    graph?: GraphSlice;
}

const SECTIONS: Array<{ id: SectionId; label: string }> = [
    { id: 'current-file', label: 'Current File' },
    { id: 'current-idea', label: 'Current Idea' },
    { id: 'referencing-ideas', label: 'Referencing Ideas' },
    { id: 'local-graph', label: 'Local Graph' }
];

export class ActivityBarProvider implements vscode.TreeDataProvider<ActivityBarItem> {
    private readonly _onDidChangeTreeData = new vscode.EventEmitter<ActivityBarItem | undefined>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private snapshot: ActivityBarSnapshot = {
        indexReady: false,
        fileLabel: 'No file open',
        referencingIdeas: []
    };

    constructor(
        private readonly index: IndexService,
        private readonly analysers: AnalyserRegistry,
        private readonly makeContext: () => AnalyserContext
    ) {}

    refresh(): void {
        void this.rebuildSnapshot().then(() => {
            this._onDidChangeTreeData.fire(undefined);
        });
    }

    getTreeItem(element: ActivityBarItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: ActivityBarItem): ActivityBarItem[] {
        if (!element) {
            return SECTIONS.map(
                section =>
                    new ActivityBarItem(
                        section.label,
                        vscode.TreeItemCollapsibleState.Expanded,
                        'section',
                        section.id
                    )
            );
        }

        if (!this.snapshot.indexReady) {
            return [new ActivityBarItem('Indexing workspace…', vscode.TreeItemCollapsibleState.None, 'placeholder')];
        }

        if (element.itemKind === 'subsection') {
            return this.childrenForGraphSubsection(element);
        }

        switch (element.sectionId) {
            case 'current-file':
                return this.childrenForCurrentFile();
            case 'current-idea':
                return this.childrenForCurrentIdea();
            case 'referencing-ideas':
                return this.childrenForReferencingIdeas();
            case 'local-graph':
                return this.childrenForLocalGraph();
            default:
                return [];
        }
    }

    private childrenForCurrentFile(): ActivityBarItem[] {
        if (!this.snapshot.fileUri) {
            return [new ActivityBarItem('Open a .rq file', vscode.TreeItemCollapsibleState.None, 'placeholder')];
        }
        return [
            new ActivityBarItem(this.snapshot.fileLabel, vscode.TreeItemCollapsibleState.None, 'file')
        ];
    }

    private childrenForCurrentIdea(): ActivityBarItem[] {
        if (!this.snapshot.fileUri) {
            return [new ActivityBarItem('No reqlan file active', vscode.TreeItemCollapsibleState.None, 'placeholder')];
        }
        if (!this.snapshot.currentIdea) {
            return [new ActivityBarItem('No idea at cursor', vscode.TreeItemCollapsibleState.None, 'placeholder')];
        }
        return [
            new ActivityBarItem(
                this.snapshot.currentIdea.name,
                vscode.TreeItemCollapsibleState.None,
                'idea',
                undefined,
                this.snapshot.currentIdea
            )
        ];
    }

    private childrenForReferencingIdeas(): ActivityBarItem[] {
        if (!this.snapshot.fileUri) {
            return [new ActivityBarItem('No reqlan file active', vscode.TreeItemCollapsibleState.None, 'placeholder')];
        }
        if (this.snapshot.referencingIdeas.length === 0) {
            return [new ActivityBarItem('No referencing ideas', vscode.TreeItemCollapsibleState.None, 'placeholder')];
        }
        return this.snapshot.referencingIdeas.map(
            idea =>
                new ActivityBarItem(idea.name, vscode.TreeItemCollapsibleState.None, 'idea', undefined, idea)
        );
    }

    private childrenForLocalGraph(): ActivityBarItem[] {
        if (!this.snapshot.fileUri) {
            return [new ActivityBarItem('No reqlan file active', vscode.TreeItemCollapsibleState.None, 'placeholder')];
        }
        if (!this.snapshot.graph || this.snapshot.graph.nodes.length === 0) {
            return [new ActivityBarItem('No graph around current idea', vscode.TreeItemCollapsibleState.None, 'placeholder')];
        }

        const nodes = new ActivityBarItem(
            `Nodes (${this.snapshot.graph.nodes.length})`,
            vscode.TreeItemCollapsibleState.Collapsed,
            'subsection',
            'local-graph'
        );
        nodes.id = 'local-graph:nodes';

        const edges = new ActivityBarItem(
            `Edges (${this.snapshot.graph.edges.length})`,
            vscode.TreeItemCollapsibleState.Collapsed,
            'subsection',
            'local-graph'
        );
        edges.id = 'local-graph:edges';

        return [nodes, edges];
    }

    private childrenForGraphSubsection(element: ActivityBarItem): ActivityBarItem[] {
        const graph = this.snapshot.graph;
        if (!graph) {
            return [];
        }

        if (element.id === 'local-graph:nodes') {
            return graph.nodes.map(
                node =>
                    new ActivityBarItem(node.name, vscode.TreeItemCollapsibleState.None, 'graph-node', undefined, node)
            );
        }

        if (element.id === 'local-graph:edges') {
            return graph.edges.map(edge => {
                const target = edge.targetId ?? edge.targetFile ?? edge.label ?? '?';
                const label = `${edge.kind}: ${shortId(edge.sourceId)} → ${shortId(target)}`;
                return new ActivityBarItem(label, vscode.TreeItemCollapsibleState.None, 'graph-edge');
            });
        }

        return [];
    }

    private async rebuildSnapshot(): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document.languageId !== 'reqlan') {
            this.snapshot = {
                indexReady: this.index.isReady,
                fileLabel: 'No file open',
                referencingIdeas: []
            };
            return;
        }

        try {
            if (!this.index.isReady) {
                await this.index.syncWorkspace();
            }

            const fileUri = toIndexFileUri(editor.document.uri);
            const fileLabel = vscode.workspace.asRelativePath(editor.document.uri);
            const line = editor.selection.active.line;
            const ideasInFile = await this.index.indexStore.getAllIdeasRaw();
            const ideasInCurrentFile = ideasInFile.filter(idea => idea.fileUri === fileUri);
            const currentIdeaRecord = ideaAtLine(ideasInCurrentFile, line);
            const currentIdea = currentIdeaRecord ? await this.index.indexStore.getIdea(currentIdeaRecord.id) : undefined;
            const ideasInFileSummaries = await this.index.indexStore.getIdeasInFile(fileUri);
            const centerIdea = currentIdea ?? ideasInFileSummaries[0];

            const referencingIdeas = centerIdea ? await collectReferencingIdeas(this.index, centerIdea.id) : [];

            let graph: GraphSlice | undefined;
            if (centerIdea) {
                graph = await this.analysers.run<{ centerId: string; depth?: number }, GraphSlice>(
                    this.makeContext(),
                    'local_graph_analysis',
                    { centerId: centerIdea.id, depth: 1 }
                );
            }

            this.snapshot = {
                indexReady: this.index.isReady,
                fileUri,
                fileLabel,
                currentIdea,
                referencingIdeas,
                graph
            };
        } catch {
            this.snapshot = {
                indexReady: false,
                fileLabel: vscode.workspace.asRelativePath(editor.document.uri),
                referencingIdeas: []
            };
        }
    }
}

function ideaAtLine(
    ideas: Array<{ id: string; lineStart: number; lineEnd: number }>,
    line: number
): { id: string; lineStart: number; lineEnd: number } | undefined {
    return ideas
        .filter(idea => idea.lineStart <= line && line <= idea.lineEnd)
        .sort((a, b) => b.lineStart - a.lineStart)[0];
}

async function collectReferencingIdeas(index: IndexService, ideaId: string): Promise<IdeaSummary[]> {
    const ids = new Set<string>();
    for (const edge of await index.indexStore.getEdgesTo(ideaId)) {
        ids.add(edge.sourceId);
    }
    return (
        await Promise.all([...ids].map(id => index.indexStore.getIdea(id)))
    )
        .filter((idea): idea is IdeaSummary => idea !== undefined)
        .sort((a, b) => a.name.localeCompare(b.name));
}

function shortId(value: string): string {
    const hashIndex = value.lastIndexOf('#');
    return hashIndex >= 0 ? value.slice(hashIndex + 1) : value;
}
