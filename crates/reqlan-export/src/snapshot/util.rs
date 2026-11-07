//! Shared helper functions for export snapshot building.
//! rq:["../../../../reqlan rq/extension/presentation/graph.rq".graph_status_tag_filters]

use crate::types::ExportIdea;
use reqlan_index::FILTER_NOT_PRESENT;
use std::collections::BTreeMap;
use std::time::{SystemTime, UNIX_EPOCH};

pub(crate) fn rollup_statuses(ideas: &[ExportIdea]) -> BTreeMap<String, usize> {
    let mut counts = BTreeMap::new();
    for idea in ideas {
        let key = if idea.status_key.is_empty() {
            FILTER_NOT_PRESENT.to_string()
        } else {
            idea.status_key.clone()
        };
        *counts.entry(key).or_insert(0) += 1;
    }
    counts
}

pub(crate) fn rollup_tags(ideas: &[ExportIdea]) -> BTreeMap<String, usize> {
    let mut counts = BTreeMap::new();
    for idea in ideas {
        let keys = if idea.tags_keys.is_empty() {
            vec![FILTER_NOT_PRESENT.to_string()]
        } else {
            idea.tags_keys.clone()
        };
        for key in keys {
            *counts.entry(key).or_insert(0) += 1;
        }
    }
    counts
}

pub fn slugify(value: &str) -> String {
    let slug = value
        .chars()
        .map(|ch| if ch.is_ascii_alphanumeric() { ch.to_ascii_lowercase() } else { '-' })
        .collect::<String>();
    let slug = slug.trim_matches('-').chars().take(80).collect::<String>();
    if slug.is_empty() {
        "item".into()
    } else {
        slug
    }
}

pub fn ensure_html_file_name(value: &str) -> String {
    let trimmed = value.trim();
    if trimmed.to_ascii_lowercase().ends_with(".html") {
        trimmed.to_string()
    } else {
        format!("{trimmed}.html")
    }
}

pub fn resolve_referenced_file_path(target_file: &str, source_id: &str) -> String {
    reqlan_index::resolve_rq_path(target_file, reqlan_index::file_from_idea_id(source_id), &[])
}

pub(crate) fn chrono_now() -> String {
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or(0);
    let days = secs / 86400;
    let tod = secs % 86400;
    let (year, month, day) = civil_from_days(days as i64);
    let hour = tod / 3600;
    let minute = (tod % 3600) / 60;
    let second = tod % 60;
    format!("{year:04}-{month:02}-{day:02}T{hour:02}:{minute:02}:{second:02}.000Z")
}

fn civil_from_days(z: i64) -> (i32, u32, u32) {
    let z = z + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = (z - era * 146_097) as u32;
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    (y as i32, m, d)
}
