//! rq:["../../../reqlan rq/extension/language/support/features-imports.rq".import_code_completion]
//! rq:["../../../reqlan rq/extension/language/support/features-imports.rq".import_code_completion_match_quality]
//! rq:["../../../reqlan rq/extension/language/syntax/features-syntax-highlighting.rq".attribute_code_completion_attribute_key]
//! rq:["../../../reqlan rq/extension/language/syntax/features-syntax-highlighting.rq".completion_site_identifier_charset]
//! rq:["../../../reqlan rq/extension/language/syntax/features-syntax-highlighting.rq".code_completion_replaces_the_tail]
//! rq:["../../../reqlan rq/extension/language/syntax/features-syntax-highlighting.rq".code_completion_reentry_is_lossless]
//! rq:["../../../reqlan rq/extension/language/syntax/features-syntax-highlighting.rq".reference_code_completion_objects]
//! rq:["../../../reqlan rq/extension/language/syntax/features-syntax-highlighting.rq".reference_code_completion_performance]
use lsp_types::{CompletionItem, CompletionTextEdit, Position, TextEdit, Url};
use reqlan_index::{index_one_file, IndexStore};
use reqlan_lsp::{AttributeCatalog, Session};
use std::collections::HashMap;
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

fn text_edit(item: &CompletionItem) -> &TextEdit {
    match item.text_edit.as_ref().unwrap() {
        CompletionTextEdit::Edit(edit) => edit,
        CompletionTextEdit::InsertAndReplace(_) => panic!("replace edit"),
    }
}

/// Splice one text edit into a single-line string (the fixtures are ASCII).
fn apply_edit(line: &str, edit: &TextEdit) -> String {
    let start = byte_at(line, edit.range.start.character);
    let end = byte_at(line, edit.range.end.character);
    format!("{}{}{}", &line[..start], edit.new_text, &line[end..])
}

fn byte_at(line: &str, character: u32) -> usize {
    match line.char_indices().nth(character as usize) {
        Some((index, _)) => index,
        None => line.len(),
    }
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

fn status_catalog(values: &[&str]) -> AttributeCatalog {
    let mut values_by_key = HashMap::new();
    values_by_key
        .insert("status".to_string(), values.iter().map(|value| (*value).to_string()).collect());
    AttributeCatalog { keys: vec!["status".to_string()], values_by_key }
}

fn value_catalog() -> AttributeCatalog {
    status_catalog(&["open", "closed"])
}

#[test]
fn completes_attribute_values_after_the_colon_form() {
    let mut session = Session::new();
    session.note_attribute_catalog(value_catalog());
    let content = "idea {\n    @status:\n}";
    let uri = open_at(&mut session, &scratch("attr-colon").join("app.rq"), content);
    let items = session.completion(&uri, Position { line: 1, character: 12 }).items;
    let labels = labels(&items);
    assert_eq!(labels, vec!["open".to_string(), "closed".to_string()], "{labels:?}");
}

#[test]
fn completes_attribute_values_after_the_space_form() {
    let mut session = Session::new();
    session.note_attribute_catalog(value_catalog());
    let content = "idea {\n    @status o\n}";
    let uri = open_at(&mut session, &scratch("attr-space").join("app.rq"), content);
    let items = session.completion(&uri, Position { line: 1, character: 13 }).items;
    let labels = labels(&items);
    assert_eq!(labels, vec!["open".to_string()], "{labels:?}");
}

#[test]
fn completes_hyphenated_reference_names() {
    let root = scratch("hyphen-ref");
    let content = "my-idea {\n}\nhost {\n    see [my-idea\n}\n";
    let mut session = Session::new();
    session.set_workspace_folders(std::slice::from_ref(&root));
    let uri = open_at(&mut session, &root.join("app.rq"), content);
    let items = session.completion(&uri, Position { line: 3, character: 16 }).items;
    assert!(labels(&items).contains(&"my-idea".to_string()), "{items:?}");
    let _ = fs::remove_dir_all(&root);
}

#[test]
fn completes_hyphenated_names_after_a_quoted_path() {
    let root = scratch("hyphen-qualified");
    fs::write(root.join("lib.rq"), "my-idea {\n}\n").unwrap();
    let content = "host {\n    see [\"./lib.rq\".my-idea\n}";
    let mut session = Session::new();
    session.set_workspace_folders(std::slice::from_ref(&root));
    let uri = open_at(&mut session, &root.join("app.rq"), content);
    let items = session.completion(&uri, Position { line: 1, character: 27 }).items;
    assert!(labels(&items).contains(&"my-idea".to_string()), "{items:?}");
    let _ = fs::remove_dir_all(&root);
}

#[test]
fn ranks_exact_substring_matches_above_subsequence_matches() {
    let root = scratch("tier");
    fs::write(root.join("a-b.rq"), "hyphen {}\n").unwrap();
    fs::create_dir_all(root.join("deep/nested/dir")).unwrap();
    fs::write(root.join("deep/nested/dir/abc.rq"), "deep {}\n").unwrap();
    let content = "import \"ab\"";
    let mut session = Session::new();
    session.set_workspace_folders(std::slice::from_ref(&root));
    let uri = open_at(&mut session, &root.join("importer.rq"), content);
    let items = session.completion(&uri, Position { line: 0, character: 10 }).items;
    let deep = items.iter().position(|item| item.label == "./deep/nested/dir/abc.rq");
    let hyphen = items.iter().position(|item| item.label == "./a-b.rq");
    let (deep, hyphen) = (deep.expect("deep"), hyphen.expect("hyphen"));
    assert!(deep < hyphen, "{:?}", labels(&items));
    let _ = fs::remove_dir_all(&root);
}

#[test]
fn completes_ideaset_members_after_a_bare_dotted_reference() {
    let root = scratch("dotted-ref");
    let content = "set (\n    member,\n)\nhost {\n    see [set.\n    see [set.mem\n}\n";
    let mut session = Session::new();
    session.set_workspace_folders(std::slice::from_ref(&root));
    let uri = open_at(&mut session, &root.join("app.rq"), content);
    let opened = labels(&session.completion(&uri, Position { line: 4, character: 13 }).items);
    assert_eq!(opened, vec!["set.member".to_string()], "{opened:?}");
    let typed = labels(&session.completion(&uri, Position { line: 5, character: 16 }).items);
    assert_eq!(typed, vec!["set.member".to_string()], "{typed:?}");
    let _ = fs::remove_dir_all(&root);
}

/// rq:["../../../reqlan rq/extension/language/syntax/features-syntax-highlighting.rq".reference_code_completion_objects]
#[test]
fn completes_ideaset_members_of_a_closed_file() {
    let root = scratch("dotted-index");
    fs::create_dir_all(root.join(".reqlan")).unwrap();
    let db = root.join(".reqlan").join("ideas-index.sqlite");
    let mut store = IndexStore::open(&db).unwrap();
    let lib = root.join("lib.rq");
    fs::write(
        &lib,
        "bundle (\n    exported,\n    other_member\n)\nexported {\n}\nother_member {\n}\n",
    )
    .unwrap();
    index_one_file(&mut store, &root, lib.to_str().unwrap()).unwrap();
    drop(store);

    let mut session = Session::new();
    session.set_workspace_folders(std::slice::from_ref(&root));
    let content = "host {\n    see [bundle.\n    see [bundle.oth\n}\n";
    let uri = open_at(&mut session, &root.join("app.rq"), content);
    let opened = labels(&session.completion(&uri, Position { line: 1, character: 16 }).items);
    assert_eq!(
        opened,
        vec!["bundle.exported".to_string(), "bundle.other_member".to_string()],
        "{opened:?}"
    );
    let typed = labels(&session.completion(&uri, Position { line: 2, character: 19 }).items);
    assert_eq!(typed, vec!["bundle.other_member".to_string()], "{typed:?}");
    let _ = fs::remove_dir_all(&root);
}

#[test]
fn does_not_complete_inside_markdown_link_labels() {
    let root = scratch("markdown-label");
    let content = "idea {\n    see [Some label \n}";
    let mut session = Session::new();
    session.set_workspace_folders(std::slice::from_ref(&root));
    let uri = open_at(&mut session, &root.join("app.rq"), content);
    let list = session.completion(&uri, Position { line: 1, character: 20 });
    assert!(list.items.is_empty(), "{:?}", labels(&list.items));
    let _ = fs::remove_dir_all(&root);
}

#[test]
fn prose_lines_do_not_trigger_import_path_completion() {
    let root = scratch("prose-import");
    fs::write(root.join("exampleimport.rq"), "myimportableIdea {\n}\n").unwrap();
    let content = "idea {\n    from \"requirements\" the docs say more\n}";
    let mut session = Session::new();
    session.set_workspace_folders(std::slice::from_ref(&root));
    let uri = open_at(&mut session, &root.join("app.rq"), content);
    let list = session.completion(&uri, Position { line: 1, character: 22 });
    assert!(list.items.is_empty(), "{:?}", labels(&list.items));
    let _ = fs::remove_dir_all(&root);
}

#[test]
fn completing_inside_a_string_replaces_the_tail() {
    let root = scratch("tail-path");
    fs::create_dir_all(root.join("root/autocompletecontexthere/hello")).unwrap();
    fs::write(root.join("root/autocompletecontexthere/hello/afile.ts"), "x\n").unwrap();
    fs::create_dir_all(root.join("a/b")).unwrap();
    fs::write(root.join("a/b/c.ts"), "x\n").unwrap();
    fs::create_dir_all(root.join("a/d")).unwrap();
    fs::write(root.join("a/c.ts"), "x\n").unwrap();
    let mut session = Session::new();
    session.set_workspace_folders(std::slice::from_ref(&root));

    let content = "demo {\n    [\"@/root/autocompletecontexthere/afile.ts\"]\n}\n";
    let uri = open_at(&mut session, &root.join("tail-string.rq"), content);
    let item = session
        .completion(&uri, Position { line: 1, character: 36 })
        .items
        .into_iter()
        .find(|item| item.label == "@/root/autocompletecontexthere/hello/afile.ts")
        .expect("tail item");
    let edit = text_edit(&item);
    assert_eq!(edit.range.start.character, 6);
    assert_eq!(edit.range.end.character, 45, "the range must end before the closing quote");
    assert_eq!(edit.new_text, "@/root/autocompletecontexthere/hello/afile.ts");
    let line = content.lines().nth(1).unwrap();
    assert_eq!(apply_edit(line, edit), "    [\"@/root/autocompletecontexthere/hello/afile.ts\"]");

    let merge_content = "demo {\n    [\"@/a/b/c.ts\"]\n}\n";
    let merge_uri = open_at(&mut session, &root.join("tail-merge.rq"), merge_content);
    let item = session
        .completion(&merge_uri, Position { line: 1, character: 10 })
        .items
        .into_iter()
        .find(|item| item.label == "@/a/b/")
        .expect("folder item");
    let edit = text_edit(&item);
    assert_eq!(edit.new_text, "@/a/b/c.ts", "the tail continues the folder label");
    let line = merge_content.lines().nth(1).unwrap();
    assert_eq!(apply_edit(line, edit), "    [\"@/a/b/c.ts\"]");

    let carry_content = "demo {\n    [\"@/a/c.ts\"]\n}\n";
    let carry_uri = open_at(&mut session, &root.join("tail-carry.rq"), carry_content);
    let item = session
        .completion(&carry_uri, Position { line: 1, character: 10 })
        .items
        .into_iter()
        .find(|item| item.label == "@/a/d/")
        .expect("sibling folder item");
    let edit = text_edit(&item);
    assert_eq!(edit.new_text, "@/a/d/c.ts", "a bare file name tail is carried");
    let line = carry_content.lines().nth(1).unwrap();
    assert_eq!(apply_edit(line, edit), "    [\"@/a/d/c.ts\"]");

    let drop_content = "demo {\n    [\"@/a/b/c.ts\"]\n}\n";
    let drop_uri = open_at(&mut session, &root.join("tail-drop.rq"), drop_content);
    let item = session
        .completion(&drop_uri, Position { line: 1, character: 10 })
        .items
        .into_iter()
        .find(|item| item.label == "@/a/d/")
        .expect("sibling folder item");
    let edit = text_edit(&item);
    assert_eq!(edit.new_text, "@/a/d/", "a tail with a separator is consumed");
    let _ = fs::remove_dir_all(&root);
}

#[test]
fn completing_inside_a_reference_name_replaces_the_tail() {
    let root = scratch("tail-ref");
    let content =
        "namespace_idea {\n}\nnamespace_idea_two {\n}\nhost {\n    see [namespace_idea]\n}\n";
    let mut session = Session::new();
    session.set_workspace_folders(std::slice::from_ref(&root));
    let uri = open_at(&mut session, &root.join("app.rq"), content);
    let item = session
        .completion(&uri, Position { line: 5, character: 11 })
        .items
        .into_iter()
        .find(|item| item.label == "namespace_idea_two")
        .expect("completion");
    let edit = text_edit(&item);
    assert_eq!(edit.range.start.character, 9);
    assert_eq!(edit.range.end.character, 23, "the range must end before the closing bracket");
    assert_eq!(edit.new_text, "namespace_idea_two");
    let line = content.lines().nth(5).unwrap();
    assert_eq!(apply_edit(line, edit), "    see [namespace_idea_two]");
    let _ = fs::remove_dir_all(&root);
}

/// rq:["../../../reqlan rq/extension/language/syntax/features-syntax-highlighting.rq".code_completion_replaces_the_tail]
#[test]
fn completes_attribute_value_replacing_the_tail() {
    let mut session = Session::new();
    session.note_attribute_catalog(status_catalog(&["active", "archived"]));
    let root = scratch("attr-value-tail");
    let content = "idea {\n    @status: active\n}";
    let uri = open_at(&mut session, &root.join("app.rq"), content);
    let item = session
        .completion(&uri, Position { line: 1, character: 15 })
        .items
        .into_iter()
        .find(|item| item.label == "active")
        .expect("active value");
    let edit = text_edit(&item);
    assert_eq!(edit.range.start.character, 13);
    assert_eq!(edit.range.end.character, 19, "the edit spans the whole value token");
    assert_eq!(edit.new_text, "active");
    let line = content.lines().nth(1).unwrap();
    assert_eq!(apply_edit(line, edit), "    @status: active");
    let _ = fs::remove_dir_all(&root);
}

/// rq:["../../../reqlan rq/extension/language/syntax/features-syntax-highlighting.rq".code_completion_replaces_the_tail]
#[test]
fn completes_attribute_key_replacing_the_tail() {
    let mut session = Session::new();
    session.note_attribute_catalog(status_catalog(&["open", "closed"]));
    let root = scratch("attr-key-tail");
    let content = "idea {\n    @status: v\n}";
    let uri = open_at(&mut session, &root.join("app.rq"), content);
    let item = session
        .completion(&uri, Position { line: 1, character: 8 })
        .items
        .into_iter()
        .find(|item| item.label == "status")
        .expect("status key");
    let edit = text_edit(&item);
    assert_eq!(edit.range.start.character, 5);
    assert_eq!(edit.range.end.character, 11, "the edit spans the whole key token");
    assert_eq!(edit.new_text, "status");
    let line = content.lines().nth(1).unwrap();
    assert_eq!(apply_edit(line, edit), "    @status: v");
    let _ = fs::remove_dir_all(&root);
}

/// rq:["../../../reqlan rq/extension/language/syntax/features-syntax-highlighting.rq".code_completion_replaces_the_tail]
#[test]
fn appends_the_closing_quote_at_the_end_of_an_unclosed_string() {
    let root = scratch("close-quote");
    fs::create_dir_all(root.join("a/b")).unwrap();
    fs::write(root.join("a/b/c.ts"), "x\n").unwrap();
    let mut session = Session::new();
    session.set_workspace_folders(std::slice::from_ref(&root));
    let uri = open_at(&mut session, &root.join("app.rq"), "demo {\n    [\"@/a/b\n}\n");
    let item = session
        .completion(&uri, Position { line: 1, character: 11 })
        .items
        .into_iter()
        .find(|item| item.label == "@/a/b/")
        .expect("folder item");
    let edit = text_edit(&item);
    assert_eq!(edit.new_text, "@/a/b/\"", "the insert ends with the missing quote");
    // In-progress text after the cursor inserts without a quote.
    let mid = open_at(&mut session, &root.join("mid.rq"), "demo {\n    [\"@/a/bc.ts\n}\n");
    let item = session
        .completion(&mid, Position { line: 1, character: 11 })
        .items
        .into_iter()
        .find(|item| item.label == "@/a/b/c.ts")
        .expect("file item");
    let edit = text_edit(&item);
    assert_eq!(edit.new_text, "@/a/b/c.ts", "in-progress text is not quoted");
    let _ = fs::remove_dir_all(&root);
}

/// rq:["../../../reqlan rq/extension/language/syntax/features-syntax-highlighting.rq".code_completion_reentry_is_lossless]
#[test]
fn ranks_the_current_value_first_when_reentering_a_path() {
    let root = scratch("reentry");
    fs::create_dir_all(root.join("a/b")).unwrap();
    fs::write(root.join("a/b/c.ts"), "x\n").unwrap();
    fs::create_dir_all(root.join("a/z")).unwrap();
    fs::write(root.join("a/z/q.ts"), "x\n").unwrap();
    let mut session = Session::new();
    session.set_workspace_folders(std::slice::from_ref(&root));
    let content = "demo {\n    [\"@/a/b/c.ts\"]\n}";
    let uri = open_at(&mut session, &root.join("app.rq"), content);
    let items = session.completion(&uri, Position { line: 1, character: 9 }).items;
    let names = labels(&items);
    let current = items.iter().position(|item| item.label == "@/a/b/c.ts").expect("current value");
    assert_eq!(current, 0, "the edited value ranks first: {names:?}");
    let folder = items.iter().position(|item| item.label == "@/a/b/").expect("resume candidate");
    let unrelated = items.iter().position(|item| item.label == "@/a/z/q.ts").expect("unrelated");
    assert!(folder < unrelated, "the resume candidate outranks its tier: {names:?}");
    let _ = fs::remove_dir_all(&root);
}

/// rq:["../../../reqlan rq/extension/language/support/features-imports.rq".import_code_completion_prefix_aware_ranking]
#[test]
fn ranks_alias_root_candidates_first_for_alias_queries() {
    let root = scratch("alias-boost");
    fs::create_dir_all(root.join("@/x")).unwrap();
    fs::write(root.join("@/x/near.rq"), "x\n").unwrap();
    fs::create_dir_all(root.join("x/deep")).unwrap();
    fs::write(root.join("x/deep/far.rq"), "x\n").unwrap();
    let mut session = Session::new();
    session.set_workspace_folders(std::slice::from_ref(&root));
    let uri = open_at(&mut session, &root.join("app.rq"), "demo {\n    [\"@/x\"]\n}\n");
    let items = session.completion(&uri, Position { line: 1, character: 9 }).items;
    let names = labels(&items);
    let far = items
        .iter()
        .position(|item| item.label == "@/x/deep/far.rq")
        .expect("alias-root candidate");
    let near =
        items.iter().position(|item| item.label == "./@/x/near.rq").expect("closer relative match");
    assert!(far < near, "the alias-root candidate outranks proximity: {names:?}");
    let _ = fs::remove_dir_all(&root);
}

/// rq:["../../../reqlan rq/extension/language/support/features-imports.rq".import_code_completion_match_quality]
#[test]
fn ranks_segment_matches_above_subsequence_matches() {
    let root = scratch("segment-rank");
    fs::create_dir_all(root.join("far/zz/ab/x")).unwrap();
    fs::write(root.join("far/zz/ab/x/cw.rq"), "x\n").unwrap();
    fs::create_dir_all(root.join("yaqb")).unwrap();
    fs::write(root.join("yaqb/cx.rq"), "x\n").unwrap();
    let mut session = Session::new();
    session.set_workspace_folders(std::slice::from_ref(&root));
    let uri = open_at(&mut session, &root.join("importer.rq"), "demo {\n    [\"ab/c\"]\n}\n");
    let items = session.completion(&uri, Position { line: 1, character: 10 }).items;
    let names = labels(&items);
    let segment =
        items.iter().position(|item| item.label == "./far/zz/ab/x/cw.rq").expect("segment match");
    let loose =
        items.iter().position(|item| item.label == "./yaqb/cx.rq").expect("subsequence match");
    assert!(segment < loose, "the segment match outranks the subsequence: {names:?}");
    let _ = fs::remove_dir_all(&root);
}
