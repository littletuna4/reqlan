/**
 * rq:["../../../reqlan rq/extension/features-skills-and-mcp.rq".mcp_tools]
 * rq:["../../../reqlan rq/extension/features-skills-and-mcp.rq".mcp_click_retrieval]
 * rq:["../../../reqlan rq/extension/features-skills-and-mcp.rq".mcp_tools_prompt]
 * rq:["../../../reqlan rq/extension/features-skills-and-mcp.rq".mcp_interaction_discovery]
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test, vi } from "vitest";
import type { ClickResult, CompletionSummary } from "@reqlan/analytical/core";
import {
  MCP_REMOVED_RETRIEVAL_TOOLS,
  MCP_TOOL_NAMES,
  createReqlanMcpServer,
  handleClickTool,
  handleCompletionStatusTool,
  handlePromptTool,
  promptClickTarget,
  type McpAnalysisApi,
} from "../src/server.js";

const here = dirname(fileURLToPath(import.meta.url));
const serverSource = readFileSync(join(here, "../src/server.ts"), "utf8");

function mockApi(overrides: Partial<McpAnalysisApi> = {}): McpAnalysisApi {
  const clickResult: ClickResult = {
    sessionKey: "clk-test",
    kind: "unique",
    target: {
      name: "alpha",
      id: "idea:alpha",
      kind: "idea",
      fileUri: "graph.rq",
      lineStart: 0,
      content: "root",
      status: "done",
    },
  };
  const completion: CompletionSummary = {
    total: 2,
    byStatus: { done: 1, pending: 1 },
    byTag: {},
    outstanding: [],
    deprecated: [],
  };
  return {
    click: overrides.click ?? (async () => clickResult),
    formatClickResult:
      overrides.formatClickResult ??
      ((result: ClickResult) => `formatted:${result.kind}:${result.sessionKey}`),
    getCompletionStatus:
      overrides.getCompletionStatus ?? (async () => completion),
  };
}

function registeredToolNames(): string[] {
  const names: string[] = [];
  const pattern = /server\.registerTool\(\s*"([^"]+)"/g;
  let match = pattern.exec(serverSource);
  while (match !== null) {
    const name = match[1];
    if (name !== undefined) {
      names.push(name);
    }
    match = pattern.exec(serverSource);
  }
  return names;
}

describe("MCP tool surface", () => {
  test("registers only click, completion_status, and prompt", () => {
    expect([...MCP_TOOL_NAMES]).toEqual([
      "click",
      "completion_status",
      "prompt",
    ]);
    expect(registeredToolNames()).toEqual([...MCP_TOOL_NAMES]);
    createReqlanMcpServer(mockApi());
  });

  test("does not register removed retrieval tools", () => {
    const names = new Set(registeredToolNames());
    for (const removed of MCP_REMOVED_RETRIEVAL_TOOLS) {
      expect(names.has(removed), removed).toBe(false);
      expect(serverSource).not.toMatch(
        new RegExp(`registerTool\\(\\s*["']${removed}["']`),
      );
    }
  });

  test("click is the retrieval tool and calls AnalysisApi.click", async () => {
    const click = vi.fn(async (target: string) => ({
      sessionKey: "clk-1",
      kind: "search",
      candidates: [
        {
          name: target,
          id: `idea:${target}`,
          kind: "idea",
          fileUri: "graph.rq",
        },
      ],
    }));
    const api = mockApi({ click });
    const result = await handleClickTool(api, {
      target: "empty password",
      sessionKey: "clk-0",
      maxCandidates: 4,
    });
    expect(click).toHaveBeenCalledWith("empty password", {
      sessionKey: "clk-0",
      maxDetail: undefined,
      maxBacklinks: undefined,
      maxSiblings: undefined,
      maxOutbound: undefined,
      maxCandidates: 4,
    });
    expect(result.content[0]?.text).toBe("formatted:search:clk-1");
  });

  test("prompt retrieval uses click", async () => {
    const click = vi.fn(async (target: string) => ({
      sessionKey: "clk-p",
      kind: "unique",
      target: {
        name: target,
        id: `idea:${target}`,
        kind: "idea",
        fileUri: "auth.rq",
        lineStart: 0,
        content: "body",
        status: null,
      },
    }));
    const api = mockApi({ click });
    const named = await handlePromptTool(api, {
      intent: "session expiry",
      requirementName: "session_expiry",
    });
    expect(click).toHaveBeenCalledWith("session_expiry");
    expect(named.content[0]?.text).toContain("Intent: session expiry");
    expect(named.content[0]?.text).toContain("formatted:unique:clk-p");

    click.mockClear();
    await handlePromptTool(api, {
      intent: "related requirements",
      filePath: "src/auth/session.ts",
    });
    expect(click).toHaveBeenCalledWith("src/auth/session.ts");

    click.mockClear();
    await handlePromptTool(api, { intent: "empty password" });
    expect(click).toHaveBeenCalledWith("empty password");
  });

  test("promptClickTarget prefers requirement, then file, then intent", () => {
    expect(
      promptClickTarget({
        intent: "find auth",
        filePath: "auth.rq",
        requirementName: "login",
      }),
    ).toBe("login");
    expect(
      promptClickTarget({ intent: "find auth", filePath: "auth.rq" }),
    ).toBe("auth.rq");
    expect(promptClickTarget({ intent: "find auth" })).toBe("find auth");
  });

  test("completion_status still summarises the graph", async () => {
    const result = await handleCompletionStatusTool(mockApi());
    expect(result.content[0]?.text).toContain("Total ideas: 2");
    expect(result.content[0]?.text).toContain("Statuses: done=1, pending=1");
  });
});
