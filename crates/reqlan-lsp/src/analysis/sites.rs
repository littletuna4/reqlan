//! File, wildcard, and search site payloads for host commands.

use std::path::PathBuf;

use lsp_types::{Position, Range, Url};
use reqlan_parse::ReferenceTarget;

use crate::utf16::range_contains;

use super::model::DocModel;
use super::refs::walk_refs;
use super::text::{import_span, span_has, target_span};

impl DocModel {
    pub fn file_reference_at(&self, pos: Position) -> Option<serde_json::Value> {
        let byte = self.byte_at(pos);
        if let Some(
            ReferenceTarget::File { span, file } | ReferenceTarget::FileSymbol { span, file, .. },
        ) = self.ref_at(byte)
        {
            let range = self.lines.range(&self.text, span.start, span.end);
            return Some(file_reference_value(file, range, self.locate(file)));
        }
        let import =
            self.model.imports.iter().find(|import| span_has(import_span(import), byte))?;
        let span = import_span(import);
        let range = self.lines.range(&self.text, span.start, span.end);
        let path = import.path()?;
        Some(file_reference_value(path, range, self.locate(path)))
    }

    pub fn wildcard_at(&self, pos: Position, from_uri: &str) -> Option<serde_json::Value> {
        let ReferenceTarget::Wildcard { path_pattern, idea_pattern, .. } =
            self.ref_at(self.byte_at(pos))?
        else {
            return None;
        };
        Some(serde_json::json!({
            "pathPattern": path_pattern,
            "ideaPattern": idea_pattern,
            "fromUri": from_uri,
        }))
    }

    pub fn search_site(&self, range: Range, doc_uri: &str) -> Option<serde_json::Value> {
        let mut site = None;
        walk_refs(&self.model, &mut |target, _| {
            let span = target_span(target);
            let target_range = self.lines.range(&self.text, span.start, span.end);
            if ranges_overlap(target_range, range) {
                if let ReferenceTarget::Local { idea, .. }
                | ReferenceTarget::Qualified { idea, .. } = target
                {
                    site = Some(serde_json::json!({
                        "documentUri": doc_uri,
                        "refText": idea,
                        "range": target_range,
                        "mode": "replace",
                    }));
                }
            }
        });
        if site.is_some() {
            return site;
        }
        let start = self.lines.byte_at(&self.text, range.start);
        let end = self.lines.byte_at(&self.text, range.end);
        if end > start {
            let text = self.text[start..end].trim().to_string();
            if !text.is_empty() {
                return Some(serde_json::json!({
                    "documentUri": doc_uri,
                    "refText": text,
                    "range": range,
                    "mode": "wrap",
                }));
            }
        }
        None
    }
}

fn file_reference_value(path: &str, range: Range, existing: Option<PathBuf>) -> serde_json::Value {
    let trimmed = path.trim_matches('"').trim_matches('\'');
    let is_dir = existing.as_ref().is_some_and(|path| path.is_dir());
    let target = existing
        .as_ref()
        .and_then(|path| Url::from_file_path(path).ok())
        .map(|url| url.to_string())
        .unwrap_or_else(|| trimmed.to_string());
    let folder_files = if is_dir {
        existing.as_ref().and_then(|path| std::fs::read_dir(path).ok()).map(|read| {
            read.flatten()
                .filter(|entry| entry.path().is_file())
                .filter_map(|entry| entry.file_name().into_string().ok())
                .collect::<Vec<_>>()
        })
    } else {
        None
    };
    let resolution = if is_dir {
        "folder"
    } else if existing.is_some() {
        "file"
    } else {
        "missing"
    };
    serde_json::json!({
        "sourceRange": range,
        "targetUri": target,
        "resolution": resolution,
        "folderFiles": folder_files,
    })
}

fn ranges_overlap(left: Range, right: Range) -> bool {
    range_contains(left, right.start)
        || range_contains(right, left.start)
        || (left.start == right.start)
}
