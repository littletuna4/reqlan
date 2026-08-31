import process from "node:process";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  openAnalysisApi,
  type BrokenReferenceDto,
  type CheckOptions,
  type ClickOptions,
  type ClickResult,
  type CompletionSummary,
  type HeadlessAnalysisApi,
  type OpenedAnalysisApi,
  type SparseWildcardHandling,
} from "@reqlan/analytical/core";

export type McpAnalysisApi = {
  click(target: string, options?: ClickOptions): Promise<ClickResult>;
  formatClickResult(result: ClickResult): string;
  getCompletionStatus(): Promise<CompletionSummary>;
  check(options?: CheckOptions): Promise<BrokenReferenceDto[]>;
};

export type ClickToolInput = {
  target: string;
  sessionKey?: string;
  maxDetail?: number;
  maxBacklinks?: number;
  maxSiblings?: number;
  maxOutbound?: number;
  maxCandidates?: number;
};

export type PromptToolInput = {
  intent: string;
  filePath?: string;
  requirementName?: string;
};

export type CheckToolInput = {
  glob?: string;
  wildcardZero?: SparseWildcardHandling;
  wildcardOne?: SparseWildcardHandling;
  skipTargets?: string[];
  skipGitignoredTargets?: boolean;
};

function resolveWorkspaceRoot(): string {
  const fromEnv = process.env.REQLAN_WORKSPACE?.trim();
  if (fromEnv) {
    return fromEnv;
  }
  return process.cwd();
}

function textContent(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

function promptClickTarget(input: PromptToolInput): string {
  const requirementName = input.requirementName?.trim();
  if (requirementName !== undefined && requirementName.length > 0) {
    return requirementName;
  }
  const filePath = input.filePath?.trim();
  if (filePath !== undefined && filePath.length > 0) {
    return filePath;
  }
  return input.intent;
}

/**
 * rq:["../../../reqlan rq/cli/click.rq".click]
 * rq:["../../../reqlan rq/cli/click.rq".agent_advisory]
 * rq:["../../../reqlan rq/extension/features-skills-and-mcp.rq".mcp_click_retrieval]
 */
export async function handleClickTool(
  api: McpAnalysisApi,
  input: ClickToolInput,
) {
  const result = await api.click(input.target, {
    sessionKey: input.sessionKey,
    maxDetail: input.maxDetail,
    maxBacklinks: input.maxBacklinks,
    maxSiblings: input.maxSiblings,
    maxOutbound: input.maxOutbound,
    maxCandidates: input.maxCandidates,
  });
  return textContent(api.formatClickResult(result));
}

async function handleCompletionStatusTool(api: McpAnalysisApi) {
  const summary = await api.getCompletionStatus();
  return textContent(
    [
      `Total ideas: ${summary.total}`,
      `Outstanding: ${summary.outstanding.length}`,
      `Deprecated: ${summary.deprecated.length}`,
      `Statuses: ${Object.entries(summary.byStatus)
        .map(([key, value]) => `${key}=${value}`)
        .join(", ")}`,
    ].join("\n"),
  );
}

/**
 * rq:["../../../reqlan rq/extension/features-skills-and-mcp.rq".mcp_tools_prompt]
 * rq:["../../../reqlan rq/extension/features-skills-and-mcp.rq".mcp_click_retrieval]
 */
export async function handlePromptTool(
  api: McpAnalysisApi,
  input: PromptToolInput,
) {
  const result = await api.click(promptClickTarget(input));
  return textContent(
    [`Intent: ${input.intent}`, api.formatClickResult(result)].join("\n\n"),
  );
}

/**
 * rq:["../../../reqlan rq/extension/features-skills-and-mcp.rq".mcp_check]
 * rq:["../../../reqlan rq/core_analysis/check.rq".check]
 * rq:["../../../reqlan rq/core_analysis/check.rq".check_order_by_target]
 * rq:["../../../reqlan rq/core_analysis/check.rq".check_wildcard_zero]
 * rq:["../../../reqlan rq/core_analysis/check.rq".check_wildcard_one]
 * rq:["../../../reqlan rq/core_analysis/check.rq".check_skip_targets]
 * rq:["../../../reqlan rq/core_analysis/check.rq".check_skip_gitignored_targets]
 * rq:["../../../reqlan rq/language/syntax.rq".comment_reference_ignore]
 */
export async function handleCheckTool(
  api: McpAnalysisApi,
  input: CheckToolInput,
) {
  const glob = input.glob?.trim();
  const rows = await api.check({
    pathGlob: glob !== undefined && glob.length > 0 ? glob : undefined,
    wildcardZero: input.wildcardZero,
    wildcardOne: input.wildcardOne,
    skipTargets: input.skipTargets,
    skipGitignoredTargets: input.skipGitignoredTargets,
  });
  return textContent(JSON.stringify(rows, null, 2));
}

/**
 * rq:["../../../reqlan rq/extension/features-skills-and-mcp.rq".mcp_tools]
 * rq:["../../../reqlan rq/extension/features-skills-and-mcp.rq".mcp_click_retrieval]
 * rq:["../../../reqlan rq/extension/features-skills-and-mcp.rq".mcp_check]
 */
export function createReqlanMcpServer(api: McpAnalysisApi): McpServer {
  const server = new McpServer({
    name: "reqlan",
    version: "0.0.1",
  });

  server.registerTool(
    "click",
    {
      description:
        "Canonical search and retrieval. Return compact context for an idea name, path#idea, .rq file, or indexed code file. No match uses search. More than one match is ranked by distance from ideas already in the session. A unique match returns idea content plus outbound, backlink, and sibling names (no edges). A second click on the same centre in this session returns connected content. Always pass sessionKey from the prior click on the next call. Use this tool instead of search, list, file context, local graph, or subtree dumps.",
      inputSchema: {
        target: z
          .string()
          .describe("Idea name, path#idea, .rq file, or indexed code file"),
        sessionKey: z
          .string()
          .optional()
          .describe("Click session key from a prior click response"),
        maxDetail: z
          .number()
          .int()
          .positive()
          .max(8)
          .optional()
          .describe("Deprecated hop-depth flag; ignored on the unique path"),
        maxBacklinks: z
          .number()
          .int()
          .positive()
          .optional()
          .describe("Max backlink names (default 8)"),
        maxSiblings: z
          .number()
          .int()
          .positive()
          .optional()
          .describe("Max sibling names (default 8)"),
        maxOutbound: z
          .number()
          .int()
          .positive()
          .optional()
          .describe("Max outbound names (default 8)"),
        maxCandidates: z
          .number()
          .int()
          .positive()
          .optional()
          .describe("Max search hits and ranked ambiguous matches (default 8)"),
      },
    },
    async (input) => handleClickTool(api, input),
  );

  server.registerTool(
    "check",
    {
      description:
        "Check that idea, comment, and file references resolve. Returns JSON issue rows ordered by missing target. Empty array means no issues. Optional glob limits to a path subset. wildcardZero and wildcardOne are warn (default), error, or off. skipTargets omits issues whose missing target matches a glob. skipGitignoredTargets omits missing file targets that Git ignore rules ignore. Lines after //rq-ignore-error are skipped.",
      inputSchema: {
        glob: z
          .string()
          .optional()
          .describe("Optional path glob that limits the check to a subset of the base"),
        wildcardZero: z
          .enum(["warn", "error", "off"])
          .optional()
          .describe("How to handle a wildcard that matches 0 ideas (default warn)"),
        wildcardOne: z
          .enum(["warn", "error", "off"])
          .optional()
          .describe("How to handle a wildcard that matches 1 idea (default warn)"),
        skipTargets: z
          .array(z.string())
          .optional()
          .describe("Omit issues whose missing target matches one of these globs"),
        skipGitignoredTargets: z
          .boolean()
          .optional()
          .describe("Omit file-reference issues whose missing target is gitignored"),
      },
    },
    async (input) => handleCheckTool(api, input),
  );

  server.registerTool(
    "completion_status",
    {
      description:
        "Summarise completion and deprecation status across the workspace graph.",
    },
    async () => handleCompletionStatusTool(api),
  );

  server.registerTool(
    "prompt",
    {
      description:
        "Prompt-oriented entry point. Resolves search and retrieval through click.",
      inputSchema: {
        intent: z
          .string()
          .describe("What you want to know or do with the requirement graph"),
        filePath: z
          .string()
          .optional()
          .describe("Optional .rq file or indexed path to click"),
        requirementName: z
          .string()
          .optional()
          .describe("Optional requirement name to click"),
      },
    },
    async (input) => handlePromptTool(api, input),
  );

  return server;
}

export async function startMcpServer(): Promise<void> {
  const workspaceRoot = resolveWorkspaceRoot();
  const opened: OpenedAnalysisApi = await openAnalysisApi({
    workspaceRoot,
    storagePath: process.env.REQLAN_INDEX_PATH,
  });
  const api: HeadlessAnalysisApi = opened.api;

  const server = createReqlanMcpServer(api);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  const shutdown = async () => {
    await opened.dispose();
    await server.close();
  };
  process.on("SIGINT", () => {
    void shutdown().finally(() => process.exit(0));
  });
  process.on("SIGTERM", () => {
    void shutdown().finally(() => process.exit(0));
  });
}
