//! rq:["../../../reqlan rq/extension/language/syntax/features-syntax.rq".idea_content_tooltip]
use lsp_types::{MarkupKind, Position, Url};
use reqlan_lsp::Session;
use std::fs;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

fn scratch(name: &str) -> std::path::PathBuf {
    let nanos = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
    let path = std::env::temp_dir().join(format!("reqlan-lsp-hover-{name}-{nanos}"));
    fs::create_dir_all(&path).unwrap();
    path
}

fn file_uri(path: &Path) -> String {
    Url::from_file_path(path).unwrap().to_string()
}

fn markup(session: &mut Session, uri: &str, line: u32, character: u32) -> String {
    let hover = session.hover(uri, Position { line, character }).unwrap();
    let lsp_types::HoverContents::Markup(markup) = hover.contents else {
        panic!("markup hover");
    };
    assert_eq!(markup.kind, MarkupKind::Markdown);
    markup.value
}

const ALPHA: &str = "\
alpha {
    The server keeps open buffers.
    @status in-progress
    steps (
        parse
        hover
    )
}
";

#[test]
fn hover_shows_styled_idea_content_by_default() {
    let mut session = Session::new();
    let uri = "file:///hover-body.rq";
    session.open(uri, format!("{ALPHA}beta {{\n    see [alpha]\n}}\n"));
    let on_name = markup(&mut session, uri, 0, 0);
    assert!(on_name.contains("### alpha"), "{on_name}");
    assert!(on_name.contains("The server keeps open buffers."), "{on_name}");
    assert!(on_name.contains("**@status**"), "{on_name}");
    assert!(on_name.contains("in-progress"), "{on_name}");
    assert!(on_name.contains("**steps**"), "{on_name}");
    assert!(on_name.contains("- parse"), "{on_name}");
    assert!(on_name.contains("- hover"), "{on_name}");

    let on_ref = markup(&mut session, uri, 9, 10);
    assert!(on_ref.contains("The server keeps open buffers."), "{on_ref}");
    assert!(on_ref.contains("**@status**"), "{on_ref}");
}

#[test]
fn hover_omits_idea_content_when_the_setting_is_off() {
    let mut session = Session::new();
    session.set_idea_content_tooltip(false);
    let uri = "file:///hover-off.rq";
    session.open(uri, ALPHA.to_string());
    let value = markup(&mut session, uri, 0, 0);
    assert!(value.contains("**alpha**"), "{value}");
    assert!(!value.contains("### alpha"), "{value}");
    assert!(!value.contains("**@status**"), "{value}");
    assert!(!value.contains("**steps**"), "{value}");
    assert!(!value.contains("- hover"), "{value}");
}

#[test]
fn hover_shows_idea_content_from_another_file() {
    let root = scratch("other");
    let lib = root.join("lib.rq");
    fs::write(&lib, "beta {\n    Ships the binary.\n}\n").unwrap();
    let host = root.join("host.rq");
    let lib_uri = file_uri(&lib);
    let host_uri = file_uri(&host);
    let mut session = Session::new();
    session.open(&lib_uri, "beta {\n    Ships the binary.\n}\n".into());
    session.open(
        &host_uri,
        "from \"./lib.rq\" import beta\nhost {\n    [beta]\n    [\"./lib.rq\".beta]\n}\n".into(),
    );
    let imported = markup(&mut session, &host_uri, 2, 6);
    assert!(imported.contains("### beta"), "{imported}");
    assert!(imported.contains("Ships the binary."), "{imported}");
    // Idea token `beta`, not the path string — hover range follows lexer tokens.
    let qualified = markup(&mut session, &host_uri, 3, 18);
    assert!(qualified.contains("Ships the binary."), "{qualified}");
    let _ = fs::remove_dir_all(root);
}
