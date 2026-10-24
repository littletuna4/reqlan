//! Code-action parity with `packages/language/test/code-actions.test.ts`.
//! rq:["../../../reqlan rq/extension/language/support/language-server-rust.rq".language_server_rust]
use lsp_types::{CodeActionOrCommand, Position, Range, Url};
use reqlan_index::{index_one_file, IndexStore};
use reqlan_lsp::{Session, SymbolHit};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

fn scratch(name: &str) -> PathBuf {
    let nanos = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
    let path = std::env::temp_dir().join(format!("reqlan-lsp-actions-{name}-{nanos}"));
    fs::create_dir_all(&path).unwrap();
    path
}

fn file_uri(path: &Path) -> String {
    Url::from_file_path(path).unwrap().to_string()
}

fn point(line: u32, character: u32) -> Range {
    Range { start: Position { line, character }, end: Position { line, character } }
}

fn titles(actions: &[CodeActionOrCommand]) -> Vec<&str> {
    actions
        .iter()
        .filter_map(|action| match action {
            CodeActionOrCommand::CodeAction(action) => Some(action.title.as_str()),
            CodeActionOrCommand::Command(_) => None,
        })
        .collect()
}

fn code_action<'a>(actions: &'a [CodeActionOrCommand], title: &str) -> &'a lsp_types::CodeAction {
    actions
        .iter()
        .find_map(|action| match action {
            CodeActionOrCommand::CodeAction(action) if action.title == title => Some(action),
            _ => None,
        })
        .unwrap_or_else(|| panic!("missing {title} in {}", titles(actions).join(" | ")))
}

fn edit_text(action: &lsp_types::CodeAction) -> String {
    action
        .edit
        .as_ref()
        .and_then(|edit| edit.changes.as_ref())
        .and_then(|changes| changes.values().next())
        .and_then(|edits| edits.first())
        .map(|edit| edit.new_text.clone())
        .unwrap_or_default()
}

// Oracle: offers ignore-error quick fix on a line with a linking error
#[test]
fn offers_ignore_error_quick_fix_on_a_line_with_a_linking_error() {
    let mut session = Session::new();
    let uri = "file:///ignore.rq";
    session.open(uri, "consumer {\n    [missing_target]\n}\n".into());
    let diagnostics = session.diagnostics(uri);
    let unresolved: Vec<_> = diagnostics
        .into_iter()
        .filter(|diagnostic| diagnostic.message.contains("Could not resolve reference"))
        .collect();
    let actions = session.code_actions_for(uri, unresolved[0].range, &unresolved, &[]);
    let ignore = code_action(&actions, "Ignore error with //rq-ignore-error");
    assert_eq!(ignore.kind.as_ref().map(|kind| kind.as_str()), Some("quickfix"));
    assert_eq!(edit_text(ignore), "    //rq-ignore-error\n");
}

// Oracle: omits ignore-error when only refactor is requested
#[test]
fn omits_ignore_error_when_only_refactor_is_requested() {
    let mut session = Session::new();
    let uri = "file:///ignore-refactor.rq";
    session.open(uri, "consumer {\n    [missing_target]\n}\n".into());
    let diagnostics = session.diagnostics(uri);
    let actions =
        session.code_actions_for(uri, diagnostics[0].range, &diagnostics, &["refactor".into()]);
    assert!(!titles(&actions).contains(&"Ignore error with //rq-ignore-error"));
}

// Oracle: creates the missing idea below the containing idea when only one is unresolved
#[test]
fn creates_the_missing_idea_below_the_containing_idea() {
    let mut session = Session::new();
    let uri = "file:///create-one.rq";
    session.open(uri, "consumer {\n    See [missing_target] here.\n}\n".into());
    let actions = session.code_actions_for(uri, point(1, 4), &[], &[]);
    let create = code_action(&actions, "Create 'missing_target' below");
    assert_eq!(create.kind.as_ref().map(|kind| kind.as_str()), Some("quickfix"));
    assert!(!titles(&actions).contains(&"Create all unresolved ideas below"));
    assert_eq!(edit_text(create), "\n\nmissing_target {\n    \n}\n");
}

// Oracle: offers all or a specific unresolved idea when the caret idea has several
#[test]
fn offers_all_or_a_specific_unresolved_idea() {
    let mut session = Session::new();
    let uri = "file:///create-many.rq";
    session.open(uri, "consumer {\n    [alpha_missing] and [beta_missing]\n}\n".into());
    let actions = session.code_actions_for(uri, point(1, 20), &[], &[]);
    let found = titles(&actions);
    assert!(found.contains(&"Create all unresolved ideas below"), "{found:?}");
    assert!(found.contains(&"Create 'alpha_missing' below"), "{found:?}");
    assert!(found.contains(&"Create 'beta_missing' below"), "{found:?}");
    assert_eq!(
        edit_text(code_action(&actions, "Create all unresolved ideas below")),
        "\n\nalpha_missing {\n    \n}\n\nbeta_missing {\n    \n}\n"
    );
    assert_eq!(
        edit_text(code_action(&actions, "Create 'alpha_missing' below")),
        "\n\nalpha_missing {\n    \n}\n"
    );
}

// Oracle: omits create-below when the caret idea has no unresolved local references
#[test]
fn omits_create_below_when_the_caret_idea_has_no_unresolved_local_references() {
    let mut session = Session::new();
    let uri = "file:///no-unresolved.rq";
    session.open(uri, "alpha {\n    [missing_target]\n}\nbeta {\n    local body\n}\n".into());
    let actions = session.code_actions_for(uri, point(3, 6), &[], &[]);
    assert!(
        titles(&actions).iter().all(|title| !title.contains("below")),
        "{:?}",
        titles(&actions)
    );
}

// Oracle: omits create-below for a qualified unresolved reference
#[test]
fn omits_create_below_for_a_qualified_unresolved_reference() {
    let mut session = Session::new();
    let uri = "file:///qualified.rq";
    session.open(uri, "consumer {\n    [\"./missing.rq\".ghost]\n}\n".into());
    let diagnostics = session.diagnostics(uri);
    let actions = session.code_actions_for(uri, point(1, 8), &diagnostics, &[]);
    assert!(
        titles(&actions).iter().all(|title| !title.contains("below")),
        "{:?}",
        titles(&actions)
    );
}

// Oracle: omits create-below when only refactor is requested
#[test]
fn omits_create_below_when_only_refactor_is_requested() {
    let mut session = Session::new();
    let uri = "file:///create-refactor.rq";
    session.open(uri, "consumer {\n    [missing_target]\n}\n".into());
    let diagnostics = session.diagnostics(uri);
    let actions =
        session.code_actions_for(uri, diagnostics[0].range, &diagnostics, &["refactor".into()]);
    assert!(titles(&actions).iter().all(|title| !title.contains("below")));
}

// Oracle: offers add-import and rewrite when a matching idea exists elsewhere
#[test]
fn offers_add_import_and_rewrite_when_a_matching_idea_exists_elsewhere() {
    let root = scratch("import");
    fs::create_dir_all(root.join("lib")).unwrap();
    fs::create_dir_all(root.join("app")).unwrap();
    let shared = root.join("lib").join("shared.rq");
    let consumer = root.join("app").join("consumer.rq");
    fs::write(&shared, "shared_idea {\n}\n").unwrap();
    let shared_uri = file_uri(&shared);
    let consumer_uri = file_uri(&consumer);
    let mut session = Session::new();
    session.open(&shared_uri, "shared_idea {\n}\n".into());
    session.open(&consumer_uri, "consumer {\n    [shared_idea]\n}\n".into());
    let diagnostics = session.diagnostics(&consumer_uri);
    let unresolved: Vec<_> = diagnostics
        .into_iter()
        .filter(|diagnostic| diagnostic.message.contains("shared_idea"))
        .collect();
    let actions = session.code_actions_for(&consumer_uri, unresolved[0].range, &unresolved, &[]);
    let add = code_action(&actions, "Add import from \"../lib/shared.rq\"");
    assert_eq!(add.is_preferred, Some(true));
    assert_eq!(edit_text(add), "from \"../lib/shared.rq\" import shared_idea\n\n");
    let rewrite = code_action(&actions, "Change to [\"../lib/shared.rq\".shared_idea]");
    assert_eq!(edit_text(rewrite), "\"../lib/shared.rq\".shared_idea");
    let _ = fs::remove_dir_all(root);
}

// Oracle: uses name catalog matches when documents are not loaded
#[test]
fn uses_name_catalog_matches_when_documents_are_not_loaded() {
    let mut session = Session::new();
    session.note_name_catalog(vec![SymbolHit {
        name: "catalog_only".into(),
        kind: "idea".into(),
        file_uri: "file:///workspace/remote/catalog.rq".into(),
    }]);
    let uri = "file:///workspace/app/consumer.rq";
    session.open(uri, "consumer {\n    [catalog_only]\n}\n".into());
    let diagnostics = session.diagnostics(uri);
    let unresolved: Vec<_> = diagnostics
        .into_iter()
        .filter(|diagnostic| diagnostic.message.contains("catalog_only"))
        .collect();
    let actions = session.code_actions_for(uri, unresolved[0].range, &unresolved, &[]);
    let add = actions
        .iter()
        .find_map(|action| match action {
            CodeActionOrCommand::CodeAction(action) if action.title.contains("Add import from") => {
                Some(action)
            }
            _ => None,
        })
        .expect("add import");
    assert!(edit_text(add).contains("import catalog_only"), "{}", edit_text(add));
    assert!(edit_text(add).contains("../remote/catalog.rq"), "{}", edit_text(add));
}

// Oracle: search and create actions invoke extension commands
#[test]
fn search_and_create_actions_invoke_extension_commands() {
    let mut session = Session::new();
    let uri = "file:///search-create.rq";
    session.open(uri, "consumer {\n    [missing_target]\n}\n".into());
    let diagnostics = session.diagnostics(uri);
    let unresolved: Vec<_> = diagnostics
        .into_iter()
        .filter(|diagnostic| diagnostic.message.contains("missing_target"))
        .collect();
    let actions = session.code_actions_for(uri, unresolved[0].range, &unresolved, &[]);
    let search = code_action(&actions, "Search for idea to replace 'missing_target'…");
    assert_eq!(
        search.command.as_ref().map(|command| command.command.as_str()),
        Some("reqlan.searchReference")
    );
    assert!(search.command.as_ref().is_some_and(|command| command.arguments.is_none()));
    let create = code_action(&actions, "Create 'missing_target' in a new file and import it…");
    let command = create.command.as_ref().unwrap();
    assert_eq!(command.command, "reqlan.importError.createFile");
    let args = command.arguments.as_ref().unwrap();
    assert_eq!(args[0]["documentUri"], uri);
    assert_eq!(args[0]["refText"], "missing_target");
    assert!(args[0].get("range").is_some());
}

// Oracle: appends to an existing from-import for the same path
#[test]
fn appends_to_an_existing_from_import_for_the_same_path() {
    let host = "from \"./lib.rq\" import alpha\nhost {\n    [beta]\n}\n";
    let applied = add_import_applied(host, "Add import from \"./lib.rq\"");
    assert_eq!(applied, "from \"./lib.rq\" import alpha, beta\nhost {\n    [beta]\n}\n");
}

// Oracle: appends after an aliased specifier on the same from-import line
#[test]
fn appends_after_aliased_specifier_on_existing_from_import() {
    let host = "from \"./lib.rq\" import alpha as a\nhost {\n    [beta]\n}\n";
    let applied = add_import_applied(host, "Add import from \"./lib.rq\"");
    assert_eq!(applied, "from \"./lib.rq\" import alpha as a, beta\nhost {\n    [beta]\n}\n");
}

// Oracle: offers search code action when cursor is inside a resolved reference
#[test]
fn offers_search_code_action_when_cursor_is_inside_a_resolved_reference() {
    let mut session = Session::new();
    let uri = "file:///resolved.rq";
    session.open(uri, "alpha {\n}\nbeta {\n    see [alpha]\n}\n".into());
    let actions = session.code_actions_for(uri, point(3, 10), &[], &[]);
    let search = code_action(&actions, "Search for idea to replace 'alpha'…");
    assert_eq!(search.kind.as_ref().map(|kind| kind.as_str()), Some("refactor"));
    assert_eq!(
        search.command.as_ref().map(|command| command.command.as_str()),
        Some("reqlan.searchReference")
    );
    assert!(search.command.as_ref().is_some_and(|command| command.arguments.is_none()));
}

// Oracle: offers wrap code action for a prose selection
#[test]
fn offers_wrap_code_action_for_a_prose_selection() {
    let mut session = Session::new();
    let uri = "file:///wrap.rq";
    session.open(uri, "consumer {\n    Turn showcase into a reference later.\n}\n".into());
    let range = Range {
        start: Position { line: 1, character: 9 },
        end: Position { line: 1, character: 17 },
    };
    let actions = session.code_actions_for(uri, range, &[], &[]);
    let wrap = code_action(&actions, "Wrap 'showcase' as idea reference…");
    assert_eq!(
        wrap.command.as_ref().map(|command| command.command.as_str()),
        Some("reqlan.searchReference")
    );
    assert_eq!(wrap.kind.as_ref().map(|kind| kind.as_str()), Some("refactor"));
}

// Oracle: wraps the word under the cursor when selection is empty
#[test]
fn wraps_the_word_under_the_cursor_when_selection_is_empty() {
    let mut session = Session::new();
    let uri = "file:///wrap-word.rq";
    session.open(uri, "consumer {\n    Turn showcase into a reference later.\n}\n".into());
    let actions = session.code_actions_for(uri, point(1, 12), &[], &[]);
    assert!(
        titles(&actions).contains(&"Wrap 'showcase' as idea reference…"),
        "{:?}",
        titles(&actions)
    );
}

// Oracle: offers move and delete actions at an idea declaration
#[test]
fn offers_move_and_delete_actions_at_an_idea_declaration() {
    let mut session = Session::new();
    let uri = "file:///refactor.rq";
    session.open(uri, "alpha {\n    body\n}\n".into());
    let actions = session.code_actions_for(uri, point(0, 1), &[], &[]);
    let delete = code_action(&actions, "Delete idea 'alpha' and update references");
    assert_eq!(
        delete.command.as_ref().map(|command| command.command.as_str()),
        Some("reqlan.refactor.deleteIdea")
    );
    let move_idea = code_action(&actions, "Move idea 'alpha' to another file…");
    assert_eq!(
        move_idea.command.as_ref().map(|command| command.command.as_str()),
        Some("reqlan.refactor.moveIdea")
    );
    let move_content = code_action(&actions, "Move idea 'alpha' content to another file…");
    assert_eq!(
        move_content.command.as_ref().map(|command| command.command.as_str()),
        Some("reqlan.refactor.moveIdeaContent")
    );
    let args = delete.command.as_ref().unwrap().arguments.as_ref().unwrap();
    assert_eq!(args[0]["documentUri"], uri);
    assert_eq!(args[0]["ideaName"], "alpha");
    assert!(args[0].get("range").is_some());
}

// Oracle: offers barrel page source action when the file has top-level ideas
#[test]
fn offers_barrel_page_source_action_when_the_file_has_top_level_ideas() {
    let mut session = Session::new();
    let uri = "file:///barrel.rq";
    session.open(uri, "alpha {\n}\n".into());
    let actions = session.code_actions_for(uri, point(0, 0), &[], &[]);
    let barrel = code_action(&actions, "Barrel page into container…");
    assert_eq!(barrel.kind.as_ref().map(|kind| kind.as_str()), Some("source.barrelPage"));
    assert_eq!(
        barrel.command.as_ref().map(|command| command.command.as_str()),
        Some("reqlan.barrelPage")
    );
    assert!(barrel.command.as_ref().is_some_and(|command| command.arguments.is_none()));
}

// Oracle: omits barrel page when only quickfix is requested or there are no ideas
#[test]
fn omits_barrel_page_when_only_quickfix_is_requested_or_there_are_no_ideas() {
    let mut session = Session::new();
    let uri = "file:///barrel-omit.rq";
    session.open(uri, "alpha {\n}\n".into());
    let quickfix = session.code_actions_for(uri, point(0, 0), &[], &["quickfix".into()]);
    assert!(!titles(&quickfix).contains(&"Barrel page into container…"));
    session.open(uri, "\n".into());
    let empty = session.code_actions_for(uri, point(0, 0), &[], &[]);
    assert!(!titles(&empty).contains(&"Barrel page into container…"));
}

// Index rows supply the same add-import path as an open buffer.
#[test]
fn offers_add_import_from_the_ideas_index() {
    let root = scratch("index-import");
    fs::create_dir_all(root.join(".reqlan")).unwrap();
    let db = root.join(".reqlan").join("ideas-index.sqlite");
    let mut store = IndexStore::open(&db).unwrap();
    let lib = root.join("lib.rq");
    fs::write(&lib, "indexed_idea {\n}\n").unwrap();
    index_one_file(&mut store, &root, lib.to_str().unwrap()).unwrap();
    drop(store);

    let mut session = Session::new();
    session.set_workspace_folders(std::slice::from_ref(&root));
    let uri = file_uri(&root.join("host.rq"));
    session.open(&uri, "host {\n    [indexed_idea]\n}\n".into());
    let diagnostics = session.diagnostics(&uri);
    let unresolved: Vec<_> =
        diagnostics.into_iter().filter(|d| d.message.contains("indexed_idea")).collect();
    let actions = session.code_actions_for(&uri, unresolved[0].range, &unresolved, &[]);
    let add = code_action(&actions, "Add import from \"./lib.rq\"");
    assert!(edit_text(add).contains("import indexed_idea"));
    let _ = fs::remove_dir_all(root);
}

fn first_edit<'a>(action: &'a lsp_types::CodeAction) -> &'a lsp_types::TextEdit {
    action
        .edit
        .as_ref()
        .and_then(|edit| edit.changes.as_ref())
        .and_then(|changes| changes.values().next())
        .and_then(|edits| edits.first())
        .expect("expected text edit")
}

fn apply_text_edit(text: &str, edit: &lsp_types::TextEdit) -> String {
    let lines: Vec<&str> = text.split('\n').collect();
    let start_line = edit.range.start.line as usize;
    let start_char = edit.range.start.character as usize;
    let end_line = edit.range.end.line as usize;
    let end_char = edit.range.end.character as usize;
    let mut start_off = 0usize;
    for (index, line) in lines.iter().enumerate() {
        if index == start_line {
            start_off += start_char.min(line.len());
            break;
        }
        start_off += line.len() + 1;
    }
    let mut end_off = 0usize;
    for (index, line) in lines.iter().enumerate() {
        if index == end_line {
            end_off += end_char.min(line.len());
            break;
        }
        end_off += line.len() + 1;
    }
    format!("{}{}{}", &text[..start_off], edit.new_text, &text[end_off..])
}

fn add_import_applied(host_text: &str, title: &str) -> String {
    let root = scratch("add-import-cases");
    let lib = root.join("lib.rq");
    let other = root.join("other.rq");
    let host = root.join("host.rq");
    fs::write(&lib, "beta {\n}\n").unwrap();
    fs::write(&other, "alpha {\n}\n").unwrap();
    let host_uri = file_uri(&host);
    let mut session = Session::new();
    session.open(&file_uri(&lib), "beta {\n}\n".into());
    session.open(&file_uri(&other), "alpha {\n}\n".into());
    session.open(&host_uri, host_text.into());
    let diagnostics = session.diagnostics(&host_uri);
    let unresolved: Vec<_> =
        diagnostics.into_iter().filter(|d| d.message.contains("'beta'")).collect();
    assert!(!unresolved.is_empty(), "expected unresolved beta");
    let actions = session.code_actions_for(&host_uri, unresolved[0].range, &unresolved, &[]);
    let add = code_action(&actions, title);
    let applied = apply_text_edit(host_text, first_edit(add));
    let _ = fs::remove_dir_all(root);
    applied
}

// Oracle: inserts a new from-import after an existing different-path from-import (blank line kept)
#[test]
fn inserts_new_from_import_after_existing_from_import_with_blank_line() {
    let host = "from \"./other.rq\" import alpha\n\nhost {\n    [beta]\n}\n";
    let applied = add_import_applied(host, "Add import from \"./lib.rq\"");
    assert_eq!(
        applied,
        "from \"./other.rq\" import alpha\nfrom \"./lib.rq\" import beta\n\nhost {\n    [beta]\n}\n"
    );
}

// Oracle: inserts a new from-import after an existing from-import with no blank line
#[test]
fn inserts_new_from_import_after_existing_from_import_without_blank_line() {
    let host = "from \"./other.rq\" import alpha\nhost {\n    [beta]\n}\n";
    let applied = add_import_applied(host, "Add import from \"./lib.rq\"");
    assert_eq!(
        applied,
        "from \"./other.rq\" import alpha\nfrom \"./lib.rq\" import beta\nhost {\n    [beta]\n}\n"
    );
}

// Oracle: inserts a new from-import after an existing namespace import
#[test]
fn inserts_new_from_import_after_existing_namespace_import() {
    let host = "import \"./other.rq\" as other\n\nhost {\n    [beta]\n}\n";
    let applied = add_import_applied(host, "Add import from \"./lib.rq\"");
    assert_eq!(
        applied,
        "import \"./other.rq\" as other\nfrom \"./lib.rq\" import beta\n\nhost {\n    [beta]\n}\n"
    );
}

const CREATE_ALL_IN_FILE: &str = "Create all unresolved ideas in this file";
const CREATE_ALL_IN_NEW_FILE: &str = "Create all unresolved ideas in a new file…";

// Oracle: appends every unresolved local idea at the end of the file
#[test]
fn appends_every_unresolved_local_idea_at_the_end_of_the_file() {
    let mut session = Session::new();
    let uri = "file:///create-all.rq";
    let text = "alpha {\n    [beta_missing]\n}\ngamma {\n    [delta_missing]\n}\n";
    session.open(uri, text.into());
    let actions = session.code_actions_for(uri, point(4, 6), &[], &[]);
    let found = titles(&actions);
    assert!(found.contains(&CREATE_ALL_IN_FILE), "{found:?}");
    assert!(found.contains(&"Create 'delta_missing' below"), "{found:?}");
    assert!(!found.contains(&"Create 'beta_missing' below"), "{found:?}");
    let create = code_action(&actions, CREATE_ALL_IN_FILE);
    assert_eq!(create.kind.as_ref().map(|kind| kind.as_str()), Some("quickfix"));
    assert_eq!(edit_text(create), "\nbeta_missing {\n    \n}\n\ndelta_missing {\n    \n}\n");
    let edit = create.edit.as_ref().unwrap().changes.as_ref().unwrap().values().next().unwrap();
    assert_eq!(edit[0].range.start, Position { line: 6, character: 0 });
    assert_eq!(edit[0].range.end, Position { line: 6, character: 0 });
}

// Oracle: offers one new file for every unresolved local idea
#[test]
fn offers_one_new_file_for_every_unresolved_local_idea() {
    let mut session = Session::new();
    let uri = "file:///create-all-new.rq";
    session.open(uri, "alpha {\n    [beta_missing]\n}\ngamma {\n    [delta_missing]\n}\n".into());
    let actions = session.code_actions_for(uri, point(0, 0), &[], &[]);
    let create = code_action(&actions, CREATE_ALL_IN_NEW_FILE);
    assert_eq!(create.kind.as_ref().map(|kind| kind.as_str()), Some("quickfix"));
    let command = create.command.as_ref().unwrap();
    assert_eq!(command.command, "reqlan.importError.createFile");
    let args = command.arguments.as_ref().unwrap();
    assert_eq!(args[0]["documentUri"], uri);
    assert_eq!(args[0]["refText"], "beta_missing");
    let names = args[0]["refTexts"].as_array().unwrap();
    assert_eq!(names.len(), 2);
    assert_eq!(names[0], "beta_missing");
    assert_eq!(names[1], "delta_missing");
}

// Oracle: creates one stub when the same unresolved name occurs twice
#[test]
fn creates_one_stub_when_the_same_unresolved_name_occurs_twice() {
    let mut session = Session::new();
    let uri = "file:///create-all-dup.rq";
    session.open(uri, "alpha {\n    [beta_missing]\n}\ngamma {\n    [beta_missing]\n}\n".into());
    let actions = session.code_actions_for(uri, point(0, 0), &[], &[]);
    let text = edit_text(code_action(&actions, CREATE_ALL_IN_FILE));
    assert_eq!(text.matches("beta_missing").count(), 1, "{text}");
    let args = code_action(&actions, CREATE_ALL_IN_NEW_FILE)
        .command
        .as_ref()
        .unwrap()
        .arguments
        .as_ref()
        .unwrap();
    assert_eq!(args[0]["refTexts"].as_array().unwrap().len(), 1);
}

// Oracle: omits file-level create when a qualified reference is unresolved
#[test]
fn omits_file_level_create_when_a_qualified_reference_is_unresolved() {
    let mut session = Session::new();
    let uri = "file:///create-all-qualified.rq";
    session.open(
        uri,
        "from \"./missing.rq\" import ghost\nconsumer {\n    [\"./missing.rq\".ghost]\n}\n".into(),
    );
    let diagnostics = session.diagnostics(uri);
    let actions = session.code_actions_for(uri, point(2, 8), &diagnostics, &[]);
    let found = titles(&actions);
    assert!(!found.contains(&CREATE_ALL_IN_FILE), "{found:?}");
    assert!(!found.contains(&CREATE_ALL_IN_NEW_FILE), "{found:?}");
}

// Oracle: omits file-level create when only refactor is requested
#[test]
fn omits_file_level_create_when_only_refactor_is_requested() {
    let mut session = Session::new();
    let uri = "file:///create-all-refactor.rq";
    session.open(uri, "alpha {\n    [beta_missing]\n}\n".into());
    let diagnostics = session.diagnostics(uri);
    let actions = session.code_actions_for(uri, point(1, 6), &diagnostics, &["refactor".into()]);
    assert!(titles(&actions).iter().all(|title| !title.starts_with("Create all unresolved")));
}

// Oracle: offers file-level create when the caret idea is resolved
#[test]
fn offers_file_level_create_when_the_caret_idea_is_resolved() {
    let mut session = Session::new();
    let uri = "file:///create-all-other.rq";
    session.open(uri, "alpha {\n    [beta_missing]\n}\nbeta {\n    local body\n}\n".into());
    let actions = session.code_actions_for(uri, point(3, 6), &[], &[]);
    let found = titles(&actions);
    assert!(found.iter().all(|title| !title.contains("below")), "{found:?}");
    assert!(found.contains(&CREATE_ALL_IN_FILE), "{found:?}");
    assert!(found.contains(&CREATE_ALL_IN_NEW_FILE), "{found:?}");
    assert_eq!(edit_text(code_action(&actions, CREATE_ALL_IN_FILE)), "\nbeta_missing {\n    \n}\n");
}

// Oracle: inserts a from-import at the top when the file has no imports
#[test]
fn inserts_from_import_at_top_when_file_has_no_imports() {
    let host = "host {\n    [beta]\n}\n";
    let applied = add_import_applied(host, "Add import from \"./lib.rq\"");
    assert_eq!(applied, "from \"./lib.rq\" import beta\n\nhost {\n    [beta]\n}\n");
}
