/**
 * rq:["../../../reqlan rq/extension/agent/skills-and-mcp.rq".mcp_tools]
 * rq:["../../../reqlan rq/extension/agent/skills-and-mcp.rq".mcp_click_retrieval]
 * rq:["../../../reqlan rq/extension/agent/skills-and-mcp.rq".mcp_tools_prompt]
 * rq:["../../../reqlan rq/extension/agent/skills-and-mcp.rq".mcp_check]
 * rq:["../../../reqlan rq/extension/agent/skills-and-mcp.rq".mcp_diff]
 * rq:["../../../reqlan rq/cli/diff.rq".diff]
 * rq:["../../../reqlan rq/core-architecture.rq".mcp_package]
 * rq:["../../../reqlan rq/core_analysis/check.rq".check]
 * rq:["../../../reqlan rq/core_analysis/check.rq".check_glob_patterns]
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test, vi } from "vitest";
import { openAnalysisApi, type BrokenReferenceDto, type ClickResult } from "@reqlan/analytical/core";
import {
  handleCheckTool,
  handleClickTool,
  handleDiffTool,
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
    diffIdeas: vi.fn(async () => ({ from: "HEAD~1", to: "HEAD", implicit: true, rows: [] })),
  };
  return { api, click, check };
}

describe("MCP tool surface", () => {
  test("MCP surface is click, check, diff, completion_status, and prompt", async () => {
    const source = readFileSync(join(here, "../src/server.ts"), "utf8");
    const names = [...source.matchAll(/server\.registerTool\(\s*"([^"]+)"/g)].map(
      (match) => match[1],
    );
    expect(names).toEqual(["click", "check", "diff", "completion_status", "prompt"]);

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
      pathGlobs: ["reqlan rq/**"],
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
      pathGlobs: undefined,
      wildcardZero: undefined,
      wildcardOne: undefined,
      skipTargets: undefined,
      skipGitignoredTargets: undefined,
    });
  });

  test("check accepts one glob or a list of globs", async () => {
    // rq:["../../../reqlan rq/core_analysis/check.rq".check_glob_patterns]
    const { api, check } = stubApi();
    await handleCheckTool(api, { glob: ["a/**", "b/**"] });
    expect(check).toHaveBeenCalledWith({
      pathGlobs: ["a/**", "b/**"],
      wildcardZero: undefined,
      wildcardOne: undefined,
      skipTargets: undefined,
      skipGitignoredTargets: undefined,
    });
    await expect(handleCheckTool(api, { glob: ["", "a/**"] })).rejects.toThrow(
      "glob must not be empty",
    );
  });
});

function git(dir: string, args: string[]): string {
  return execFileSync("git", args, { cwd: dir, encoding: "utf8" }).trim();
}

function initRepo(dir: string): void {
  git(dir, ["init", "-b", "main"]);
  git(dir, ["config", "user.email", "diff@example.com"]);
  git(dir, ["config", "user.name", "Diff Test"]);
  git(dir, ["config", "commit.gpgsign", "false"]);
}

function commitAll(dir: string, message: string): string {
  git(dir, ["add", "-A"]);
  git(dir, ["commit", "-m", message]);
  return git(dir, ["rev-parse", "HEAD"]);
}

describe("MCP diff", () => {
  test("diff returns created JSON and text bodies", { timeout: 30_000 }, async () => {
    const root = mkdtempSync(join(tmpdir(), "reqlan-mcp-diff-"));
    try {
      initRepo(root);
      writeFileSync(join(root, "reqs.rq"), "alpha {\n    one\n}\n");
      const left = commitAll(root, "a");
      writeFileSync(join(root, "reqs.rq"), "alpha {\n    one\n}\n\nbeta {\n    two\n}\n");
      const right = commitAll(root, "b");
      const opened = await openAnalysisApi({ workspaceRoot: root });
      try {
        const created = await handleDiffTool(opened.api, { from: left, to: right });
        const rows = JSON.parse(created.content[0]?.text ?? "[]") as Array<Record<string, unknown>>;
        expect(rows).toEqual([{ change: "created", name: "beta", file: "reqs.rq" }]);
        expect(created.content[0]?.text).not.toContain("\u001b");

        writeFileSync(join(root, "body.rq"), "alpha {\n    one\n}\n");
        const bodyLeft = commitAll(root, "body-a");
        writeFileSync(join(root, "body.rq"), "alpha {\n    two\n}\n");
        const bodyRight = commitAll(root, "body-b");
        const text = await handleDiffTool(opened.api, {
          from: bodyLeft,
          to: bodyRight,
          verbosity: "text",
        });
        const textRows = JSON.parse(text.content[0]?.text ?? "[]") as Array<{
          text?: { before: string; after: string };
        }>;
        expect(textRows[0]?.text?.before).toBe("one");
        expect(textRows[0]?.text?.after).toBe("two");
      } finally {
        await opened.dispose();
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("omitted targets follow the clean and dirty defaults", { timeout: 30_000 }, async () => {
    const root = mkdtempSync(join(tmpdir(), "reqlan-mcp-diff-default-"));
    try {
      initRepo(root);
      writeFileSync(join(root, "reqs.rq"), "alpha {\n    one\n}\n");
      commitAll(root, "a");
      writeFileSync(join(root, "reqs.rq"), "alpha {\n    one\n}\n\nbeta {\n    two\n}\n");
      commitAll(root, "b");
      const opened = await openAnalysisApi({ workspaceRoot: root });
      try {
        const clean = await handleDiffTool(opened.api, {});
        const rows = JSON.parse(clean.content[0]?.text ?? "[]") as Array<{ name: string; change: string }>;
        expect(rows).toEqual([{ change: "created", name: "beta", file: "reqs.rq" }]);

        writeFileSync(join(root, "reqs.rq"), "alpha {\n    one\n}\n\ngamma {\n    three\n}\n");
        const dirty = await handleDiffTool(opened.api, {});
        const dirtyRows = JSON.parse(dirty.content[0]?.text ?? "[]") as Array<{
          change: string;
          name: string;
          file: string;
        }>;
        expect(dirtyRows).toEqual([
          { change: "deleted", name: "beta", file: "reqs.rq" },
          { change: "created", name: "gamma", file: "reqs.rq" },
        ]);
      } finally {
        await opened.dispose();
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("a bad revision is a tool error", async () => {
    const root = mkdtempSync(join(tmpdir(), "reqlan-mcp-diff-bad-"));
    try {
      initRepo(root);
      writeFileSync(join(root, "reqs.rq"), "alpha {\n    one\n}\n");
      commitAll(root, "a");
      const opened = await openAnalysisApi({ workspaceRoot: root });
      try {
        await expect(handleDiffTool(opened.api, { from: "not-a-rev" })).rejects.toThrow(/bad_revision/);
      } finally {
        await opened.dispose();
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
