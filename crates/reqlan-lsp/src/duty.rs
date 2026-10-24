//! Request cancellation and work-done progress for the language-server loop.
//! rq:["../../../reqlan rq/extension/language/support/ts-lsp-vs-rust-gaps.rq".lsp_work_progress]
use crossbeam_channel::{Receiver, Sender};
use lsp_server::{ErrorCode, Message, Request, RequestId, Response};
use lsp_types::{
    ProgressParams, ProgressParamsValue, ProgressToken, WorkDoneProgress, WorkDoneProgressBegin,
    WorkDoneProgressCreateParams, WorkDoneProgressEnd, WorkDoneProgressReport,
};
use serde_json::Value;
use std::collections::{HashSet, VecDeque};
use std::time::{Duration, Instant};

pub const PROGRESS_DELAY: Duration = Duration::from_millis(150);

/// A walk stopped because the client cancelled it or a newer message is waiting.
pub struct Stopped;

/// Polled from a long walk. `true` means the walk must stop.
pub trait Checkpoint {
    fn tick(&mut self, message: &str, done: u32, total: u32) -> bool;
}

/// Checkpoint that never stops. Callers outside the server loop use this.
pub struct Idle;

impl Checkpoint for Idle {
    fn tick(&mut self, _message: &str, _done: u32, _total: u32) -> bool {
        false
    }
}

/// Inbox, cancel set, and progress token for one server loop.
pub struct Duty<'a> {
    sender: &'a Sender<Message>,
    receiver: &'a Receiver<Message>,
    deferred: VecDeque<Message>,
    cancelled: HashSet<RequestId>,
    progress_supported: bool,
    delay: Duration,
    current_id: Option<RequestId>,
    client_token: Option<ProgressToken>,
    active_token: Option<ProgressToken>,
    title: &'static str,
    started: Instant,
    begun: bool,
    interruptible: bool,
    yielded: bool,
    current_cancelled: bool,
    pending_create: Option<(RequestId, ProgressToken)>,
    create_ready: bool,
    next_progress: i32,
    report_sent: bool,
    report_percent: u32,
}

impl<'a> Duty<'a> {
    pub fn new(
        sender: &'a Sender<Message>,
        receiver: &'a Receiver<Message>,
        delay: Duration,
    ) -> Self {
        Self {
            sender,
            receiver,
            deferred: VecDeque::new(),
            cancelled: HashSet::new(),
            progress_supported: false,
            delay,
            current_id: None,
            client_token: None,
            active_token: None,
            title: "",
            started: Instant::now(),
            begun: false,
            interruptible: false,
            yielded: false,
            current_cancelled: false,
            pending_create: None,
            create_ready: false,
            next_progress: 1,
            report_sent: false,
            report_percent: 0,
        }
    }

    pub fn set_progress_supported(&mut self, supported: bool) {
        self.progress_supported = supported;
    }

    pub fn note_cancel_params(&mut self, params: &Value) {
        let Some(id) = params.get("id") else {
            return;
        };
        if let Some(n) = id.as_i64().and_then(|n| i32::try_from(n).ok()) {
            self.note_cancel(RequestId::from(n));
        } else if let Some(text) = id.as_str() {
            self.note_cancel(RequestId::from(text.to_string()));
        }
    }

    pub fn note_cancel(&mut self, id: RequestId) {
        if self.current_id.as_ref() == Some(&id) {
            self.current_cancelled = true;
        } else {
            self.cancelled.insert(id);
        }
    }

    /// `Some` when this id was cancelled before the handler starts.
    pub fn reject_if_cancelled(&mut self, id: &RequestId) -> Option<Response> {
        if self.cancelled.remove(id) {
            Some(cancelled_response(id.clone()))
        } else {
            None
        }
    }

    pub fn begin_request(
        &mut self,
        id: RequestId,
        token: Option<ProgressToken>,
        title: &'static str,
    ) {
        self.current_id = Some(id);
        self.client_token = token.clone();
        self.active_token = token;
        self.title = title;
        self.started = Instant::now();
        self.begun = false;
        self.interruptible = false;
        self.yielded = false;
        self.current_cancelled = false;
        self.pending_create = None;
        self.create_ready = false;
        self.report_sent = false;
    }

    pub fn begin_background(&mut self, title: &'static str) {
        self.current_id = None;
        self.client_token = None;
        self.active_token = None;
        self.title = title;
        self.started = Instant::now();
        self.begun = false;
        self.interruptible = true;
        self.yielded = false;
        self.current_cancelled = false;
        self.pending_create = None;
        self.create_ready = false;
        self.report_sent = false;
    }

    /// Sends progress end when a bar was opened. `true` means the caller must drop its result.
    pub fn finish(&mut self) -> bool {
        let inbox_stopped = self.poll();
        let stopped = inbox_stopped || self.current_cancelled || self.yielded;
        if self.begun {
            self.send_end();
        }
        self.begun = false;
        self.client_token = None;
        self.active_token = None;
        self.current_id = None;
        self.current_cancelled = false;
        self.interruptible = false;
        self.yielded = false;
        self.pending_create = None;
        self.create_ready = false;
        self.title = "";
        stopped
    }

    pub fn pop_deferred(&mut self) -> Option<Message> {
        self.deferred.pop_front()
    }

    fn checkpoint(&mut self, message: &str, done: u32, total: u32) -> bool {
        if self.poll() || self.current_cancelled {
            return true;
        }
        self.maybe_begin();
        if self.begun {
            self.send_report(message, done, total);
        }
        false
    }

    /// `true` when the walk must stop.
    fn poll(&mut self) -> bool {
        loop {
            match self.receiver.try_recv() {
                Ok(message) => {
                    if self.ingest(message) {
                        return true;
                    }
                }
                Err(_) => return false,
            }
        }
    }

    /// `true` when this message ends the current walk.
    fn ingest(&mut self, message: Message) -> bool {
        match message {
            Message::Notification(notification) if notification.method == "$/cancelRequest" => {
                self.note_cancel_params(&notification.params);
                self.current_cancelled
            }
            Message::Notification(notification)
                if notification.method == "window/workDoneProgress/cancel" =>
            {
                if self.token_matches(&notification.params) {
                    self.current_cancelled = true;
                }
                self.current_cancelled
            }
            Message::Response(response)
                if self.pending_create.as_ref().is_some_and(|(id, _)| id == &response.id) =>
            {
                self.create_ready = response.error.is_none();
                if !self.create_ready {
                    self.pending_create = None;
                }
                false
            }
            Message::Response(_) => false,
            other => {
                self.deferred.push_back(other);
                if self.interruptible {
                    self.yielded = true;
                }
                self.interruptible
            }
        }
    }

    fn token_matches(&self, params: &Value) -> bool {
        let Some(token) = params.get("token") else {
            return false;
        };
        let Ok(token) = serde_json::from_value::<ProgressToken>(token.clone()) else {
            return false;
        };
        self.active_token.as_ref() == Some(&token)
    }

    fn maybe_begin(&mut self) {
        if self.begun || self.started.elapsed() < self.delay {
            return;
        }
        if let Some(token) = self.client_token.clone() {
            self.send_begin(token);
            return;
        }
        if !self.interruptible || !self.progress_supported {
            return;
        }
        if self.pending_create.is_none() {
            self.next_progress += 1;
            let token = ProgressToken::String(format!("reqlan-{}", self.next_progress));
            let id = RequestId::from(format!("reqlan-progress-{}", self.next_progress));
            let request = Request::new(
                id.clone(),
                "window/workDoneProgress/create".into(),
                WorkDoneProgressCreateParams { token: token.clone() },
            );
            let _ = self.sender.send(Message::Request(request));
            self.pending_create = Some((id, token));
        }
        if self.create_ready {
            if let Some((_, token)) = self.pending_create.clone() {
                self.send_begin(token);
            }
        }
    }

    fn send_begin(&mut self, token: ProgressToken) {
        self.active_token = Some(token.clone());
        self.begun = true;
        self.send_progress(
            token,
            WorkDoneProgress::Begin(WorkDoneProgressBegin {
                title: self.title.to_string(),
                cancellable: Some(true),
                message: None,
                percentage: Some(0),
            }),
        );
    }

    fn send_report(&mut self, message: &str, done: u32, total: u32) {
        let Some(token) = self.active_token.clone() else {
            return;
        };
        let percentage = (total > 0).then(|| (done.saturating_mul(100) / total).min(100));
        let percent = percentage.unwrap_or(0);
        if self.report_sent && self.report_percent == percent {
            return;
        }
        self.report_sent = true;
        self.report_percent = percent;
        self.send_progress(
            token,
            WorkDoneProgress::Report(WorkDoneProgressReport {
                cancellable: Some(true),
                message: (!message.is_empty()).then(|| message.to_string()),
                percentage,
            }),
        );
    }

    fn send_end(&self) {
        let Some(token) = self.active_token.clone() else {
            return;
        };
        self.send_progress(token, WorkDoneProgress::End(WorkDoneProgressEnd { message: None }));
    }

    fn send_progress(&self, token: ProgressToken, value: WorkDoneProgress) {
        let params = ProgressParams { token, value: ProgressParamsValue::WorkDone(value) };
        let notification = lsp_server::Notification {
            method: "$/progress".into(),
            params: serde_json::to_value(params).unwrap_or(Value::Null),
        };
        let _ = self.sender.send(Message::Notification(notification));
    }
}

impl Checkpoint for Duty<'_> {
    fn tick(&mut self, message: &str, done: u32, total: u32) -> bool {
        self.checkpoint(message, done, total)
    }
}

pub fn cancelled_response(id: RequestId) -> Response {
    Response::new_err(id, ErrorCode::RequestCanceled as i32, "canceled".into())
}

pub fn work_token(params: &Value) -> Option<ProgressToken> {
    params.get("workDoneToken").and_then(|token| serde_json::from_value(token.clone()).ok())
}

pub fn tracked_method(method: &str) -> bool {
    matches!(
        method,
        "textDocument/references"
            | "textDocument/rename"
            | "textDocument/completion"
            | "workspace/symbol"
    )
}

pub fn title_for(method: &str) -> &'static str {
    match method {
        "textDocument/references" => "Finding references",
        "textDocument/rename" => "Renaming",
        "textDocument/completion" => "Completing",
        "workspace/symbol" => "Searching workspace",
        _ => "",
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use lsp_server::Notification;

    fn pair(delay: Duration) -> (Duty<'static>, Sender<Message>, Receiver<Message>) {
        let (to_server, server_rx) = crossbeam_channel::unbounded();
        let (server_tx, from_server) = crossbeam_channel::unbounded();
        let server_tx: &'static Sender<Message> = Box::leak(Box::new(server_tx));
        let server_rx: &'static Receiver<Message> = Box::leak(Box::new(server_rx));
        (Duty::new(server_tx, server_rx, delay), to_server, from_server)
    }

    fn progress_kinds(rx: &Receiver<Message>) -> Vec<(String, String)> {
        let mut out = Vec::new();
        while let Ok(message) = rx.try_recv() {
            let Message::Notification(notification) = message else {
                continue;
            };
            if notification.method != "$/progress" {
                continue;
            }
            let token =
                notification.params.get("token").and_then(|token| token.as_str()).unwrap_or("");
            let kind = notification
                .params
                .get("value")
                .and_then(|value| value.get("kind"))
                .and_then(|kind| kind.as_str())
                .unwrap_or("");
            out.push((token.to_string(), kind.to_string()));
        }
        out
    }

    /// rq:["../../../reqlan rq/extension/language/support/ts-lsp-vs-rust-gaps.rq".lsp_work_progress]
    #[test]
    fn cancel_before_the_request_skips_the_handler() {
        let (mut duty, _to_server, _from_server) = pair(Duration::from_secs(60));
        let id = RequestId::from(3);
        duty.note_cancel(id.clone());
        let mut parsed = false;
        let response = duty.reject_if_cancelled(&id).unwrap_or_else(|| {
            parsed = true;
            Response::new_ok(id, Value::Null)
        });
        assert!(!parsed);
        assert_eq!(response.error.expect("error").code, ErrorCode::RequestCanceled as i32);
        assert!(response.result.is_none());
    }

    /// rq:["../../../reqlan rq/extension/language/support/ts-lsp-vs-rust-gaps.rq".lsp_work_progress]
    #[test]
    fn checkpoint_cancel_stops_the_walk() {
        let (mut duty, to_server, _from_server) = pair(Duration::from_secs(60));
        let id = RequestId::from(4);
        duty.begin_request(id.clone(), None, "Finding references");
        assert!(!duty.checkpoint("a.rq", 0, 2));
        to_server
            .send(Message::Notification(Notification {
                method: "$/cancelRequest".into(),
                params: serde_json::json!({ "id": 4 }),
            }))
            .unwrap();
        assert!(duty.checkpoint("b.rq", 1, 2));
        let mut produced = false;
        if !duty.current_cancelled {
            produced = true;
        }
        assert!(!produced);
        assert!(duty.finish());
    }

    /// rq:["../../../reqlan rq/extension/language/support/ts-lsp-vs-rust-gaps.rq".lsp_work_progress]
    #[test]
    fn progress_reports_on_the_client_token() {
        let (mut duty, _to_server, from_server) = pair(Duration::ZERO);
        duty.begin_request(
            RequestId::from(5),
            Some(ProgressToken::String("tok".into())),
            "Finding references",
        );
        assert!(!duty.checkpoint("a.rq", 0, 2));
        assert!(!duty.checkpoint("b.rq", 1, 2));
        assert!(!duty.finish());
        assert_eq!(
            progress_kinds(&from_server),
            vec![
                ("tok".into(), "begin".into()),
                ("tok".into(), "report".into()),
                ("tok".into(), "report".into()),
                ("tok".into(), "end".into()),
            ]
        );
    }

    /// rq:["../../../reqlan rq/extension/language/support/ts-lsp-vs-rust-gaps.rq".lsp_work_progress]
    #[test]
    fn progress_stays_quiet_inside_the_delay() {
        let (mut duty, _to_server, from_server) = pair(Duration::from_secs(60));
        duty.begin_request(
            RequestId::from(6),
            Some(ProgressToken::String("tok".into())),
            "Finding references",
        );
        assert!(!duty.checkpoint("a.rq", 0, 1));
        assert!(!duty.finish());
        assert!(progress_kinds(&from_server).is_empty());
    }

    /// rq:["../../../reqlan rq/extension/language/support/ts-lsp-vs-rust-gaps.rq".lsp_work_progress]
    #[test]
    fn progress_collapses_one_percentage() {
        let (mut duty, _to_server, from_server) = pair(Duration::ZERO);
        duty.begin_request(
            RequestId::from(7),
            Some(ProgressToken::String("tok".into())),
            "Searching workspace",
        );
        assert!(!duty.checkpoint("a", 0, 1_000));
        assert!(!duty.checkpoint("b", 1, 1_000));
        assert!(!duty.finish());
        assert_eq!(
            progress_kinds(&from_server),
            vec![
                ("tok".into(), "begin".into()),
                ("tok".into(), "report".into()),
                ("tok".into(), "end".into()),
            ]
        );
    }
}
