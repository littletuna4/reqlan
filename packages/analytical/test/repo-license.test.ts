/**
 * Repo-level licence must match publishable packages and crates.
 * rq:["../../../reqlan rq/distribution/license.rq".repo_license]
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const EXPECTED_SPDX = "AGPL-3.0-only";
const AGPL_HEADER = "GNU AFFERO GENERAL PUBLIC LICENSE";

const PUBLISHABLE_PACKAGE_JSON_PATHS = [
  "package.json",
  "packages/language/package.json",
  "packages/analytical/package.json",
  "packages/cli/package.json",
  "packages/mcp/package.json",
  "packages/extension/package.json",
  "packages/analytical-native/linux-x64-gnu/package.json",
  "packages/analytical-native/linux-arm64-gnu/package.json",
  "packages/analytical-native/darwin-x64/package.json",
  "packages/analytical-native/darwin-arm64/package.json",
  "packages/analytical-native/win32-x64-msvc/package.json",
  "packages/analytical-native/win32-arm64-msvc/package.json",
] as const;

describe("repo license", () => {
  test("root LICENSE is AGPL-3.0 and matches extension LICENSE", () => {
    const rootLicense = readFileSync(join(root, "LICENSE"), "utf8");
    const extensionLicense = readFileSync(
      join(root, "packages/extension/LICENSE"),
      "utf8",
    );
    expect(rootLicense).toContain(AGPL_HEADER);
    expect(rootLicense).toContain("Version 3");
    expect(extensionLicense).toBe(rootLicense);
  });

  test("publishable packages and crates declare AGPL-3.0-only", () => {
    for (const relativePath of PUBLISHABLE_PACKAGE_JSON_PATHS) {
      const pkg = JSON.parse(
        readFileSync(join(root, relativePath), "utf8"),
      ) as { license?: string };
      expect(pkg.license, relativePath).toBe(EXPECTED_SPDX);
    }

    const cargoToml = readFileSync(join(root, "crates/Cargo.toml"), "utf8");
    expect(cargoToml).toMatch(
      /\[workspace\.package\][\s\S]*?license\s*=\s*"AGPL-3\.0-only"/,
    );
  });
});
