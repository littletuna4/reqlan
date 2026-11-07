//! Authored import paths resolved, compared, and rewritten between files.
//! rq:["../../../reqlan rq/extension/mutation/refactor_native_planner.rq".refactor_native_planner]
//! rq:["../../../reqlan rq/extension/mutation/refactor_support.rq".refactor_file_moves]
//! rq:["../../../reqlan rq/extension/mutation/refactor_support.rq".refactor_symbol_move]

use crate::path::{
    import_path_with_implicit_extension, match_import_root_alias, normalize_posix_segments,
    posix_dirname, posix_join, DEFAULT_IMPORT_ROOT_ALIAS,
};

pub(crate) fn rewrite_path_to_moved_target(
    path: &str,
    referencing_uri: &str,
    old_target: &str,
    new_target: &str,
) -> Option<String> {
    if path.is_empty() || path.starts_with("file://") {
        return None;
    }
    if match_import_root_alias(path, DEFAULT_IMPORT_ROOT_ALIAS).is_some() {
        return rewrite_aliased_path(path, old_target, new_target);
    }
    let resolved = resolve_authored(referencing_uri, path);
    let old = uri_path(old_target);
    let implicit = import_path_with_implicit_extension(path)
        .map(|extra| resolve_authored(referencing_uri, &extra));
    let matches = same_target(&resolved, &old)
        || implicit.as_ref().is_some_and(|path| same_target(path, &old));
    if !matches {
        return None;
    }
    let keep_extension = has_explicit_extension(path);
    let new_path = uri_path(new_target);
    let target =
        if keep_extension { new_path } else { new_path.trim_end_matches(".rq").to_string() };
    let relative =
        ensure_dot_relative(&posix_relative(posix_dirname(&uri_path(referencing_uri)), &target));
    if relative == path {
        None
    } else {
        Some(relative)
    }
}

fn rewrite_aliased_path(path: &str, old_target: &str, new_target: &str) -> Option<String> {
    let remainder = match_import_root_alias(path, DEFAULT_IMPORT_ROOT_ALIAS)?;
    let old = uri_path(old_target);
    let new = uri_path(new_target);
    let matched = if path_ends_with(&old, &remainder) {
        remainder.clone()
    } else {
        let implicit = import_path_with_implicit_extension(&remainder)?;
        if path_ends_with(&old, &implicit) {
            implicit
        } else {
            return None;
        }
    };
    if matched.len() > old.len() {
        return None;
    }
    let prefix = &old[..old.len() - matched.len()];
    if !new.starts_with(prefix) {
        return None;
    }
    let mut new_remainder = new[prefix.len()..].to_string();
    if !has_explicit_extension(&remainder) && new_remainder.ends_with(".rq") {
        new_remainder.truncate(new_remainder.len() - 3);
    }
    let rewritten = format!("{DEFAULT_IMPORT_ROOT_ALIAS}/{new_remainder}");
    if rewritten == path {
        None
    } else {
        Some(rewritten)
    }
}

fn path_ends_with(absolute: &str, segment: &str) -> bool {
    let abs = absolute.trim_end_matches('/');
    let rel = segment.trim_matches('/');
    !rel.is_empty() && (abs == rel || abs.ends_with(&format!("/{rel}")))
}

fn has_explicit_extension(path: &str) -> bool {
    let base = path.rsplit('/').next().unwrap_or(path);
    base.len() > 1 && base[1..].contains('.')
}

pub(crate) fn relative_import(from_uri: &str, to_uri: &str) -> String {
    relative_from_file(from_uri, &uri_path(to_uri))
}

pub(crate) fn relative_from_file(from_uri: &str, to_path: &str) -> String {
    let from = uri_path(from_uri);
    let from_dir = posix_dirname(&from);
    ensure_dot_relative(&posix_relative(from_dir, to_path))
}

pub(crate) fn resolve_authored(from_uri: &str, authored: &str) -> String {
    if authored.starts_with('/') || authored.contains("://") {
        return authored.to_string();
    }
    let from = uri_path(from_uri);
    normalize_posix_segments(&posix_join(posix_dirname(&from), authored))
}

pub(crate) fn uri_path(uri: &str) -> String {
    let bare = uri.split('?').next().unwrap_or(uri);
    let bare = bare.split('#').next().unwrap_or(bare);
    if let Some(rest) = bare.strip_prefix("file://") {
        return rest.to_string();
    }
    bare.replace('\\', "/")
}

pub(crate) fn same_target(left: &str, right: &str) -> bool {
    let left = left.trim_end_matches('/');
    let right = right.trim_end_matches('/');
    left == right || left.trim_end_matches(".rq") == right.trim_end_matches(".rq")
}

fn posix_relative(from_dir: &str, to_path: &str) -> String {
    let from = normalize_posix_segments(from_dir);
    let to = normalize_posix_segments(to_path);
    let from_parts: Vec<&str> = from.split('/').filter(|part| !part.is_empty()).collect();
    let to_parts: Vec<&str> = to.split('/').filter(|part| !part.is_empty()).collect();
    let mut shared = 0;
    while shared < from_parts.len()
        && shared < to_parts.len()
        && from_parts[shared] == to_parts[shared]
    {
        shared += 1;
    }
    let mut out: Vec<&str> = vec![".."; from_parts.len() - shared];
    out.extend_from_slice(&to_parts[shared..]);
    if out.is_empty() {
        ".".to_string()
    } else {
        out.join("/")
    }
}

fn ensure_dot_relative(path: &str) -> String {
    if path.starts_with('.') {
        path.to_string()
    } else {
        format!("./{path}")
    }
}

pub(crate) fn is_rq_uri(uri: &str) -> bool {
    let path = uri.split('?').next().unwrap_or(uri);
    path.to_ascii_lowercase().ends_with(".rq")
}
