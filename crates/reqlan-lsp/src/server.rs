//! stdio language server loop.
//! rq:["../../../reqlan rq/extension/language/support/language-server-rust.rq".language_server_rust]
//! rq:["../../../reqlan rq/extension/language/support/open-file-sequencing.rq".open_file_algorithm]
//! rq:["../../../reqlan rq/extension/language/support/open-file-sequencing.rq".lazy_features_after_outbound]
//! rq:["../../../reqlan rq/extension/language/support/ts-lsp-vs-rust-gaps.rq".lsp_incremental_sync]
//! rq:["../../../reqlan rq/extension/language/support/ts-lsp-vs-rust-gaps.rq".lsp_work_progress]
use crate::analysis::AttributeCatalog;
use crate::duty::{
    cancelled_response, title_for, tracked_method, work_token, Duty, PROGRESS_DELAY,
};
use crate::session::{is_rq_uri, Session};
use lsp_server::{Connection, Message, Notification, Request, Response};
use lsp_types::{
    CodeActionParams, CodeLensParams, CompletionOptions, CompletionParams,
    DidChangeTextDocumentParams, DidCloseTextDocumentParams, DidOpenTextDocumentParams,
    DocumentHighlightParams, DocumentLinkOptions, DocumentLinkParams, DocumentSymbolParams,
    FoldingRangeParams, GotoDefinitionParams, HoverParams, HoverProviderCapability,
    InitializeParams, InlayHintParams, OneOf, PublishDiagnosticsParams, ReferenceParams,
    ReferencesOptions, RenameOptions, RenameParams, SelectionRangeParams,
    SemanticTokensFullOptions, SemanticTokensLegend, SemanticTokensOptions, SemanticTokensParams,
    ServerCapabilities, TextDocumentPositionParams, TextDocumentSyncCapability,
    TextDocumentSyncKind, TextDocumentSyncOptions, Url, WorkDoneProgressOptions,
    WorkspaceSymbolOptions, WorkspaceSymbolParams,
};
use serde_json::Value;
use std::collections::HashMap;
use std::path::PathBuf;

pub fn serve() -> Result<(), Box<dyn std::error::Error + Sync + Send>> {
    let (connection, io_threads) = Connection::stdio();
    let caps = serde_json::to_value(server_capabilities())?;
    let init = connection.initialize(caps)?;
    let mut duty = Duty::new(&connection.sender, &connection.receiver, PROGRESS_DELAY);
    let mut session = Session::new();
    if let Ok(params) = serde_json::from_value::<InitializeParams>(init) {
        let folders = workspace_folders(&params);
        session.set_workspace_folders(&folders);
        let progress =
            params.capabilities.window.as_ref().and_then(|window| window.work_done_progress)
                == Some(true);
        duty.set_progress_supported(progress);
        if let Some(options) = params.initialization_options.as_ref() {
            if let Some(enabled) =
                options.get("ideaContentTooltip").and_then(|value| value.as_bool())
            {
                session.set_idea_content_tooltip(enabled);
            }
            if let Some(enabled) =
                options.get("referenceInlayHints").and_then(|value| value.as_bool())
            {
                session.set_reference_inlay_hints(enabled);
            }
        }
    }
    let mut confirm = PendingConfirm::default();
    loop {
        let message = if let Some(message) = duty.pop_deferred() {
            message
        } else {
            match connection.receiver.try_recv() {
                Ok(message) => message,
                Err(error) if error.is_disconnected() => break,
                Err(_) if confirm.is_empty() => match connection.receiver.recv() {
                    Ok(message) => message,
                    Err(_) => break,
                },
                Err(_) => {
                    if let ConfirmStep::Publish(notes) = confirm.run_one(&mut session, &mut duty) {
                        for publish in notes {
                            let _ = connection.sender.send(Message::Notification(publish));
                        }
                    }
                    continue;
                }
            }
        };
        match message {
            Message::Request(request) => {
                if connection.handle_shutdown(&request).unwrap_or(false) {
                    break;
                }
                if let Some(response) = duty.reject_if_cancelled(&request.id) {
                    let _ = connection.sender.send(Message::Response(response));
                    continue;
                }
                let id = request.id.clone();
                let token =
                    tracked_method(&request.method).then(|| work_token(&request.params)).flatten();
                duty.begin_request(id.clone(), token, title_for(&request.method));
                let response = dispatch_request(&mut session, &mut duty, request);
                let response = if duty.finish() { cancelled_response(id) } else { response };
                let _ = connection.sender.send(Message::Response(response));
            }
            Message::Notification(notification) => {
                if notification.method == "exit" {
                    break;
                }
                if notification.method == "$/cancelRequest" {
                    duty.note_cancel_params(&notification.params);
                    continue;
                }
                for publish in dispatch_notification(&mut session, &mut confirm, notification) {
                    let _ = connection.sender.send(Message::Notification(publish));
                }
            }
            Message::Response(_) => {}
        }
    }
    // Drop the writer so the stdout thread can finish. Join waits on that thread.
    drop(connection);
    io_threads.join()?;
    Ok(())
}

fn progress_on() -> WorkDoneProgressOptions {
    WorkDoneProgressOptions { work_done_progress: Some(true) }
}

fn server_capabilities() -> ServerCapabilities {
    ServerCapabilities {
        text_document_sync: Some(TextDocumentSyncCapability::Options(TextDocumentSyncOptions {
            open_close: Some(true),
            change: Some(TextDocumentSyncKind::INCREMENTAL),
            ..TextDocumentSyncOptions::default()
        })),
        definition_provider: Some(OneOf::Left(true)),
        document_highlight_provider: Some(OneOf::Left(true)),
        document_link_provider: Some(DocumentLinkOptions {
            resolve_provider: Some(false),
            work_done_progress_options: WorkDoneProgressOptions::default(),
        }),
        hover_provider: Some(HoverProviderCapability::Simple(true)),
        semantic_tokens_provider: Some(
            SemanticTokensOptions {
                legend: SemanticTokensLegend {
                    token_types: vec![
                        "type".into(),
                        "namespace".into(),
                        "variable".into(),
                        "string".into(),
                        "decorator".into(),
                        "operator".into(),
                        "keyword".into(),
                        "method".into(),
                    ],
                    token_modifiers: vec!["definition".into()],
                },
                range: Some(false),
                full: Some(SemanticTokensFullOptions::Bool(true)),
                ..SemanticTokensOptions::default()
            }
            .into(),
        ),
        inlay_hint_provider: Some(OneOf::Left(true)),
        code_lens_provider: Some(lsp_types::CodeLensOptions { resolve_provider: Some(false) }),
        completion_provider: Some(CompletionOptions {
            trigger_characters: Some(vec![
                "[".into(),
                "@".into(),
                ".".into(),
                "/".into(),
                "\"".into(),
            ]),
            work_done_progress_options: progress_on(),
            ..CompletionOptions::default()
        }),
        code_action_provider: Some(lsp_types::CodeActionProviderCapability::Simple(true)),
        rename_provider: Some(OneOf::Right(RenameOptions {
            prepare_provider: Some(true),
            work_done_progress_options: progress_on(),
        })),
        references_provider: Some(OneOf::Right(ReferencesOptions {
            work_done_progress_options: progress_on(),
        })),
        document_symbol_provider: Some(OneOf::Left(true)),
        folding_range_provider: Some(lsp_types::FoldingRangeProviderCapability::Simple(true)),
        selection_range_provider: Some(lsp_types::SelectionRangeProviderCapability::Simple(true)),
        workspace_symbol_provider: Some(OneOf::Right(WorkspaceSymbolOptions {
            work_done_progress_options: progress_on(),
            resolve_provider: None,
        })),
        ..ServerCapabilities::default()
    }
}

#[allow(deprecated)]
fn workspace_folders(params: &InitializeParams) -> Vec<PathBuf> {
    let mut folders = Vec::new();
    if let Some(list) = &params.workspace_folders {
        for folder in list {
            if let Ok(path) = folder.uri.to_file_path() {
                folders.push(path);
            }
        }
    }
    if folders.is_empty() {
        if let Some(root) = params.root_uri.as_ref().and_then(|uri| uri.to_file_path().ok()) {
            folders.push(root);
        }
    }
    folders
}

/// The confirm pass after a hot publish. It runs only while no client message waits,
/// so a hover or a definition request never queues behind it.
#[derive(Default)]
struct PendingConfirm {
    uris: Vec<String>,
    comments: bool,
}

enum ConfirmStep {
    Publish(Vec<Notification>),
    Interrupted,
}

impl PendingConfirm {
    fn is_empty(&self) -> bool {
        self.uris.is_empty() && !self.comments
    }

    fn push(&mut self, uri: &str) {
        if !self.uris.iter().any(|pending| pending == uri) {
            self.uris.push(uri.to_string());
        }
        self.comments |= is_rq_uri(uri);
    }

    /// A waiting client message keeps the URI and publishes nothing.
    fn run_one(&mut self, session: &mut Session, duty: &mut Duty) -> ConfirmStep {
        if !self.uris.is_empty() {
            let uri = self.uris[0].clone();
            duty.begin_background("Checking references");
            let diagnostics = session.diagnostics_checked(&uri, duty);
            let stopped = duty.finish();
            if diagnostics.is_err() || stopped {
                return ConfirmStep::Interrupted;
            }
            self.uris.remove(0);
            return ConfirmStep::Publish(vec![publish_with(diagnostics.unwrap_or_default(), &uri)]);
        }
        self.comments = false;
        ConfirmStep::Publish(republish_comments(session))
    }
}

fn dispatch_notification(
    session: &mut Session,
    confirm: &mut PendingConfirm,
    notification: Notification,
) -> Vec<Notification> {
    match notification.method.as_str() {
        "textDocument/didOpen" => {
            let Ok(params) =
                serde_json::from_value::<DidOpenTextDocumentParams>(notification.params)
            else {
                return Vec::new();
            };
            let uri = params.text_document.uri.as_ref().to_string();
            session.open(&uri, params.text_document.text);
            confirm.push(&uri);
            vec![publish_hot(session, &uri)]
        }
        "textDocument/didChange" => {
            let Ok(params) =
                serde_json::from_value::<DidChangeTextDocumentParams>(notification.params)
            else {
                return Vec::new();
            };
            let uri = params.text_document.uri.as_ref().to_string();
            if !session.apply_content_changes(&uri, &params.content_changes) {
                return Vec::new();
            }
            confirm.push(&uri);
            vec![publish_hot(session, &uri)]
        }
        "textDocument/didClose" => {
            let Ok(params) =
                serde_json::from_value::<DidCloseTextDocumentParams>(notification.params)
            else {
                return Vec::new();
            };
            let uri = params.text_document.uri.as_ref().to_string();
            session.close(&uri);
            confirm.uris.retain(|pending| pending != &uri);
            confirm.comments |= is_rq_uri(&uri);
            vec![empty_publish(&uri)]
        }
        "reqlan/inboundSnapshot" => {
            note_snapshot(session, &notification.params);
            Vec::new()
        }
        "reqlan/settings" => {
            if let Some(enabled) =
                notification.params.get("ideaContentTooltip").and_then(|value| value.as_bool())
            {
                session.set_idea_content_tooltip(enabled);
            }
            if let Some(enabled) =
                notification.params.get("referenceInlayHints").and_then(|value| value.as_bool())
            {
                session.set_reference_inlay_hints(enabled);
            }
            Vec::new()
        }
        "reqlan/attributeCatalog" => {
            note_attribute_catalog(session, &notification.params);
            Vec::new()
        }
        "reqlan/bases" => {
            note_bases(session, &notification.params);
            Vec::new()
        }
        _ => Vec::new(),
    }
}

fn republish_comments(session: &mut Session) -> Vec<Notification> {
    session.comment_uris().into_iter().map(|uri| publish(session, &uri)).collect()
}

fn referencer_from_snapshot(row: &Value) -> Option<crate::analysis::InboundReferencer> {
    let name = row.get("name").and_then(|value| value.as_str())?.to_string();
    let uri = row.get("uri").and_then(|value| value.as_str()).unwrap_or("").to_string();
    let line = row.get("line").and_then(|value| value.as_u64()).unwrap_or(0) as u32;
    Some(crate::analysis::InboundReferencer { name, uri, line })
}

fn note_snapshot(session: &mut Session, params: &Value) {
    let Some(snapshots) = params.get("snapshots").and_then(|value| value.as_array()) else {
        return;
    };
    for snapshot in snapshots {
        let Some(uri) = snapshot.get("documentUri").and_then(|value| value.as_str()) else {
            continue;
        };
        let mut names = Vec::new();
        if let Some(by_name) = snapshot.get("byIdeaName").and_then(|value| value.as_object()) {
            for (name, rows) in by_name {
                let referencers = rows
                    .as_array()
                    .map(|rows| {
                        rows.iter().filter_map(referencer_from_snapshot).collect::<Vec<_>>()
                    })
                    .unwrap_or_default();
                names.push((name.clone(), referencers));
            }
        }
        let file_referencers = snapshot
            .get("fileReferencers")
            .and_then(|value| value.as_array())
            .map(|rows| rows.iter().filter_map(referencer_from_snapshot).collect())
            .unwrap_or_default();
        session.note_inbound(uri, names, file_referencers);
    }
}

fn note_attribute_catalog(session: &mut Session, params: &Value) {
    let keys = params
        .get("keys")
        .and_then(|value| value.as_array())
        .map(|rows| {
            rows.iter().filter_map(|row| row.as_str().map(str::to_string)).collect::<Vec<_>>()
        })
        .unwrap_or_default();
    let mut values_by_key = HashMap::new();
    if let Some(map) = params.get("valuesByKey").and_then(|value| value.as_object()) {
        for (key, values) in map {
            let list = values
                .as_array()
                .map(|rows| {
                    rows.iter().filter_map(|row| row.as_str().map(str::to_string)).collect()
                })
                .unwrap_or_default();
            values_by_key.insert(key.clone(), list);
        }
    }
    let mut catalog = AttributeCatalog::endorsed();
    for key in keys {
        if !catalog.keys.iter().any(|existing| existing == &key) {
            catalog.keys.push(key);
        }
    }
    catalog.keys.sort();
    for (key, values) in values_by_key {
        catalog.values_by_key.insert(key, values);
    }
    session.note_attribute_catalog(catalog);
}

fn note_bases(session: &mut Session, params: &Value) {
    let Some(roots) = params.get("roots").and_then(|value| value.as_array()) else {
        return;
    };
    let paths =
        roots.iter().filter_map(|root| root.as_str().map(PathBuf::from)).collect::<Vec<_>>();
    session.note_base_roots(&paths);
}

fn publish_hot(session: &mut Session, uri: &str) -> Notification {
    publish_with(session.diagnostics_hot(uri), uri)
}

fn publish(session: &mut Session, uri: &str) -> Notification {
    publish_with(session.diagnostics(uri), uri)
}

fn publish_with(diagnostics: Vec<lsp_types::Diagnostic>, uri: &str) -> Notification {
    let params = PublishDiagnosticsParams {
        uri: Url::parse(uri).unwrap_or_else(|_| Url::parse("file:///reqlan.rq").expect("uri")),
        diagnostics,
        version: None,
    };
    Notification {
        method: "textDocument/publishDiagnostics".into(),
        params: serde_json::to_value(params).unwrap_or(Value::Null),
    }
}

fn empty_publish(uri: &str) -> Notification {
    let params = PublishDiagnosticsParams {
        uri: Url::parse(uri).unwrap_or_else(|_| Url::parse("file:///reqlan.rq").expect("uri")),
        diagnostics: Vec::new(),
        version: None,
    };
    Notification {
        method: "textDocument/publishDiagnostics".into(),
        params: serde_json::to_value(params).unwrap_or(Value::Null),
    }
}

fn dispatch_request(session: &mut Session, duty: &mut Duty, request: Request) -> Response {
    let id = request.id.clone();
    let result = match request.method.as_str() {
        "textDocument/definition" => {
            let params: GotoDefinitionParams = match serde_json::from_value(request.params) {
                Ok(params) => params,
                Err(_) => return err(id.clone()),
            };
            json_opt(session.definition(
                params.text_document_position_params.text_document.uri.as_ref(),
                params.text_document_position_params.position,
            ))
        }
        "textDocument/documentHighlight" => {
            let params: DocumentHighlightParams = match serde_json::from_value(request.params) {
                Ok(params) => params,
                Err(_) => return err(id.clone()),
            };
            json(session.highlights(
                doc_uri(&params.text_document_position_params),
                params.text_document_position_params.position,
            ))
        }
        "textDocument/documentLink" => {
            let params: DocumentLinkParams = match serde_json::from_value(request.params) {
                Ok(params) => params,
                Err(_) => return err(id.clone()),
            };
            json(session.links(params.text_document.uri.as_ref()))
        }
        "textDocument/hover" => {
            let params: HoverParams = match serde_json::from_value(request.params) {
                Ok(params) => params,
                Err(_) => return err(id.clone()),
            };
            json_opt(session.hover(
                doc_uri(&params.text_document_position_params),
                params.text_document_position_params.position,
            ))
        }
        "textDocument/semanticTokens/full" => {
            let params: SemanticTokensParams = match serde_json::from_value(request.params) {
                Ok(params) => params,
                Err(_) => return err(id.clone()),
            };
            json_opt(session.semantic_tokens(params.text_document.uri.as_ref()))
        }
        "textDocument/inlayHint" => {
            let params: InlayHintParams = match serde_json::from_value(request.params) {
                Ok(params) => params,
                Err(_) => return err(id.clone()),
            };
            json(session.inlays(params.text_document.uri.as_ref()))
        }
        "textDocument/codeLens" => {
            let params: CodeLensParams = match serde_json::from_value(request.params) {
                Ok(params) => params,
                Err(_) => return err(id.clone()),
            };
            json(session.code_lenses(params.text_document.uri.as_ref()))
        }
        "textDocument/completion" => {
            let params: CompletionParams = match serde_json::from_value(request.params) {
                Ok(params) => params,
                Err(_) => return err(id.clone()),
            };
            match session.completion_with(
                doc_uri(&params.text_document_position),
                params.text_document_position.position,
                duty,
            ) {
                Ok(list) => json(list),
                Err(_) => return cancelled_response(id.clone()),
            }
        }
        "textDocument/codeAction" => {
            let params: CodeActionParams = match serde_json::from_value(request.params) {
                Ok(params) => params,
                Err(_) => return err(id.clone()),
            };
            let only = params
                .context
                .only
                .unwrap_or_default()
                .into_iter()
                .map(|kind| kind.as_str().to_string())
                .collect::<Vec<_>>();
            json(session.code_actions_for(
                params.text_document.uri.as_ref(),
                params.range,
                &params.context.diagnostics,
                &only,
            ))
        }
        "textDocument/prepareRename" => {
            let params: TextDocumentPositionParams = match serde_json::from_value(request.params) {
                Ok(params) => params,
                Err(_) => return err(id.clone()),
            };
            json_opt(session.prepare_rename(params.text_document.uri.as_ref(), params.position))
        }
        "textDocument/rename" => {
            let params: RenameParams = match serde_json::from_value(request.params) {
                Ok(params) => params,
                Err(_) => return err(id.clone()),
            };
            match session.rename_with(
                params.text_document_position.text_document.uri.as_ref(),
                params.text_document_position.position,
                &params.new_name,
                duty,
            ) {
                Ok(edit) => json_opt(edit),
                Err(_) => return cancelled_response(id.clone()),
            }
        }
        "textDocument/references" => {
            let params: ReferenceParams = match serde_json::from_value(request.params) {
                Ok(params) => params,
                Err(_) => return err(id.clone()),
            };
            match session.references_with(
                params.text_document_position.text_document.uri.as_ref(),
                params.text_document_position.position,
                duty,
            ) {
                Ok(locations) => json(locations),
                Err(_) => return cancelled_response(id.clone()),
            }
        }
        "textDocument/documentSymbol" => {
            let params: DocumentSymbolParams = match serde_json::from_value(request.params) {
                Ok(params) => params,
                Err(_) => return err(id.clone()),
            };
            json_opt(session.document_symbols(params.text_document.uri.as_ref()))
        }
        "textDocument/foldingRange" => {
            let params: FoldingRangeParams = match serde_json::from_value(request.params) {
                Ok(params) => params,
                Err(_) => return err(id.clone()),
            };
            json(session.folding_ranges(params.text_document.uri.as_ref()))
        }
        "textDocument/selectionRange" => {
            let params: SelectionRangeParams = match serde_json::from_value(request.params) {
                Ok(params) => params,
                Err(_) => return err(id.clone()),
            };
            json_opt(session.selection_ranges(params.text_document.uri.as_ref(), &params.positions))
        }
        "workspace/symbol" => {
            let params: WorkspaceSymbolParams = match serde_json::from_value(request.params) {
                Ok(params) => params,
                Err(_) => return err(id.clone()),
            };
            match session.workspace_symbols_with(&params.query, duty) {
                Ok(symbols) => json(symbols),
                Err(_) => return cancelled_response(id.clone()),
            }
        }
        "reqlan/fileReferenceAt" => {
            custom_position(session, request.params, Session::file_reference_at)
        }
        "reqlan/wildcardReferenceAt" => {
            custom_position(session, request.params, Session::wildcard_at)
        }
        "reqlan/referenceSearchSite" => {
            let uri = request
                .params
                .get("uri")
                .and_then(|value| value.as_str())
                .unwrap_or("")
                .to_string();
            let range =
                serde_json::from_value(request.params.get("range").cloned().unwrap_or(Value::Null))
                    .ok();
            json_opt(range.and_then(|range| session.search_site(&uri, range)))
        }
        _ => Value::Null,
    };
    Response { id, result: Some(result), error: None }
}

fn custom_position(
    session: &mut Session,
    params: Value,
    call: fn(&Session, &str, lsp_types::Position) -> Option<Value>,
) -> Value {
    let uri = params.get("uri").and_then(|value| value.as_str()).unwrap_or("");
    let Ok(position) =
        serde_json::from_value(params.get("position").cloned().unwrap_or(Value::Null))
    else {
        return Value::Null;
    };
    call(session, uri, position).unwrap_or(Value::Null)
}

fn doc_uri(params: &TextDocumentPositionParams) -> &str {
    params.text_document.uri.as_ref()
}

fn json<T: serde::Serialize>(value: T) -> Value {
    serde_json::to_value(value).unwrap_or(Value::Null)
}

fn json_opt<T: serde::Serialize>(value: Option<T>) -> Value {
    value.map(json).unwrap_or(Value::Null)
}

fn err(id: lsp_server::RequestId) -> Response {
    Response { id, result: Some(Value::Null), error: None }
}

#[cfg(test)]
mod tests {
    use super::*;
    use lsp_server::Message;
    use std::time::Duration;

    /// rq:["../../../reqlan rq/extension/language/support/ts-lsp-vs-rust-gaps.rq".lsp_work_progress]
    #[test]
    fn aborted_confirm_keeps_the_uri() {
        let mut session = Session::new();
        let uri = "file:///confirm.rq";
        session.open(uri, "host {\n    [missing]\n}\n".into());
        let mut confirm = PendingConfirm::default();
        confirm.push(uri);
        let (to_server, server_rx) = crossbeam_channel::unbounded();
        let (server_tx, from_server) = crossbeam_channel::unbounded();
        let mut duty = Duty::new(&server_tx, &server_rx, Duration::from_secs(60));
        to_server
            .send(Message::Notification(Notification {
                method: "textDocument/didChange".into(),
                params: serde_json::json!({
                    "textDocument": { "uri": uri },
                    "contentChanges": []
                }),
            }))
            .unwrap();
        let step = confirm.run_one(&mut session, &mut duty);
        assert!(matches!(step, ConfirmStep::Interrupted));
        assert_eq!(confirm.uris, vec![uri.to_string()]);
        assert!(from_server.try_recv().is_err(), "stale confirm must not publish");
        assert!(duty.pop_deferred().is_some());
    }
}
