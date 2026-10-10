//! Inbound Katz centrality on the citation graph.
//! rq:["../../../reqlan rq/modelling/advanced_analysis.rq".katz_centrality]
//! rq:["../../../reqlan rq/core_analysis/search.rq".katz_search]

use reqlan_index::{EdgeKind, EdgeRecord, SemanticMatch};
use std::collections::{HashMap, HashSet};

const BETA: f64 = 1.0;
const ALPHA_WHEN_RADIUS_IS_ZERO: f64 = 0.1;
const RADIUS_FRACTION: f64 = 0.85;
/// A directed cycle has spectral radius at least 1. A smaller estimate is a DAG residual.
const RADIUS_CYCLE_FLOOR: f64 = 0.5;
const ITERATION_LIMIT: usize = 1000;
const TOLERANCE: f64 = 1e-9;
const RADIUS_EPSILON: f64 = 1e-12;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MissingKatzScore {
    pub idea_id: String,
}

impl std::fmt::Display for MissingKatzScore {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(formatter, "missing Katz score for {}", self.idea_id)
    }
}

impl std::error::Error for MissingKatzScore {}

/// Resolved `references` and `wildcard_reference` edges whose ends are both in `node_ids`.
pub fn citation_edge_pairs(node_ids: &[String], edges: &[EdgeRecord]) -> Vec<(String, String)> {
    let ids: HashSet<&str> = node_ids.iter().map(String::as_str).collect();
    let mut seen = HashSet::new();
    let mut pairs = Vec::new();
    for edge in edges {
        if !is_citation_kind(edge.kind) || edge.is_resolved != Some(true) {
            continue;
        }
        let Some(target) = edge.target_id.as_deref() else {
            continue;
        };
        if !ids.contains(edge.source_id.as_str()) || !ids.contains(target) {
            continue;
        }
        if seen.insert((edge.source_id.clone(), target.to_string())) {
            pairs.push((edge.source_id.clone(), target.to_string()));
        }
    }
    pairs
}

fn is_citation_kind(kind: EdgeKind) -> bool {
    matches!(kind, EdgeKind::References | EdgeKind::WildcardReference)
}

/// Max-normalized inbound Katz scores. Every id in `node_ids` is present.
/// An edge `(source, target)` adds the source score into the target.
pub fn katz_centrality(node_ids: &[String], edges: &[(String, String)]) -> HashMap<String, f64> {
    let count = node_ids.len();
    if count == 0 {
        return HashMap::new();
    }
    let index: HashMap<&str, usize> =
        node_ids.iter().enumerate().map(|(slot, id)| (id.as_str(), slot)).collect();
    let mut inbound: Vec<Vec<usize>> = vec![Vec::new(); count];
    let mut seen = HashSet::new();
    for (source, target) in edges {
        let Some(&source_index) = index.get(source.as_str()) else {
            continue;
        };
        let Some(&target_index) = index.get(target.as_str()) else {
            continue;
        };
        if seen.insert((source_index, target_index)) {
            inbound[target_index].push(source_index);
        }
    }

    let lambda = spectral_radius(&inbound);
    let alpha = if lambda >= RADIUS_CYCLE_FLOOR {
        RADIUS_FRACTION / lambda
    } else {
        ALPHA_WHEN_RADIUS_IS_ZERO
    };

    let mut scores = vec![BETA; count];
    for _ in 0..ITERATION_LIMIT {
        let mut next = vec![BETA; count];
        let mut max_delta = 0.0_f64;
        for (target, sources) in inbound.iter().enumerate() {
            let mut sum = 0.0;
            for &source in sources {
                sum += scores[source];
            }
            next[target] = alpha * sum + BETA;
            max_delta = max_delta.max((next[target] - scores[target]).abs());
        }
        scores = next;
        if max_delta < TOLERANCE {
            break;
        }
    }

    let max_score = scores.iter().copied().fold(0.0_f64, f64::max);
    let scale = if max_score > 0.0 { max_score } else { 1.0 };
    node_ids.iter().enumerate().map(|(slot, id)| (id.clone(), scores[slot] / scale)).collect()
}

fn spectral_radius(inbound: &[Vec<usize>]) -> f64 {
    let count = inbound.len();
    if count == 0 || inbound.iter().all(Vec::is_empty) {
        return 0.0;
    }
    let mut vector = vec![1.0 / (count as f64).sqrt(); count];
    let mut lambda = 0.0;
    for _ in 0..ITERATION_LIMIT {
        let mut image = vec![0.0; count];
        for (target, sources) in inbound.iter().enumerate() {
            let mut sum = 0.0;
            for &source in sources {
                sum += vector[source];
            }
            image[target] = sum;
        }
        let norm = image.iter().map(|value| value * value).sum::<f64>().sqrt();
        if norm <= RADIUS_EPSILON {
            return 0.0;
        }
        let vector_norm = vector.iter().map(|value| value * value).sum::<f64>().sqrt();
        let next_lambda = norm / vector_norm;
        for (slot, value) in vector.iter_mut().zip(image.iter()) {
            *slot = value / norm;
        }
        if (next_lambda - lambda).abs() < TOLERANCE {
            return next_lambda;
        }
        lambda = next_lambda;
    }
    lambda
}

/// When `enabled` is false, keep text order and scores.
/// When `enabled` is true, set `score = textScore * (1 + katzScore)` and append `katz:<score>`.
pub fn apply_katz_search_bias(
    enabled: bool,
    matches: Vec<SemanticMatch>,
    scores: &HashMap<String, f64>,
) -> Result<Vec<SemanticMatch>, MissingKatzScore> {
    if !enabled {
        return Ok(matches);
    }
    let mut ranked = Vec::with_capacity(matches.len());
    for mut match_ in matches {
        let Some(katz) = scores.get(&match_.idea.id).copied() else {
            return Err(MissingKatzScore { idea_id: match_.idea.id });
        };
        match_.score *= 1.0 + katz;
        match_.reasons.push(format!("katz:{katz:.3}"));
        ranked.push(match_);
    }
    ranked.sort_by(|left, right| {
        right
            .score
            .partial_cmp(&left.score)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then_with(|| left.idea.name.cmp(&right.idea.name))
    });
    Ok(ranked)
}
