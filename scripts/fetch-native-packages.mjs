/**
 * Optional: fetch published `@reqlan/analytical-<platform>` tarballs from npm
 * into packages/analytical-native/. VSIX packaging does not use this path.
 * Azure compiles the native matrix from git and stages with
 * prepare-native-packages.mjs --binary-dir. GitHub Actions still publishes
 * platform packages on analytical/v* for CLI/MCP optionalDependencies.
 *
 * Usage:
 *   node scripts/fetch-native-packages.mjs
 *   node scripts/fetch-native-packages.mjs --latest
 *   node scripts/fetch-native-packages.mjs --host-only --latest
 *   node scripts/fetch-native-packages.mjs --version 1.10.6
 *   node scripts/fetch-native-packages.mjs --latest --retries 60 --retry-delay-ms 20000
 *
 * rq:["../reqlan rq/distribution/distribution.rq".vsix_export]
 * rq:["../reqlan rq/distribution/distribution.rq".npm_distribution]
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { NATIVE_TARGETS, hostNativeTarget } from "./native-targets.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function parseArg(argv, name) {
  const eq = argv.find((a) => a.startsWith(`${name}=`));
  if (eq) {
    return eq.slice(name.length + 1);
  }
  const idx = argv.indexOf(name);
  if (idx !== -1 && argv[idx + 1]) {
    return argv[idx + 1];
  }
  return undefined;
}

function sleepSync(ms) {
  spawnSync(
    process.execPath,
    ["-e", `Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,${ms})`],
    {
      stdio: "ignore",
    },
  );
}

function npmViewVersion(name) {
  const view = spawnSync("npm", ["view", name, "version"], {
    cwd: root,
    encoding: "utf8",
    shell: process.platform === "win32",
  });
  if (view.status !== 0) {
    return undefined;
  }
  const line = (view.stdout || "").trim().split("\n").filter(Boolean).pop();
  return line || undefined;
}

const argv = process.argv.slice(2);
const hostOnly = argv.includes("--host-only");
const allowMissing = argv.includes("--allow-missing");
const useLatest = argv.includes("--latest");
const retries = Number.parseInt(parseArg(argv, "--retries") ?? "0", 10);
const retryDelayMs = Number.parseInt(
  parseArg(argv, "--retry-delay-ms") ?? "15000",
  10,
);
const analytical = JSON.parse(
  fs.readFileSync(path.join(root, "packages/analytical/package.json"), "utf8"),
);
const versionOverride = parseArg(argv, "--version");
const targets = hostOnly
  ? (() => {
      const host = hostNativeTarget();
      if (!host) {
        throw new Error(
          `No native target for ${process.platform}-${process.arch}`,
        );
      }
      return [host];
    })()
  : NATIVE_TARGETS;

function resolveVersion() {
  if (versionOverride) {
    return versionOverride;
  }
  if (useLatest) {
    return npmViewVersion("@reqlan/analytical");
  }
  return analytical.version;
}

function fetchAtVersion(version) {
  spawnSync(
    process.execPath,
    [path.join(root, "scripts/prepare-native-packages.mjs")],
    {
      cwd: root,
      stdio: "inherit",
    },
  );

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "reqlan-napi-"));
  const missing = [];

  for (const target of targets) {
    const spec = `${target.packageName}@${version}`;
    console.log(`npm pack ${spec}`);
    const pack = spawnSync("npm", ["pack", spec, "--pack-destination", tmp], {
      cwd: root,
      encoding: "utf8",
      shell: process.platform === "win32",
    });
    if (pack.status !== 0) {
      console.error(pack.stderr || pack.stdout);
      console.error(`Failed to pack ${spec}`);
      missing.push(spec);
      continue;
    }
    const tgzName = (pack.stdout || "")
      .trim()
      .split("\n")
      .filter(Boolean)
      .pop();
    if (!tgzName) {
      console.error(`npm pack produced no tarball name for ${spec}`);
      missing.push(spec);
      continue;
    }
    const tgz = path.join(tmp, tgzName);
    const extractDir = path.join(tmp, target.napiSuffix);
    fs.mkdirSync(extractDir, { recursive: true });
    const untar = spawnSync("tar", ["-xzf", tgz, "-C", extractDir], {
      encoding: "utf8",
    });
    if (untar.status !== 0) {
      console.error(untar.stderr);
      missing.push(spec);
      continue;
    }
    const packedRoot = path.join(extractDir, "package");
    const srcBinary = path.join(packedRoot, target.binaryName);
    if (!fs.existsSync(srcBinary) || fs.statSync(srcBinary).size === 0) {
      console.error(`Packed tarball missing binary: ${srcBinary}`);
      missing.push(spec);
      continue;
    }
    const destDir = path.join(
      root,
      "packages/analytical-native",
      target.napiSuffix,
    );
    fs.mkdirSync(destDir, { recursive: true });
    fs.copyFileSync(srcBinary, path.join(destDir, target.binaryName));
    const publishedPkg = path.join(packedRoot, "package.json");
    if (fs.existsSync(publishedPkg)) {
      fs.copyFileSync(publishedPkg, path.join(destDir, "package.json"));
    }
    console.log(`fetched ${spec} → ${path.join(destDir, target.binaryName)}`);
  }

  fs.rmSync(tmp, { recursive: true, force: true });
  return missing;
}

let attempt = 0;
while (true) {
  const version = resolveVersion();
  if (!version) {
    console.error("Could not resolve an npm version for @reqlan/analytical.");
  } else {
    const missing = fetchAtVersion(version);
    if (missing.length === 0) {
      console.log(
        `fetched ${targets.length} platform package(s) at ${version}`,
      );
      process.exit(0);
    }
    console.error(
      `Missing ${missing.length} package(s) at ${version}: ${missing.join(", ")}`,
    );
    if (allowMissing) {
      console.warn("Continuing (--allow-missing).");
      process.exit(0);
    }
  }

  if (attempt >= retries) {
    console.error(
      `Failed to fetch platform packages from npm after ${attempt + 1} attempt(s). ` +
        `GitHub Actions must publish @reqlan/analytical-<platform> on analytical/v* first.`,
    );
    process.exit(1);
  }
  attempt += 1;
  console.log(
    `retry ${attempt}/${retries} in ${retryDelayMs}ms (waiting for npm publish)`,
  );
  sleepSync(retryDelayMs);
}
