//! rq:["../../../reqlan rq/core_analysis/rust_port.rq".parser_rust]

use reqlan_parse::{
    parse_align_snapshot, parse_document, parse_document_with_budget, BodyElement, ParseBudget,
    ReferenceTarget, RichPart, Severity, TopLevelElement, PARSE_HANG_SENTINEL,
};

fn idea_names(source: &str) -> Vec<String> {
    parse_document(source)
        .model
        .elements
        .iter()
        .filter_map(TopLevelElement::name)
        .map(str::to_string)
        .collect()
}

fn block_body_source(source: &str, name: &str) -> String {
    let parsed = parse_document(source);
    let idea = parsed
        .model
        .elements
        .iter()
        .find_map(|element| match element {
            TopLevelElement::Idea(idea) if idea.name == name => Some(idea),
            _ => None,
        })
        .unwrap_or_else(|| panic!("missing block idea {name}"));
    idea.elements
        .iter()
        .filter_map(|element| match element {
            BodyElement::BodyLine(line) => source.get(line.span.start..line.span.end),
            _ => None,
        })
        .collect::<Vec<_>>()
        .join("\n")
}

fn repo_root() -> std::path::PathBuf {
    std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..")
}

// rq:["../../../reqlan rq/language/syntax.rq".simple_idea]
// rq:["../../../reqlan rq/language/syntax.rq".block_idea]
#[test]
fn parses_block_and_oneliner() {
    let source = "oneliner this is a simple idea body\n\
         myidea {\n\
             It should be a good thing.\n\
             per [simple_views]\n\
         }\n";
    let result = parse_document(source);
    assert!(result.incomplete.is_none());
    assert_eq!(idea_names(source), vec!["oneliner", "myidea"]);
}

// rq:["../../../reqlan rq/language/syntax.rq".code_snippets]
// rq:["../../../reqlan rq/core_analysis/rust_port.rq".comment_span_align]
#[test]
fn keeps_ideas_after_mid_line_triple_backticks() {
    let source = "\
first {
    fenced ``` bodies must not open comments
}
later { ok }
";
    let result = parse_document(source);
    assert!(result.incomplete.is_none());
    assert_eq!(idea_names(source), vec!["first", "later"]);
}

// rq:["../../../reqlan rq/language/syntax.rq".block_idea]
// rq:["../../../reqlan rq/language/syntax.rq".simple_idea]
#[test]
fn parses_same_line_blocks_without_swallowing_later_ideas() {
    let source = "\
mybadidea1 {}\n\
mybadidea2 {hello}\n\
mybadidea4 hello again\n\
myokidea1 {\n\
  this is ok to text mate\n\
}\n\
mybadidea3\n";
    let result = parse_document(source);
    assert!(result.incomplete.is_none());
    let kinds: Vec<(&str, &str)> = result
        .model
        .elements
        .iter()
        .map(|element| match element {
            TopLevelElement::Idea(idea) => ("block", idea.name.as_str()),
            TopLevelElement::OneLiner(idea) => ("oneliner", idea.name.as_str()),
            other => panic!("unexpected element {other:?}"),
        })
        .collect();
    assert_eq!(
        kinds,
        vec![
            ("block", "mybadidea1"),
            ("block", "mybadidea2"),
            ("oneliner", "mybadidea4"),
            ("block", "myokidea1"),
            ("oneliner", "mybadidea3"),
        ]
    );
}

// rq:["../../../reqlan rq/core_analysis/check_oom.rq".parser_list_progress]
#[test]
fn unclosed_list_stops_at_attribute_and_enclosing_block() {
    let source =
        "host {\n    items (\n        first\n    @status pending\n}\nnext { still parsed }\n";
    let result = parse_document(source);
    assert!(result.incomplete.is_none(), "{:?}", result.diagnostics);
    assert_eq!(idea_names(source), vec!["host", "next"]);
}

// rq:["../../../reqlan rq/core_analysis/check_oom.rq".parser_list_progress]
#[test]
fn unclosed_list_stops_before_enclosing_block_close() {
    let source = "host {\n    items (\n        first\n}\nnext { still parsed }\n";
    let result = parse_document(source);
    assert!(result.incomplete.is_none(), "{:?}", result.diagnostics);
    assert_eq!(idea_names(source), vec!["host", "next"]);
}

// rq:["../../../reqlan rq/language/syntax-edge-cases.rq".nested_curly_braces]
#[test]
fn keeps_inline_prose_braces() {
    let source = "nested_curly_braces {\n    if there is a prose block containing curly braces, {such as this one} they should be treated as part of the prose.\n}\n";
    let result = parse_document(source);
    assert!(result.incomplete.is_none());
    let body = block_body_source(source, "nested_curly_braces");
    assert!(body.contains("{such as this one}"), "{body}");
}

// rq:["../../../reqlan rq/language/syntax-edge-cases.rq".nested_curly_braces]
#[test]
fn keeps_end_of_line_matching_prose_braces() {
    let source = "resources {\n    - Project site: {{SITE_URL}}\n    - Docs: {{QUICKSTART_URL}}\n}\nnext_idea still here\n";
    let result = parse_document(source);
    assert!(result.incomplete.is_none());
    let body = block_body_source(source, "resources");
    assert!(body.contains("{{SITE_URL}}"), "{body}");
    assert!(body.contains("{{QUICKSTART_URL}}"), "{body}");
    assert_eq!(idea_names(source), vec!["resources", "next_idea"]);
}

// rq:["../../../reqlan rq/language/syntax-edge-cases.rq".one_liner_curly_brace_context]
#[test]
fn keeps_inline_braces_in_one_liner_body() {
    let source = "one_liner_curly_brace_context this should {be acceptable} as well";
    let result = parse_document(source);
    assert!(result.incomplete.is_none());
    let idea = match result.model.elements.first() {
        Some(TopLevelElement::OneLiner(idea)) => idea,
        other => panic!("expected one-liner, got {other:?}"),
    };
    assert_eq!(idea.name, "one_liner_curly_brace_context");
    let text = source.get(idea.span.start..idea.span.end).unwrap_or("");
    assert_eq!(text, source);
    assert!(text.contains("{be acceptable}"));
}

// rq:["../../../reqlan rq/language/syntax-edge-cases.rq".closing_nested_curly_braces]
#[test]
fn allows_escaped_closing_brace_in_body_prose() {
    let source = "closing_nested_curly_braces {\n    if, for some reason, there is a prose block containing only closing curly braces, they should be escaped and allowed \\} like this.\n}\n";
    let body = block_body_source(source, "closing_nested_curly_braces");
    assert!(body.contains("\\}"), "{body}");
}

// rq:["../../../reqlan rq/language/imports.rq".import_from]
// rq:["../../../reqlan rq/core_analysis/rust_port.rq".parser_rust]
#[test]
fn from_import_records_each_token_span() {
    let source = "from \"./links-to-file.rq\" import ishouldlink, ishouldbeasecondlink as ishouldbeathirdvalidlink\n";
    let parsed = parse_document(source);
    let reqlan_parse::Import::From(import) = &parsed.model.imports[0] else {
        panic!("expected a from-import");
    };
    let text = |span: reqlan_parse::Span| &source[span.start..span.end];
    assert_eq!(text(import.path_span), "\"./links-to-file.rq\"");
    assert_eq!(import.specifiers.len(), 2);
    assert_eq!(text(import.specifiers[0].idea_span), "ishouldlink");
    assert!(import.specifiers[0].alias_span.is_none());
    assert_eq!(text(import.specifiers[1].idea_span), "ishouldbeasecondlink");
    let alias_span = import.specifiers[1].alias_span.expect("alias span");
    assert_eq!(text(alias_span), "ishouldbeathirdvalidlink");
}

// rq:["../../../reqlan rq/core_analysis/rust_port.rq".parser_rust]
// rq:["../../../reqlan rq/language/parser_lexer.rq".recovery_vs_budget]
#[test]
fn recovers_invalid_from_import_and_keeps_later_ideas() {
    let source = "from not-a-string import foo\nlater_idea still here\n";
    let result = parse_document(source);
    assert!(
        result
            .model
            .imports
            .iter()
            .any(|import| matches!(import, reqlan_parse::Import::InvalidFrom(_))),
        "local import mistakes must recover as InvalidFrom: {:?}",
        result.model.imports
    );
    assert!(idea_names(source).contains(&"later_idea".to_string()));
}

// rq:["../../../reqlan rq/language/syntax.rq".no_name_idea_safe_warning]
// rq:["../../../reqlan rq/language/parser_lexer.rq".recovery_vs_budget]
#[test]
fn recovers_nameless_block() {
    let source = "{\n    stray\n}\nnext still_here\n";
    let result = parse_document(source);
    assert!(matches!(result.model.elements.first(), Some(TopLevelElement::Anonymous(_))));
    assert!(idea_names(source).contains(&"next".to_string()));
}

// rq:["../../../reqlan rq/language/syntax.rq".no_name_idea_safe_warning]
#[test]
fn parses_top_level_nameless_braces_without_aborting_later_ideas() {
    let source = "{\n    orphan body\n}\n\nlater_idea {\n    still reachable\n}\n";
    let result = parse_document(source);
    assert!(result.incomplete.is_none());
    assert!(matches!(result.model.elements.first(), Some(TopLevelElement::Anonymous(_))));
    assert!(idea_names(source).contains(&"later_idea".to_string()));
}

// rq:["../../../reqlan rq/language/syntax.rq".simple_idea]
#[test]
fn one_liner_body_does_not_continue_on_the_next_line() {
    let source = "first a one liner\nsecond another\n";
    assert_eq!(idea_names(source), vec!["first", "second"]);
}

// rq:["../../../reqlan rq/language/syntax.rq".idea_name]
#[test]
fn parse_dash_and_underscore_delimited_idea_names() {
    let source = "dash-or_undersore_delimited-idea it should be possible\nmy_idea body\n";
    let names = idea_names(source);
    assert!(names.contains(&"dash-or_undersore_delimited-idea".to_string()));
    assert!(names.contains(&"my_idea".to_string()));
}

// rq:["../../../reqlan rq/language/syntax.rq".empty_attribute]
#[test]
fn lone_at_keeps_surrounding_ideas() {
    let source = "\
sample {
    kept body
    @
    @   
    @flag
    @gone!
    @status done
    @note: legacy
    still kept
}
next { ok }
";
    let result = parse_document(source);
    assert!(
        result.diagnostics.iter().all(|diagnostic| diagnostic.severity != Severity::Error),
        "{:?}",
        result.diagnostics
    );
    assert!(result.incomplete.is_none());
    assert_eq!(idea_names(source), vec!["sample", "next"]);
    let body = block_body_source(source, "sample");
    assert!(body.contains("kept body"), "{body}");
    assert!(body.contains("still kept"), "{body}");
    assert!(!body.contains('@'), "{body}");
    let parsed = parse_document(source);
    let idea = parsed.model.elements.iter().find_map(|element| match element {
        TopLevelElement::Idea(idea) if idea.name == "sample" => Some(idea),
        _ => None,
    });
    let idea = idea.expect("sample idea");
    let names: Vec<&str> = idea
        .elements
        .iter()
        .filter_map(|element| match element {
            BodyElement::Attribute(attribute) => Some(attribute.name.as_str()),
            _ => None,
        })
        .collect();
    assert_eq!(names, vec!["flag", "gone", "status", "note"]);
    let gone = idea.elements.iter().find_map(|element| match element {
        BodyElement::Attribute(attribute) if attribute.name == "gone" => Some(attribute),
        _ => None,
    });
    assert_eq!(gone.map(|attribute| attribute.negated), Some(true));
    let status = idea.elements.iter().find_map(|element| match element {
        BodyElement::Attribute(attribute) if attribute.name == "status" => Some(attribute),
        _ => None,
    });
    assert!(matches!(
        status.and_then(|attribute| attribute.value.as_ref()),
        Some(reqlan_parse::AttributeValue::Scalar(scalar)) if scalar.text == "done"
    ));
}

// rq:["../../../reqlan rq/language/syntax.rq".empty_attribute]
#[test]
fn syntax_error_elsewhere_is_still_reported() {
    let source = "\
sample {
    @
}
next { ok }
bad {
    @!
}
";
    let result = parse_document(source);
    assert!(result.incomplete.is_none());
    assert_eq!(idea_names(source), vec!["sample", "next", "bad"]);
    let errors: Vec<_> = result
        .diagnostics
        .iter()
        .filter(|diagnostic| diagnostic.severity == Severity::Error)
        .collect();
    assert!(!errors.is_empty(), "{:?}", result.diagnostics);
    let lone_at_line = source
        .lines()
        .position(|line| line.trim_matches(|ch: char| ch == ' ' || ch == '\t') == "@")
        .expect("lone @ line") as u32;
    assert!(
        errors.iter().all(|diagnostic| diagnostic.line != lone_at_line),
        "lone @ line {lone_at_line} must not be an error: {errors:?}"
    );
}

// rq:["../../../reqlan rq/language/syntax.rq".file_layout]
#[test]
fn parse_syntax_rq() {
    let path = repo_root().join("testdata/golden-corpus/language/syntax.rq");
    let source = std::fs::read_to_string(&path).unwrap();
    let result = parse_document(&source);
    assert!(result.incomplete.is_none(), "syntax.rq must parse: {:?}", result.diagnostics);
    assert!(!idea_names(&source).is_empty());
}

// rq:["../../../reqlan rq/language/syntax-edge-cases.rq".nested_curly_braces]
#[test]
fn parse_thanks_for_installing_template() {
    let path = repo_root().join("packages/extension/templates/thanks-for-installing.template.rq");
    let source = std::fs::read_to_string(&path).unwrap();
    let result = parse_document(&source);
    assert!(result.incomplete.is_none(), "{:?}", result.diagnostics);
    assert_eq!(
        idea_names(&source),
        vec![
            "welcome",
            "one_liner_ideas",
            "block_ideas",
            "references",
            "attributes",
            "project_resources",
            "extension_overview",
            "language_overview",
            "acknowledgements"
        ]
    );
}

// rq:["../../../reqlan rq/language/parser_lexer.rq".parse_budget_timeout]
#[test]
fn times_out_hang_sentinel() {
    let budget = ParseBudget::new(std::time::Duration::from_millis(50));
    let result = parse_document_with_budget(PARSE_HANG_SENTINEL, budget);
    assert!(result.incomplete.is_some());
    assert!(!result.diagnostics.is_empty());
}

// rq:["../../../reqlan rq/language/syntax.rq".comments]
#[test]
fn unquoted_url_in_one_liner_preserves_text() {
    let source = "url_example use https://not a comment.com in body";
    let result = parse_document(source);
    let idea = match result.model.elements.first() {
        Some(TopLevelElement::OneLiner(idea)) => idea,
        other => panic!("expected one-liner, got {other:?}"),
    };
    let text = source.get(idea.span.start..idea.span.end).unwrap_or("");
    assert!(text.contains("https://"));
    assert!(text.contains("comment.com"));
}

// rq:["../../../reqlan rq/reference_types.rq".url_reference]
#[test]
fn bracketed_url_is_a_url_reference() {
    let source = "host {\n    see [https://reqlan.com/]\n}\n";
    let snapshot = parse_align_snapshot(source);
    let urls: Vec<&str> = snapshot
        .refs
        .iter()
        .filter(|reference| reference.kind == "url")
        .map(|reference| reference.label.as_str())
        .collect();
    assert_eq!(urls, vec!["https://reqlan.com/"], "{:?}", snapshot.refs);
    assert!(snapshot
        .refs
        .iter()
        .all(|reference| reference.kind != "local" || reference.label != "https"));
}

// rq:["../../../reqlan rq/language/syntax_whitespace.rq".idea-leading-whitespace]
#[test]
fn relative_dedent_keeps_extra_spaces_on_a_later_body_line() {
    let source = "\
idea {
        @status pending
    alpha
    gamma
        beta
}
";
    let result = parse_document(source);
    assert!(result.incomplete.is_none());
    let idea = result
        .model
        .elements
        .iter()
        .find_map(|element| match element {
            TopLevelElement::Idea(idea) if idea.name == "idea" => Some(idea),
            _ => None,
        })
        .expect("idea");
    let kinds: Vec<&str> = idea
        .elements
        .iter()
        .map(|element| match element {
            BodyElement::Attribute(attribute) => {
                assert_eq!(attribute.name, "status");
                "attribute"
            }
            BodyElement::BodyLine(_) => "line",
            _ => "other",
        })
        .collect();
    assert_eq!(kinds, vec!["attribute", "line", "line", "line"]);
    let lines = block_body_source(source, "idea");
    assert_eq!(lines, "alpha\ngamma\n    beta");
}

// rq:["../../../reqlan rq/language/syntax_whitespace.rq".idea-leading-whitespace]
#[test]
fn relative_dedent_uses_the_indent_of_a_first_body_line_that_is_not_at_column_0() {
    let source = "\
    shifted {
        alpha
            beta
    }
";
    let lines = block_body_source(source, "shifted");
    assert_eq!(lines, "alpha\n    beta");
}

// rq:["../../../reqlan rq/language/syntax_whitespace.rq".idea-leading-whitespace]
#[test]
fn relative_dedent_keeps_an_extra_tab() {
    let source = "idea {\n\tfirst\n\t\tsecond\n}\n";
    let lines = block_body_source(source, "idea");
    assert_eq!(lines, "first\n\tsecond");
}

// rq:["../../../reqlan rq/reference_types.rq".reference_edgecase]
#[test]
fn unbracketed_quoted_path_is_not_a_file_reference() {
    let source = concat!(
        "demo {\n",
        "    see \"this is not a reference.rq\"\n",
        "    and './also-not-a-reference.ts'\n",
        "    but this is: [\"./live.ts\"]\n",
        "}\n",
    );
    let snapshot = parse_align_snapshot(source);
    let file_labels: Vec<&str> = snapshot
        .refs
        .iter()
        .filter(|reference| reference.kind == "file")
        .map(|reference| reference.label.as_str())
        .collect();
    assert_eq!(file_labels, vec!["./live.ts"], "{:?}", snapshot.refs);
    assert!(
        snapshot.refs.iter().all(|reference| {
            reference.label != "this is not a reference.rq"
                && reference.label != "./also-not-a-reference.ts"
        }),
        "{:?}",
        snapshot.refs
    );
}

// rq:["../../../reqlan rq/language/syntax.rq".attribute_namespacing]
#[test]
fn parses_idea_attribute_link_as_qualified_names() {
    let source = "host {\n    see [attribute_namespacing.example]\n}\n";
    let result = parse_document(source);
    assert!(result.diagnostics.is_empty(), "{:?}", result.diagnostics);
    assert!(result.incomplete.is_none());
    let idea = result
        .model
        .elements
        .iter()
        .find_map(|element| match element {
            TopLevelElement::Idea(idea) if idea.name == "host" => Some(idea),
            _ => None,
        })
        .expect("host idea");
    let target = idea.elements.iter().find_map(|element| match element {
        BodyElement::BodyLine(line) => line.parts.iter().find_map(|part| match part {
            RichPart::BracketRef { target, .. } => Some(target),
            _ => None,
        }),
        _ => None,
    });
    match target {
        Some(ReferenceTarget::Qualified { path: None, qualifier, ideaset: None, idea, .. }) => {
            assert_eq!(qualifier.as_deref(), Some("attribute_namespacing"));
            assert_eq!(idea, "example");
        }
        other => panic!("expected idea.attribute qualified target, got {other:?}"),
    }
}
