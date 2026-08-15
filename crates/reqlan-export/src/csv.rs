use crate::json::ExportError;
use crate::types::{ExportIdea, ExportRequest, ExportResult, ExportSnapshot};
use std::fs;

pub fn write_csv_export(
    snapshot: &ExportSnapshot,
    request: &ExportRequest,
) -> Result<ExportResult, ExportError> {
    let output_dir = request.output_dir.join(&request.export_name);
    fs::create_dir_all(&output_dir)?;
    let ideas_path = output_dir.join("ideas.csv");
    let references_path = output_dir.join("references.csv");
    fs::write(&ideas_path, render_ideas_csv(snapshot))?;
    fs::write(&references_path, render_references_csv(snapshot))?;
    Ok(ExportResult {
        output_dir,
        index_file_path: ideas_path.clone(),
        print_file_path: ideas_path,
        data_file_path: references_path,
        ..ExportResult::default()
    })
}

fn render_ideas_csv(snapshot: &ExportSnapshot) -> String {
    let mut lines = vec!["id,name,kind,fileUri,lineStart,status,tags,summary".to_string()];
    for idea in &snapshot.ideas {
        lines.push(idea_row(idea));
    }
    lines.join("\n") + "\n"
}

fn idea_row(idea: &ExportIdea) -> String {
    [
        csv_escape(&idea.id),
        csv_escape(&idea.name),
        csv_escape(&idea.kind),
        csv_escape(&idea.file_uri),
        idea.line_start.to_string(),
        csv_escape(idea.status.as_deref().unwrap_or("")),
        csv_escape(&idea.tags.join(";")),
        csv_escape(&idea.summary),
    ]
    .join(",")
}

fn render_references_csv(snapshot: &ExportSnapshot) -> String {
    let mut lines = vec!["ideaId,name,outbound,inbound".to_string()];
    for idea in &snapshot.ideas {
        lines.push(format!(
            "{},{},{},{}",
            csv_escape(&idea.id),
            csv_escape(&idea.name),
            idea.outbound_count(),
            idea.inbound_count()
        ));
    }
    lines.join("\n") + "\n"
}

pub fn csv_escape(value: &str) -> String {
    if value.contains([',', '"', '\n', '\r']) {
        format!("\"{}\"", value.replace('"', "\"\""))
    } else {
        value.to_string()
    }
}
