//! Idea filtering for export snapshots.
//! rq:["../../../../reqlan rq/core_analysis/export.rq".export_pipeline]

use crate::types::ExportRequest;
use reqlan_index::ignore::RqIgnoreFilter;
use reqlan_index::{IdeaAttributeMap, IdeaSummary};
use std::collections::HashMap;

pub(crate) fn filter_export_ideas(
    summaries: Vec<IdeaSummary>,
    raw_by_id: &HashMap<String, String>,
    request: &ExportRequest,
) -> Vec<IdeaSummary> {
    summaries
        .into_iter()
        .filter(|summary| {
            if request.exclude_secret_files && is_secret_rq_path(&summary.file_uri) {
                return false;
            }
            if request.exclude_ignored_files {
                let filter = RqIgnoreFilter::load(&request.workspace_root);
                if filter.ignores(&summary.file_uri, false) {
                    return false;
                }
            }

            // Attribute filter
            if let Some(attr_filter) = request.attribute_filters.first() {
                if let Some(attr_json) = raw_by_id.get(&summary.id) {
                    let attributes: IdeaAttributeMap = match serde_json::from_str(attr_json) {
                        Ok(v) => v,
                        Err(_) => {
                            // If we can't parse, treat as no attributes, then only not_present will be considered
                            return attr_filter.not_present;
                        }
                    };

                    let has_key = attributes.contains_key(&attr_filter.key);
                    if attr_filter.not_present {
                        // Node must NOT have this attribute
                        return !has_key;
                    } else if let Some(val) = &attr_filter.value {
                        // Node must have the attribute with this exact value
                        if !has_key {
                            return false;
                        }
                        match attributes.get(&attr_filter.key) {
                            // Compare as string; Text variant holds the actual text value
                            Some(reqlan_index::AttributeValue::Text(actual)) => {
                                if actual != val {
                                    return false;
                                }
                            }
                            // Different variant; treat as mismatch
                            _ => return false,
                        }
                    } else {
                        // value None => just check presence
                        return has_key;
                    }
                } else {
                    // No attributes JSON for this idea, treat as not present
                    return attr_filter.not_present;
                }
            }

            true
        })
        .collect()
}

fn is_secret_rq_path(file_uri: &str) -> bool {
    file_uri
        .replace('\\', "/")
        .rsplit('/')
        .next()
        .unwrap_or(file_uri)
        .to_ascii_lowercase()
        .ends_with(".secret.rq")
}
