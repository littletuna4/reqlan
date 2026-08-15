//! Wall-clock parse budget for a single .rq file.
//! rq:["../../../reqlan rq/language/parser_lexer.rq".parse_budget_timeout]
//! rq:["../../../reqlan rq/core_analysis/rust_port.rq".parser_rust]

use std::time::{Duration, Instant};

/// Default wall-clock budget for lex+parse of one file.
pub const DEFAULT_PARSE_BUDGET: Duration = Duration::from_millis(8_000);

/// Test-only sentinel: treat as a hang until the budget expires.
pub const PARSE_HANG_SENTINEL: &str = "__REQLAN_PARSE_HANG__";

pub const PARSE_TIMEOUT_WARNING: &str =
    "Parse budget exceeded for this file; semantic features may be incomplete until the file is simplified or the budget is raised.";

#[derive(Debug, Clone, Copy)]
pub struct ParseBudget {
    deadline: Instant,
}

impl ParseBudget {
    pub fn new(limit: Duration) -> Self {
        Self { deadline: Instant::now() + limit }
    }

    pub fn default_limit() -> Self {
        Self::new(DEFAULT_PARSE_BUDGET)
    }

    pub fn unlimited() -> Self {
        Self { deadline: Instant::now() + Duration::from_secs(60 * 60) }
    }

    pub fn expired(&self) -> bool {
        Instant::now() >= self.deadline
    }

    pub fn remaining(&self) -> Duration {
        self.deadline.saturating_duration_since(Instant::now())
    }
}

pub fn parse_timeout_error_message(timeout_ms: u64) -> String {
    format!(
        "Failed to lex/parse this file within {timeout_ms}ms; left unloaded so the rest of the workspace can continue."
    )
}
