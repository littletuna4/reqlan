use reqlan_index::{IdeaKind, IdeaSummary, IndexStore, FILTER_NOT_PRESENT};
use reqlan_search::{
    filter_and_score_files, filter_and_score_ideas, fuzzy_search, match_query_tokens,
    normalize_search_separators, search_ideas, search_index, split_search_tokens, FuzzyHitKind,
    SearchIdeasOptions,
};

fn idea(name: &str, summary: &str) -> IdeaSummary {
    idea_kind(name, summary, IdeaKind::Block)
}

fn idea_kind(name: &str, summary: &str, kind: IdeaKind) -> IdeaSummary {
    IdeaSummary {
        id: name.to_string(),
        name: name.to_string(),
        kind,
        file_uri: format!("file:///{name}.rq"),
        line_start: 0,
        summary: summary.to_string(),
        status: None,
        status_key: FILTER_NOT_PRESENT.to_string(),
        tags: Vec::new(),
        tags_keys: vec![FILTER_NOT_PRESENT.to_string()],
        git_created_at: None,
        git_modified_at: None,
        git_change_count: None,
    }
}

// rq:["../../../reqlan rq/core_analysis/search.rq".fuzzy_search_whitespace]
#[test]
fn collapses_underscore_hyphen_dots_ellipsis_and_whitespace() {
    assert_eq!(normalize_search_separators("cli_package"), "clipackage");
    assert_eq!(normalize_search_separators("cli-package"), "clipackage");
    assert_eq!(normalize_search_separators("cli package"), "clipackage");
    assert_eq!(normalize_search_separators("cli...package"), "clipackage");
    assert_eq!(normalize_search_separators("cli…package"), "clipackage");
    assert_eq!(normalize_search_separators("  CLI__Package  "), "clipackage");
}

// rq:["../../../reqlan rq/core_analysis/search.rq".fuzzy_search_whitespace]
#[test]
fn splits_on_interchangeable_separators() {
    assert_eq!(split_search_tokens("cli_package"), vec!["cli", "package"]);
    assert_eq!(split_search_tokens("search-code-actions"), vec!["search", "code", "actions"]);
    assert_eq!(split_search_tokens("parent...nodes pane"), vec!["parent", "nodes", "pane"]);
    assert_eq!(split_search_tokens("  CLI__Package  "), vec!["cli", "package"]);
}

// rq:["../../../reqlan rq/core_analysis/search.rq".fuzzy_search_whitespace]
#[test]
fn prefers_order_allows_reordering_and_missing_hay_words() {
    assert_eq!(
        match_query_tokens(
            &["search".into(), "code".into(), "actions".into()],
            &["search".into(), "actions".into()]
        ),
        Some("ordered")
    );
    assert_eq!(
        match_query_tokens(&["cli".into(), "package".into()], &["package".into(), "cli".into()]),
        Some("reordered")
    );
    assert_eq!(
        match_query_tokens(
            &["cli".into(), "package".into()],
            &["cli".into(), "package".into(), "extra".into()]
        ),
        None
    );
    assert_eq!(
        match_query_tokens(&["search".into(), "code".into(), "actions".into()], &["sea".into()]),
        Some("ordered")
    );
}

// rq:["../../../reqlan rq/core_analysis/search.rq".fuzzy_search]
#[test]
fn ranks_exact_and_prefix_matches_ahead_of_subsequence_fuzzy_hits() {
    let ideas = vec![
        idea("search_code_actions", "code action search"),
        idea("sea_code", ""),
        idea("other", "mentions search somewhere"),
        idea_kind("ideaset_only", "", IdeaKind::Ideaset),
    ];
    let exact = filter_and_score_ideas(&ideas, "search_code_actions");
    assert_eq!(exact[0].name, "search_code_actions");
    assert!(!exact.iter().any(|hit| hit.name == "ideaset_only"));

    let partial = filter_and_score_ideas(&ideas, "search");
    let partial_names: Vec<_> = partial.iter().map(|hit| hit.name.as_str()).collect();
    assert!(partial_names.contains(&"search_code_actions"));
    assert!(partial_names.contains(&"other"));

    let fuzzy = filter_and_score_ideas(&ideas, "sca");
    assert!(fuzzy.iter().any(|hit| hit.name == "search_code_actions"));
}

// rq:["../../../reqlan rq/core_analysis/search.rq".fuzzy_search_whitespace]
#[test]
fn matches_across_separator_substitutions() {
    let ideas = vec![
        idea("cli_package", "CLI package"),
        idea("search-code-actions", ""),
        idea("parent_nodes_pane", ""),
    ];
    assert_eq!(filter_and_score_ideas(&ideas, "cli package")[0].name, "cli_package");
    assert_eq!(filter_and_score_ideas(&ideas, "cli-package")[0].name, "cli_package");
    assert_eq!(
        filter_and_score_ideas(&ideas, "search code actions")[0].name,
        "search-code-actions"
    );
    assert_eq!(filter_and_score_ideas(&ideas, "parent...nodes")[0].name, "parent_nodes_pane");
}

// rq:["../../../reqlan rq/core_analysis/search.rq".fuzzy_search_whitespace]
#[test]
fn matches_reordered_and_partial_word_queries() {
    let ideas = vec![
        idea("cli_package", ""),
        idea("search_code_actions", ""),
        idea("parent_nodes_pane", ""),
        idea("unrelated_thing", ""),
    ];
    let reordered = filter_and_score_ideas(&ideas, "package cli");
    assert_eq!(reordered[0].name, "cli_package");
    assert!(!reordered.iter().any(|hit| hit.name == "unrelated_thing"));

    let missing_middle = filter_and_score_ideas(&ideas, "search actions");
    assert_eq!(missing_middle[0].name, "search_code_actions");

    let ordered_beats_reordered = filter_and_score_ideas(
        &[idea("actions_search", ""), idea("search_code_actions", "")],
        "search actions",
    );
    assert_eq!(ordered_beats_reordered[0].name, "search_code_actions");
}

// rq:["../../../reqlan rq/core_analysis/search.rq".fuzzy_search]
#[test]
fn search_ideas_requires_query_and_caps_hits() {
    let ideas = vec![
        idea("cli_package", "CLI package"),
        idea("search_code_actions", "code action search"),
        idea("parent_nodes_pane", ""),
    ];
    let empty = search_ideas(
        &ideas,
        "   ",
        SearchIdeasOptions { limit: Some(10), require_query: true, offset: 0 },
    );
    assert!(empty.hits.is_empty());
    assert_eq!(empty.total, 0);

    let capped = search_ideas(
        &ideas,
        "a",
        SearchIdeasOptions { limit: Some(1), require_query: true, offset: 0 },
    );
    assert_eq!(capped.hits.len(), 1);
    assert!(capped.total > 1);
    assert!(capped.truncated);
}

// rq:["../../../reqlan rq/core_analysis/search.rq".fuzzy_search]
#[test]
fn fuzzy_search_reads_sqlite_and_returns_ranked_hits() {
    let mut store = IndexStore::open_in_memory().unwrap();
    let document = reqlan_index::extract_indexed_document(
        "demo.rq",
        "cli_package {\n    CLI package\n}\nsearch_code_actions {\n    code action search\n}\n",
        &reqlan_index::ExtractOptions::default(),
    );
    store.persist_extracted(document, None).unwrap();

    let result = fuzzy_search(
        &store,
        "cli package",
        SearchIdeasOptions { limit: Some(8), require_query: true, offset: 0 },
    )
    .unwrap();
    assert_eq!(result.hits[0].name, "cli_package");
    assert!(!result.hits.iter().any(|hit| hit.kind == FuzzyHitKind::Ideaset));
}

// rq:["../../../reqlan rq/core_analysis/search.rq".file_search]
#[test]
fn ranks_file_name_hits_with_ideas() {
    let ideas = vec![idea("cli_package", "CLI package"), idea("unrelated", "")];
    let files = vec![
        "reqlan rq/core_analysis/search.rq".to_string(),
        "packages/cli/cli_package.rq".to_string(),
    ];
    let by_basename = filter_and_score_files(&files, "search");
    assert_eq!(by_basename[0].name, "search.rq");
    assert_eq!(by_basename[0].kind, FuzzyHitKind::File);
    assert_eq!(by_basename[0].line_start, 0);

    let mixed = search_index(
        &ideas,
        &files,
        "search",
        SearchIdeasOptions { limit: Some(8), require_query: true, offset: 0 },
    );
    assert!(mixed.hits.iter().any(|hit| hit.kind == FuzzyHitKind::File && hit.name == "search.rq"));
    assert!(mixed.hits.iter().any(|hit| hit.name == "cli_package") == false);
}

// rq:["../../../reqlan rq/core_analysis/search.rq".fuzzy_search_pages]
#[test]
fn pages_ranked_hits_with_offset_and_truncated() {
    let ideas: Vec<_> = (0..5)
        .map(|index| idea(&format!("alpha_{index}"), "shared"))
        .collect();
    let first = search_ideas(
        &ideas,
        "alpha",
        SearchIdeasOptions { limit: Some(2), require_query: true, offset: 0 },
    );
    assert_eq!(first.hits.len(), 2);
    assert_eq!(first.total, 5);
    assert!(first.truncated);

    let second = search_ideas(
        &ideas,
        "alpha",
        SearchIdeasOptions { limit: Some(2), require_query: true, offset: 2 },
    );
    assert_eq!(second.hits.len(), 2);
    assert!(second.truncated);
    assert_ne!(first.hits[0].name, second.hits[0].name);

    let last = search_ideas(
        &ideas,
        "alpha",
        SearchIdeasOptions { limit: Some(2), require_query: true, offset: 4 },
    );
    assert_eq!(last.hits.len(), 1);
    assert!(!last.truncated);
}
