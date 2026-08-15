use crate::json::ExportError;
use crate::types::{ExportRequest, ExportResult, ExportSnapshot};
use std::fs;

pub fn write_markdown_export(
    snapshot: &ExportSnapshot,
    request: &ExportRequest,
) -> Result<ExportResult, ExportError> {
    let output_dir = request.output_dir.join(&request.export_name);
    fs::create_dir_all(output_dir.join("ideas"))?;
    let index = output_dir.join("README.md");
    fs::write(&index, render_readme(snapshot))?;
    for idea in &snapshot.ideas {
        let slug = slug(&idea.name);
        let path = output_dir.join("ideas").join(format!("{slug}.md"));
        fs::write(path, render_idea(idea))?;
    }
    Ok(ExportResult {
        output_dir,
        index_file_path: index.clone(),
        print_file_path: index.clone(),
        data_file_path: index,
        ..ExportResult::default()
    })
}

fn render_readme(snapshot: &ExportSnapshot) -> String {
    let mut lines = vec![
        format!("# {}", snapshot.title),
        String::new(),
        format!("Generated {}", snapshot.generated_at),
        String::new(),
        format!("- Ideas: {}", snapshot.counts.ideas),
        format!("- Files: {}", snapshot.counts.files),
        format!("- References: {}", snapshot.counts.edges),
        String::new(),
        "## Ideas".into(),
        String::new(),
    ];
    for idea in &snapshot.ideas {
        lines.push(format!(
            "- [{}](ideas/{}.md) — {}",
            idea.name,
            slug(&idea.name),
            one_line(&idea.summary)
        ));
    }
    lines.join("\n") + "\n"
}

fn render_idea(idea: &crate::types::ExportIdea) -> String {
    format!(
        "# {}\n\nStatus: {}\n\nTags: {}\n\nFile: `{}`\n\n{}\n",
        idea.name,
        idea.status.clone().unwrap_or_else(|| "—".into()),
        idea.tags.join(", "),
        idea.file_uri,
        idea.summary
    )
}

fn slug(name: &str) -> String {
    name.chars()
        .map(|ch| if ch.is_ascii_alphanumeric() { ch.to_ascii_lowercase() } else { '-' })
        .collect::<String>()
        .trim_matches('-')
        .to_string()
}

fn one_line(text: &str) -> String {
    text.lines().next().unwrap_or("").to_string()
}
