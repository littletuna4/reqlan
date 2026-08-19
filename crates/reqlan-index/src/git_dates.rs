//! Surface creation / last-modified dates and change count for ideas via git history.
//! Ported from the former `git-dates-analyser.ts`; the extension only schedules waves
//! and calls `fill_git_dates`, so the git log + persist work stays native.
//! rq:["../../../reqlan rq/extension/features-graph-analysers.rq".git_dates]
//! rq:["../../../reqlan rq/extension/git-codelens.rq".git_dates_background_indexing]
//! rq:["../../../reqlan rq/extension/git-codelens.rq".git_idea_timeline_analysis]
//! rq:["../../../reqlan rq/core_analysis/core.rq".consumption_silence]

use crate::store::{IndexStore, StoreError};
use crate::types::IdeaKind;
use std::collections::HashSet;
use std::path::Path;
use std::process::Command;

/// Win32 `CREATE_NO_WINDOW`. GUI hosts must pass this when they spawn `git.exe`.
/// rq:["../../../reqlan rq/core_analysis/core.rq".consumption_silence]
pub const CREATE_NO_WINDOW: u32 = 0x0800_0000;

#[allow(unused_variables)]
fn apply_hidden_console(cmd: &mut Command) {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    #[cfg(not(windows))]
    let _ = CREATE_NO_WINDOW;
}

/// A single git-date result for an idea (mirrors the former `GitDateInfo`).
#[derive(Debug, Clone, Default)]
struct GitDates {
    created_at: Option<String>,
    modified_at: Option<String>,
    change_count: Option<i64>,
}

impl GitDates {
    fn is_empty(&self) -> bool {
        self.created_at.is_none() && self.modified_at.is_none() && self.change_count.is_none()
    }
}

/// Fill git dates for ideas missing them (all non-ideaset ideas when `idea_ids` is None).
/// Persists each non-empty result via `update_git_dates` and returns the count updated.
pub fn fill_git_dates(
    store: &IndexStore,
    workspace_root: &Path,
    idea_ids: Option<&[String]>,
) -> Result<usize, StoreError> {
    let wanted: Option<HashSet<&str>> =
        idea_ids.map(|ids| ids.iter().map(String::as_str).collect());
    let ideas = store.all_idea_records()?;
    let mut updated = 0usize;
    for idea in ideas {
        if idea.kind == IdeaKind::Ideaset {
            continue;
        }
        if let Some(wanted) = &wanted {
            if !wanted.contains(idea.id.as_str()) {
                continue;
            }
        }
        let dates =
            lookup_git_dates(workspace_root, &idea.file_uri, idea.line_start, idea.line_end);
        if dates.is_empty() {
            continue;
        }
        store.update_git_dates(
            &idea.id,
            dates.created_at.as_deref(),
            dates.modified_at.as_deref(),
            dates.change_count,
        )?;
        updated += 1;
    }
    Ok(updated)
}

fn lookup_git_dates(
    workspace_root: &Path,
    file_uri: &str,
    line_start: u32,
    line_end: u32,
) -> GitDates {
    let file_path = workspace_root.join(file_uri);
    let file_path = file_path.to_string_lossy().to_string();
    let start = line_start.min(line_end) + 1;
    let end = line_start.max(line_end) + 1;

    if let Some(stdout) = run_git(
        workspace_root,
        &["log", "-L", &format!("{start},{end}:{file_path}"), "--format=%aI", "--no-patch"],
    ) {
        let line_dates = parse_git_author_dates(&stdout);
        if !line_dates.is_empty() {
            return GitDates {
                modified_at: line_dates.first().cloned(),
                created_at: line_dates.last().cloned(),
                change_count: Some(line_dates.len() as i64),
            };
        }
    }

    let created_at = run_git(
        workspace_root,
        &["log", "--follow", "--diff-filter=A", "--format=%aI", "-1", "--", &file_path],
    )
    .and_then(|out| parse_git_author_dates(&out).into_iter().next());
    let modified_at =
        run_git(workspace_root, &["log", "--follow", "--format=%aI", "-1", "--", &file_path])
            .and_then(|out| parse_git_author_dates(&out).into_iter().next());
    let change_count =
        run_git(workspace_root, &["log", "--follow", "--format=%H", "--", &file_path])
            .map(|out| out.lines().map(str::trim).filter(|line| !line.is_empty()).count() as i64)
            .unwrap_or(0);

    if created_at.is_none() && modified_at.is_none() && change_count == 0 {
        return GitDates::default();
    }
    GitDates {
        created_at,
        modified_at,
        change_count: if change_count > 0 { Some(change_count) } else { None },
    }
}

fn run_git(cwd: &Path, args: &[&str]) -> Option<String> {
    let mut cmd = Command::new("git");
    apply_hidden_console(&mut cmd);
    let output = cmd.args(args).current_dir(cwd).output().ok()?;
    if !output.status.success() {
        return None;
    }
    String::from_utf8(output.stdout).ok()
}

/// Extract ISO author-date lines from git-log stdout (defensive against patch noise).
/// Matches lines beginning `\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}`.
pub fn parse_git_author_dates(stdout: &str) -> Vec<String> {
    stdout
        .lines()
        .map(str::trim)
        .filter(|line| is_iso_author_date(line))
        .map(str::to_string)
        .collect()
}

fn is_iso_author_date(line: &str) -> bool {
    let bytes = line.as_bytes();
    if bytes.len() < 19 {
        return false;
    }
    let digit = |i: usize| bytes[i].is_ascii_digit();
    digit(0)
        && digit(1)
        && digit(2)
        && digit(3)
        && bytes[4] == b'-'
        && digit(5)
        && digit(6)
        && bytes[7] == b'-'
        && digit(8)
        && digit(9)
        && bytes[10] == b'T'
        && digit(11)
        && digit(12)
        && bytes[13] == b':'
        && digit(14)
        && digit(15)
        && bytes[16] == b':'
        && digit(17)
        && digit(18)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_iso_author_dates_and_ignores_patch_noise() {
        let stdout = "2026-01-02T03:04:05+10:00\n+ some patch line\n2025-12-31T23:59:59Z\n";
        let dates = parse_git_author_dates(stdout);
        assert_eq!(
            dates,
            vec!["2026-01-02T03:04:05+10:00".to_string(), "2025-12-31T23:59:59Z".to_string(),]
        );
    }

    #[test]
    fn rejects_non_iso_lines() {
        assert!(!is_iso_author_date("not a date"));
        assert!(!is_iso_author_date("2026-01-02"));
        assert!(is_iso_author_date("2026-01-02T03:04:05"));
    }

    // rq:["../../../reqlan rq/core_analysis/core.rq".consumption_silence]
    #[test]
    fn create_no_window_matches_win32_flag() {
        assert_eq!(CREATE_NO_WINDOW, 0x0800_0000);
    }
}
