//! The public move and delete planners.
//! rq:["../../../../reqlan rq/extension/mutation/refactor_native_planner.rq".refactor_native_planner]
//! rq:["../../../../reqlan rq/extension/mutation/refactor_support.rq".refactor_symbol_move]
//! rq:["../../../../reqlan rq/extension/mutation/refactor_support.rq".refactor_symbol_delete]

use crate::barrel::file_basename_alias;
use crate::parser::parse_document;
use std::collections::BTreeMap;

use super::comments::{clear_comments, rewrite_comments};
use super::decl::{bound_names, find_declaration, source_keeps_name, used_names_outside};
use super::edits::{edit_range, finish, full_line_range, push, LineMap};
use super::imports::{
    dest_required_import_edits, from_import_edit, idea_insert_position, namespace_alias_for_path,
    namespace_import_edit, unique_alias, unused_import_edits,
};
use super::pathing::{is_rq_uri, relative_import};
use super::refs::clear_name_hits;
use super::types::{DocumentEdits, FileText, PlanError, TextEdit};

//rq-ignore-error
/// Remove the idea and clear bracket, wiki, and `rq:[…]` hits of that name.
pub fn plan_idea_delete(
    source_uri: &str,
    source: &str,
    idea_name: &str,
    files: &[FileText],
) -> Vec<DocumentEdits> {
    let parsed = parse_document(source);
    let Some(decl) = find_declaration(&parsed.model, idea_name) else {
        return Vec::new();
    };
    let mut by_uri: BTreeMap<String, Vec<TextEdit>> = BTreeMap::new();
    let lines = LineMap::new(source);
    push(
        &mut by_uri,
        source_uri,
        edit_range(full_line_range(&lines, source, decl.span), String::new()),
    );
    clear_name_hits(&mut by_uri, source_uri, source, idea_name, Some(decl.span));
    clear_comments(&mut by_uri, source_uri, source, idea_name, Some(decl.span));
    for file in files {
        if file.uri == source_uri {
            continue;
        }
        if is_rq_uri(&file.uri) {
            clear_name_hits(&mut by_uri, &file.uri, &file.text, idea_name, None);
        }
        clear_comments(&mut by_uri, &file.uri, &file.text, idea_name, None);
    }
    finish(by_uri)
}

/// Move an idea into an existing file, or leave a one-liner stub when `leave_stub` is set.
pub fn plan_idea_move(
    source_uri: &str,
    source: &str,
    dest_uri: &str,
    dest: &str,
    idea_name: &str,
    leave_stub: bool,
    files: &[FileText],
) -> Result<Vec<DocumentEdits>, PlanError> {
    let source_parsed = parse_document(source);
    let dest_parsed = parse_document(dest);
    let decl = find_declaration(&source_parsed.model, idea_name).ok_or(PlanError::MissingIdea)?;
    if find_declaration(&dest_parsed.model, idea_name).is_some() {
        return Err(PlanError::DestinationHasIdea);
    }

    let idea_text = source.get(decl.span.start..decl.span.end).unwrap_or("").to_string();
    let source_lines = LineMap::new(source);
    let mut by_uri: BTreeMap<String, Vec<TextEdit>> = BTreeMap::new();

    let dest_import_path = relative_import(source_uri, dest_uri);
    let existing_alias = namespace_alias_for_path(&source_parsed.model, &dest_import_path);
    let stub_alias = if leave_stub {
        Some(existing_alias.clone().unwrap_or_else(|| {
            unique_alias(&file_basename_alias(dest_uri), &bound_names(&source_parsed.model))
        }))
    } else {
        None
    };

    let stub_text = match &stub_alias {
        Some(alias) => format!("{idea_name} [{alias}.{idea_name}]\n"),
        None => String::new(),
    };
    push(
        &mut by_uri,
        source_uri,
        edit_range(full_line_range(&source_lines, source, decl.span), stub_text),
    );

    let mut used_after = used_names_outside(&source_parsed.model, decl.span);
    if let Some(alias) = &stub_alias {
        used_after.insert(alias.clone());
    }
    for edit in unused_import_edits(source, &source_parsed.model, &used_after) {
        push(&mut by_uri, source_uri, edit);
    }

    let mut dest_import_edits = dest_required_import_edits(
        source_uri,
        &source_parsed.model,
        dest_uri,
        dest,
        &dest_parsed.model,
        decl.span,
    );
    let idea_at = idea_insert_position(dest, &dest_parsed.model);
    let mut inserted = false;
    for edit in &mut dest_import_edits {
        if edit.start_line == idea_at.line
            && edit.start_character == idea_at.character
            && edit.end_line == idea_at.line
            && edit.end_character == idea_at.character
        {
            edit.new_text = format!("{}{idea_text}\n", edit.new_text);
            inserted = true;
            break;
        }
    }
    if !inserted {
        push(
            &mut by_uri,
            dest_uri,
            TextEdit {
                start_line: idea_at.line,
                start_character: idea_at.character,
                end_line: idea_at.line,
                end_character: idea_at.character,
                new_text: format!("{idea_text}\n"),
            },
        );
    }
    for edit in dest_import_edits {
        push(&mut by_uri, dest_uri, edit);
    }

    if let Some(alias) = &stub_alias {
        if existing_alias.is_none() {
            if let Some(edit) =
                namespace_import_edit(source, &source_parsed.model, &dest_import_path, alias)
            {
                push(&mut by_uri, source_uri, edit);
            }
        }
    } else if source_keeps_name(&source_parsed.model, idea_name, decl.span) {
        if let Some(edit) =
            from_import_edit(source, &source_parsed.model, &dest_import_path, idea_name)
        {
            push(&mut by_uri, source_uri, edit);
        }
    }

    rewrite_comments(&mut by_uri, source_uri, source, source_uri, dest_uri, idea_name);
    rewrite_comments(&mut by_uri, dest_uri, dest, source_uri, dest_uri, idea_name);
    for file in files {
        if file.uri == source_uri || file.uri == dest_uri {
            continue;
        }
        rewrite_comments(&mut by_uri, &file.uri, &file.text, source_uri, dest_uri, idea_name);
    }

    Ok(finish(by_uri))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn apply(text: &str, edits: &[TextEdit]) -> String {
        let lines = LineMap::new(text);
        let mut items: Vec<(usize, usize, &str)> = edits
            .iter()
            .map(|edit| {
                (
                    lines.byte_at(text, edit.start_line, edit.start_character),
                    lines.byte_at(text, edit.end_line, edit.end_character),
                    edit.new_text.as_str(),
                )
            })
            .collect();
        items.sort_by(|left, right| right.0.cmp(&left.0).then(right.1.cmp(&left.1)));
        let mut result = text.to_string();
        for (start, end, new_text) in items {
            let end = end.min(result.len()).max(start.min(result.len()));
            let start = start.min(result.len());
            result = format!("{}{}{}", &result[..start], new_text, &result[end..]);
        }
        result
    }

    fn doc<'a>(planned: &'a [DocumentEdits], uri: &str) -> &'a DocumentEdits {
        planned.iter().find(|entry| entry.uri == uri).expect("document edits")
    }

    #[test]
    fn delete_plan_removes_declaration_and_bracket_references() {
        let source = "alpha {\n    body\n}\nbeta {\n    see [alpha]\n}\n";
        let uri = "file:///tmp/source.rq";
        let planned = plan_idea_delete(uri, source, "alpha", &[]);
        let text = apply(source, &doc(&planned, uri).edits);
        assert!(!text.contains("alpha {"));
        assert!(!text.contains("[alpha]"));
        assert!(text.contains("beta {"));
    }

    #[test]
    fn delete_plan_removes_matching_comment_references() {
        let source = "alpha {\n    body\n}\n";
        let uri = "file:///tmp/source.rq";
        let code = "file:///tmp/app.ts";
        let planned = plan_idea_delete(
            uri,
            source,
            "alpha",
            &[FileText { uri: code.into(), text: "// keep this rq:[alpha] here\n".into() }],
        );
        let code_edits = doc(&planned, code);
        assert_eq!(code_edits.edits.len(), 1);
        assert_eq!(code_edits.edits[0].new_text, "");
        let updated = apply("// keep this rq:[alpha] here\n", &code_edits.edits);
        assert_eq!(updated, "// keep this  here\n");
    }

    #[test]
    fn move_plan_cuts_from_source_and_inserts_into_destination() {
        let source = "alpha {\n    body\n}\n";
        let dest = "other {\n    keep\n}\n";
        let source_uri = "file:///tmp/source.rq";
        let dest_uri = "file:///tmp/dest.rq";
        let planned =
            plan_idea_move(source_uri, source, dest_uri, dest, "alpha", false, &[]).unwrap();
        let source_text = apply(source, &doc(&planned, source_uri).edits);
        let dest_text = apply(dest, &doc(&planned, dest_uri).edits);
        assert!(!source_text.contains("alpha {"));
        assert!(dest_text.contains("alpha {"));
        assert!(dest_text.contains("body"));
    }

    #[test]
    fn move_plan_rewrites_qualified_comment_paths_for_the_moved_idea() {
        let source = "alpha {\n    body\n}\nbeta {\n    stay\n}\n";
        let dest = "other {\n    keep\n}\n";
        let code = "file:///tmp/src/app.ts";
        let planned = plan_idea_move(
            "file:///tmp/a/source.rq",
            source,
            "file:///tmp/b/dest.rq",
            dest,
            "alpha",
            false,
            &[FileText {
                uri: code.into(),
                text: "// rq:[\"../a/source.rq\".alpha]\n// rq:[\"../a/source.rq\".beta]\n".into(),
            }],
        )
        .unwrap();
        let edits = &doc(&planned, code).edits;
        assert_eq!(edits.len(), 1);
        assert_eq!(edits[0].new_text, "\"../b/dest.rq\"");
    }

    #[test]
    fn move_plan_removes_unused_source_imports_and_copies_them_to_destination() {
        let source = "from \"./lib.rq\" import foo, stay\nalpha {\n    uses [foo]\n}\nbeta {\n    uses [stay]\n}\n";
        let dest = "other {\n    keep\n}\n";
        let source_uri = "file:///tmp/a/source.rq";
        let dest_uri = "file:///tmp/b/dest.rq";
        let planned =
            plan_idea_move(source_uri, source, dest_uri, dest, "alpha", false, &[]).unwrap();
        let source_text = apply(source, &doc(&planned, source_uri).edits);
        let dest_text = apply(dest, &doc(&planned, dest_uri).edits);
        assert!(!source_text.contains("import foo"));
        assert!(source_text.contains("from \"./lib.rq\" import stay"));
        assert!(!source_text.contains("alpha {"));
        assert!(dest_text.contains("from \"../a/lib.rq\" import foo"));
        assert!(dest_text.contains("alpha {"));
        assert!(dest_text.contains("uses [foo]"));
    }

    #[test]
    fn move_plan_adds_a_sibling_import_on_the_destination() {
        let source = "alpha {\n    uses [beta]\n}\nbeta {\n    stay\n}\n";
        let dest = "other {\n    keep\n}\n";
        let planned = plan_idea_move(
            "file:///tmp/source.rq",
            source,
            "file:///tmp/dest.rq",
            dest,
            "alpha",
            false,
            &[],
        )
        .unwrap();
        let dest_text = apply(dest, &doc(&planned, "file:///tmp/dest.rq").edits);
        assert!(dest_text.contains("from \"./source.rq\" import beta"));
        assert!(dest_text.contains("uses [beta]"));
    }

    #[test]
    fn move_content_plan_leaves_a_source_stub_that_imports_the_moved_idea() {
        let source = "from \"./lib.rq\" import foo\nalpha {\n    uses [foo]\n}\n";
        let dest = "other {\n    keep\n}\n";
        let source_uri = "file:///tmp/source.rq";
        let dest_uri = "file:///tmp/dest.rq";
        let planned =
            plan_idea_move(source_uri, source, dest_uri, dest, "alpha", true, &[]).unwrap();
        let source_text = apply(source, &doc(&planned, source_uri).edits);
        let dest_text = apply(dest, &doc(&planned, dest_uri).edits);
        assert!(source_text.contains("import \"./dest.rq\" as dest"));
        assert!(source_text.contains("alpha [dest.alpha]"));
        assert!(!source_text.contains("from \"./lib.rq\" import foo"));
        assert!(!source_text.contains("uses [foo]"));
        assert!(dest_text.contains("from \"./lib.rq\" import foo"));
        assert!(dest_text.contains("alpha {"));
        assert!(dest_text.contains("uses [foo]"));
    }

    #[test]
    fn move_rejects_a_destination_that_already_declares_the_idea() {
        let error = plan_idea_move(
            "file:///tmp/source.rq",
            "alpha {\n    body\n}\n",
            "file:///tmp/dest.rq",
            "alpha {\n    other\n}\n",
            "alpha",
            false,
            &[],
        );
        assert_eq!(error, Err(PlanError::DestinationHasIdea));
    }
}
