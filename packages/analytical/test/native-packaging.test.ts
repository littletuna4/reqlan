/**
 * Platform package + VSIX target layout for the first native release.
 * rq:["../../../reqlan rq/core_analysis/rust_port.rq".native_bridge]
 * rq:["../../../reqlan rq/distribution/distribution.rq".rust_binary_distribution]
 * rq:["../../../reqlan rq/distribution/distribution.rq".version_management]
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import {
  NATIVE_TARGETS,
  hostNativeTarget,
  workspaceNativeOptionalDependencies,
} from "../../../scripts/native-targets.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");

describe("native platform packaging", () => {
  test("defines the six host targets with os/cpu and napi suffixes", () => {
    expect(NATIVE_TARGETS.map((target) => target.vsCodeTarget)).toEqual([
      "win32-x64",
      "win32-arm64",
      "linux-x64",
      "linux-arm64",
      "darwin-x64",
      "darwin-arm64",
    ]);
    for (const target of NATIVE_TARGETS) {
      expect(target.packageName).toBe(
        `@reqlan/analytical-${target.napiSuffix}`,
      );
      expect(target.os.length).toBeGreaterThan(0);
      expect(target.cpu.length).toBeGreaterThan(0);
      expect(target.binaryName).toMatch(/\.node$/);
      expect(target.ciImage).toMatch(/^(ubuntu|macOS|windows)-latest$/);
    }
    expect(hostNativeTarget("linux", "x64")?.napiSuffix).toBe("linux-x64-gnu");
  });

  test("@reqlan/analytical optionalDependencies are publish-only, not in git", () => {
    const analyticalPath = join(root, "packages/analytical/package.json");
    const original = readFileSync(analyticalPath, "utf8");
    const analytical = JSON.parse(original) as {
      version: string;
      optionalDependencies?: Record<string, string>;
    };
    expect(analytical.optionalDependencies).toBeUndefined();

    const workspaceYaml = readFileSync(join(root, "pnpm-workspace.yaml"), "utf8");
    expect(workspaceYaml).toContain("packageExtensions:");
    expect(workspaceYaml).toContain("'@reqlan/analytical':");
    for (const [name, spec] of Object.entries(
      workspaceNativeOptionalDependencies(),
    )) {
      expect(workspaceYaml).toContain(`'${name}': ${spec}`);
    }

    const result = spawnSync(
      process.execPath,
      [join(root, "scripts/prepare-native-packages.mjs"), "--publish-versions"],
      { cwd: root, encoding: "utf8" },
    );
    try {
      expect(result.status, result.stderr).toBe(0);
      const published = JSON.parse(readFileSync(analyticalPath, "utf8")) as {
        version: string;
        optionalDependencies: Record<string, string>;
      };
      for (const target of NATIVE_TARGETS) {
        expect(published.optionalDependencies[target.packageName]).toBe(
          published.version,
        );
      }
    } finally {
      writeFileSync(analyticalPath, original);
    }
  });

  // rq:["../../../reqlan rq/distribution/distribution.rq".version_management]
  // rq:["../../../reqlan rq/distribution/distribution.rq".rust_binary_distribution]
  test("analytical version is SSOT for platform packages; Changesets ignores them", () => {
    const changeset = JSON.parse(
      readFileSync(join(root, ".changeset/config.json"), "utf8"),
    ) as { fixed: string[][]; ignore: string[] };
    expect(changeset.ignore).toContain("@reqlan/analytical-*");
    expect(
      changeset.fixed.some((group) =>
        group.some((name) => name.includes("@reqlan/analytical")),
      ),
    ).toBe(false);
    expect(
      changeset.fixed.some((group) => group.includes("reqlan-extension")),
    ).toBe(false);

    const release = readFileSync(
      join(root, ".github/workflows/release.yml"),
      "utf8",
    );
    const versionAt = release.indexOf("pnpm changeset version");
    const prepareAt = release.indexOf(
      "node scripts/prepare-native-packages.mjs",
    );
    expect(versionAt).toBeGreaterThan(-1);
    expect(prepareAt).toBeGreaterThan(versionAt);
  });

  test("each platform package declares Trusted Publisher repository + os/cpu + binary main", () => {
    for (const target of NATIVE_TARGETS) {
      const pkgPath = join(
        root,
        "packages/analytical-native",
        target.napiSuffix,
        "package.json",
      );
      expect(existsSync(pkgPath), pkgPath).toBe(true);
      const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
        name: string;
        version: string;
        os: string[];
        cpu: string[];
        main: string;
        repository: { url: string };
        publishConfig: { access: string };
      };
      expect(pkg.name).toBe(target.packageName);
      expect(pkg.version).toBe(
        JSON.parse(
          readFileSync(join(root, "packages/analytical/package.json"), "utf8"),
        ).version,
      );
      expect(pkg.os).toEqual(target.os);
      expect(pkg.cpu).toEqual(target.cpu);
      expect(pkg.main).toBe(target.binaryName);
      expect(pkg.repository.url).toBe(
        "https://github.com/littletuna4/reqlan.git",
      );
      expect(pkg.publishConfig.access).toBe("public");
    }
  });

  test("extension VSIX layout stages native/ and vscodeignore keeps it", () => {
    const ignore = readFileSync(
      join(root, "packages/extension/.vscodeignore"),
      "utf8",
    );
    expect(ignore).toMatch(/!native\/\*\*/);
    const azure = readFileSync(join(root, "azure-pipelines.yml"), "utf8");
    expect(azure).toContain("package-extension-targets.mjs");
    expect(azure).toContain("build_native");
    expect(azure).toContain("collect-napi-binary.mjs");
    expect(azure).toContain("prepare-native-packages.mjs");
    expect(azure).toContain("--binary-dir");
    expect(azure).not.toContain("fetch-native-packages.mjs");
    expect(azure).not.toContain("--latest");
    expect(azure).toContain("ensure-host-native.mjs");
    for (const target of NATIVE_TARGETS) {
      expect(azure).toContain(target.napiSuffix);
      expect(azure).toContain(target.rustTarget);
      expect(azure).toContain(target.ciImage);
    }
    const packScript = readFileSync(
      join(root, "scripts/package-extension-targets.mjs"),
      "utf8",
    );
    expect(packScript).toContain("assertPackedNativeTarget");
    const extPkg = JSON.parse(
      readFileSync(join(root, "packages/extension/package.json"), "utf8"),
    ) as { scripts: Record<string, string> };
    expect(extPkg.scripts["vscode:prepublish"]).toContain("--skip-native");
    const deployNpm = readFileSync(
      join(root, ".github/workflows/deploy-npm.yml"),
      "utf8",
    );
    expect(deployNpm).toContain("--publish-versions");
    expect(deployNpm).toMatch(
      /prepare-native-packages\.mjs --publish-versions/,
    );
    expect(deployNpm).toContain("id-token: write");
    expect(deployNpm).toContain("Publish platform packages");
    expect(deployNpm).toContain("build-native");
    expect(deployNpm).toContain("require-natives-published.mjs");
    expect(existsSync(join(root, "scripts/ensure-host-native.mjs"))).toBe(true);
    const site = readFileSync(
      join(root, ".github/workflows/deploy-site.yml"),
      "utf8",
    );
    expect(site).toContain("stage-host-native.mjs");
    expect(site).toContain("REQLAN_FORCE_NATIVE_BUILD");
  });

  // rq:["../../../reqlan rq/distribution/distribution.rq".npm_distribution]
  // rq:["../../../reqlan rq/distribution/distribution.rq".rust_binary_distribution]
  test("deploy-npm publishes platform packages before @reqlan/analytical", () => {
    const deployNpm = readFileSync(
      join(root, ".github/workflows/deploy-npm.yml"),
      "utf8",
    );
    const nativesAt = deployNpm.indexOf("- name: Publish platform packages");
    const requireAt = deployNpm.indexOf(
      "- name: Require natives at @reqlan/analytical version",
    );
    const analyticalAt = deployNpm.indexOf("- name: Publish @reqlan/analytical");
    expect(nativesAt).toBeGreaterThan(-1);
    expect(requireAt).toBeGreaterThan(nativesAt);
    expect(analyticalAt).toBeGreaterThan(requireAt);
    expect(deployNpm).toContain(
      "node scripts/require-natives-published.mjs --ready-file artifacts/natives-ready.txt",
    );
    const requireStep = deployNpm.slice(requireAt, analyticalAt);
    expect(requireStep).toContain(
      "if: steps.check_analytical.outputs.should_publish == 'true'",
    );
  });

  // rq:["../../../reqlan rq/distribution/distribution.rq".npm_distribution]
  // rq:["../../../reqlan rq/distribution/distribution.rq".rust_binary_distribution]
  test("deploy-npm builds natives when analytical was bumped, not when npm_ref is language", () => {
    const deployNpm = readFileSync(
      join(root, ".github/workflows/deploy-npm.yml"),
      "utf8",
    );
    const release = readFileSync(
      join(root, ".github/workflows/release.yml"),
      "utf8",
    );
    const buildIf = deployNpm.slice(
      deployNpm.indexOf("name: Build napi"),
      deployNpm.indexOf("strategy:"),
    );
    expect(buildIf).toContain("startsWith(inputs.analytical_tag, 'analytical/v')");
    expect(buildIf).toContain("startsWith(github.ref, 'refs/tags/analytical/v')");
    expect(buildIf).not.toContain("github.event_name == 'workflow_call'");
    expect(deployNpm).toContain("analytical_tag:");
    expect(release).toContain("analytical_tag: ${{ steps.tags.outputs.analytical_tag }}");
    expect(release).toContain(
      "analytical_tag: ${{ needs.release.outputs.analytical_tag }}",
    );
    expect(release).toContain("analytical_tag=${analyticalTag}");
  });
});
