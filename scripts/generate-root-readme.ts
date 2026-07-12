/**
 * Generate README.md for the GitHub repository — see reqlan rq/distribution/distribution.rq root_readme
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { getPhonebookLink } from "./phonebook.ts";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const templatePath = join(repoRoot, "README.template.md");
const outputPath = join(repoRoot, "README.md");

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

const site = getPhonebookLink("site");
const github = getPhonebookLink("github");
const vsc = getPhonebookLink("vsc");
const openvsx = getPhonebookLink("openvsx");
const email = getPhonebookLink("email");
const logoUrl = `${github.href.replace(
  "https://github.com/",
  "https://raw.githubusercontent.com/",
)}/HEAD/packages/extension/media/logo.png`;

const readme = renderTemplate(readFileSync(templatePath, "utf8"), {
  SITE_LABEL: site.label,
  SITE_URL: site.href,
  VSC_LABEL: vsc.label,
  VSC_URL: vsc.href,
  OPENVSX_LABEL: openvsx.label,
  OPENVSX_URL: openvsx.href,
  GITHUB_URL: github.href,
  EMAIL_URL: email.href,
  LOGO_URL: logoUrl,
});

writeFileSync(outputPath, `${readme.trimEnd()}\n`, "utf8");
console.log(`[readme] wrote ${outputPath}`);
