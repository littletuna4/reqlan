import * as vscode from 'vscode';
import type { ContextFileEntry, GitContextSlice } from 'reqlan-analytical';
import { toIndexFileUri } from '../analytical_submodule/index-store/resolve-index-file-uri.js';

interface GitApiRepository {
    state: {
        HEAD?: { name?: string };
        indexChanges: Array<{ uri: vscode.Uri }>;
        workingTreeChanges: Array<{ uri: vscode.Uri }>;
    };
}

interface GitExtensionApi {
    repositories: GitApiRepository[];
}

export function collectGitContext(relativePath: (uri: string) => string): GitContextSlice | undefined {
    const gitExtension = vscode.extensions.getExtension<{ getAPI(version: number): GitExtensionApi }>('vscode.git');
    const api = gitExtension?.exports?.getAPI(1);
    const repo = api?.repositories[0];
    if (!repo) {
        return undefined;
    }

    const stagedUris = new Set(repo.state.indexChanges.map(change => toIndexFileUri(change.uri)));
    const unstagedUris = new Set(repo.state.workingTreeChanges.map(change => toIndexFileUri(change.uri)));
    const allUris = new Set([...stagedUris, ...unstagedUris]);
    const changedFiles: ContextFileEntry[] = [];

    for (const fileUri of allUris) {
        const staged = stagedUris.has(fileUri);
        const unstaged = unstagedUris.has(fileUri);
        changedFiles.push({
            fileUri,
            fileLabel: relativePath(fileUri),
            gitChange: staged && unstaged ? 'both' : staged ? 'staged' : 'unstaged',
            sources: ['git']
        });
    }

    return {
        branch: repo.state.HEAD?.name,
        stagedCount: stagedUris.size,
        unstagedCount: unstagedUris.size,
        changedFiles
    };
}

export function gitChangeForFile(fileUri: string, git?: GitContextSlice): 'staged' | 'unstaged' | 'both' | undefined {
    return git?.changedFiles.find(entry => entry.fileUri === fileUri)?.gitChange;
}
