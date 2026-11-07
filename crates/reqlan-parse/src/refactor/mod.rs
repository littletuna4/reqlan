//! Pure-text plans for moving or deleting an idea.
//! The host supplies file texts. This module does not read the disk or the index.
//! rq:["../../../reqlan rq/extension/mutation/refactor_support.rq".refactor_symbol_move]
//! rq:["../../../reqlan rq/extension/mutation/refactor_support.rq".refactor_symbol_delete]
//! rq:["../../../reqlan rq/extension/mutation/refactor_support.rq".comment_reference_refactor_support]
//! rq:["../../../reqlan rq/extension/mutation/refactor_native_planner.rq".refactor_native_planner]

mod comments;
mod decl;
mod edits;
mod imports;
mod pathing;
mod plan;
mod refs;
mod types;
mod walk;

pub use plan::{plan_idea_delete, plan_idea_move};
pub use types::{DocumentEdits, FileText, PlanError, TextEdit};
