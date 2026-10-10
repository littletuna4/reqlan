//! rq:["../../../reqlan rq/extension/language/support/language-server-rust.rq".language_server_rust]
use lsp_types::{Position, Range, Url};
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
    let mut line = 0u32;
    let mut start = 0u32;
    let mut out = Vec::new();
    for token in tokens {
        line += token.delta_line;
        start = if token.delta_line == 0 { start + token.delta_start } else { token.delta_start };
        out.push((line, start, token.length));
    }
    out
}

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
    let Some(lsp_types::GotoDefinitionResponse::Array(locations)) = definition else {
        panic!("definition");
    };
    assert_eq!(locations[0].range.start.line, 0);

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
    let items = session.completion(uri, Position { line: 1, character: 9 });
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

    let items = session.completion(&uri, Position { line: 1, character: 6 });
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
    session.open(
        &uri,
        "# rq:[alpha]\n# rq:[missing]\n# rq:[\"./../lib.rq\".alpha]\n# rq:[\"@/lib.rq\".alpha]\n"
            .into(),
    );

    let links = session.links(&uri);
    assert_eq!(links.len(), 3, "{links:?}");
    assert!(links.iter().all(|link| {
        link.tooltip.as_deref() == Some("alpha")
            && link.target.as_ref().is_some_and(|target| target.to_string().ends_with("lib.rq"))
    }));
    let first = &links[0].range;
    assert_eq!(first.start.line, 0);
    assert_eq!(first.start.character, 2);
    assert_eq!(first.end.character, 12);

    let diagnostics = session.diagnostics(&uri);
    assert_eq!(diagnostics.len(), 1, "{diagnostics:?}");
    assert!(diagnostics[0].message.contains("'missing'"), "{}", diagnostics[0].message);
    assert_eq!(
        diagnostics[0].code,
        Some(lsp_types::NumberOrString::String("comment-reference-missing-idea".into()))
    );

    session.open(&uri, "# //rq-ignore-error\n# rq:[missing]\n".into());
    assert!(session.diagnostics(&uri).is_empty(), "{:?}", session.diagnostics(&uri));

    let before = session.document_count();
    session.close(&uri);
    assert_eq!(session.document_count(), before - 1);
    assert!(session.links(&uri).is_empty());
    assert!(session.diagnostics(&uri).is_empty());
    let _ = fs::remove_dir_all(&root);
}
