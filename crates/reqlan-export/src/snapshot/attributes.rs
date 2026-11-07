//! Attribute record building for the export snapshot.
//! rq:["../../../../reqlan rq/core_analysis/html_export.rq".html_export_attributes_index]
//! rq:["../../../../reqlan rq/core_analysis/html_export.rq".html_export_attribute_pages]

use super::manifest::build_page_info;
use crate::html_utils::slug_attribute_key;
use crate::types::{format_attribute_value, ExportAttribute, ExportAttributeValue, ExportIdea};
use std::collections::{BTreeMap, BTreeSet};

/// Idea IDs and per-value idea-ID sets grouped by attribute key.
type AttributeRollup = BTreeMap<String, (BTreeSet<String>, BTreeMap<String, BTreeSet<String>>)>;

pub(crate) fn build_attribute_records(ideas: &[ExportIdea]) -> Vec<ExportAttribute> {
    let mut by_key: AttributeRollup = BTreeMap::new();
    for idea in ideas {
        for (key, value) in &idea.attributes {
            let entry = by_key.entry(key.clone()).or_default();
            entry.0.insert(idea.id.clone());
            let formatted = {
                let text = format_attribute_value(value);
                if text.is_empty() {
                    "(empty)".into()
                } else {
                    text
                }
            };
            entry.1.entry(formatted).or_default().insert(idea.id.clone());
        }
    }
    let mut records: Vec<ExportAttribute> = by_key
        .into_iter()
        .map(|(key, (idea_ids, values))| {
            let slug = slug_attribute_key(&key);
            let mut values: Vec<ExportAttributeValue> = values
                .into_iter()
                .map(|(value, ids)| ExportAttributeValue {
                    count: ids.len(),
                    idea_ids: ids.into_iter().collect(),
                    value,
                })
                .collect();
            values.sort_by(|left, right| {
                right.count.cmp(&left.count).then(left.value.cmp(&right.value))
            });
            ExportAttribute {
                idea_count: idea_ids.len(),
                idea_ids: idea_ids.into_iter().collect(),
                page: build_page_info(&key, &format!("attributes/{slug}.html"), None),
                key,
                values,
            }
        })
        .collect();
    records.sort_by(|left, right| {
        right.idea_count.cmp(&left.idea_count).then(left.key.cmp(&right.key))
    });
    records
}
