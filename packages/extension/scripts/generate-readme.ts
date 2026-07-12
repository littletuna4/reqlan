/**
 * Generate README.md for VSIX packaging — see reqlan rq/distribution/distribution.rq extension_readme
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { getPhonebookLink } from "../../../scripts/phonebook.ts";

const extensionRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const templatePath = join(extensionRoot, "README.template.md");
const changelogPath = join(extensionRoot, "CHANGELOG.md");
const packageJsonPath = join(extensionRoot, "package.json");
const outputPath = join(extensionRoot, "README.md");

type PackageManifest = {
  displayName: string;
  description: string;
};

function readChangelogBody(): string {
  const markdown = readFileSync(changelogPath, "utf8").trimEnd();
  const withoutTitle = markdown.replace(/^#\s+.*\n*/m, "").trimStart();

  if (!withoutTitle) {
    return "_No releases yet._";
  }

  return withoutTitle
    .replace(/^### /gm, "#### ")
    .replace(/^## /gm, "### ");
}

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

const manifest = JSON.parse(
  readFileSync(packageJsonPath, "utf8"),
) as PackageManifest;
const github = getPhonebookLink("github");
const vsc = getPhonebookLink("vsc");
const openvsx = getPhonebookLink("openvsx");
const email = getPhonebookLink("email");
const logoUrl = `${github.href.replace(
  "https://github.com/",
  "https://raw.githubusercontent.com/",
)}/HEAD/packages/extension/media/logo.png`;

const readme = renderTemplate(readFileSync(templatePath, "utf8"), {
  DISPLAY_NAME: manifest.displayName,
  DESCRIPTION: manifest.description,
  LOGO_URL: logoUrl,
  VSC_LABEL: vsc.label,
  VSC_URL: vsc.href,
  OPENVSX_LABEL: openvsx.label,
  OPENVSX_URL: openvsx.href,
  GITHUB_URL: github.href,
  EMAIL_URL: email.href,
  CHANGELOG: readChangelogBody(),
});

writeFileSync(outputPath, `${readme.trimEnd()}\n`, "utf8");
console.log(`[readme] wrote ${outputPath}`);
