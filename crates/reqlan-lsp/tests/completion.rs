//! rq:["../../../reqlan rq/extension/language/support/features-imports.rq".import_code_completion]
//! rq:["../../../reqlan rq/extension/language/syntax/features-syntax-highlighting.rq".reference_code_completion_objects]
//! rq:["../../../reqlan rq/extension/language/syntax/features-syntax-highlighting.rq".reference_code_completion_performance]
use lsp_types::{CompletionItem, Position, Url};
use reqlan_lsp::Session;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

fn scratch(name: &str) -> PathBuf {
    let nanos = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
    let path = std::env::temp_dir().join(format!("reqlan-lsp-complete-{name}-{nanos}"));
    fs::create_dir_all(&path).unwrap();
    path
}

fn file_uri(path: &Path) -> String {
    Url::from_file_path(path).unwrap().to_string()
}

fn labels(items: &[CompletionItem]) -> Vec<String> {
    items.iter().map(|item| item.label.clone()).collect()
}

fn open_at(session: &mut Session, path: &Path, text: &str) -> String {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).unwrap();
    }
    let uri = file_uri(path);
    session.open(&uri, text.to_string());
    uri
}

#[test]
fn completes_relative_import_paths_with_explicit_rq() {
    let root = scratch("explicit");
    fs::write(root.join("exampleimport.rq"), "myimportableIdea {\n}\n").unwrap();
    fs::write(root.join("sub idea.rq"), "from \"main.rq\" import myidea\nimport \"./\"\n").unwrap();
    let mut session = Session::new();
    session.set_workspace_folders(std::slice::from_ref(&root));
    let uri = open_at(
        &mut session,
        &root.join("sub idea.rq"),
        "from \"main.rq\" import myidea\nimport \"./\"\n",
    );
    let list = session.completion(&uri, Position { line: 1, character: 10 });
    assert!(list.is_incomplete);
    let items = list.items;
    let labels = labels(&items);
    assert!(labels.iter().any(|label| label.contains("exampleimport.rq")), "{labels:?}");
    assert!(!labels.iter().any(|label| label == "./exampleimport" || label == "exampleimport"));
    let _ = fs::remove_dir_all(&root);
}

#[test]
fn completes_import_root_alias_paths_with_explicit_rq() {
    let root = scratch("alias");
    fs::write(root.join("exampleimport.rq"), "myimportableIdea {\n}\n").unwrap();
    let mut session = Session::new();
    session.set_workspace_folders(std::slice::from_ref(&root));
    let uri = open_at(&mut session, &root.join("alias-completion.rq"), "import \"@");
    let items = session.completion(&uri, Position { line: 0, character: 8 }).items;
    let labels = labels(&items);
    assert!(
        labels.iter().any(|label| label.starts_with("@/") && label.ends_with("exampleimport.rq")),
        "{labels:?}"
    );
    let _ = fs::remove_dir_all(&root);
}

#[test]
fn shows_next_path_segments_in_a_folder_context() {
    let root = scratch("segments");
    fs::create_dir_all(root.join("lang/sub")).unwrap();
    fs::write(root.join("lang/near.rq"), "near {}\n").unwrap();
    fs::write(root.join("lang/notes.md"), "# notes\n").unwrap();
    let content = "import \"./lang/\"";
    let mut session = Session::new();
    session.set_workspace_folders(std::slice::from_ref(&root));
    let uri = open_at(&mut session, &root.join("importer.rq"), content);
    let items =
        session.completion(&uri, Position { line: 0, character: (content.len() - 1) as u32 }).items;
    let labels = labels(&items);
    assert!(labels.contains(&"./lang/near.rq".to_string()), "{labels:?}");
    assert!(labels.contains(&"./lang/sub/".to_string()), "{labels:?}");
    assert!(!labels.iter().any(|label| label.contains("notes.md")));
    let _ = fs::remove_dir_all(&root);
}

#[test]
fn ranks_directory_segments_before_nested_files() {
    let root = scratch("dir-rank");
    fs::create_dir_all(root.join("deep")).unwrap();
    fs::create_dir_all(root.join("path")).unwrap();
    fs::write(root.join("path/file.rq"), "nested {}\n").unwrap();
    let content = "import \"../\"";
    let mut session = Session::new();
    session.set_workspace_folders(std::slice::from_ref(&root));
    let uri = open_at(&mut session, &root.join("deep/importer.rq"), content);
    let items =
        session.completion(&uri, Position { line: 0, character: (content.len() - 1) as u32 }).items;
    let picked: Vec<_> = items
        .iter()
        .filter(|item| item.label == "../path/" || item.label == "../path/file.rq")
        .map(|item| item.label.clone())
        .collect();
    assert_eq!(picked, vec!["../path/".to_string(), "../path/file.rq".to_string()], "{items:?}");
    assert!(items
        .iter()
        .filter(|item| item.label == "../path/" || item.label == "../path/file.rq")
        .all(|item| item.filter_text.as_deref() == Some("../")));
    let _ = fs::remove_dir_all(&root);
}

#[test]
fn matches_import_paths_by_substring() {
    let root = scratch("substr");
    fs::create_dir_all(root.join("parent")).unwrap();
    fs::create_dir_all(root.join("a/b")).unwrap();
    fs::create_dir_all(root.join("hello/inbetween/path")).unwrap();
    fs::write(root.join("parent/path.rq"), "target {}\n").unwrap();
    fs::write(root.join("hello/inbetween/path/file.rq"), "deep {}\n").unwrap();
    let mut session = Session::new();
    session.set_workspace_folders(std::slice::from_ref(&root));
    let path_content = "import \"path\"";
    let uri = open_at(&mut session, &root.join("a/b/importer.rq"), path_content);
    let path_labels = labels(
        &session
            .completion(&uri, Position { line: 0, character: (path_content.len() - 1) as u32 })
            .items,
    );
    assert!(path_labels.iter().any(|label| label.contains("parent/path.rq")), "{path_labels:?}");
    let hello_content = "import \"hellopath\"";
    let hello = open_at(&mut session, &root.join("a/b/hello-importer.rq"), hello_content);
    let hello_labels = labels(
        &session
            .completion(&hello, Position { line: 0, character: (hello_content.len() - 1) as u32 })
            .items,
    );
    assert!(
        hello_labels.iter().any(|label| label.contains("hello/inbetween/path/file.rq")),
        "{hello_labels:?}"
    );
    let _ = fs::remove_dir_all(&root);
}

#[test]
fn ranks_import_paths_by_proximity_then_alphabetically() {
    let root = scratch("rank");
    fs::create_dir_all(root.join("a/b/c")).unwrap();
    fs::write(root.join("a/b/close.rq"), "close {}\n").unwrap();
    fs::write(root.join("far.rq"), "far {}\n").unwrap();
    fs::write(root.join("a/b/alpha.rq"), "alpha {}\n").unwrap();
    fs::write(root.join("a/b/zeta.rq"), "zeta {}\n").unwrap();
    let content = "import \"../\"";
    let mut session = Session::new();
    session.set_workspace_folders(std::slice::from_ref(&root));
    let uri = open_at(&mut session, &root.join("a/b/c/importer.rq"), content);
    let items =
        session.completion(&uri, Position { line: 0, character: (content.len() - 1) as u32 }).items;
    let close = items.iter().position(|item| item.label == "../close.rq").expect("close");
    let far = items.iter().position(|item| item.label == "../../../far.rq").expect("far");
    assert!(close < far, "{:?}", labels(&items));
    assert_eq!(items[close].filter_text.as_deref(), Some("../"));
    assert_eq!(items[far].filter_text.as_deref(), Some("../"));
    assert!(items[close].sort_text.as_deref().unwrap() < items[far].sort_text.as_deref().unwrap());
    let alpha = items.iter().position(|item| item.label == "../alpha.rq").unwrap();
    let zeta = items.iter().position(|item| item.label == "../zeta.rq").unwrap();
    assert!(alpha < zeta);
    let _ = fs::remove_dir_all(&root);
}

#[test]
fn anonymous_paths_share_import_path_completion() {
    let root = scratch("share");
    fs::write(root.join("exampleimport.rq"), "myimportableIdea {\n}\n").unwrap();
    let mut session = Session::new();
    session.set_workspace_folders(std::slice::from_ref(&root));
    let anon = open_at(&mut session, &root.join("anon-completion.rq"), "demo {\n    [\"./\"]\n}");
    let anon_items = session.completion(&anon, Position { line: 1, character: 8 }).items;
    let import_content = "import \"./\"";
    let import_uri = open_at(&mut session, &root.join("named-completion.rq"), import_content);
    let import_items = session
        .completion(&import_uri, Position { line: 0, character: (import_content.len() - 1) as u32 })
        .items;
    let anon_item = anon_items.iter().find(|item| item.label == "./exampleimport.rq");
    let import_item = import_items.iter().find(|item| item.label == "./exampleimport.rq");
    assert_eq!(
        anon_item.and_then(|item| item.sort_text.clone()),
        import_item.and_then(|item| item.sort_text.clone())
    );
    assert_eq!(anon_item.unwrap().filter_text.as_deref(), Some("./"));
    assert_eq!(import_item.unwrap().filter_text.as_deref(), Some("./"));
    let _ = fs::remove_dir_all(&root);
}

#[test]
fn anonymous_qualified_paths_use_shared_completion() {
    let root = scratch("qual-path");
    fs::write(root.join("exampleimport.rq"), "myimportableIdea {\n}\n").unwrap();
    let mut session = Session::new();
    session.set_workspace_folders(std::slice::from_ref(&root));
    let uri = open_at(
        &mut session,
        &root.join("anon-qualified-completion.rq"),
        "demo {\n    [\"./exampleimport.rq\".myimportableIdea]\n}",
    );
    let labels = labels(&session.completion(&uri, Position { line: 1, character: 8 }).items);
    assert!(labels.iter().any(|label| label.contains("exampleimport.rq")), "{labels:?}");
    let _ = fs::remove_dir_all(&root);
}

#[test]
fn incomplete_anonymous_alias_paths_match_import_alias_paths() {
    let root = scratch("alias-open");
    fs::write(root.join("exampleimport.rq"), "myimportableIdea {\n}\n").unwrap();
    let mut session = Session::new();
    session.set_workspace_folders(std::slice::from_ref(&root));
    let import_uri = open_at(&mut session, &root.join("anon-import-open.rq"), "import \"@");
    let anon =
        open_at(&mut session, &root.join("anon-bracket-open.rq"), "consumer {\n    see [\"@\n}");
    let import_labels =
        labels(&session.completion(&import_uri, Position { line: 0, character: 8 }).items);
    let anon_labels = labels(&session.completion(&anon, Position { line: 1, character: 11 }).items);
    assert!(!anon_labels.is_empty(), "{anon_labels:?}");
    assert!(anon_labels.iter().all(|label| label.starts_with("@/")), "{anon_labels:?}");
    assert!(anon_labels.iter().any(|label| label.ends_with("exampleimport.rq")));
    for label in
        import_labels.iter().filter(|label| label.starts_with("@/") && label.ends_with(".rq"))
    {
        assert!(anon_labels.contains(label), "{label} missing from {anon_labels:?}");
    }
    let _ = fs::remove_dir_all(&root);
}

#[test]
fn anonymous_file_references_complete_code_files_folders_and_rq_files() {
    let root = scratch("objects");
    fs::create_dir_all(root.join("assets")).unwrap();
    fs::write(root.join("lib.rq"), "exported {}\n").unwrap();
    fs::write(root.join("util.ts"), "export const x = 1;\n").unwrap();
    fs::write(root.join("assets/notes.md"), "# notes\n").unwrap();
    let mut session = Session::new();
    session.set_workspace_folders(std::slice::from_ref(&root));
    let anon = open_at(&mut session, &root.join("app.rq"), "host {\n    see [\"./\"]\n}");
    let anon_labels = labels(&session.completion(&anon, Position { line: 1, character: 12 }).items);
    assert!(anon_labels.contains(&"./lib.rq".to_string()), "{anon_labels:?}");
    assert!(anon_labels.contains(&"./util.ts".to_string()), "{anon_labels:?}");
    assert!(anon_labels.contains(&"./assets/".to_string()), "{anon_labels:?}");
    assert!(anon_labels.contains(&"./assets/notes.md".to_string()), "{anon_labels:?}");
    let import_content = "import \"./\"";
    let import_uri = open_at(&mut session, &root.join("importer.rq"), import_content);
    let import_labels = labels(
        &session
            .completion(
                &import_uri,
                Position { line: 0, character: (import_content.len() - 1) as u32 },
            )
            .items,
    );
    assert!(import_labels.contains(&"./lib.rq".to_string()), "{import_labels:?}");
    assert!(import_labels.contains(&"./assets/".to_string()), "{import_labels:?}");
    assert!(!import_labels.iter().any(|label| label.ends_with("util.ts")));
    assert!(!import_labels.iter().any(|label| label.ends_with("notes.md")));
    let _ = fs::remove_dir_all(&root);
}

#[test]
fn completes_ideas_after_a_quoted_file_path() {
    let root = scratch("ideas");
    let lib = "exported {\n    body\n}\nbundle (\n    exported\n)\n";
    fs::write(root.join("lib.rq"), lib).unwrap();
    let app = "host {\n    see [\"./lib.rq\".\n}";
    let mut session = Session::new();
    session.set_workspace_folders(std::slice::from_ref(&root));
    let uri = open_at(&mut session, &root.join("app.rq"), app);
    let items = session.completion(&uri, Position { line: 1, character: 20 }).items;
    let labels = labels(&items);
    assert!(labels.contains(&"exported".to_string()), "{labels:?}");
    assert!(labels.contains(&"bundle".to_string()), "{labels:?}");
    assert!(items.iter().all(|item| item.detail.as_deref() == Some("./lib.rq")));
    assert!(items.iter().all(|item| item.additional_text_edits.is_none()));
    let _ = fs::remove_dir_all(&root);
}

#[test]
fn completes_ideaset_members_after_a_quoted_path() {
    let root = scratch("members");
    fs::write(root.join("lib.rq"), "bundle (\n    exported,\n    other_member\n)\nexported {\n}\n")
        .unwrap();
    let app = "host {\n    see [\"./lib.rq\".bundle.\n}";
    let mut session = Session::new();
    session.set_workspace_folders(std::slice::from_ref(&root));
    let uri = open_at(&mut session, &root.join("app.rq"), app);
    let labels = labels(&session.completion(&uri, Position { line: 1, character: 27 }).items);
    assert!(labels.contains(&"bundle.exported".to_string()), "{labels:?}");
    assert!(labels.contains(&"bundle.other_member".to_string()), "{labels:?}");
    assert!(!labels.iter().any(|label| label == "host"));
    let _ = fs::remove_dir_all(&root);
}

#[test]
fn reference_completions_show_source_path_and_auto_import() {
    let root = scratch("auto");
    fs::write(root.join("exampleimport.rq"), "myimportableIdea {\n}\n").unwrap();
    let mut session = Session::new();
    session.set_workspace_folders(std::slice::from_ref(&root));
    open_at(&mut session, &root.join("exampleimport.rq"), "myimportableIdea {\n}\n");
    let content = "consumer {\n    see [\n}";
    let uri = open_at(&mut session, &root.join("consumer-completion.rq"), content);
    let items = session.completion(&uri, Position { line: 1, character: 9 }).items;
    let remote = items.iter().find(|item| item.label == "myimportableIdea").expect("remote");
    assert_eq!(remote.detail.as_deref(), Some("./exampleimport.rq"));
    let edit = remote.additional_text_edits.as_ref().unwrap();
    assert_eq!(edit[0].new_text, "from \"./exampleimport.rq\" import myimportableIdea\n\n");
    assert_eq!(edit[0].range.start.line, 0);
    let local = items.iter().find(|item| item.label == "consumer").unwrap();
    assert!(local.detail.is_none());
    assert!(local.additional_text_edits.is_none());
    let _ = fs::remove_dir_all(&root);
}

#[test]
fn skips_auto_import_when_the_idea_is_already_imported() {
    let root = scratch("already");
    fs::write(root.join("exampleimport.rq"), "myimportableIdea {\n}\n").unwrap();
    let mut session = Session::new();
    session.set_workspace_folders(std::slice::from_ref(&root));
    open_at(&mut session, &root.join("exampleimport.rq"), "myimportableIdea {\n}\n");
    let content = "from \"./exampleimport.rq\" import myimportableIdea\n\nconsumer {\n    see [\n}";
    let uri = open_at(&mut session, &root.join("consumer-already-imported.rq"), content);
    let items = session.completion(&uri, Position { line: 3, character: 9 }).items;
    let remote = items.iter().find(|item| item.label == "myimportableIdea").expect("remote");
    assert_eq!(remote.detail.as_deref(), Some("./exampleimport.rq"));
    assert!(remote.additional_text_edits.is_none(), "{:?}", remote.additional_text_edits);
    let _ = fs::remove_dir_all(&root);
}

#[test]
fn cached_path_completion_does_not_re_read_directories() {
    let root = scratch("cache");
    fs::write(root.join("lib.rq"), "exported {}\n").unwrap();
    let content = "import \"./\"";
    let mut session = Session::new();
    session.set_workspace_folders(std::slice::from_ref(&root));
    let uri = open_at(&mut session, &root.join("app.rq"), content);
    let pos = Position { line: 0, character: (content.len() - 1) as u32 };
    let _ = session.completion(&uri, pos);
    let reads = session.path_completion_directory_reads();
    assert!(reads > 0);
    let _ = session.completion(&uri, pos);
    assert_eq!(session.path_completion_directory_reads(), reads);
    let _ = fs::remove_dir_all(&root);
}
