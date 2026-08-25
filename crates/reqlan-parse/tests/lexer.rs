//! rq:["../../../reqlan rq/core_analysis/rust_port.rq".lexer_rust]
//! rq:["../../../reqlan rq/language/parser_lexer.rq".lexer_bridge_to_syntax]

use reqlan_parse::{lex, ParseBudget, TokenKind};

fn visible_kinds(source: &str) -> Vec<TokenKind> {
    lex(source, ParseBudget::unlimited())
        .tokens
        .into_iter()
        .filter(|token| {
            !token.kind.is_hidden() && token.kind != TokenKind::Eof && token.kind != TokenKind::Nl
        })
        .map(|token| token.kind)
        .collect()
}

fn has_comment(source: &str) -> bool {
    lex(source, ParseBudget::unlimited())
        .tokens
        .iter()
        .any(|token| token.kind == TokenKind::SlComment || token.kind == TokenKind::MlComment)
}

// rq:["../../../reqlan rq/language/syntax.rq".block_idea]
#[test]
fn structural_braces_around_named_block() {
    let tokens = visible_kinds("demo {\n    body text\n}");
    assert_eq!(
        tokens,
        vec![TokenKind::Id, TokenKind::LBrace, TokenKind::Id, TokenKind::Id, TokenKind::RBrace]
    );
}

// rq:["../../../reqlan rq/language/syntax-edge-cases.rq".nested_curly_braces]
#[test]
fn prose_braces_stay_other() {
    let tokens = visible_kinds("nested {\n    if {such as this} they stay prose\n}");
    assert!(tokens.contains(&TokenKind::Other), "prose '{{' / '}}' must lex as OTHER: {tokens:?}");
    assert_eq!(tokens.iter().filter(|kind| **kind == TokenKind::LBrace).count(), 1);
    assert_eq!(tokens.iter().filter(|kind| **kind == TokenKind::RBrace).count(), 1);
}

// rq:["../../../reqlan rq/language/syntax.rq".comments]
#[test]
fn glob_star_star_is_not_a_block_comment() {
    let source = r#"from "../mod/**/*.rq" import foo"#;
    assert!(!has_comment(source), "empty /**/ glob must not lex as ML_COMMENT");
    assert!(visible_kinds(source).contains(&TokenKind::String));
}

// rq:["../../../reqlan rq/language/syntax.rq".attribute_location]
// rq:["../../../reqlan rq/core_analysis/rust_port.rq".parser_rust]
#[test]
fn mid_line_at_plan_brace_stays_prose() {
    let source = "episode {\n    code @plan { goal: ship login }\n}";
    let tokens = visible_kinds(source);
    assert_eq!(
        tokens.iter().filter(|kind| **kind == TokenKind::LBrace).count(),
        1,
        "mid-line @plan {{ must not open a structural block: {tokens:?}"
    );
    assert!(tokens.contains(&TokenKind::Other), "prose {{ after mid-line @plan: {tokens:?}");
}

// rq:["../../../reqlan rq/language/syntax.rq".attribute_location]
#[test]
fn at_only_at_line_start() {
    let source = "idea {\n    @status pending\n    email user@host in body\n}";
    let lexed = lex(source, ParseBudget::unlimited());
    let ats: Vec<_> = lexed.tokens.iter().filter(|token| token.kind == TokenKind::At).collect();
    assert_eq!(ats.len(), 1, "mid-line @ in user@host is body text, not an attribute marker");
}

// rq:["../../../reqlan rq/language/syntax.rq".comments]
#[test]
fn comments_inside_quotes_are_not_comments() {
    let source = r#"from "./path//not-comment.rq" import foo"#;
    assert!(!has_comment(source));
    assert!(visible_kinds(source).contains(&TokenKind::String));
}

// rq:["../../../reqlan rq/language/syntax.rq".inline_code]
#[test]
fn backticked_bracketed_file_ref_is_one_inline_code_token() {
    let source = "showcase {\n    `[\"./plc/interlock.stL#41-58\"]`\n}\n";
    let lexed = lex(source, ParseBudget::unlimited());
    let kinds: Vec<_> = lexed
        .tokens
        .iter()
        .filter(|token| {
            !token.kind.is_hidden() && token.kind != TokenKind::Eof && token.kind != TokenKind::Nl
        })
        .map(|token| token.kind)
        .collect();
    assert_eq!(kinds.iter().filter(|kind| **kind == TokenKind::InlineCode).count(), 1, "{kinds:?}");
    assert!(
        !kinds.contains(&TokenKind::String),
        "quotes inside inline code must not lex as STRING: {kinds:?}"
    );
    assert!(
        !kinds.contains(&TokenKind::LBrack),
        "brackets inside inline code must not lex as LBRACK: {kinds:?}"
    );
}

// rq:["../../../reqlan rq/language/syntax.rq".comments]
#[test]
fn url_slashes_are_not_line_comments() {
    let source = "url_example use https://not a comment.com in body";
    assert!(!has_comment(source), "':' or '/' before // must keep URL text visible");
    let joined: String = lex(source, ParseBudget::unlimited())
        .tokens
        .into_iter()
        .filter(|token| !token.kind.is_hidden())
        .map(|token| token.text(source).to_string())
        .collect();
    assert!(joined.contains("https://"), "{joined}");
    assert!(joined.contains("comment.com"), "{joined}");
}

// rq:["../../../reqlan rq/language/syntax.rq".comments]
#[test]
fn quoted_body_slashes_are_not_comments() {
    let source = r#"demo { note "//also not a comment" here }"#;
    assert!(!has_comment(source));
}

// rq:["../../../reqlan rq/language/syntax.rq".comments]
#[test]
fn meta_line_comment_after_content_is_hidden() {
    let source = "demo {\n    keep this // meta comment\n}";
    assert!(has_comment(source));
    let visible: String = lex(source, ParseBudget::unlimited())
        .tokens
        .into_iter()
        .filter(|token| !token.kind.is_hidden() && token.kind != TokenKind::Eof)
        .map(|token| token.text(source).to_string())
        .collect();
    assert!(visible.contains("keep"));
    assert!(!visible.contains("meta comment"), "{visible}");
}

// rq:["../../../reqlan rq/reference_types.rq".reference_edgecase]
#[test]
fn unbracketed_quoted_path_in_body_is_not_string() {
    let source = concat!(
        "demo {\n",
        "    see \"this is not a reference.rq\"\n",
        "    but this is: [\"./live.ts\"]\n",
        "}\n",
    );
    let lexed = lex(source, ParseBudget::unlimited());
    let strings: Vec<&str> = lexed
        .tokens
        .iter()
        .filter(|token| token.kind == TokenKind::String)
        .map(|token| token.text(source))
        .collect();
    assert_eq!(strings, vec!["\"./live.ts\""], "{strings:?}");
}

// rq:["../../../reqlan rq/language/syntax-edge-cases.rq".fencing_comments]
#[test]
fn quoted_slash_slash_in_body_is_not_a_comment() {
    let source = r#"demo { for example "//this line" contains no comment }"#;
    let offset = source.find("//").expect("quoted slash-slash");
    assert!(reqlan_parse::is_inside_line_fence(source.as_bytes(), offset), "offset {offset}");
    assert_eq!(comment_texts(source), Vec::<String>::new());
}

// rq:["../../../reqlan rq/language/syntax-edge-cases.rq".fencing_comments]
#[test]
fn backticked_slash_slash_in_body_is_not_a_comment() {
    let source = "demo { also `//this line` does not comment }";
    assert!(!has_comment(source), "{source}");
    let kinds = visible_kinds(source);
    assert!(kinds.contains(&TokenKind::InlineCode), "{kinds:?}");
    let joined = visible_text(source);
    assert!(joined.contains("//this line"), "{joined}");
}

// rq:["../../../reqlan rq/language/syntax-edge-cases.rq".fencing_comments]
#[test]
fn unclosed_backtick_then_slash_slash_is_a_comment() {
    let source = "demo {\n    this line `// finishes \" with a comment\n    keep visible\n}";
    let comments = comment_texts(source);
    assert!(comments.iter().any(|text| text.contains("finishes")), "{comments:?}");
    let joined = visible_text(source);
    assert!(!joined.contains("finishes"), "{joined}");
    assert!(joined.contains("keep"), "{joined}");
}

// rq:["../../../reqlan rq/language/syntax-edge-cases.rq".fencing_comments]
#[test]
fn unclosed_quote_then_slash_slash_is_a_comment() {
    let source = "demo {\n    as does \"//this one\n    keep visible\n}";
    let comments = comment_texts(source);
    assert!(comments.iter().any(|text| text.contains("this one")), "{comments:?}");
    let joined = visible_text(source);
    assert!(!joined.contains("this one"), "{joined}");
    assert!(joined.contains("keep"), "{joined}");
}

fn visible_text(source: &str) -> String {
    lex(source, ParseBudget::unlimited())
        .tokens
        .into_iter()
        .filter(|token| !token.kind.is_hidden() && token.kind != TokenKind::Eof)
        .map(|token| token.text(source).to_string())
        .collect()
}

fn comment_texts(source: &str) -> Vec<String> {
    lex(source, ParseBudget::unlimited())
        .tokens
        .into_iter()
        .filter(|token| token.kind == TokenKind::SlComment || token.kind == TokenKind::MlComment)
        .map(|token| token.text(source).to_string())
        .collect()
}
