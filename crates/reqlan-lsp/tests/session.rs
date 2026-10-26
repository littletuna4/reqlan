//! rq:["../../../reqlan rq/extension/language/support/language-server-rust.rq".language_server_rust]
use lsp_types::{Position, Range, TextDocumentContentChangeEvent, Url};
use reqlan_index::{index_one_file, IndexStore};
use reqlan_lsp::Session;
use std::fs;
use std::time::{SystemTime, UNIX_EPOCH};

fn scratch(name: &str) -> std::path::PathBuf {
    let nanos = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
    let path = std::env::temp_dir().join(format!("reqlan-lsp-{name}-{nanos}"));
    fs::create_dir_all(&path).unwrap();
    path
}

fn file_uri(path: &std::path::Path) -> String {
    Url::from_file_path(path).unwrap().to_string()
}

fn decode_tokens(tokens: &[lsp_types::SemanticToken]) -> Vec<(u32, u32, u32)> {
    decode_typed_tokens(tokens)
        .into_iter()
        .map(|(line, start, len, _)| (line, start, len))
        .collect()
}

fn decode_typed_tokens(tokens: &[lsp_types::SemanticToken]) -> Vec<(u32, u32, u32, u32)> {
    let mut line = 0u32;
    let mut start = 0u32;
    let mut out = Vec::new();
    for token in tokens {
        line += token.delta_line;
        start = if token.delta_line == 0 { start + token.delta_start } else { token.delta_start };
        out.push((line, start, token.length, token.token_type));
    }
    out
}

/// Legend index in `server.rs`: keyword = 6, method = 7.
const TOKEN_KEYWORD: u32 = 6;
const TOKEN_METHOD: u32 = 7;

#[test]
fn open_file_diagnostics_and_close_drops_the_parse() {
    let mut session = Session::new();
    let uri = "file:///open.rq";
    session.open(uri, "host {\n    [missing_idea]\n}\n".into());
    let diagnostics = session.diagnostics(uri);
    assert!(
        diagnostics.iter().any(|diagnostic| diagnostic.message.contains("missing_idea")),
        "{diagnostics:?}"
    );
    assert_eq!(session.document_count(), 1);
    session.close(uri);
    assert_eq!(session.document_count(), 0);
    assert!(session.diagnostics(uri).is_empty());
}

/// rq:["../../../reqlan rq/extension/language/support/ts-lsp-vs-rust-gaps.rq".lsp_incremental_sync]
#[test]
fn incremental_change_renames_an_unresolved_idea() {
    let mut session = Session::new();
    let uri = "file:///edit.rq";
    session.open(uri, "host {\n    [missing_idea]\n}\n".into());
    let change = TextDocumentContentChangeEvent {
        range: Some(Range {
            start: Position { line: 1, character: 5 },
            end: Position { line: 1, character: 17 },
        }),
        range_length: Some(99),
        text: "renamed_idea".into(),
    };
    assert!(session.apply_content_changes(uri, std::slice::from_ref(&change)));
    let diagnostics = session.diagnostics(uri);
    assert!(
        diagnostics.iter().any(|diagnostic| diagnostic.message.contains("renamed_idea")),
        "{diagnostics:?}"
    );
    assert!(
        diagnostics.iter().all(|diagnostic| !diagnostic.message.contains("missing_idea")),
        "{diagnostics:?}"
    );

    assert!(!session.apply_content_changes(uri, &[]));
    assert!(
        session
            .diagnostics(uri)
            .iter()
            .any(|diagnostic| diagnostic.message.contains("renamed_idea")),
        "an empty batch leaves the buffer"
    );

    let closed = TextDocumentContentChangeEvent {
        range: Some(Range {
            start: Position { line: 0, character: 0 },
            end: Position { line: 0, character: 1 },
        }),
        range_length: None,
        text: "nope".into(),
    };
    assert!(!session.apply_content_changes("file:///closed.rq", std::slice::from_ref(&closed)));
    assert_eq!(session.document_count(), 1);
}

/// rq:["../../../reqlan rq/extension/language/support/ts-lsp-vs-rust-gaps.rq".lsp_incremental_sync]
#[test]
fn incremental_change_updates_a_comment_reference() {
    let root = scratch("incremental-comment");
    let py = root.join("host.py");
    let uri = file_uri(&py);
    let mut session = Session::new();
    session.set_workspace_folders(std::slice::from_ref(&root));
    session.open(&uri, "# rq:[missing]\n".into());
    let change = TextDocumentContentChangeEvent {
        range: Some(Range {
            start: Position { line: 0, character: 6 },
            end: Position { line: 0, character: 13 },
        }),
        range_length: None,
        text: "other".into(),
    };
    assert!(session.apply_content_changes(&uri, std::slice::from_ref(&change)));
    let diagnostics = session.diagnostics(&uri);
    assert!(
        diagnostics.iter().any(|diagnostic| diagnostic.message.contains("'other'")),
        "{diagnostics:?}"
    );
    assert!(
        diagnostics.iter().all(|diagnostic| !diagnostic.message.contains("missing")),
        "{diagnostics:?}"
    );
    let _ = fs::remove_dir_all(&root);
}

#[test]
fn semantic_token_range_matches_the_source_name() {
    let mut session = Session::new();
    let uri = "file:///tokens.rq";
    session.open(uri, "alpha {\n    body\n}\n".into());
    let tokens = session.semantic_tokens(uri).unwrap();
    let decoded = decode_tokens(&tokens.data);
    assert!(
        decoded.iter().any(|(line, start, len)| *line == 0 && *start == 0 && *len == 5),
        "{decoded:?}"
    );
    assert_eq!(session.first_body_indent(uri), Some(4));
}

/// rq:["../../../reqlan rq/extension/language/syntax/features-syntax.rq".syntax_highlighting]
#[test]
fn semantic_tokens_cover_import_keywords_and_file_symbols() {
    let mut session = Session::new();
    let uri = "file:///token-kinds.rq";
    let text = "\
from \"./from.rq\" import alpha as beta
import \"./ns.rq\" as ns
host {
    [\"src/app.ts\".Foo.bar.baz]
}
";
    session.open(uri, text.into());
    let tokens = session.semantic_tokens(uri).unwrap();
    let decoded = decode_typed_tokens(&tokens.data);
    for word in ["from", "import", "as"] {
        let hits = word_spans(text, word);
        assert!(!hits.is_empty(), "{word}");
        for (line, start, len) in hits {
            let is_keyword = decoded.iter().any(|token| {
                token.0 == line && token.1 == start && token.2 == len && token.3 == TOKEN_KEYWORD
            });
            if inside_quotes(text, line, start) {
                assert!(!is_keyword, "{word} inside a path must stay a string, got {decoded:?}");
            } else {
                assert!(is_keyword, "{word} at {line}:{start} missing in {decoded:?}");
            }
        }
    }
    for symbol in ["Foo", "bar", "baz"] {
        let hits = word_spans(text, symbol);
        assert_eq!(hits.len(), 1, "{symbol}");
        let (line, start, len) = hits[0];
        assert!(
            decoded.iter().any(|token| {
                token.0 == line && token.1 == start && token.2 == len && token.3 == TOKEN_METHOD
            }),
            "{symbol} missing in {decoded:?}"
        );
    }
}

fn word_spans(text: &str, word: &str) -> Vec<(u32, u32, u32)> {
    let bytes = text.as_bytes();
    let needle = word.as_bytes();
    let mut out = Vec::new();
    let mut index = 0;
    while index + needle.len() <= bytes.len() {
        let before_ok = index == 0 || !is_word_byte(bytes[index - 1]);
        let after = index + needle.len();
        let after_ok = after >= bytes.len() || !is_word_byte(bytes[after]);
        if before_ok && after_ok && bytes[index..].starts_with(needle) {
            let line = text[..index].bytes().filter(|byte| *byte == b'\n').count() as u32;
            let line_start = text[..index].rfind('\n').map(|pos| pos + 1).unwrap_or(0);
            out.push((line, (index - line_start) as u32, word.len() as u32));
            index = after;
            continue;
        }
        index += 1;
    }
    out
}

fn is_word_byte(byte: u8) -> bool {
    byte.is_ascii_alphanumeric() || byte == b'_' || byte == b'-'
}

fn inside_quotes(text: &str, line: u32, character: u32) -> bool {
    let mut current_line = 0u32;
    let mut current_char = 0u32;
    let mut quote: Option<u8> = None;
    for byte in text.bytes() {
        if current_line == line && current_char == character {
            return quote.is_some();
        }
        if byte == b'\n' {
            current_line += 1;
            current_char = 0;
            continue;
        }
        if quote == Some(byte) {
            quote = None;
        } else if quote.is_none() && (byte == b'"' || byte == b'\'') {
            quote = Some(byte);
        }
        current_char += 1;
    }
    false
}

#[test]
fn definition_hover_highlight_and_link() {
    let mut session = Session::new();
    let uri = "file:///nav.rq";
    let text = "alpha {\n    see [alpha]\n}\n";
    session.open(uri, text.into());
    let hover = session.hover(uri, Position { line: 0, character: 0 }).unwrap();
    let lsp_types::HoverContents::Markup(markup) = hover.contents else {
        panic!("markup hover");
    };
    assert!(markup.value.contains("alpha"));

    let highlights = session.highlights(uri, Position { line: 1, character: 10 });
    assert!(highlights.len() >= 2, "{highlights:?}");

    let definition = session.definition(uri, Position { line: 1, character: 10 });
    let Some(lsp_types::GotoDefinitionResponse::Link(links)) = definition else {
        panic!("definition");
    };
    assert_eq!(links[0].target_selection_range.start.line, 0);

    let links = session.links(uri);
    assert!(links.iter().any(|link| link.target.is_some()));
}

#[test]
fn neighbor_confirm_suppresses_missing_idea() {
    let root = scratch("neighbor");
    fs::write(root.join("b.rq"), "beta {\n}\n").unwrap();
    let uri = file_uri(&root.join("a.rq"));
    let mut session = Session::new();
    session.open(&uri, "host {\n    [\"./b.rq\".beta]\n    [missing_name]\n}\n".into());
    let diagnostics = session.diagnostics(&uri);
    assert!(
        diagnostics.iter().all(|diagnostic| !diagnostic.message.contains("'beta'")),
        "{diagnostics:?}"
    );
    assert!(
        diagnostics.iter().any(|diagnostic| diagnostic.message.contains("missing_name")),
        "{diagnostics:?}"
    );
    let _ = fs::remove_dir_all(&root);
}

#[test]
fn rq_ignore_suppresses_the_next_line() {
    let mut session = Session::new();
    let uri = "file:///ignore.rq";
    session.open(uri, "host {\n    //rq-ignore-error\n    [missing_idea]\n}\n".into());
    let diagnostics = session.diagnostics(uri);
    assert!(
        diagnostics.iter().all(|diagnostic| !diagnostic.message.contains("missing_idea")),
        "{diagnostics:?}"
    );
}

#[test]
fn completion_rename_and_code_action() {
    let mut session = Session::new();
    let uri = "file:///edit.rq";
    session.open(uri, "alpha {\n    see [missing_idea]\n}\n".into());
    let items = session.completion(uri, Position { line: 1, character: 9 }).items;
    assert!(items.iter().any(|item| item.label == "alpha"), "{items:?}");

    let range = session.prepare_rename(uri, Position { line: 0, character: 0 }).unwrap();
    assert_eq!(range.start.line, 0);
    let edit = session.rename(uri, Position { line: 0, character: 0 }, "beta").unwrap();
    let changes = edit.changes.unwrap();
    let edits = changes.values().next().unwrap();
    assert!(edits.iter().any(|edit| edit.new_text.contains("beta")));

    let actions = session.code_actions(
        uri,
        Range {
            start: Position { line: 1, character: 9 },
            end: Position { line: 1, character: 12 },
        },
    );
    assert!(actions.len() >= 2, "{actions:?}");
}

#[test]
fn index_completion_inlay_and_custom_requests() {
    let root = scratch("index");
    fs::create_dir_all(root.join(".reqlan")).unwrap();
    let db = root.join(".reqlan").join("ideas-index.sqlite");
    let mut store = IndexStore::open(&db).unwrap();
    let lib = root.join("lib.rq");
    fs::write(&lib, "library {\n}\n").unwrap();
    index_one_file(&mut store, &root, lib.to_str().unwrap()).unwrap();
    drop(store);

    let mut session = Session::new();
    session.set_workspace_folders(std::slice::from_ref(&root));
    let uri = file_uri(&root.join("host.rq"));
    session.open(
        &uri,
        "host {\n    [lib\n    [\"./mods/*.rq\".widget_*]\n    [\"./lib.rq\"]\n}\n".into(),
    );

    let items = session.completion(&uri, Position { line: 1, character: 6 }).items;
    assert!(items.iter().any(|item| item.label == "library"), "{items:?}");

    session.open(&uri, "alpha {\n    see [alpha]\n}\n".into());
    assert!(session.inlays(&uri).is_empty(), "a self-reference is not an inbound backlink");

    session.open(&uri, "host {\n    [\"./mods/*.rq\".widget_*]\n    [\"./lib.rq\"]\n}\n".into());
    let wildcard = session.wildcard_at(&uri, Position { line: 1, character: 8 });
    assert!(wildcard.is_some(), "wildcard at cursor");
    let value = wildcard.unwrap();
    assert_eq!(value.get("ideaPattern").and_then(|item| item.as_str()), Some("widget_*"));

    let file_ref = session.file_reference_at(&uri, Position { line: 2, character: 8 });
    assert!(file_ref.is_some(), "file reference at cursor");

    let site = session.search_site(
        &uri,
        Range {
            start: Position { line: 0, character: 0 },
            end: Position { line: 0, character: 4 },
        },
    );
    assert!(site.is_some());
    let _ = fs::remove_dir_all(&root);
}

#[test]
fn attribute_catalog_completion_and_find_references() {
    use reqlan_lsp::AttributeCatalog;
    use std::collections::HashMap;

    let mut session = Session::new();
    let uri = "file:///catalog.rq";
    session.open(uri, "alpha {\n    @status done\n    see [alpha]\n}\n".into());

    let mut values = HashMap::new();
    values.insert("status".into(), vec!["done".into(), "draft".into()]);
    session.note_attribute_catalog(AttributeCatalog {
        keys: vec!["status".into(), "owner".into(), "custom_key".into()],
        values_by_key: values,
    });

    let keys = session.completion(uri, Position { line: 1, character: 5 }).items;
    assert!(keys.iter().any(|item| item.label == "custom_key"), "{keys:?}");

    let values = session.completion(uri, Position { line: 1, character: 12 }).items;
    assert!(values.iter().any(|item| item.label == "draft"), "{values:?}");

    let refs = session.references(uri, Position { line: 0, character: 0 });
    assert!(refs.len() >= 2, "{refs:?}");
    assert!(refs.iter().any(|location| location.range.start.line == 0));
    assert!(refs.iter().any(|location| location.range.start.line == 2));
}

/// rq:["../../../reqlan rq/extension/language/comment-references/functional-code-comment-references.rq".comment_reference_resolution_error_state]
/// rq:["../../../reqlan rq/extension/language/comment-references/functional-code-comment-references.rq".comment_reference_qualified_token_links]
#[test]
fn comment_links_share_one_resolution() {
    let root = scratch("comment-links");
    fs::create_dir_all(root.join("src")).unwrap();
    fs::write(root.join("lib.rq"), "alpha {\n    summary\n}\n").unwrap();
    let lib = file_uri(&root.join("lib.rq"));
    let py = root.join("src").join("host.py");
    let uri = file_uri(&py);
    let mut session = Session::new();
    session.set_workspace_folders(std::slice::from_ref(&root));
    session.open(&lib, "alpha {\n    summary\n}\n".into());
    let text =
        "# rq:[alpha]\n# rq:[missing]\n# rq:[\"./../lib.rq\".alpha]\n# rq:[\"@/lib.rq\".alpha]\n";
    session.open(&uri, text.into());

    let links = session.links(&uri);
    // unqualified idea + two qualified sites (path + idea each)
    assert_eq!(links.len(), 5, "{links:?}");
    assert!(links.iter().all(|link| {
        link.target.as_ref().is_some_and(|target| target.to_string().contains("lib.rq"))
    }));
    let first = &links[0].range;
    assert_eq!(first.start.line, 0);
    assert_eq!(first.start.character, 6);
    assert_eq!(first.end.character, 11);
    assert_eq!(links[0].tooltip.as_deref(), Some("alpha"));

    let diagnostics = session.diagnostics(&uri);
    assert_eq!(diagnostics.len(), 1, "{diagnostics:?}");
    assert!(diagnostics[0].message.contains("'missing'"), "{}", diagnostics[0].message);
    assert_eq!(
        diagnostics[0].code,
        Some(lsp_types::NumberOrString::String("comment-reference-missing-idea".into()))
    );
    let missing_line = text.lines().nth(1).unwrap();
    assert_eq!(range_text(missing_line, &diagnostics[0].range), "missing");

    session.open(&uri, "# //rq-ignore-error\n# rq:[missing]\n".into());
    assert!(session.diagnostics(&uri).is_empty(), "{:?}", session.diagnostics(&uri));

    let before = session.document_count();
    session.close(&uri);
    assert_eq!(session.document_count(), before - 1);
    assert!(session.links(&uri).is_empty());
    assert!(session.diagnostics(&uri).is_empty());
    let _ = fs::remove_dir_all(&root);
}

/// rq:["../../../reqlan rq/extension/language/comment-references/functional-code-comment-references.rq".comment_reference_qualified_token_links]
#[test]
fn qualified_comment_links_cover_path_and_idea_tokens() {
    let root = scratch("comment-qualified-links");
    fs::create_dir_all(root.join("src")).unwrap();
    fs::write(root.join("lib.rq"), "alpha {\n    summary\n}\n").unwrap();
    let lib = file_uri(&root.join("lib.rq"));
    let py = root.join("src").join("host.py");
    let uri = file_uri(&py);
    let text = "# rq:[\"./../lib.rq\".alpha]\n";
    let mut session = Session::new();
    session.set_workspace_folders(std::slice::from_ref(&root));
    session.open(&lib, "alpha {\n    summary\n}\n".into());
    session.open(&uri, text.into());

    let links = session.links(&uri);
    assert_eq!(links.len(), 2, "{links:?}");
    let line = text.lines().next().unwrap();
    let path_text =
        &line[links[0].range.start.character as usize..links[0].range.end.character as usize];
    let idea_text =
        &line[links[1].range.start.character as usize..links[1].range.end.character as usize];
    assert_eq!(path_text, "\"./../lib.rq\"");
    assert_eq!(idea_text, "alpha");
    assert!(links[0].target.as_ref().is_some_and(|target| {
        target.to_string() == lib || target.to_string().ends_with("lib.rq")
    }));
    assert!(links[1].target.as_ref().is_some_and(|target| target.to_string().contains("#L0")));
    assert_eq!(links[1].tooltip.as_deref(), Some("alpha"));
    let _ = fs::remove_dir_all(&root);
}

/// rq:["../../../reqlan rq/extension/language/comment-references/functional-code-comment-references.rq".comment_reference_qualified_token_links]
/// rq:["../../../reqlan rq/extension/language/comment-references/functional-code-comment-references.rq".comment_reference_resolution_error_state]
#[test]
fn qualified_comment_missing_idea_underlines_the_idea_token() {
    let root = scratch("comment-partial");
    fs::create_dir_all(root.join("src")).unwrap();
    fs::write(root.join("lib.rq"), "alpha {\n    summary\n}\n").unwrap();
    let lib = file_uri(&root.join("lib.rq"));
    let py = root.join("src").join("host.py");
    let uri = file_uri(&py);
    let text = "# rq:[\"./../lib.rq\".absent]\n# rq:[\"./missing.rq\".alpha]\n";
    let mut session = Session::new();
    session.set_workspace_folders(std::slice::from_ref(&root));
    session.open(&lib, "alpha {\n    summary\n}\n".into());
    session.open(&uri, text.into());

    let links = session.links(&uri);
    assert_eq!(links.len(), 1, "{links:?}");
    let idea_line = text.lines().next().unwrap();
    assert_eq!(range_text(idea_line, &links[0].range), "\"./../lib.rq\"");
    assert!(links[0].target.as_ref().is_some_and(|target| target.to_string().ends_with("lib.rq")));

    let diagnostics = session.diagnostics(&uri);
    assert_eq!(diagnostics.len(), 2, "{diagnostics:?}");
    let idea = diagnostics
        .iter()
        .find(|diagnostic| {
            diagnostic.code
                == Some(lsp_types::NumberOrString::String("comment-reference-missing-idea".into()))
        })
        .expect("missing idea");
    assert_eq!(range_text(idea_line, &idea.range), "absent");
    assert!(idea.message.contains("'absent'"), "{}", idea.message);

    let file_line = text.lines().nth(1).unwrap();
    let file = diagnostics
        .iter()
        .find(|diagnostic| {
            diagnostic.code
                == Some(lsp_types::NumberOrString::String("comment-reference-missing-file".into()))
        })
        .expect("missing file");
    assert_eq!(range_text(file_line, &file.range), "\"./missing.rq\"");

    let path = definition_at(&mut session, &uri, position_of(text, "lib.rq"));
    let path_origin = path.origin_selection_range.expect("path origin");
    assert_eq!(range_text(idea_line, &path_origin), "\"./../lib.rq\"");
    assert!(path.target_uri.to_string().ends_with("lib.rq"));
    assert!(session.definition(&uri, position_of(text, "absent")).is_none());
    assert!(session.definition(&uri, position_of(text, "missing.rq")).is_none());
    let _ = fs::remove_dir_all(&root);
}

/// rq:["../../../reqlan rq/extension/language/comment-references/functional-code-comment-references.rq".comment_reference_qualified_token_links]
/// rq:["../../../reqlan rq/extension/language/syntax/features-syntax-highlighting.rq".editor_reference_activation]
#[test]
fn qualified_comment_definition_origin_is_the_token_under_the_cursor() {
    let root = scratch("comment-qualified-def");
    fs::create_dir_all(root.join("src")).unwrap();
    fs::write(root.join("lib.rq"), "alpha {\n    summary\n}\n").unwrap();
    let lib = Url::from_file_path(root.join("lib.rq")).unwrap();
    let py = root.join("src").join("host.py");
    let uri = file_uri(&py);
    let text = "# rq:[\"./../lib.rq\".alpha]\n";
    let mut session = Session::new();
    session.set_workspace_folders(std::slice::from_ref(&root));
    session.open(&lib.to_string(), "alpha {\n    summary\n}\n".into());
    session.open(&uri, text.into());

    let path = definition_at(&mut session, &uri, position_of(text, "lib.rq"));
    let path_origin = path.origin_selection_range.expect("path origin");
    let path_line = text.lines().next().unwrap();
    let path_text =
        &path_line[path_origin.start.character as usize..path_origin.end.character as usize];
    assert_eq!(path_text, "\"./../lib.rq\"");
    assert_eq!(path.target_uri, lib);
    assert_eq!(path.target_selection_range.start.line, 0);
    assert_eq!(path.target_selection_range.start.character, 0);

    let idea = definition_at(&mut session, &uri, position_of(text, "alpha]"));
    let idea_origin = idea.origin_selection_range.expect("idea origin");
    assert_eq!(idea_origin.end.character - idea_origin.start.character, "alpha".len() as u32);
    assert_eq!(idea.target_uri, lib);
    assert_eq!(idea.target_selection_range.start.line, 0);

    assert!(session.definition(&uri, position_of(text, "rq:")).is_none());
    let _ = fs::remove_dir_all(&root);
}

/// rq:["../../../reqlan rq/extension/language/comment-references/functional-code-comment-references.rq".references_in_functional_code_comments]
/// rq:["../../../reqlan rq/extension/language/comment-references/functional-code-comment-references.rq".comment_reference_qualified_token_links]
/// rq:["../../../reqlan rq/extension/language/syntax/features-syntax-highlighting.rq".editor_reference_activation]
/// rq:["../../../reqlan rq/extension/language/support/language-server-rust.rq".language_server_rust]
#[test]
fn comment_definition_follows_a_resolved_rq_reference() {
    let root = scratch("comment-definition");
    fs::create_dir_all(root.join("src")).unwrap();
    fs::write(root.join("lib.rq"), "alpha {\n    summary\n}\n").unwrap();
    let lib = file_uri(&root.join("lib.rq"));
    let py = root.join("src").join("host.py");
    let uri = file_uri(&py);
    let mut session = Session::new();
    session.set_workspace_folders(std::slice::from_ref(&root));
    session.open(&lib, "alpha {\n    summary\n}\n".into());
    session.open(&uri, "# rq:[alpha]\n# rq:[missing]\n".into());

    let Some(lsp_types::GotoDefinitionResponse::Link(links)) =
        session.definition(&uri, Position { line: 0, character: 6 })
    else {
        panic!("definition");
    };
    assert_eq!(links.len(), 1, "{links:?}");
    assert_eq!(links[0].target_uri.to_string(), lib);
    // rq-ignore-error
    // origin is the idea id `alpha`, not the whole `rq:[alpha]`
    assert_eq!(links[0].origin_selection_range.unwrap().start.character, 6);
    assert_eq!(links[0].origin_selection_range.unwrap().end.character, 11);
    assert_eq!(links[0].target_selection_range.start.line, 0);
    assert!(links[0].target_selection_range.end.character > 0);

    assert!(session.definition(&uri, Position { line: 1, character: 6 }).is_none());

    let _ = fs::remove_dir_all(&root);
}

fn range_text<'a>(line: &'a str, range: &Range) -> &'a str {
    &line[range.start.character as usize..range.end.character as usize]
}

fn position_of(text: &str, needle: &str) -> Position {
    let (line_index, line) = text
        .lines()
        .enumerate()
        .find(|(_, line)| line.contains(needle))
        .unwrap_or_else(|| panic!("missing {needle}"));
    Position { line: line_index as u32, character: line.find(needle).unwrap() as u32 }
}

/// rq:["../../../reqlan rq/extension/language/syntax/features-syntax-highlighting.rq".reference_goto_definition_speed]
#[test]
fn definition_uses_the_open_neighbor_parse() {
    let root = scratch("def-open");
    let target = root.join("b.rq");
    fs::write(&target, "old {\n}\n").unwrap();
    let from = root.join("a.rq");
    let from_uri = file_uri(&from);
    let target_uri = file_uri(&target);
    let text = "host {\n    [\"./b.rq\".beta]\n}\n";
    let mut session = Session::new();
    session.open(&target_uri, "pad {\n}\n\nbeta {\n}\n".into());
    session.open(&from_uri, text.into());
    let Some(lsp_types::GotoDefinitionResponse::Link(links)) =
        session.definition(&from_uri, position_of(text, "beta"))
    else {
        panic!("definition");
    };
    assert_eq!(links[0].target_uri, Url::from_file_path(&target).unwrap());
    assert_eq!(links[0].target_selection_range.start.line, 3);
    let _ = fs::remove_dir_all(&root);
}

fn definition_at(session: &mut Session, uri: &str, pos: Position) -> lsp_types::LocationLink {
    let Some(lsp_types::GotoDefinitionResponse::Link(links)) = session.definition(uri, pos) else {
        panic!("definition");
    };
    links.into_iter().next().expect("one location")
}

/// rq:["../../../reqlan rq/extension/language/syntax/features-syntax-highlighting.rq".reference_goto_definition_speed]
#[test]
fn definition_follows_a_changed_neighbor_to_the_name_token() {
    let root = scratch("def-cache");
    let target = root.join("b.rq");
    fs::write(&target, "pad {\n}\n\nbeta {\n}\n").unwrap();
    let from_uri = file_uri(&root.join("a.rq"));
    let text = "host {\n    [\"./b.rq\".beta]\n}\n";
    let mut session = Session::new();
    session.open(&from_uri, text.into());
    let pos = position_of(text, "beta");
    let first = definition_at(&mut session, &from_uri, pos);
    assert_eq!(
        (first.target_selection_range.start.line, first.target_selection_range.end.character),
        (3, 4)
    );
    fs::write(&target, "beta {\n}\n").unwrap();
    let second = definition_at(&mut session, &from_uri, pos);
    assert_eq!(second.target_uri, Url::from_file_path(&target).unwrap());
    assert_eq!(second.target_selection_range.start.line, 0);
    let _ = fs::remove_dir_all(&root);
}

/// rq:["../../../reqlan rq/extension/language/syntax/features-syntax-highlighting.rq".reference_goto_definition_speed]
#[test]
fn definition_of_an_imported_alias_reaches_the_neighbor() {
    let root = scratch("def-alias");
    let target = root.join("b.rq");
    fs::write(&target, "pad {\n}\n\nbeta {\n}\n").unwrap();
    let from_uri = file_uri(&root.join("a.rq"));
    let text = "from \"./b.rq\" import beta as other\n\nhost {\n    see [other]\n}\n";
    let mut session = Session::new();
    session.open(&from_uri, text.into());
    let location = definition_at(&mut session, &from_uri, position_of(text, "other]"));
    assert_eq!(location.target_uri, Url::from_file_path(&target).unwrap());
    assert_eq!(location.target_selection_range.start.line, 3);
    let _ = fs::remove_dir_all(&root);
}

/// rq:["../../../reqlan rq/extension/language/syntax/features-syntax-highlighting.rq".editor_reference_activation]
#[test]
fn definition_origin_is_the_lexer_token_under_the_cursor() {
    let root = scratch("def-token");
    let target = root.join("rust_port.rq");
    fs::write(&target, "lexer_rust {\n}\n\nparser_rust {\n}\n").unwrap();
    let from = root.join("parser_lexer.rq");
    let from_uri = file_uri(&from);
    let text = concat!(
        "lexer_bridge {\n",
        "    see [block_idea]\n",
        "    Index: [\"./rust_port.rq\".lexer_rust] / [\"./rust_port.rq\".parser_rust].\n",
        "}\n",
        "block_idea {\n}\n",
    );
    let mut session = Session::new();
    session.open(&from_uri, text.into());

    let local = definition_at(&mut session, &from_uri, position_of(text, "block_idea]"));
    let origin = local.origin_selection_range.expect("local origin");
    assert_eq!(
        origin.start.character,
        text.lines().nth(1).unwrap().find("block_idea").unwrap() as u32
    );
    assert_eq!(origin.end.character - origin.start.character, "block_idea".len() as u32);

    let idea = definition_at(&mut session, &from_uri, position_of(text, "lexer_rust]"));
    let idea_origin = idea.origin_selection_range.expect("idea origin");
    assert_eq!(idea_origin.end.character - idea_origin.start.character, "lexer_rust".len() as u32);
    assert_eq!(idea.target_uri, Url::from_file_path(&target).unwrap());

    let path = definition_at(&mut session, &from_uri, position_of(text, "rust_port.rq"));
    let path_origin = path.origin_selection_range.expect("path origin");
    let path_line = text.lines().nth(2).unwrap();
    let path_text =
        &path_line[path_origin.start.character as usize..path_origin.end.character as usize];
    assert_eq!(path_text, "\"./rust_port.rq\"");
    assert_eq!(path.target_uri, Url::from_file_path(&target).unwrap());

    assert!(session.definition(&from_uri, position_of(text, "] / [")).is_none());
    let _ = fs::remove_dir_all(&root);
}

/// rq:["../../../reqlan rq/extension/language/syntax/features-syntax-highlighting.rq".reference_goto_definition_speed]
#[test]
fn folder_reference_link_is_a_command() {
    let root = scratch("folder-link");
    fs::create_dir_all(root.join("media")).unwrap();
    fs::write(root.join("media").join("a.rq"), "alpha {\n}\n").unwrap();
    let from = root.join("host.rq");
    let uri = file_uri(&from);
    let mut session = Session::new();
    session.open(&uri, "host {\n    [\"./media/\"]\n}\n".into());
    let links = session.links(&uri);
    let target = links.iter().find_map(|link| link.target.clone()).expect("folder link");
    assert_eq!(target.scheme(), "command");
    assert!(target.as_str().contains("reqlan.openFolderReference"), "{target}");
    let _ = fs::remove_dir_all(&root);
}

fn selection_texts(source: &str, range: &lsp_types::SelectionRange) -> Vec<String> {
    let mut out = Vec::new();
    let mut current = Some(range);
    while let Some(node) = current {
        out.push(text_in_range(source, &node.range));
        current = node.parent.as_deref();
    }
    out
}

fn text_in_range(source: &str, range: &Range) -> String {
    let lines: Vec<&str> = source.split('\n').collect();
    let start_line = range.start.line as usize;
    let end_line = range.end.line as usize;
    if start_line == end_line {
        return lines[start_line][range.start.character as usize..range.end.character as usize]
            .to_string();
    }
    let mut out = String::new();
    out.push_str(&lines[start_line][range.start.character as usize..]);
    out.push('\n');
    for line in &lines[start_line + 1..end_line] {
        out.push_str(line);
        out.push('\n');
    }
    out.push_str(&lines[end_line][..range.end.character as usize]);
    out
}

/// rq:["../../../reqlan rq/extension/language/vsc-primitives.rq".selection_range]
#[test]
fn selection_range_grows_from_the_reference_name_to_the_idea() {
    let mut session = Session::new();
    let uri = "file:///select.rq";
    let text = "checkout {\n    Pay with [payment_method].\n    @status draft\n}\n";
    session.open(uri, text.into());
    let ranges = session
        .selection_ranges(uri, &[position_of(text, "payment_method")])
        .expect("open document");
    let texts = selection_texts(text, &ranges[0]);
    assert_eq!(texts[0], "payment_method", "{texts:?}");
    assert_eq!(texts[1], "[payment_method]", "{texts:?}");
    assert_eq!(texts[2], "Pay with [payment_method].", "{texts:?}");
    let idea = texts
        .iter()
        .find(|slice| slice.starts_with("checkout {") && slice.contains("@status draft"))
        .expect("idea range");
    assert!(idea.trim_end().ends_with('}'), "{idea:?}");
    assert_eq!(texts.last().map(String::as_str), Some(text));
    let name_at = texts.iter().position(|slice| slice == "payment_method").unwrap();
    let idea_at = texts.iter().position(|slice| slice.starts_with("checkout {")).unwrap();
    assert!(name_at < idea_at);
}

/// rq:["../../../reqlan rq/extension/language/vsc-primitives.rq".selection_range]
#[test]
fn selection_range_grows_from_an_attribute_name() {
    let mut session = Session::new();
    let uri = "file:///select-attr.rq";
    let text = "checkout {\n    Pay with [payment_method].\n    @status draft\n}\n";
    session.open(uri, text.into());
    let ranges =
        session.selection_ranges(uri, &[position_of(text, "status")]).expect("open document");
    let texts = selection_texts(text, &ranges[0]);
    assert_eq!(texts[0], "@status", "{texts:?}");
    assert!(texts[1].starts_with("@status draft"), "{texts:?}");
    assert!(texts.iter().any(|slice| slice.starts_with("checkout {")), "{texts:?}");
    assert_eq!(texts.last().map(String::as_str), Some(text));
}
