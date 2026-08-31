/**
 * rq:["../../../reqlan rq/extension/features-skills-and-mcp.rq".mcp_tools]
 * rq:["../../../reqlan rq/extension/features-skills-and-mcp.rq".mcp_click_retrieval]
 * rq:["../../../reqlan rq/extension/features-skills-and-mcp.rq".mcp_tools_prompt]
 * rq:["../../../reqlan rq/extension/features-skills-and-mcp.rq".mcp_check]
 * rq:["../../../reqlan rq/core-architecture.rq".mcp_package]
 * rq:["../../../reqlan rq/core_analysis/check.rq".check]
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test, vi } from "vitest";
import type { BrokenReferenceDto, ClickResult } from "@reqlan/analytical/core";
import {
  handleCheckTool,
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
  const check = vi.fn(
    async (): Promise<BrokenReferenceDto[]> => [
      {
        fileUri: "host.rq",
        sourceName: "host",
        kind: "references",
        label: "missing_idea",
        sourceLine: 1,
        severity: "error",
      },
    ],
  );
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
    check,
  };
  return { api, click, check };
}

describe("MCP tool surface", () => {
  test("MCP surface is click, check, completion_status, and prompt", async () => {
    const source = readFileSync(join(here, "../src/server.ts"), "utf8");
    const names = [...source.matchAll(/server\.registerTool\(\s*"([^"]+)"/g)].map(
      (match) => match[1],
    );
    expect(names).toEqual(["click", "check", "completion_status", "prompt"]);

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

  test("check returns JSON issue rows", async () => {
    const { api, check } = stubApi();
    const result = await handleCheckTool(api, {
      glob: "reqlan rq/**",
      wildcardZero: "error",
      wildcardOne: "off",
      skipTargets: ["**/.cursor/**"],
      skipGitignoredTargets: true,
    });
    expect(check).toHaveBeenCalledWith({
      pathGlob: "reqlan rq/**",
      wildcardZero: "error",
      wildcardOne: "off",
      skipTargets: ["**/.cursor/**"],
      skipGitignoredTargets: true,
    });
    const rows = JSON.parse(result.content[0]?.text ?? "[]") as BrokenReferenceDto[];
    expect(rows).toEqual([
      {
        fileUri: "host.rq",
        sourceName: "host",
        kind: "references",
        label: "missing_idea",
        sourceLine: 1,
        severity: "error",
      },
    ]);

    check.mockClear();
    await handleCheckTool(api, { glob: "  " });
    expect(check).toHaveBeenCalledWith({
      pathGlob: undefined,
      wildcardZero: undefined,
      wildcardOne: undefined,
      skipTargets: undefined,
      skipGitignoredTargets: undefined,
    });
  });
});
