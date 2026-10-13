//! Code actions that match the Langium provider titles and commands.
//! rq:["../../../reqlan rq/extension/language/vsc-primitives.rq".code_actions]
//! rq:["../../../reqlan rq/extension/language/support/language-server-rust.rq".language_server_rust]
use crate::analysis::{walk_refs, NameLoc};
use crate::utf16::LineMap;
use lsp_types::{
    CodeAction, CodeActionKind, CodeActionOrCommand, Command, Diagnostic, Position, Range,
    TextEdit, Url, WorkspaceEdit,
};
use reqlan_index::find_rq_ignore_error_target_lines;
use reqlan_parse::{Import, Model, ReferenceTarget, Span, TopLevelElement};
use std::collections::{HashMap, HashSet};

const SEARCH_COMMAND: &str = "reqlan.searchReference";
const CREATE_FILE_COMMAND: &str = "reqlan.importError.createFile";
const DELETE_COMMAND: &str = "reqlan.refactor.deleteIdea";
const MOVE_COMMAND: &str = "reqlan.refactor.moveIdea";
const MOVE_CONTENT_COMMAND: &str = "reqlan.refactor.moveIdeaContent";
const BARREL_COMMAND: &str = "reqlan.barrelPage";
const BARREL_KIND: &str = "source.barrelPage";
const MAX_IMPORT_SUGGESTIONS: usize = 5;

#[derive(Clone)]
pub struct SymbolHit {
    pub name: String,
    pub kind: String,
    pub file_uri: String,
}

pub struct ActionRequest<'a> {
    pub text: &'a str,
    pub lines: &'a LineMap,
    pub model: &'a Model,
    pub names: &'a [NameLoc],
    pub range: Range,
    pub doc_uri: &'a str,
    pub context_diagnostics: &'a [Diagnostic],
    pub only: &'a [String],
    pub server_diagnostics: &'a [Diagnostic],
    pub symbols: &'a [SymbolHit],
}

pub fn collect(request: ActionRequest<'_>) -> Vec<CodeActionOrCommand> {
    let mut actions = Vec::new();
    let mut searched = HashSet::new();
    for diagnostic in request.context_diagnostics {
        if let Some(name) =
            local_unresolved_name(request.model, request.lines, request.text, diagnostic)
        {
            push_import_fixes(&request, diagnostic, &name, &mut searched, &mut actions);
        }
    }
    if kind_allowed(request.only, "quickfix") {
        push_ignore(&request, &mut actions);
        push_create_below(&request, &mut actions);
    }
    push_search_or_wrap(&request, &searched, &mut actions);
    push_refactor(&request, &mut actions);
    push_barrel(&request, &mut actions);
    actions
}

fn push_import_fixes(
    request: &ActionRequest<'_>,
    diagnostic: &Diagnostic,
    name: &str,
    searched: &mut HashSet<String>,
    actions: &mut Vec<CodeActionOrCommand>,
) {
    let mut matches = matches_for(request, name);
    matches.truncate(MAX_IMPORT_SUGGESTIONS);
    let mut preferred = false;
    for hit in &matches {
        if hit.kind == "ideaset" || hit.kind == "file" {
            continue;
        }
        if let Some(edit) = from_import_edit(request, &hit.import_path, name) {
            actions.push(quick_fix(
                format!("Add import from \"{}\"", hit.import_path),
                request.doc_uri,
                edit,
                vec![diagnostic.clone()],
                !preferred,
            ));
            preferred = true;
        }
        actions.push(quick_fix(
            format!("Change to [\"{}\".{name}]", hit.import_path),
            request.doc_uri,
            TextEdit {
                range: diagnostic.range,
                new_text: format!("\"{}\".{name}", hit.import_path),
            },
            vec![diagnostic.clone()],
            false,
        ));
    }
    let title = format!("Search for idea to replace '{name}'…");
    searched.insert(name.to_string());
    actions.push(command_action(
        title,
        CodeActionKind::QUICKFIX,
        SEARCH_COMMAND,
        None,
        Some(diagnostic.clone()),
    ));
    let args = serde_json::json!({
        "documentUri": request.doc_uri,
        "refText": name,
        "range": serde_json::to_value(diagnostic.range).unwrap_or(serde_json::Value::Null),
    });
    actions.push(command_action(
        format!("Create '{name}' in a new file and import it…"),
        CodeActionKind::QUICKFIX,
        CREATE_FILE_COMMAND,
        Some(vec![args]),
        Some(diagnostic.clone()),
    ));
}

struct RankedMatch {
    import_path: String,
    kind: String,
}

fn matches_for(request: &ActionRequest<'_>, name: &str) -> Vec<RankedMatch> {
    let mut by_key: HashMap<String, RankedMatch> = HashMap::new();
    for hit in request.symbols {
        if hit.name != name || same_file(hit.file_uri.as_str(), request.doc_uri) {
            continue;
        }
        if hit.kind == "ideaset" || hit.kind == "file" {
            continue;
        }
        let Some(import_path) = relative_import_path(request.doc_uri, &hit.file_uri) else {
            continue;
        };
        let key = format!("{}:{}", hit.kind, hit.file_uri);
        by_key.entry(key).or_insert(RankedMatch { import_path, kind: hit.kind.clone() });
    }
    let mut matches: Vec<_> = by_key.into_values().collect();
    matches.sort_by(|left, right| {
        left.import_path
            .len()
            .cmp(&right.import_path.len())
            .then_with(|| left.import_path.cmp(&right.import_path))
    });
    matches
}

fn push_ignore(request: &ActionRequest<'_>, actions: &mut Vec<CodeActionOrCommand>) {
    let ignored = find_rq_ignore_error_target_lines(request.text);
    let mut by_line: HashMap<u32, Vec<Diagnostic>> = HashMap::new();
    for diagnostic in request.context_diagnostics {
        let line = diagnostic.range.start.line;
        if ignored.contains(&line) {
            continue;
        }
        by_line.entry(line).or_default().push(diagnostic.clone());
    }
    let mut lines: Vec<_> = by_line.keys().copied().collect();
    lines.sort_unstable();
    for line in lines {
        let diagnostics = by_line.remove(&line).unwrap_or_default();
        let edit = TextEdit {
            range: Range {
                start: Position { line, character: 0 },
                end: Position { line, character: 0 },
            },
            new_text: ignore_text(request.text, line),
        };
        actions.push(quick_fix(
            "Ignore error with //rq-ignore-error".into(),
            request.doc_uri,
            edit,
            diagnostics,
            false,
        ));
    }
}

fn ignore_text(text: &str, line: u32) -> String {
    let raw = text.lines().nth(line as usize).unwrap_or("");
    let indent_end = raw.find(|ch: char| ch != ' ' && ch != '\t').unwrap_or(raw.len());
    let indent = &raw[..indent_end];
    let hash = if raw.trim_start().starts_with('#') { "# " } else { "" };
    format!("{indent}{hash}//rq-ignore-error\n")
}

fn push_create_below(request: &ActionRequest<'_>, actions: &mut Vec<CodeActionOrCommand>) {
    let Some((span, names)) = unresolved_in_caret_idea(request) else {
        return;
    };
    let insert_at = request.lines.range(request.text, span.end, span.end).end;
    let range = Range { start: insert_at, end: insert_at };
    if names.len() > 1 {
        actions.push(quick_fix(
            "Create all unresolved ideas below".into(),
            request.doc_uri,
            TextEdit { range, new_text: idea_stubs(&names) },
            Vec::new(),
            false,
        ));
    }
    for name in &names {
        actions.push(quick_fix(
            format!("Create '{name}' below"),
            request.doc_uri,
            TextEdit { range, new_text: idea_stubs(std::slice::from_ref(name)) },
            Vec::new(),
            false,
        ));
    }
}

fn unresolved_in_caret_idea(request: &ActionRequest<'_>) -> Option<(Span, Vec<String>)> {
    let idea = containing_idea(request)?;
    let idea_range = request.lines.range(request.text, idea.start, idea.end);
    let mut names = Vec::new();
    walk_refs(request.model, &mut |target, _| {
        let ReferenceTarget::Local { span, idea: name } = target else {
            return;
        };
        if name.is_empty() {
            return;
        }
        let range = request.lines.range(request.text, span.start, span.end);
        if !range_inside(range, idea_range) {
            return;
        }
        let unresolved = request.server_diagnostics.iter().any(|diagnostic| {
            ranges_overlap(diagnostic.range, range)
                && unresolved_idea_name(&diagnostic.message) == Some(name.as_str())
        });
        if unresolved && !names.iter().any(|existing| existing == name) {
            names.push(name.clone());
        }
    });
    if names.is_empty() {
        None
    } else {
        Some((idea, names))
    }
}

fn containing_idea(request: &ActionRequest<'_>) -> Option<Span> {
    let offset = request.lines.byte_at(request.text, request.range.start);
    let mut best: Option<(Span, usize)> = None;
    for element in &request.model.elements {
        let span = match element {
            TopLevelElement::Idea(idea) => idea.span,
            TopLevelElement::OneLiner(idea) => idea.span,
            _ => continue,
        };
        if offset < span.start || offset > span.end {
            continue;
        }
        let size = span.end.saturating_sub(span.start);
        if best.as_ref().is_none_or(|(_, best_size)| size < *best_size) {
            best = Some((span, size));
        }
    }
    best.map(|(span, _)| span)
}

fn push_search_or_wrap(
    request: &ActionRequest<'_>,
    searched: &HashSet<String>,
    actions: &mut Vec<CodeActionOrCommand>,
) {
    if let Some((name, site)) = reference_at(request) {
        if searched.contains(&name)
            && request.context_diagnostics.iter().any(|diagnostic| {
                unresolved_idea_name(&diagnostic.message) == Some(name.as_str())
                    && ranges_overlap(diagnostic.range, site)
            })
        {
            return;
        }
        actions.push(command_action(
            format!("Search for idea to replace '{name}'…"),
            CodeActionKind::REFACTOR,
            SEARCH_COMMAND,
            None,
            None,
        ));
        return;
    }
    let Some(text) = wrap_text(request) else {
        return;
    };
    actions.push(command_action(
        format!("Wrap '{text}' as idea reference…"),
        CodeActionKind::REFACTOR,
        SEARCH_COMMAND,
        None,
        None,
    ));
}

fn reference_at(request: &ActionRequest<'_>) -> Option<(String, Range)> {
    let mut found = None;
    walk_refs(request.model, &mut |target, _| {
        let (span, name) = match target {
            ReferenceTarget::Local { span, idea } => (*span, idea.clone()),
            ReferenceTarget::Qualified { span, idea, .. } => (*span, idea.clone()),
            _ => return,
        };
        if name.is_empty() {
            return;
        }
        let range = request.lines.range(request.text, span.start, span.end);
        if ranges_overlap(range, request.range) || range_contains_pos(range, request.range.start) {
            found = Some((name, range));
        }
    });
    found
}

fn wrap_text(request: &ActionRequest<'_>) -> Option<String> {
    let range = if range_empty(request.range) {
        expand_word(request.text, request.lines, request.range.start)?
    } else {
        request.range
    };
    if request.names.iter().any(|name| ranges_overlap(name.range, range)) {
        return None;
    }
    if reference_covers(request, range) {
        return None;
    }
    let idea = containing_span_for(request, range.start)?;
    let end_probe =
        Position { line: range.end.line, character: range.end.character.saturating_sub(1) };
    containing_span_for(request, end_probe)
        .filter(|span| span.start == idea.start && span.end == idea.end)?;
    let start = request.lines.byte_at(request.text, range.start);
    let end = request.lines.byte_at(request.text, range.end);
    let text = request.text.get(start..end)?.trim();
    if text.is_empty() || text.contains('\n') || text.starts_with('[') {
        return None;
    }
    Some(text.to_string())
}

fn reference_covers(request: &ActionRequest<'_>, range: Range) -> bool {
    let mut covers = false;
    walk_refs(request.model, &mut |target, span| {
        let target_range = request.lines.range(request.text, span.start, span.end);
        if ranges_overlap(target_range, range) {
            let _ = target;
            covers = true;
        }
    });
    covers
}

fn containing_span_for(request: &ActionRequest<'_>, pos: Position) -> Option<Span> {
    let offset = request.lines.byte_at(request.text, pos);
    let mut best: Option<(Span, usize)> = None;
    for element in &request.model.elements {
        let span = match element {
            TopLevelElement::Idea(idea) => idea.span,
            TopLevelElement::OneLiner(idea) => idea.span,
            _ => continue,
        };
        if offset < span.start || offset > span.end {
            continue;
        }
        let size = span.end.saturating_sub(span.start);
        if best.as_ref().is_none_or(|(_, best_size)| size < *best_size) {
            best = Some((span, size));
        }
    }
    best.map(|(span, _)| span)
}

fn expand_word(text: &str, lines: &LineMap, pos: Position) -> Option<Range> {
    let start_byte = lines.byte_at(text, Position { line: pos.line, character: 0 });
    let end_byte = lines.byte_at(text, Position { line: pos.line, character: u32::MAX });
    let line = text.get(start_byte..end_byte)?.trim_end_matches(['\n', '\r']);
    let mut spans = Vec::new();
    let mut units = 0u32;
    let mut word_start = None;
    for ch in line.chars() {
        let width = if (ch as u32) > 0xFFFF { 2 } else { 1 };
        if ch.is_ascii_alphanumeric() || ch == '_' {
            if word_start.is_none() {
                word_start = Some(units);
            }
        } else if let Some(start) = word_start.take() {
            spans.push((start, units));
        }
        units += width;
    }
    if let Some(start) = word_start {
        spans.push((start, units));
    }
    let (start, end) =
        spans.into_iter().find(|(start, end)| pos.character >= *start && pos.character <= *end)?;
    Some(Range {
        start: Position { line: pos.line, character: start },
        end: Position { line: pos.line, character: end },
    })
}

fn push_refactor(request: &ActionRequest<'_>, actions: &mut Vec<CodeActionOrCommand>) {
    let Some(name) = declaration_at(request) else {
        return;
    };
    let idea_range = idea_range_named(request, &name).unwrap_or(request.range);
    let args = serde_json::json!({
        "documentUri": request.doc_uri,
        "ideaName": name,
        "range": serde_json::to_value(idea_range).unwrap_or(serde_json::Value::Null),
    });
    let commands = [
        (format!("Delete idea '{name}' and update references"), DELETE_COMMAND),
        (format!("Move idea '{name}' to another file…"), MOVE_COMMAND),
        (format!("Move idea '{name}' content to another file…"), MOVE_CONTENT_COMMAND),
    ];
    for (title, command) in commands {
        actions.push(command_action(
            title,
            CodeActionKind::REFACTOR,
            command,
            Some(vec![args.clone()]),
            None,
        ));
    }
}

fn declaration_at(request: &ActionRequest<'_>) -> Option<String> {
    request
        .names
        .iter()
        .find(|name| ranges_overlap(name.range, request.range))
        .map(|name| name.name.clone())
}

fn idea_range_named(request: &ActionRequest<'_>, name: &str) -> Option<Range> {
    for element in &request.model.elements {
        let (idea_name, span) = match element {
            TopLevelElement::Idea(idea) => (idea.name.as_str(), idea.span),
            TopLevelElement::OneLiner(idea) => (idea.name.as_str(), idea.span),
            TopLevelElement::IdeaSet(set) => (set.name.as_str(), set.span),
            TopLevelElement::Anonymous(_) => continue,
        };
        if idea_name == name {
            return Some(request.lines.range(request.text, span.start, span.end));
        }
    }
    None
}

fn push_barrel(request: &ActionRequest<'_>, actions: &mut Vec<CodeActionOrCommand>) {
    if !kind_allowed(request.only, BARREL_KIND) {
        return;
    }
    let has_idea =
        request.model.elements.iter().any(|element| matches!(element, TopLevelElement::Idea(_)));
    if !has_idea {
        return;
    }
    actions.push(command_action(
        "Barrel page into container…".into(),
        CodeActionKind::new(BARREL_KIND),
        BARREL_COMMAND,
        None,
        None,
    ));
}

fn from_import_edit(
    request: &ActionRequest<'_>,
    import_path: &str,
    name: &str,
) -> Option<TextEdit> {
    for import in &request.model.imports {
        let Import::From(from) = import else {
            continue;
        };
        if from.path != import_path {
            continue;
        }
        let already = from
            .specifiers
            .iter()
            .any(|spec| spec.alias.as_deref() == Some(name) || spec.idea == name);
        if already {
            return None;
        }
        // Specifier `span` includes the following comma/newline token; append after the
        // written name (alias or idea), matching Langium CST end-of-token placement.
        let end = from
            .specifiers
            .last()
            .map(|spec| spec.alias_span.as_ref().map(|span| span.end).unwrap_or(spec.idea_span.end))
            .unwrap_or(from.span.end);
        let at = request.lines.position(request.text, end);
        return Some(TextEdit {
            range: Range { start: at, end: at },
            new_text: format!(", {name}"),
        });
    }
    let (position, trailing) = import_insert_point(request);
    let line = format!("from \"{import_path}\" import {name}");
    let new_text = if trailing { format!("{line}\n\n") } else { format!("{line}\n") };
    Some(TextEdit { range: Range { start: position, end: position }, new_text })
}

fn import_insert_point(request: &ActionRequest<'_>) -> (Position, bool) {
    if let Some(import) = request.model.imports.last() {
        let span = match import {
            Import::From(from) => from.span,
            Import::Namespace(ns) => ns.span,
            Import::Qualified(qualified) => qualified.span,
            Import::InvalidFrom(invalid) => invalid.span,
        };
        // Import spans include the trailing newline token, so `span.end` is already the
        // start of the next line. Only advance when the span ends mid-line (EOF, no nl).
        let end = request.lines.position(request.text, span.end);
        let position =
            if end.character == 0 { end } else { Position { line: end.line + 1, character: 0 } };
        return (position, false);
    }
    if let Some(element) = request.model.elements.first() {
        let span = match element {
            TopLevelElement::Idea(idea) => idea.span,
            TopLevelElement::OneLiner(idea) => idea.span,
            TopLevelElement::IdeaSet(set) => set.span,
            TopLevelElement::Anonymous(block) => block.span,
        };
        return (request.lines.range(request.text, span.start, span.start).start, true);
    }
    (Position { line: 0, character: 0 }, true)
}

fn idea_stubs(names: &[String]) -> String {
    let stubs: Vec<_> = names.iter().map(|name| format!("{name} {{\n    \n}}")).collect();
    format!("\n\n{}\n", stubs.join("\n\n"))
}

fn local_unresolved_name(
    model: &Model,
    lines: &LineMap,
    text: &str,
    diagnostic: &Diagnostic,
) -> Option<String> {
    let name = unresolved_idea_name(&diagnostic.message)?.to_string();
    let mut local = false;
    let mut qualified = false;
    walk_refs(model, &mut |target, _| match target {
        ReferenceTarget::Local { span, idea } if idea == &name => {
            let range = lines.range(text, span.start, span.end);
            if ranges_overlap(range, diagnostic.range) {
                local = true;
            }
        }
        ReferenceTarget::Qualified { span, idea, .. } if idea == &name => {
            let range = lines.range(text, span.start, span.end);
            if ranges_overlap(range, diagnostic.range) {
                qualified = true;
            }
        }
        _ => {}
    });
    if local && !qualified {
        Some(name)
    } else {
        None
    }
}

fn unresolved_idea_name(message: &str) -> Option<&str> {
    message
        .strip_prefix("Could not resolve reference to IdeaDeclaration named '")?
        .strip_suffix("'.")
}

fn kind_allowed(only: &[String], kind: &str) -> bool {
    if only.is_empty() {
        return true;
    }
    only.iter().any(|requested| {
        requested == kind
            || kind.starts_with(&format!("{requested}."))
            || requested.starts_with(&format!("{kind}."))
    })
}

fn relative_import_path(from_uri: &str, to_uri: &str) -> Option<String> {
    let from = Url::parse(from_uri).ok()?.to_file_path().ok()?;
    let to = Url::parse(to_uri).ok()?.to_file_path().ok()?;
    let from_dir = from.parent()?;
    let from_parts: Vec<_> = from_dir.components().collect();
    let to_parts: Vec<_> = to.components().collect();
    let mut shared = 0;
    while shared < from_parts.len()
        && shared < to_parts.len()
        && from_parts[shared] == to_parts[shared]
    {
        shared += 1;
    }
    let mut parts = Vec::new();
    for _ in shared..from_parts.len() {
        parts.push("..".to_string());
    }
    for component in &to_parts[shared..] {
        parts.push(component.as_os_str().to_string_lossy().replace('\\', "/"));
    }
    let joined = if parts.is_empty() { ".".to_string() } else { parts.join("/") };
    if joined.starts_with("./") || joined.starts_with("../") {
        Some(joined)
    } else {
        Some(format!("./{joined}"))
    }
}

fn same_file(left: &str, right: &str) -> bool {
    if left == right {
        return true;
    }
    match (
        Url::parse(left).ok().and_then(|uri| uri.to_file_path().ok()),
        Url::parse(right).ok().and_then(|uri| uri.to_file_path().ok()),
    ) {
        (Some(left_path), Some(right_path)) => left_path == right_path,
        _ => false,
    }
}

fn quick_fix(
    title: String,
    doc_uri: &str,
    edit: TextEdit,
    diagnostics: Vec<Diagnostic>,
    preferred: bool,
) -> CodeActionOrCommand {
    let mut changes = HashMap::new();
    if let Ok(uri) = Url::parse(doc_uri) {
        changes.insert(uri, vec![edit]);
    }
    CodeActionOrCommand::CodeAction(CodeAction {
        title,
        kind: Some(CodeActionKind::QUICKFIX),
        diagnostics: (!diagnostics.is_empty()).then_some(diagnostics),
        is_preferred: preferred.then_some(true),
        edit: Some(WorkspaceEdit {
            changes: Some(changes),
            document_changes: None,
            change_annotations: None,
        }),
        ..CodeAction::default()
    })
}

fn command_action(
    title: String,
    kind: CodeActionKind,
    command: &str,
    arguments: Option<Vec<serde_json::Value>>,
    diagnostic: Option<Diagnostic>,
) -> CodeActionOrCommand {
    CodeActionOrCommand::CodeAction(CodeAction {
        title: title.clone(),
        kind: Some(kind),
        diagnostics: diagnostic.map(|item| vec![item]),
        command: Some(Command { title, command: command.into(), arguments }),
        ..CodeAction::default()
    })
}

fn range_empty(range: Range) -> bool {
    range.start.line == range.end.line && range.start.character == range.end.character
}

fn ranges_overlap(left: Range, right: Range) -> bool {
    if range_empty(left) {
        return range_contains_pos(right, left.start);
    }
    if range_empty(right) {
        return range_contains_pos(left, right.start);
    }
    position_lt(left.start, right.end) && position_lt(right.start, left.end)
}

fn range_inside(inner: Range, outer: Range) -> bool {
    position_leq(outer.start, inner.start) && position_leq(inner.end, outer.end)
}

fn range_contains_pos(range: Range, pos: Position) -> bool {
    position_leq(range.start, pos) && position_lt(pos, range.end)
}

fn position_leq(left: Position, right: Position) -> bool {
    left.line < right.line || (left.line == right.line && left.character <= right.character)
}

fn position_lt(left: Position, right: Position) -> bool {
    left.line < right.line || (left.line == right.line && left.character < right.character)
}
