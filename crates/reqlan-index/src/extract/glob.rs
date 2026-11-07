//! Path glob matching and POSIX path helpers for extract.
//! rq:["../../../../reqlan rq/indexer/indexer.rq.wildcard_reference_edges]

pub(crate) fn looks_absolute(path: &str) -> bool {
    path.len() >= 3 && path.as_bytes()[0].is_ascii_alphabetic() && path.as_bytes()[1] == b':'
}

pub(crate) fn parent_posix(path: &str) -> String {
    let normalized = normalize_posix(path);
    match normalized.rsplit_once('/') {
        Some((parent, _)) => parent.to_string(),
        None => String::new(),
    }
}

pub(crate) fn join_posix(base: &str, relative: &str) -> String {
    let left = normalize_posix(base).trim_end_matches('/').to_string();
    let right = normalize_posix(relative).trim_start_matches('/').to_string();
    if left.is_empty() {
        return normalize_glob_path(&right);
    }
    normalize_glob_path(&format!("{left}/{right}"))
}

/// Match a POSIX-style path glob against a workspace-relative file URI.
/// A glob with no `/` (for example `*.rq`) also matches nested paths.
/// An empty glob matches every path. Callers that reject a failed glob must not use that result.
pub fn path_glob_matches(glob: &str, path: &str) -> bool {
    let glob = glob.replace('\\', "/");
    let glob = glob.trim();
    if glob.is_empty() {
        return true;
    }
    let path = path.replace('\\', "/");
    glob_to_regex(&normalize_scan_glob(glob), true).is_match(&path)
}

/// True when any non-empty glob in `path_globs` matches `file_uri`.
/// An empty string in the list matches nothing (does not select every file).
/// rq:["../../../../reqlan rq/core_analysis/check.rq".check_glob_patterns]
pub fn glob_list_matches(path_globs: &[&str], file_uri: &str) -> bool {
    path_globs.iter().any(|glob| {
        let glob = glob.trim();
        !glob.is_empty() && path_glob_matches(glob, file_uri)
    })
}

/// True when `file_uri` matches an explicit file in `extra_files`.
pub fn extra_file_matches(extra_files: &[&str], file_uri: &str) -> bool {
    extra_files.iter().any(|path| crate::path_resolve::same_indexed_path(path, file_uri))
}

/// True when a file under `dir_rel` can match `glob`.
/// An empty glob matches nothing here. It is not a match-all scan.
/// `dir_rel` is a workspace-relative directory. An empty directory is the workspace root.
/// rq:["../../../../reqlan rq/core_analysis/check.rq".check_glob_patterns]
pub fn path_glob_may_match_under(glob: &str, dir_rel: &str) -> bool {
    let normalized = normalize_scan_glob(glob.trim());
    if normalized.is_empty() {
        return false;
    }
    let dir_rel = dir_rel.replace('\\', "/");
    let dir_rel = dir_rel.trim().trim_matches('/');
    if dir_rel.is_empty() {
        return true;
    }
    let glob_parts: Vec<&str> = normalized.split('/').filter(|part| !part.is_empty()).collect();
    let dir_parts: Vec<&str> = dir_rel.split('/').filter(|part| !part.is_empty()).collect();
    glob_prefix_can_match(&glob_parts, &dir_parts)
}

fn normalize_scan_glob(glob: &str) -> String {
    let glob = glob.replace('\\', "/");
    let glob = glob.trim();
    if glob.is_empty() {
        return String::new();
    }
    if glob.contains('/') || glob.starts_with("**") {
        glob.to_string()
    } else {
        format!("**/{glob}")
    }
}

fn glob_prefix_can_match(glob: &[&str], dir: &[&str]) -> bool {
    fn rec(glob: &[&str], dir: &[&str], gi: usize, di: usize) -> bool {
        if di == dir.len() {
            return gi < glob.len();
        }
        if gi == glob.len() {
            return false;
        }
        if glob[gi] == "**" {
            if rec(glob, dir, gi + 1, di) {
                return true;
            }
            return rec(glob, dir, gi, di + 1);
        }
        if segment_glob_match(glob[gi], dir[di]) {
            return rec(glob, dir, gi + 1, di + 1);
        }
        false
    }
    rec(glob, dir, 0, 0)
}

fn segment_glob_match(pattern: &str, segment: &str) -> bool {
    segment_glob_at(pattern.as_bytes(), 0, segment.as_bytes(), 0)
}

fn segment_glob_at(pat: &[u8], pi: usize, hay: &[u8], hi: usize) -> bool {
    if pi == pat.len() {
        return hi == hay.len();
    }
    if pat[pi] == b'*' && pi + 1 < pat.len() && pat[pi + 1] == b'*' {
        return segment_glob_at(pat, pi + 1, hay, hi);
    }
    if pat[pi] == b'*' {
        for skip in 0..=hay.len().saturating_sub(hi) {
            if segment_glob_at(pat, pi + 1, hay, hi + skip) {
                return true;
            }
        }
        return false;
    }
    if pat[pi] == b'?' {
        return hi < hay.len() && segment_glob_at(pat, pi + 1, hay, hi + 1);
    }
    hi < hay.len() && hay[hi] == pat[pi] && segment_glob_at(pat, pi + 1, hay, hi + 1)
}

pub(crate) fn normalize_posix(path: &str) -> String {
    path.replace('\\', "/")
}

pub(crate) fn normalize_glob_path(path: &str) -> String {
    let absolute = path.starts_with('/');
    let mut out: Vec<String> = Vec::new();
    for part in path.split('/') {
        if part.is_empty() || part == "." {
            continue;
        }
        if part == ".." {
            if let Some(last) = out.last() {
                if last != ".." && !last.contains('*') && !last.contains('?') {
                    out.pop();
                    continue;
                }
            }
            if !absolute {
                out.push(part.to_string());
            }
            continue;
        }
        out.push(part.to_string());
    }
    let joined = out.join("/");
    if absolute {
        format!("/{joined}")
    } else {
        joined
    }
}

pub(crate) struct GlobRegex {
    inner: String,
}

impl GlobRegex {
    pub(crate) fn is_match(&self, hay: &str) -> bool {
        simple_glob_match(&self.inner, hay)
    }
}

pub(crate) fn glob_to_regex(glob: &str, path_mode: bool) -> GlobRegex {
    let mut pattern = String::from("^");
    let bytes = glob.as_bytes();
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'*' && i + 1 < bytes.len() && bytes[i + 1] == b'*' {
            if i + 2 < bytes.len() && bytes[i + 2] == b'/' {
                pattern.push_str("(?:.*/)?");
                i += 3;
                continue;
            }
            pattern.push_str(".*");
            i += 2;
            continue;
        }
        if bytes[i] == b'*' {
            pattern.push_str(if path_mode { "[^/]*" } else { ".*" });
            i += 1;
            continue;
        }
        if bytes[i] == b'?' {
            pattern.push_str(if path_mode { "[^/]" } else { "." });
            i += 1;
            continue;
        }
        let ch = bytes[i] as char;
        if "\\^$+{}[]()|/.".contains(ch) {
            pattern.push('\\');
        }
        pattern.push(ch);
        i += 1;
    }
    pattern.push('$');
    GlobRegex { inner: pattern }
}

fn simple_glob_match(regex_like: &str, hay: &str) -> bool {
    glob_match_from(regex_like.as_bytes(), 0, hay.as_bytes(), 0)
}

fn glob_match_from(pat: &[u8], pi: usize, hay: &[u8], hi: usize) -> bool {
    if pi == pat.len() {
        return hi == hay.len();
    }
    if pat[pi] == b'^' {
        return glob_match_from(pat, pi + 1, hay, hi);
    }
    if pi + 1 == pat.len() && pat[pi] == b'$' {
        return hi == hay.len();
    }
    if pi + 1 < pat.len() && pat[pi] == b'.' && pat[pi + 1] == b'*' {
        for skip in 0..=hay.len().saturating_sub(hi) {
            if glob_match_from(pat, pi + 2, hay, hi + skip) {
                return true;
            }
        }
        return false;
    }
    if pi + 4 < pat.len() && pat[pi..].starts_with(b"(?:.*/)?") {
        if glob_match_from(pat, pi + 8, hay, hi) {
            return true;
        }
        for skip in 0..=hay.len().saturating_sub(hi) {
            if hi + skip < hay.len()
                && hay[hi + skip] == b'/'
                && glob_match_from(pat, pi + 8, hay, hi + skip + 1)
            {
                return true;
            }
        }
        return false;
    }
    if pi + 4 < pat.len() && pat[pi..].starts_with(b"[^/]*") {
        let mut end = hi;
        while end < hay.len() && hay[end] != b'/' {
            end += 1;
        }
        for skip in hi..=end {
            if glob_match_from(pat, pi + 5, hay, skip) {
                return true;
            }
        }
        return false;
    }
    if pi + 3 < pat.len() && pat[pi..].starts_with(b"[^/]") {
        if hi < hay.len() && hay[hi] != b'/' {
            return glob_match_from(pat, pi + 4, hay, hi + 1);
        }
        return false;
    }
    if pat[pi] == b'\\' && pi + 1 < pat.len() {
        if hi < hay.len() && hay[hi] == pat[pi + 1] {
            return glob_match_from(pat, pi + 2, hay, hi + 1);
        }
        return false;
    }
    if pat[pi] == b'.' {
        if hi < hay.len() {
            return glob_match_from(pat, pi + 1, hay, hi + 1);
        }
        return false;
    }
    if hi < hay.len() && hay[hi] == pat[pi] {
        return glob_match_from(pat, pi + 1, hay, hi + 1);
    }
    false
}

pub(crate) fn unquote_if_needed(value: &str) -> String {
    reqlan_parse::unquote_path(value)
}
