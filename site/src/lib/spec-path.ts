/**
 * Spec export page paths — keep slug rules aligned with
 * `crates/reqlan-export/src/snapshot/util.rs` `slugify`.
 *
 * rq:["../../../reqlan rq/site/site.rq".roadmap_section]
 * rq:["../../../reqlan rq/core_analysis/html_export.rq".html_export]
 */

export function slugifySpec(value: string): string {
  const slug = Array.from(value)
    .map((ch) => (/[A-Za-z0-9]/.test(ch) ? ch.toLowerCase() : "-"))
    .join("")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug.length > 0 ? slug : "item";
}

/** Workspace-relative `.rq` path + idea name → `/spec/ideas/...html`. */
export function ideaSpecHref(fileUri: string, ideaName: string): string {
  const ideaId = `${fileUri}#${ideaName}`;
  return `/spec/ideas/${slugifySpec(ideaName)}--${slugifySpec(ideaId)}.html`;
}

/** Workspace-relative path → `/spec/files/...html`. */
export function fileSpecHref(fileUri: string): string {
  return `/spec/files/${slugifySpec(fileUri)}.html`;
}

/** Workspace-relative folder path → `/spec/folders/...html`. */
export function folderSpecHref(folderPath: string): string {
  return `/spec/folders/${slugifySpec(folderPath)}.html`;
}
