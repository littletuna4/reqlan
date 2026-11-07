//! Native text-edit planners for barrel and refactor operations.
//! rq:["../../../reqlan rq/core_analysis/rust_port.rq".native_bridge]

use napi::bindgen_prelude::*;
use napi_derive::napi;

/// Plan a barrel transform from source text (no filesystem writes).
/// The TS wrapper performs the writes; this keeps the plan engine native.
/// rq:["../../../reqlan rq/extension/host/features-commands.rq".barrel_page]
// Exported via napi to `@reqlan/analytical` (load-native.ts); `#[no_mangle]`
// exports are not counted as live roots by the dead_code lint.
#[allow(dead_code)]
#[napi]
pub fn barrel_page_plan(
    source: String,
    container_name: Option<String>,
    source_file_name: String,
) -> Result<serde_json::Value> {
    let plan =
        reqlan_parse::plan_barrel_page(&source, container_name.as_deref(), &source_file_name)
            .map_err(Error::from_reason)?;
    Ok(serde_json::json!({
        "containerName": plan.container_name,
        "containerContent": plan.container_content,
        "children": plan
            .children
            .iter()
            .map(|child| serde_json::json!({
                "ideaName": child.idea_name,
                "fileName": child.file_name,
                "content": child.content,
            }))
            .collect::<Vec<_>>(),
        "preservedIdeasets": plan.preserved_ideasets,
    }))
}
// Helpers of the napi-exported planners above.
#[allow(dead_code)]
fn parse_planner_files(files_json: &str) -> Result<Vec<reqlan_parse::FileText>> {
    #[derive(serde::Deserialize)]
    struct Wire {
        uri: String,
        text: String,
    }
    let wires: Vec<Wire> = serde_json::from_str(files_json)
        .map_err(|error| Error::from_reason(format!("bad files: {error}")))?;
    Ok(wires
        .into_iter()
        .map(|file| reqlan_parse::FileText { uri: file.uri, text: file.text })
        .collect())
}

#[allow(dead_code)]
fn planner_json(docs: Vec<reqlan_parse::DocumentEdits>) -> serde_json::Value {
    serde_json::json!({
        "documents": docs.iter().map(|doc| serde_json::json!({
            "uri": doc.uri,
            "edits": doc.edits.iter().map(|edit| serde_json::json!({
                "range": {
                    "start": { "line": edit.start_line, "character": edit.start_character },
                    "end": { "line": edit.end_line, "character": edit.end_character }
                },
                "newText": edit.new_text
            })).collect::<Vec<_>>()
        })).collect::<Vec<_>>()
    })
}

/// Plan idea-delete edits from source text and extra file texts.
/// rq:["../../../reqlan rq/extension/mutation/refactor_support.rq".refactor_symbol_delete]
#[allow(dead_code)]
#[napi(js_name = "planIdeaDelete")]
pub fn plan_idea_delete(
    source_uri: String,
    source: String,
    idea_name: String,
    files_json: String,
) -> Result<serde_json::Value> {
    let files = parse_planner_files(&files_json)?;
    let docs = reqlan_parse::plan_idea_delete(&source_uri, &source, &idea_name, &files);
    Ok(planner_json(docs))
}

/// Plan idea-move edits from source and destination text.
/// rq:["../../../reqlan rq/extension/mutation/refactor_support.rq".refactor_symbol_move]
#[allow(dead_code)]
#[napi(js_name = "planIdeaMove")]
pub fn plan_idea_move(
    source_uri: String,
    source: String,
    dest_uri: String,
    dest: String,
    idea_name: String,
    leave_stub: bool,
    files_json: String,
) -> Result<serde_json::Value> {
    let files = parse_planner_files(&files_json)?;
    let docs = reqlan_parse::plan_idea_move(
        &source_uri,
        &source,
        &dest_uri,
        &dest,
        &idea_name,
        leave_stub,
        &files,
    )
    .map_err(|error| Error::from_reason(error.to_string()))?;
    Ok(planner_json(docs))
}
