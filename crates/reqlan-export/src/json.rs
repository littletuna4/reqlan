use crate::types::{ExportRequest, ExportResult, ExportSnapshot};
use std::fs;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum ExportError {
    #[error("io: {0}")]
    Io(#[from] std::io::Error),
    #[error("json: {0}")]
    Json(#[from] serde_json::Error),
}

pub fn write_json_export(
    snapshot: &ExportSnapshot,
    request: &ExportRequest,
) -> Result<ExportResult, ExportError> {
    let output_dir = request.output_dir.join(&request.export_name);
    fs::create_dir_all(&output_dir)?;
    let index = output_dir.join("export.json");
    fs::write(&index, serde_json::to_string_pretty(snapshot)?)?;
    Ok(ExportResult {
        output_dir: output_dir.clone(),
        index_file_path: index.clone(),
        print_file_path: index.clone(),
        data_file_path: index,
        ..ExportResult::default()
    })
}
