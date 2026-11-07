//! Parse, reference, and import diagnostics for an open buffer.

use std::collections::HashSet;

use lsp_types::{Diagnostic, DiagnosticSeverity};
use reqlan_index::{find_rq_ignore_error_target_lines, local_name_binding, LocalNameBinding};
use reqlan_parse::{unquote_path, Import, ReferenceTarget, Span};

use super::model::{DocModel, LocalNameKind};
use super::refs::walk_refs;
use super::text::{ident_span_from, import_span};

impl DocModel {
    pub fn diagnostics<F, A>(
        &self,
        mut neighbor_has: F,
        mut neighbor_binds_import: A,
        confirm_path_qualified: bool,
    ) -> Vec<Diagnostic>
    where
        F: FnMut(&str, &str) -> bool,
        A: FnMut(&str, &str) -> bool,
    {
        let ignored = find_rq_ignore_error_target_lines(&self.text);
        let mut out = Vec::new();
        for diagnostic in &self.parse_diagnostics {
            let range = self.lines.range(
                &self.text,
                diagnostic.offset,
                diagnostic.offset.saturating_add(1),
            );
            push_diag(
                &mut out,
                &ignored,
                range,
                diagnostic.message.clone(),
                match diagnostic.severity {
                    reqlan_parse::Severity::Warning => DiagnosticSeverity::WARNING,
                    reqlan_parse::Severity::Error => DiagnosticSeverity::ERROR,
                },
            );
        }
        walk_refs(&self.model, &mut |target, _part_span| match target {
            ReferenceTarget::Local { span, idea } => {
                if idea.is_empty() || self.local_name_resolves(idea, &mut neighbor_has) {
                    return;
                }
                self.push_unresolved_idea(&mut out, &ignored, span, idea);
            }
            ReferenceTarget::Qualified { span, path, qualifier, idea, ideaset } => {
                if let Some(path) = path {
                    let authored = unquote_path(path);
                    if !confirm_path_qualified || self.locate(&authored).is_none() {
                        // Path does not exist or not allowed; emit file reference diagnostic covering full span.
                        push_diag(
                            &mut out,
                            &ignored,
                            self.lines.range(&self.text, span.start, span.end),
                            format!("Could not resolve file reference '{}'.", authored),
                            DiagnosticSeverity::ERROR,
                        );
                        return;
                    }
                    if !neighbor_has(path, idea)
                        && !neighbor_binds_import(path, idea)
                        && !self.has_idea(idea)
                    {
                        let leaf =
                            ident_span_from(&self.text, *span, span.start, idea).unwrap_or(*span);
                        self.push_unresolved_idea(&mut out, &ignored, &leaf, idea);
                    }
                } else if let Some(qualifier) = qualifier {
                    self.diagnose_dotted(
                        &mut out,
                        &ignored,
                        span,
                        qualifier,
                        ideaset.as_deref(),
                        idea,
                        &mut neighbor_has,
                        &mut neighbor_binds_import,
                    );
                } else if !self.has_idea(idea) {
                    let leaf =
                        ident_span_from(&self.text, *span, span.start, idea).unwrap_or(*span);
                    self.push_unresolved_idea(&mut out, &ignored, &leaf, idea);
                }
            }
            ReferenceTarget::File { span, file }
            | ReferenceTarget::FileSymbol { span, file, .. } => {
                let authored = unquote_path(file);
                if authored.contains("://") || self.locate(&authored).is_some() {
                    return;
                }
                push_diag(
                    &mut out,
                    &ignored,
                    self.lines.range(&self.text, span.start, span.end),
                    format!("Could not resolve file reference '{authored}'."),
                    DiagnosticSeverity::ERROR,
                );
            }
            _ => {}
        });
        for import in &self.model.imports {
            let Some(path) = import.path() else {
                continue;
            };
            if path.contains("://") {
                continue;
            }
            if self.locate(path).is_none() {
                let span = import.path_span().unwrap_or_else(|| import_span(import));
                push_diag(
                    &mut out,
                    &ignored,
                    self.lines.range(&self.text, span.start, span.end),
                    format!("Could not resolve import '{path}'."),
                    DiagnosticSeverity::ERROR,
                );
                continue;
            }
            self.push_missing_import_ideas(import, &mut out, &ignored, &mut neighbor_has);
        }
        out
    }

    fn push_unresolved_idea(
        &self,
        out: &mut Vec<Diagnostic>,
        ignored: &HashSet<u32>,
        span: &Span,
        idea: &str,
    ) {
        push_diag(
            out,
            ignored,
            self.lines.range(&self.text, span.start, span.end),
            format!("Could not resolve reference to IdeaDeclaration named '{idea}'."),
            DiagnosticSeverity::ERROR,
        );
    }

    fn push_missing_import_ideas<F>(
        &self,
        import: &Import,
        out: &mut Vec<Diagnostic>,
        ignored: &HashSet<u32>,
        neighbor_has: &mut F,
    ) where
        F: FnMut(&str, &str) -> bool,
    {
        match import {
            Import::From(from) => {
                for spec in &from.specifiers {
                    if spec.idea.is_empty() || neighbor_has(&from.path, &spec.idea) {
                        continue;
                    }
                    self.push_unresolved_idea(out, ignored, &spec.idea_span, &spec.idea);
                }
            }
            Import::Qualified(qualified) => {
                if !qualified.idea.is_empty() && !neighbor_has(&qualified.path, &qualified.idea) {
                    self.push_unresolved_idea(out, ignored, &qualified.idea_span, &qualified.idea);
                }
            }
            Import::Namespace(_) | Import::InvalidFrom(_) => {}
        }
    }

    #[allow(clippy::too_many_arguments)]
    fn diagnose_dotted<F, A>(
        &self,
        out: &mut Vec<Diagnostic>,
        ignored: &HashSet<u32>,
        span: &Span,
        qualifier: &str,
        ideaset: Option<&str>,
        idea: &str,
        neighbor_has: &mut F,
        neighbor_binds_import: &mut A,
    ) where
        F: FnMut(&str, &str) -> bool,
        A: FnMut(&str, &str) -> bool,
    {
        let parts = self.dotted_parts(*span, Some(qualifier), ideaset, idea);
        if ideaset.is_none() {
            match self.local_name_kind(qualifier) {
                Some(LocalNameKind::Block) | Some(LocalNameKind::OneLiner) => return,
                Some(LocalNameKind::IdeaSet) => {
                    if !self.has_idea(idea) {
                        self.push_unresolved_idea(out, ignored, &parts.idea, idea);
                    }
                    return;
                }
                None => {}
            }
        }
        if let Some(LocalNameBinding::Namespace { path }) =
            local_name_binding(&self.model.imports, qualifier)
        {
            if !neighbor_has(&path, idea) && !neighbor_binds_import(&path, idea) {
                self.push_unresolved_idea(out, ignored, &parts.idea, idea);
            }
            return;
        }
        if let Some(qualifier_span) = parts.qualifier {
            if self.local_name_kind(qualifier).is_none() {
                self.push_unresolved_idea(out, ignored, &qualifier_span, qualifier);
            }
        }
        if !self.has_idea(idea) {
            self.push_unresolved_idea(out, ignored, &parts.idea, idea);
        }
    }
}

fn push_diag(
    out: &mut Vec<Diagnostic>,
    ignored: &HashSet<u32>,
    range: lsp_types::Range,
    message: String,
    severity: DiagnosticSeverity,
) {
    if ignored.contains(&range.start.line) {
        return;
    }
    out.push(Diagnostic {
        range,
        message,
        severity: Some(severity),
        source: Some("reqlan".into()),
        ..Diagnostic::default()
    });
}
