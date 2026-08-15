//! Semantic token scoring over name, summary, tags, and edge labels.
//! rq:["../../../reqlan rq/core_analysis/search.rq".semantic_search]

use reqlan_index::{IndexStore, SemanticMatch, StoreError};

pub fn semantic_search(
    store: &IndexStore,
    query: &str,
    ideaset: Option<&str>,
    limit: usize,
) -> Result<Vec<SemanticMatch>, StoreError> {
    let normalized = query.to_lowercase();
    let tokens: Vec<&str> =
        normalized.split_whitespace().filter(|token| !token.is_empty()).collect();
    let candidates = store.search_by_name_or_summary(query)?;
    let mut matches = Vec::new();
    for idea in candidates {
        if let Some(set) = ideaset {
            if idea.kind == reqlan_index::IdeaKind::Ideaset && idea.name != set {
                continue;
            }
        }
        let haystack =
            format!("{} {} {}", idea.name, idea.summary, idea.tags.join(" ")).to_lowercase();
        let mut reasons = Vec::new();
        let mut score = 0.0;
        if idea.name.to_lowercase().contains(&normalized) {
            score += 3.0;
            reasons.push("name match".into());
        }
        if idea.summary.to_lowercase().contains(&normalized) {
            score += 2.0;
            reasons.push("summary match".into());
        }
        for token in &tokens {
            if haystack.contains(token) {
                score += 1.0;
                reasons.push(format!("token:{token}"));
            }
        }
        for tag in &idea.tags {
            if tag.to_lowercase().contains(&normalized) {
                score += 1.0;
                reasons.push(format!("tag:{tag}"));
            }
        }
        for edge in store.get_edges_from(&idea.id)? {
            if edge.label.as_deref().is_some_and(|label| label.to_lowercase().contains(&normalized))
            {
                score += 1.0;
                reasons.push("reference label".into());
            }
        }
        reasons.sort();
        reasons.dedup();
        if score > 0.0 {
            matches.push(SemanticMatch { idea, score, reasons });
        }
    }
    matches.sort_by(|left, right| {
        right.score.partial_cmp(&left.score).unwrap_or(std::cmp::Ordering::Equal)
    });
    matches.truncate(limit);
    Ok(matches)
}
