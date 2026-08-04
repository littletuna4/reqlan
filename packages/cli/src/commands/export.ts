import { Command, Option } from 'clipanion';
import { resolve } from 'node:path';
import {
    toWorkspaceRelativePath,
    type ExportClusterStrategy,
    type ExportRuntimeMode,
    type ExportScope
} from '@reqlan/analytical';
import { withAnalysisApi, resolveWorkspaceRoot } from '../runtime.js';
import { emit } from '../output.js';

const RUNTIME_MODES = new Set<ExportRuntimeMode>(['interactive', 'document', 'print']);
const CLUSTER_STRATEGIES = new Set<ExportClusterStrategy>(['hybrid', 'deterministic']);

export class ExportCommand extends Command {
    static override paths = [['export'], ['export', 'html']];

    static override usage = Command.Usage({
        description: 'Export the requirement graph as a multi-file static HTML site.',
        details: `
            Writes an HTML export under <output>/<name>/.
            Use --exclude-secret to omit *.secret.rq files from the export.
            Use --exclude-ignored to omit paths matched by .reqlan/.rqignore.
        `,
        examples: [
            ['Workspace HTML export', '$0 export --output ./reqlan-export --name workspace'],
            ['Public non-secret graph', '$0 export html --exclude-secret --output ./out --name spec'],
            [
                'Site embed with mount + home link',
                '$0 export html --exclude-secret --url-base /spec --header-href / --header-label reqlan --output ./out --name spec'
            ],
            ['Current-file scope', '$0 export --file ./reqlan\\ rq/cli/cli_package.rq --output ./tmp']
        ]
    });

    output = Option.String('-o,--output', {
        description: 'Parent directory for the export folder (default: <cwd>/reqlan-export)'
    });
    name = Option.String('-n,--name', 'reqlan-export', {
        description: 'Export folder name (default: reqlan-export)'
    });
    file = Option.String('-f,--file', {
        description: 'Export only the given .rq file and its local graph'
    });
    runtimeMode = Option.String('--runtime-mode', 'interactive', {
        description: 'HTML runtime mode: interactive | document | print (default: interactive)'
    });
    clusterStrategy = Option.String('--cluster-strategy', 'hybrid', {
        description: 'Cluster strategy: hybrid | deterministic (default: hybrid)'
    });
    excludeSecret = Option.Boolean('--exclude-secret', false, {
        description: 'Omit ideas hosted in *.secret.rq files'
    });
    excludeIgnored = Option.Boolean('--exclude-ignored', false, {
        description: 'Omit ideas hosted in paths matched by .reqlan/.rqignore'
    });
    urlBase = Option.String('--url-base', {
        description: 'Absolute URL prefix for the export mount (e.g. /spec or /reqlan/spec)'
    });
    headerHref = Option.String('--header-href', {
        description: 'Optional topbar link href back to a parent site'
    });
    headerLabel = Option.String('--header-label', {
        description: 'Optional topbar link label (requires --header-href)'
    });
    cwd = Option.String('--cwd', {
        description: 'Workspace root (default: walk from cwd, or REQLAN_WORKSPACE)'
    });
    json = Option.Boolean('--json', false, {
        description: 'Emit machine-readable JSON with export paths'
    });

    async execute(): Promise<number> {
        const runtimeMode = this.runtimeMode as ExportRuntimeMode;
        if (!RUNTIME_MODES.has(runtimeMode)) {
            this.context.stderr.write(
                `Invalid --runtime-mode "${this.runtimeMode}". Expected interactive, document, or print.\n`
            );
            return 1;
        }
        const clusterStrategy = this.clusterStrategy as ExportClusterStrategy;
        if (!CLUSTER_STRATEGIES.has(clusterStrategy)) {
            this.context.stderr.write(
                `Invalid --cluster-strategy "${this.clusterStrategy}". Expected hybrid or deterministic.\n`
            );
            return 1;
        }

        const headerHref = this.headerHref?.trim();
        const headerLabel = this.headerLabel?.trim();
        if ((headerHref && !headerLabel) || (!headerHref && headerLabel)) {
            this.context.stderr.write(
                'Both --header-href and --header-label are required when setting a header link.\n'
            );
            return 1;
        }

        const exportName = this.name.trim() || 'reqlan-export';
        if (/[\\/]/.test(exportName)) {
            this.context.stderr.write('Export name cannot contain path separators.\n');
            return 1;
        }

        const workspaceRoot = resolveWorkspaceRoot(this.cwd);
        const outputDir = resolve(this.output?.trim() || resolve(workspaceRoot, 'reqlan-export'));
        const scope: ExportScope = this.file ? 'currentFile' : 'workspace';
        const sourceFileUri = this.file
            ? toWorkspaceRelativePath(resolve(workspaceRoot, this.file), workspaceRoot)
            : undefined;

        try {
            await withAnalysisApi(this.cwd, async api => {
                const result = await api.exportHtml({
                    format: 'html',
                    outputDir,
                    exportName,
                    templateId: 'default',
                    scope,
                    sourceFileUri,
                    includeRequirementsPage: true,
                    includeGraphPage: true,
                    printEntryFileName: 'print.html',
                    runtimeMode,
                    clusterStrategy,
                    includeIdeaPages: true,
                    includeFilePages: true,
                    includeCodeFilePages: true,
                    includeClusterPages: true,
                    includeAttributePages: true,
                    includePrintPages: true,
                    excludeSecretFiles: this.excludeSecret,
                    excludeIgnoredFiles: this.excludeIgnored,
                    urlBase: this.urlBase?.trim() || undefined,
                    headerLink: headerHref && headerLabel
                        ? { href: headerHref, label: headerLabel }
                        : undefined
                });

                if (this.json) {
                    emit({
                        outputDir: result.outputDir,
                        indexFilePath: result.indexFilePath,
                        printFilePath: result.printFilePath,
                        graphFilePath: result.graphFilePath,
                        dataFilePath: result.dataFilePath
                    }, true);
                    return;
                }
                emit(`Exported HTML site to ${result.outputDir}`, false);
            });
            return 0;
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.context.stderr.write(`${message}\n`);
            return 1;
        }
    }
}
