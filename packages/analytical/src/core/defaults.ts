/**
 * Shared product defaults. Native crates embed this JSON at build time.
 * rq:["../../../../reqlan rq/indexer/sequencing.rq".scan_limits]
 * rq:["../../../../reqlan rq/cli/click.rq".click_session_limit]
 * rq:["../../../../reqlan rq/cli/click.rq".click_max_detail]
 * rq:["../../../../reqlan rq/language/parser_lexer.rq".parse_budget_timeout]
 * rq:["../../../../reqlan rq/language/imports.rq".configuration_import_root_alias]
 * rq:["../../../../reqlan rq/extension/index-host/index.rq".rqignore]
 */
import defaults from './defaults.json' with { type: 'json' };

const settings = defaults satisfies {
    scan: {
        defaultMaxDepth: number;
        defaultMaxEntries: number;
        minDepth: number;
        maxDepthLimit: number;
        minEntries: number;
        maxEntriesLimit: number;
    };
    click: {
        maxSessions: number;
        listLimit: number;
        minimum: number;
    };
    importRootAlias: string;
    parseBudgetMs: number;
    graphHopDepth: number;
    paths: {
        applicationMemoryDir: string;
        configFilename: string;
        rqignoreFilename: string;
        gitignoreFilename: string;
        ideasIndexFilename: string;
        indexDiagnosticsFilename: string;
        clickSessionsFilename: string;
    };
    rqignore: {
        groups: readonly { title: string; patterns: readonly string[] }[];
        binaryTitle: string;
        binary: readonly string[];
        seedHeader: readonly string[];
    };
};

export const DEFAULT_SCAN_MAX_DEPTH = settings.scan.defaultMaxDepth;
export const DEFAULT_SCAN_MAX_ENTRIES = settings.scan.defaultMaxEntries;
export const SCAN_MIN_DEPTH = settings.scan.minDepth;
export const SCAN_MAX_DEPTH_LIMIT = settings.scan.maxDepthLimit;
export const SCAN_MIN_ENTRIES = settings.scan.minEntries;
export const SCAN_MAX_ENTRIES_LIMIT = settings.scan.maxEntriesLimit;

export const DEFAULT_CLICK_MAX_SESSIONS = settings.click.maxSessions;
export const DEFAULT_CLICK_LIST_LIMIT = settings.click.listLimit;
export const CLICK_LIMIT_MIN = settings.click.minimum;

export const DEFAULT_IMPORT_ROOT_ALIAS = settings.importRootAlias;
export const DEFAULT_PARSE_BUDGET_MS = settings.parseBudgetMs;
export const GRAPH_HOP_DEPTH = settings.graphHopDepth;

export const APPLICATION_MEMORY_DIR = settings.paths.applicationMemoryDir;
export const CONFIG_FILENAME = settings.paths.configFilename;
export const RQIGNORE_FILENAME = settings.paths.rqignoreFilename;
export const GITIGNORE_FILENAME = settings.paths.gitignoreFilename;
export const IDEAS_INDEX_FILENAME = settings.paths.ideasIndexFilename;
export const INDEX_DIAGNOSTICS_FILENAME = settings.paths.indexDiagnosticsFilename;
export const CLICK_SESSIONS_FILENAME = settings.paths.clickSessionsFilename;

export const RQIGNORE_GROUPS = settings.rqignore.groups;
export const RQIGNORE_BINARY_TITLE = settings.rqignore.binaryTitle;
export const BINARY_RQIGNORE_PATTERNS = settings.rqignore.binary;
export const RQIGNORE_SEED_HEADER = settings.rqignore.seedHeader;
