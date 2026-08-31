/**
 * rq:["../../../reqlan rq/extension/features-skills-and-mcp.rq".mcp_tools]
 * rq:["../../../reqlan rq/extension/features-skills-and-mcp.rq".mcp_click_retrieval]
 * rq:["../../../reqlan rq/extension/features-skills-and-mcp.rq".mcp_tools_prompt]
 * rq:["../../../reqlan rq/core-architecture.rq".mcp_package]
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test, vi } from "vitest";
import type { ClickResult } from "@reqlan/analytical/core";
import {
  handleClickTool,
  handlePromptTool,
  type McpAnalysisApi,
} from "../src/server.js";

const here = dirname(fileURLToPath(import.meta.url));

function stubApi() {
  const click = vi.fn(async (_target: string): Promise<ClickResult> => ({
    sessionKey: "clk-1",
    kind: "unique",
  }));
  const api: McpAnalysisApi = {
    click,
    formatClickResult: (result) => result.sessionKey,
    getCompletionStatus: async () => ({
      total: 0,
      byStatus: {},
      byTag: {},
      outstanding: [],
      deprecated: [],
    }),
  };
  return { api, click };
}

describe("MCP tool surface", () => {
  test("MCP surface is click, completion_status, and prompt", async () => {
    const source = readFileSync(join(here, "../src/server.ts"), "utf8");
    const names = [...source.matchAll(/server\.registerTool\(\s*"([^"]+)"/g)].map(
      (match) => match[1],
    );
    expect(names).toEqual(["click", "completion_status", "prompt"]);

    const pkg = JSON.parse(
      readFileSync(join(here, "../package.json"), "utf8"),
    ) as { mcpName: string };
    expect(pkg.mcpName).toBe("io.github.littletuna4/reqlan");

    const { api, click } = stubApi();
    const clicked = await handleClickTool(api, {
      target: "alpha",
      sessionKey: "clk-0",
    });
    expect(click).toHaveBeenCalledWith("alpha", {
      sessionKey: "clk-0",
      maxDetail: undefined,
      maxBacklinks: undefined,
      maxSiblings: undefined,
      maxOutbound: undefined,
      maxCandidates: undefined,
    });
    expect(clicked.content[0]?.text).toBe("clk-1");

    click.mockClear();
    const prompt = await handlePromptTool(api, {
      intent: "auth",
      requirementName: "login",
    });
    expect(click).toHaveBeenCalledWith("login");
    expect(prompt.content[0]?.text).toContain("Intent: auth");
  });
});
