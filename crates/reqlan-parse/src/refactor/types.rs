//! Plan data types the host consumes.
//! rq:["../../../../reqlan rq/extension/mutation/refactor_native_planner.rq".refactor_native_planner]
//! rq:["../../../../reqlan rq/extension/mutation/refactor_support.rq".refactor_symbol_move]
//! rq:["../../../../reqlan rq/extension/mutation/refactor_support.rq".refactor_symbol_delete]

/// One file the host already loaded.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FileText {
    pub uri: String,
    pub text: String,
}

/// One LSP text edit. Columns are UTF-16 code units.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TextEdit {
    pub start_line: u32,
    pub start_character: u32,
    pub end_line: u32,
    pub end_character: u32,
    pub new_text: String,
}

/// Edits for one document, sorted for bottom-up application.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DocumentEdits {
    pub uri: String,
    pub edits: Vec<TextEdit>,
}

#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum PlanError {
    #[error("idea not found")]
    MissingIdea,
    #[error("destination already has this idea")]
    DestinationHasIdea,
}
// rq-ignore-error
