/**
 * Generate README.md for publishable npm packages — same phonebook/logo/changelog
 * pattern as packages/extension/scripts/generate-readme.ts.
 * See reqlan rq/distribution/distribution.rq npm_package_readme.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { getPhonebookLink } from "./phonebook.ts";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

const npmPackages = [
  "packages/language",
  "packages/analytical",
  "packages/cli",
] as const;

type PackageManifest = {
  name: string;
  description: string;
};

function renderTemplate(
  template: string,
  values: Record<string, string>,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    const value = values[key];
    if (value === undefined) {
      throw new Error(`Missing template value for {{${key}}}`);
    }
    return value;
  });
}

function readChangelogBody(changelogPath: string): string {
  if (!existsSync(changelogPath)) {
    return "_No releases yet._";
  }

  const markdown = readFileSync(changelogPath, "utf8").trimEnd();
  const withoutTitle = markdown.replace(/^#\s+.*\n*/m, "").trimStart();

  if (!withoutTitle) {
    return "_No releases yet._";
  }

  return withoutTitle
    .replace(/^### /gm, "#### ")
    .replace(/^## /gm, "### ");
}

const site = getPhonebookLink("site");
const github = getPhonebookLink("github");
const vsc = getPhonebookLink("vsc");
const openvsx = getPhonebookLink("openvsx");
const email = getPhonebookLink("email");
const logoUrl = `${github.href.replace(
  "https://github.com/",
  "https://raw.githubusercontent.com/",
)}/HEAD/site/public/logo.svg`;

const sharedValues = {
  LOGO_URL: logoUrl,
  SITE_LABEL: site.label,
  SITE_URL: site.href,
  VSC_LABEL: vsc.label,
  VSC_URL: vsc.href,
  OPENVSX_LABEL: openvsx.label,
  OPENVSX_URL: openvsx.href,
  GITHUB_URL: github.href,
  EMAIL_URL: email.href,
};

for (const relativeDir of npmPackages) {
  const packageRoot = join(repoRoot, relativeDir);
  const templatePath = join(packageRoot, "README.template.md");
  const changelogPath = join(packageRoot, "CHANGELOG.md");
  const packageJsonPath = join(packageRoot, "package.json");
  const outputPath = join(packageRoot, "README.md");

  if (!existsSync(templatePath)) {
    throw new Error(`Missing README template: ${templatePath}`);
  }

  const manifest = JSON.parse(
    readFileSync(packageJsonPath, "utf8"),
  ) as PackageManifest;

  const readme = renderTemplate(readFileSync(templatePath, "utf8"), {
    ...sharedValues,
    PACKAGE_NAME: manifest.name,
    DESCRIPTION: manifest.description,
    CHANGELOG: readChangelogBody(changelogPath),
  });

  writeFileSync(outputPath, `${readme.trimEnd()}\n`, "utf8");
  console.log(`[readme] wrote ${outputPath}`);
}
