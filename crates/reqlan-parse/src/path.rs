//! Authored path forms: import-root aliases (`@/…`), file-ref suffixes, posix join.
//! rq:["../../../reqlan rq/language/imports.rq".configuration_import_root_alias]
//! rq:["../../../reqlan rq/language/imports.rq".import_paths]
//! rq:["../../../reqlan rq/extension/configuration.rq".configuration_import_roots]
//! rq:["../../../reqlan rq/language/syntax.rq".reference_file]

/// Default import-root alias string. Written as `@/` plus a path under the import root.
pub const DEFAULT_IMPORT_ROOT_ALIAS: &str = "@";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ImportRootMapping {
    pub alias: String,
    /// Directory for this alias, relative to the base root, or absolute. `None` uses the workspace folder.
    pub root: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct ParsedFileReference {
    pub file_path: String,
    pub line_start: Option<u32>,
    pub line_end: Option<u32>,
    pub test_name: Option<String>,
}

pub fn default_import_roots() -> Vec<ImportRootMapping> {
    vec![ImportRootMapping { alias: DEFAULT_IMPORT_ROOT_ALIAS.to_string(), root: None }]
}

/// Remainder after `alias/` , or `None` when the path is not that alias form.
pub fn match_import_root_alias(path: &str, alias: &str) -> Option<String> {
    if alias.is_empty() || !path.starts_with(alias) {
        return None;
    }
    let after = &path[alias.len()..];
    let remainder = after.strip_prefix('/')?;
    Some(remainder.to_string())
}

/// Longest matching alias wins.
pub fn match_import_root_mapping<'a>(
    path: &str,
    mappings: &'a [ImportRootMapping],
) -> Option<(&'a ImportRootMapping, String)> {
    let mut best: Option<(&ImportRootMapping, String)> = None;
    for mapping in mappings {
        if mapping.alias.is_empty() {
            continue;
        }
        let Some(remainder) = match_import_root_alias(path, &mapping.alias) else {
            continue;
        };
        let better = match &best {
            None => true,
            Some((current, _)) => mapping.alias.len() > current.alias.len(),
        };
        if better {
            best = Some((mapping, remainder));
        }
    }
    best
}

pub fn unquote_path(value: &str) -> String {
    let bytes = value.as_bytes();
    if bytes.len() >= 2 {
        let quote = bytes[0];
        if (quote == b'"' || quote == b'\'') && bytes[bytes.len() - 1] == quote {
            let inner = &value[1..value.len() - 1];
            let mut out = String::with_capacity(inner.len());
            let mut chars = inner.chars().peekable();
            while let Some(ch) = chars.next() {
                if ch == '\\' {
                    if let Some(next) = chars.next() {
                        out.push(next);
                    }
                } else {
                    out.push(ch);
                }
            }
            return out;
        }
    }
    value.to_string()
}

pub fn parse_file_reference_string(file: &str) -> ParsedFileReference {
    let (without_line, line_start, line_end) = strip_line_suffix(file);
    let (file_path, test_name) = strip_test_name_suffix(&without_line);
    ParsedFileReference { file_path, line_start, line_end, test_name }
}

/// Resolve an authored path the way `resolveDocumentPathUri` does for index URIs.
/// Aliased paths join the mapping root (or the workspace folder when `root` is omitted).
/// Other relative paths join the directory of `from_file`.
/// Import paths with no extension mean `.rq`. Keep the authored path as a fallback.
/// rq:["../../../reqlan rq/extension/language-support/features-imports.rq".implicit_file_extension]
pub fn import_path_with_implicit_extension(path: &str) -> Option<String> {
    let basename = match path.rsplit_once('/') {
        Some((_, name)) => name,
        None => path,
    };
    if basename.is_empty() || basename == "." || basename == ".." {
        return None;
    }
    if basename.len() > 1 && basename[1..].contains('.') {
        return None;
    }
    Some(format!("{path}.rq"))
}

pub fn import_path_candidates(path: &str) -> Vec<String> {
    match import_path_with_implicit_extension(path) {
        Some(implicit) => vec![implicit, path.to_string()],
        None => vec![path.to_string()],
    }
}

pub fn resolve_rq_path(
    authored: &str,
    from_file: &str,
    import_roots: &[ImportRootMapping],
) -> String {
    let parsed = parse_file_reference_string(&unquote_path(authored));
    let path = parsed.file_path.replace('\\', "/");
    if path.contains("://") || is_absolute_uri_or_path(&path) {
        return path;
    }
    let default_roots = default_import_roots();
    let roots = if import_roots.is_empty() { default_roots.as_slice() } else { import_roots };
    if let Some((mapping, remainder)) = match_import_root_mapping(&path, roots) {
        return join_import_root(mapping.root.as_deref(), &remainder);
    }
    let from = from_file.replace('\\', "/");
    if from.contains("://") || from.is_empty() {
        return path;
    }
    posix_join(posix_dirname(&from), &path)
}

pub fn file_from_idea_id(source_id: &str) -> &str {
    match source_id.rfind('#') {
        Some(index) => &source_id[..index],
        None => source_id,
    }
}

fn join_import_root(root: Option<&str>, remainder: &str) -> String {
    match root {
        None | Some("") => remainder.to_string(),
        Some(root) if is_absolute_uri_or_path(root) => {
            posix_join(&root.replace('\\', "/"), remainder)
        }
        Some(root) => posix_join(&normalize_rel_root(root), remainder),
    }
}

fn normalize_rel_root(root: &str) -> String {
    let root = root.replace('\\', "/");
    let stripped = root.strip_prefix("./").unwrap_or(&root);
    stripped.trim_end_matches('/').to_string()
}

pub fn is_windows_absolute_path(path: &str) -> bool {
    let bytes = path.as_bytes();
    if path.starts_with("\\\\") {
        return true;
    }
    bytes.len() >= 3
        && bytes[0].is_ascii_alphabetic()
        && bytes[1] == b':'
        && (bytes[2] == b'\\' || bytes[2] == b'/')
}

pub fn is_absolute_uri_or_path(path: &str) -> bool {
    path.starts_with('/') || is_windows_absolute_path(path) || has_uri_scheme(path)
}

fn has_uri_scheme(path: &str) -> bool {
    let Some((scheme, rest)) = path.split_once(':') else {
        return false;
    };
    if rest.starts_with('\\') || rest.starts_with('/') && scheme.len() == 1 {
        return false;
    }
    let mut chars = scheme.chars();
    let Some(first) = chars.next() else {
        return false;
    };
    first.is_ascii_alphabetic()
        && chars.all(|ch| ch.is_ascii_alphanumeric() || ch == '+' || ch == '.' || ch == '-')
}

pub fn posix_dirname(path: &str) -> &str {
    match path.rfind('/') {
        Some(0) => "/",
        Some(index) => &path[..index],
        None => ".",
    }
}

pub fn posix_join(base: &str, relative: &str) -> String {
    let combined = if base.is_empty() || base == "." {
        relative.to_string()
    } else {
        format!("{}/{}", base.trim_end_matches('/'), relative)
    };
    normalize_posix_segments(&combined)
}

pub fn normalize_posix_segments(path: &str) -> String {
    let absolute = path.starts_with('/');
    let mut out: Vec<&str> = Vec::new();
    for part in path.split('/') {
        match part {
            "" | "." => {}
            ".." => {
                if matches!(out.last(), Some(&last) if last != "..") {
                    out.pop();
                } else if !absolute {
                    out.push(part);
                }
            }
            other => out.push(other),
        }
    }
    let joined = out.join("/");
    if absolute {
        format!("/{joined}")
    } else {
        joined
    }
}

fn strip_line_suffix(file: &str) -> (String, Option<u32>, Option<u32>) {
    let Some(pos) = file.find("L#") else {
        return (file.to_string(), None, None);
    };
    let after = &file[pos + 2..];
    let mut parts = after.split('-');
    let Some(start) = parts.next() else {
        return (file.to_string(), None, None);
    };
    if start.is_empty() || !start.bytes().all(|b| b.is_ascii_digit()) {
        return (file.to_string(), None, None);
    }
    let line_start = start.parse().ok();
    let line_end = match parts.next() {
        None => line_start,
        Some(end) if end.bytes().all(|b| b.is_ascii_digit()) && parts.next().is_none() => {
            end.parse().ok().or(line_start)
        }
        _ => return (file.to_string(), None, None),
    };
    (file[..pos].to_string(), line_start, line_end)
}

fn strip_test_name_suffix(file: &str) -> (String, Option<String>) {
    let bytes = file.as_bytes();
    for index in 0..bytes.len() {
        if bytes[index] != b':' {
            continue;
        }
        if is_uri_scheme_colon(bytes, index) || is_windows_drive_colon(bytes, index) {
            continue;
        }
        let test_name = &file[index + 1..];
        if test_name.is_empty() {
            return (file.to_string(), None);
        }
        return (file[..index].to_string(), Some(test_name.to_string()));
    }
    (file.to_string(), None)
}

fn is_uri_scheme_colon(bytes: &[u8], index: usize) -> bool {
    index + 2 < bytes.len() && bytes[index + 1] == b'/' && bytes[index + 2] == b'/'
}

fn is_windows_drive_colon(bytes: &[u8], index: usize) -> bool {
    index >= 1
        && bytes[index - 1].is_ascii_alphabetic()
        && index + 1 < bytes.len()
        && (bytes[index + 1] == b'\\' || bytes[index + 1] == b'/')
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn match_import_root_alias_requires_alias_then_slash() {
        assert_eq!(
            match_import_root_alias("@/reqs/style.rq", "@").as_deref(),
            Some("reqs/style.rq")
        );
        assert_eq!(match_import_root_alias("@reqs/style.rq", "@"), None);
        assert_eq!(match_import_root_alias("./x.rq", "@"), None);
        assert_eq!(match_import_root_alias("#/x.rq", "#").as_deref(), Some("x.rq"));
    }

    #[test]
    fn longest_alias_wins() {
        let mappings = vec![
            ImportRootMapping { alias: "@".into(), root: None },
            ImportRootMapping { alias: "@lib".into(), root: Some("vendor".into()) },
        ];
        let (mapping, remainder) = match_import_root_mapping("@lib/a.ts", &mappings).unwrap();
        assert_eq!(mapping.alias, "@lib");
        assert_eq!(remainder, "a.ts");
    }

    #[test]
    fn resolves_default_alias_against_workspace_folder() {
        assert_eq!(
            resolve_rq_path(
                "@/site/src/app/support/page.tsx",
                "reqlan rq/site/support-page.rq",
                &[]
            ),
            "site/src/app/support/page.tsx"
        );
    }

    #[test]
    fn leaves_non_aliased_relative_paths_document_relative() {
        assert_eq!(
            resolve_rq_path("./shared.rq", "pkg/a.rq", &default_import_roots()),
            "pkg/shared.rq"
        );
    }

    #[test]
    fn resolves_configured_import_root() {
        let roots = vec![ImportRootMapping { alias: "~".into(), root: Some("./lib".into()) }];
        assert_eq!(resolve_rq_path("~/target.rq", "pkg/a.rq", &roots), "lib/target.rq");
    }

    #[test]
    fn strips_test_name_and_line_suffix() {
        let parsed = parse_file_reference_string("src/app.test.ts:lists items");
        assert_eq!(parsed.file_path, "src/app.test.ts");
        assert_eq!(parsed.test_name.as_deref(), Some("lists items"));
        let lined = parse_file_reference_string("src/app.tsL#3-4");
        assert_eq!(lined.file_path, "src/app.ts");
        assert_eq!(lined.line_start, Some(3));
        assert_eq!(lined.line_end, Some(4));
    }

    #[test]
    fn test_name_suffix_keeps_colons_in_the_title() {
        let parsed = parse_file_reference_string(
            "../../packages/language/test/comment-in-string.test.ts:e2e: real block comments still hide body text",
        );
        assert_eq!(parsed.file_path, "../../packages/language/test/comment-in-string.test.ts");
        assert_eq!(
            parsed.test_name.as_deref(),
            Some("e2e: real block comments still hide body text")
        );
        let windows = parse_file_reference_string(r"C:\Users\tony\foo.ts:e2e: lists items");
        assert_eq!(windows.file_path, r"C:\Users\tony\foo.ts");
        assert_eq!(windows.test_name.as_deref(), Some("e2e: lists items"));
        let uri = parse_file_reference_string("https://host/app.test.ts:e2e: lists items");
        assert_eq!(uri.file_path, "https://host/app.test.ts");
        assert_eq!(uri.test_name.as_deref(), Some("e2e: lists items"));
    }

    #[test]
    fn resolves_colon_test_title_to_the_source_file() {
        let authored = "../../packages/language/test/comment-in-string.test.ts:e2e: real block comments still hide body text";
        let resolved = resolve_rq_path(authored, "reqlan rq/language/syntax.rq", &[]);
        assert_eq!(resolved, "packages/language/test/comment-in-string.test.ts");
    }

    // rq:["../../../reqlan rq/extension/language-support/features-imports.rq".implicit_file_extension]
    #[test]
    fn implicit_rq_extension_skips_paths_that_already_have_one() {
        assert_eq!(import_path_with_implicit_extension("reqs/style"), Some("reqs/style.rq".into()));
        assert_eq!(import_path_with_implicit_extension("reqs/style.rq"), None);
        assert_eq!(
            import_path_candidates("../../../reqlan rq/media/tutorials.rq"),
            vec!["../../../reqlan rq/media/tutorials.rq".to_string()]
        );
    }

    #[test]
    fn resolves_relative_path_with_a_space_in_a_folder_name() {
        assert_eq!(
            resolve_rq_path(
                "../../../reqlan rq/marketing_and_media/tutorials.rq",
                "site/src/content/quickstart.ts",
                &[]
            ),
            "reqlan rq/marketing_and_media/tutorials.rq"
        );
    }
}
