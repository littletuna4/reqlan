//! Oracle: packages/language/test/linking.test.ts, validating.test.ts, inlay-hints.test.ts
//! rq:["../../../reqlan rq/extension/language/support/language-server-rust.rq".language_server_rust]
use lsp_types::{Position, Range, Url};
use reqlan_lsp::{InboundReferencer, Session};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

fn scratch(name: &str) -> PathBuf {
    let nanos = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
    let path = std::env::temp_dir().join(format!("reqlan-lsp-parity-{name}-{nanos}"));
    fs::create_dir_all(&path).unwrap();
    path
}

fn file_uri(path: &Path) -> String {
    Url::from_file_path(path).unwrap().to_string()
}

fn text_at(source: &str, range: &Range) -> String {
    let Some(line) = source.lines().nth(range.start.line as usize) else {
        return String::new();
    };
    if range.start.line != range.end.line {
        return String::new();
    }
    let start = range.start.character as usize;
    let end = range.end.character as usize;
    if start > end || end > line.len() {
        return String::new();
    }
    line[start..end].to_string()
}

fn referencer(name: &str, uri: &str, line: u32) -> InboundReferencer {
    InboundReferencer { name: name.to_string(), uri: uri.to_string(), line }
}

fn hint_text(label: &lsp_types::InlayHintLabel) -> String {
    match label {
        lsp_types::InlayHintLabel::String(text) => text.clone(),
        lsp_types::InlayHintLabel::LabelParts(parts) => {
            parts.iter().map(|part| part.value.as_str()).collect()
        }
    }
}

fn messages(session: &mut Session, uri: &str) -> Vec<String> {
    session.diagnostics(uri).into_iter().map(|diagnostic| diagnostic.message).collect()
}

/// oracle: linking.test.ts same-file idea references produce document links
#[test]
fn same_file_idea_references_produce_document_links() {
    let mut session = Session::new();
    let uri = "file:///same-file.rq";
    let source = "alpha {\n    body\n}\nbeta {\n    see [alpha] and [[alpha]]\n}\n";
    session.open(uri, source.into());
    let links = session.links(uri);
    let alpha: Vec<_> =
        links.iter().filter(|link| text_at(source, &link.range) == "alpha").collect();
    assert!(alpha.len() >= 2, "{links:?}");
    assert!(alpha.iter().all(|link| link.range.start.line != 0), "declaration is not a link");
    for link in alpha {
        let target = link.target.as_ref().map(|url| url.to_string()).unwrap_or_default();
        assert!(target.contains("same-file.rq"), "{target}");
        assert!(target.contains("#L"), "{target}");
        assert!(link.tooltip.is_some());
    }
}

/// oracle: linking.test.ts missing file references do not produce document links
#[test]
fn missing_file_references_do_not_produce_document_links() {
    let root = scratch("missing-file");
    let host = root.join("host.rq");
    let source = "missing_reference {\n    see [\"./does-not-exist.rq\"]\n}\n";
    fs::write(&host, source).unwrap();
    let uri = file_uri(&host);
    let mut session = Session::new();
    session.open(&uri, source.into());
    assert!(session.links(&uri).is_empty(), "{:?}", session.links(&uri));
    let found = messages(&mut session, &uri);
    assert!(
        found
            .iter()
            .any(|message| message == "Could not resolve file reference './does-not-exist.rq'."),
        "{found:?}"
    );
    assert!(found.iter().all(|message| !message.contains("IdeaDeclaration")), "{found:?}");
    let _ = fs::remove_dir_all(&root);
}

/// oracle: linking.test.ts does not report linking error for anonymous import path only
#[test]
fn anonymous_import_path_does_not_report_an_unresolved_import() {
    let root = scratch("anon-path");
    fs::create_dir_all(root.join("site")).unwrap();
    fs::write(root.join("brand.rq"), "brand {\n}\n").unwrap();
    let consumer = root.join("site").join("consumer.rq");
    let source = "site_brand {\n    must be aligned with [\"../brand.rq\"]\n}\n";
    fs::write(&consumer, source).unwrap();
    let uri = file_uri(&consumer);
    let mut session = Session::new();
    session.open(&uri, source.into());
    let found = messages(&mut session, &uri);
    assert!(
        found.iter().all(|message| !message.contains("Could not resolve reference to Import")),
        "{found:?}"
    );
    assert!(found.iter().all(|message| !message.contains("IdeaDeclaration")), "{found:?}");
    let links = session.links(&uri);
    assert!(
        links.iter().any(|link| {
            link.target.as_ref().is_some_and(|target| target.path().ends_with("brand.rq"))
        }),
        "{links:?}"
    );
    let _ = fs::remove_dir_all(&root);
}

/// oracle: validating.test.ts reports an error when an import path file does not exist
#[test]
fn reports_an_error_when_an_import_path_file_does_not_exist() {
    let root = scratch("missing-import");
    let host = root.join("host.rq");
    let source = "import \"./does-not-exist.rq\" as missing\nhost {\n}\n";
    fs::write(&host, source).unwrap();
    let uri = file_uri(&host);
    let mut session = Session::new();
    session.open(&uri, source.into());
    let diags = session.diagnostics(&uri);
    let found: Vec<_> = diags.iter().map(|diagnostic| diagnostic.message.clone()).collect();
    assert!(
        found.iter().any(|message| message == "Could not resolve import './does-not-exist.rq'."),
        "{found:?}"
    );
    let import_diag = diags
        .iter()
        .find(|diagnostic| diagnostic.message == "Could not resolve import './does-not-exist.rq'.")
        .expect("import diagnostic");
    assert_eq!(text_at(source, &import_diag.range), "\"./does-not-exist.rq\"");
    let _ = fs::remove_dir_all(&root);
}

/// oracle: validating.test.ts reports an error when an imported idea does not exist in the target file
#[test]
fn reports_an_error_when_an_imported_idea_does_not_exist() {
    let root = scratch("missing-imported-idea");
    fs::write(root.join("exampleimport.rq"), "alpha {\n}\n").unwrap();
    let host = root.join("host.rq");
    let source = "from \"./exampleimport.rq\" import missing_idea\nhost {\n}\n";
    fs::write(&host, source).unwrap();
    let uri = file_uri(&host);
    let mut session = Session::new();
    session.open(&uri, source.into());
    let diags = session.diagnostics(&uri);
    let found: Vec<_> = diags.iter().map(|diagnostic| diagnostic.message.clone()).collect();
    assert!(
        found.iter().any(|message| {
            message == "Could not resolve reference to IdeaDeclaration named 'missing_idea'."
        }),
        "{found:?}"
    );
    let idea_diag = diags
        .iter()
        .find(|diagnostic| {
            diagnostic.message
                == "Could not resolve reference to IdeaDeclaration named 'missing_idea'."
        })
        .expect("idea diagnostic");
    assert_eq!(text_at(source, &idea_diag.range), "missing_idea");
    assert!(found.iter().all(|message| !message.contains("Could not resolve import")), "{found:?}");
    let _ = fs::remove_dir_all(&root);
}

/// oracle: linking.test.ts resolve anonymous import in bracket reference without import statement
#[test]
fn anonymous_qualified_idea_resolves_without_an_import_statement() {
    let root = scratch("anon-qualified");
    fs::write(root.join("lib.rq"), "beta {\n}\n").unwrap();
    let host = root.join("host.rq");
    let source = "host {\n    [\"./lib.rq\".beta]\n}\n";
    fs::write(&host, source).unwrap();
    let uri = file_uri(&host);
    let mut session = Session::new();
    session.open(&uri, source.into());
    let found = messages(&mut session, &uri);
    assert!(found.iter().all(|message| !message.contains("'beta'")), "{found:?}");
    let links = session.links(&uri);
    assert!(
        links.iter().any(|link| {
            link.target.as_ref().is_some_and(|target| target.path().ends_with("lib.rq"))
        }),
        "{links:?}"
    );
    let _ = fs::remove_dir_all(&root);
}

/// oracle: linking.test.ts quoted-path qualified idea is not limited to from-import specifiers
#[test]
fn quoted_path_reaches_an_idea_that_is_not_from_imported() {
    let root = scratch("quoted-not-imported");
    fs::write(root.join("lib.rq"), "alpha {\n}\nbeta {\n}\n").unwrap();
    let host = root.join("host.rq");
    let source = "from \"./lib.rq\" import alpha\nhost {\n    [\"./lib.rq\".beta]\n}\n";
    fs::write(&host, source).unwrap();
    let uri = file_uri(&host);
    let mut session = Session::new();
    session.open(&uri, source.into());
    let found = messages(&mut session, &uri);
    assert!(found.iter().all(|message| !message.contains("'beta'")), "{found:?}");
    assert!(found.iter().all(|message| !message.contains("Could not resolve import")), "{found:?}");
    let _ = fs::remove_dir_all(&root);
}

/// oracle: outbound-hop.test.ts confirms a neighbor idea when the authored path has no .rq extension
#[test]
fn extensionless_path_confirms_the_neighbor_idea() {
    let root = scratch("extensionless");
    fs::write(root.join("lib.rq"), "beta {\n}\n").unwrap();
    let host = root.join("host.rq");
    let source = "host {\n    [\"./lib\".beta]\n}\n";
    fs::write(&host, source).unwrap();
    let uri = file_uri(&host);
    let mut session = Session::new();
    session.open(&uri, source.into());
    let found = messages(&mut session, &uri);
    assert!(found.iter().all(|message| !message.contains("'beta'")), "{found:?}");
    let _ = fs::remove_dir_all(&root);
}

/// oracle: linking.test.ts cross-file imported idea references produce document links
#[test]
fn from_import_binds_a_local_reference() {
    let root = scratch("from-bind");
    fs::write(root.join("lib.rq"), "beta {\n}\n").unwrap();
    let host = root.join("host.rq");
    let source = "from \"./lib.rq\" import beta\nhost {\n    [beta]\n}\n";
    fs::write(&host, source).unwrap();
    let uri = file_uri(&host);
    let mut session = Session::new();
    session.open(&uri, source.into());
    let found = messages(&mut session, &uri);
    assert!(found.iter().all(|message| !message.contains("'beta'")), "{found:?}");
    let links = session.links(&uri);
    let beta: Vec<_> = links.iter().filter(|link| text_at(source, &link.range) == "beta").collect();
    assert!(!beta.is_empty(), "{links:?}");
    assert!(beta.iter().all(|link| {
        link.target.as_ref().is_some_and(|target| target.path().ends_with("lib.rq"))
    }));
    let _ = fs::remove_dir_all(&root);
}

/// oracle: reqlan-file-link-resolver.ts resolveImportPathLink uses the path node
#[test]
fn import_document_link_covers_the_path_string() {
    let root = scratch("import-path-link");
    fs::write(root.join("lib.rq"), "beta {\n}\n").unwrap();
    let host = root.join("host.rq");
    let source = "import \"./lib.rq\" as Lib\nhost {\n    [Lib]\n}\n";
    fs::write(&host, source).unwrap();
    let uri = file_uri(&host);
    let mut session = Session::new();
    session.open(&uri, source.into());
    let links = session.links(&uri);
    let path_links: Vec<_> =
        links.iter().filter(|link| text_at(source, &link.range).contains("lib.rq")).collect();
    assert_eq!(path_links.len(), 1, "{links:?}");
    assert_eq!(text_at(source, &path_links[0].range), "\"./lib.rq\"");
    assert!(path_links[0].target.as_ref().is_some_and(|target| target.path().ends_with("lib.rq")));
    let _ = fs::remove_dir_all(&root);
}

/// oracle: linking.test.ts qualified reference idea token produces document link
/// oracle: reqlan-namespace-import-links.ts resolveNamespaceImportReferenceLink
#[test]
fn namespace_drill_links_each_segment() {
    let root = scratch("namespace-drill");
    fs::write(root.join("configuration.rq"), "configuration_rqignore {\n}\n").unwrap();
    let host = root.join("host.rq");
    let source = "import \"./configuration.rq\" as configuration\nhost {\n    [configuration.configuration_rqignore]\n}\n";
    fs::write(&host, source).unwrap();
    let uri = file_uri(&host);
    let mut session = Session::new();
    session.open(&uri, source.into());
    let found = messages(&mut session, &uri);
    assert!(found.iter().all(|message| !message.contains("IdeaDeclaration")), "{found:?}");
    let links = session.links(&uri);
    let qualifier = links
        .iter()
        .find(|link| text_at(source, &link.range) == "configuration")
        .expect("qualifier link");
    let leaf = links
        .iter()
        .find(|link| text_at(source, &link.range) == "configuration_rqignore")
        .expect("leaf link");
    assert!(qualifier.target.as_ref().is_some_and(|target| {
        target.path().ends_with("configuration.rq") && target.fragment().is_none()
    }));
    assert!(leaf.target.as_ref().is_some_and(|target| {
        target.path().ends_with("configuration.rq")
            && target.fragment().is_some_and(|line| line.starts_with('L'))
    }));
    assert!(links.iter().all(|link| {
        let text = text_at(source, &link.range);
        text != "configuration.configuration_rqignore"
            && !text.contains("configuration.configuration")
    }));
    let _ = fs::remove_dir_all(&root);
}

/// oracle: validating.test.ts reports an error when an imported idea does not exist in the target file
#[test]
fn namespace_drill_missing_leaf_is_unresolved() {
    let root = scratch("namespace-missing-leaf");
    fs::write(root.join("configuration.rq"), "configuration_rqignore {\n}\n").unwrap();
    let host = root.join("host.rq");
    let source = "import \"./configuration.rq\" as configuration\nhost {\n    [configuration.missing_leaf]\n}\n";
    fs::write(&host, source).unwrap();
    let uri = file_uri(&host);
    let mut session = Session::new();
    session.open(&uri, source.into());
    let diags = session.diagnostics(&uri);
    let leaf: Vec<_> = diags
        .iter()
        .filter(|diagnostic| {
            diagnostic.message
                == "Could not resolve reference to IdeaDeclaration named 'missing_leaf'."
        })
        .collect();
    assert_eq!(leaf.len(), 1, "{diags:?}");
    assert_eq!(text_at(source, &leaf[0].range), "missing_leaf");
    let links = session.links(&uri);
    assert!(links.iter().any(|link| text_at(source, &link.range) == "configuration"), "{links:?}");
    assert!(links.iter().all(|link| text_at(source, &link.range) != "missing_leaf"), "{links:?}");
    let _ = fs::remove_dir_all(&root);
}

/// oracle: imports.rq import_from — each import token is its own link
#[test]
fn from_import_tokens_link_independently() {
    let root = scratch("import-tokens");
    fs::write(root.join("links-to-file.rq"), "ishouldlink {\n}\nishouldbeasecondlink {\n}\n")
        .unwrap();
    let host = root.join("host.rq");
    let source = "from \"./links-to-file.rq\" import ishouldlink, ishouldbeasecondlink as ishouldbeathirdvalidlink\nhost {\n}\n";
    fs::write(&host, source).unwrap();
    let uri = file_uri(&host);
    let mut session = Session::new();
    session.open(&uri, source.into());
    let found = messages(&mut session, &uri);
    assert!(found.iter().all(|message| !message.contains("IdeaDeclaration")), "{found:?}");
    let links = session.links(&uri);
    let by_text = |name: &str| {
        links
            .iter()
            .find(|link| text_at(source, &link.range) == name)
            .unwrap_or_else(|| panic!("missing link for {name}: {links:?}"))
    };
    let path = by_text("\"./links-to-file.rq\"");
    assert!(path.target.as_ref().is_some_and(|target| {
        target.path().ends_with("links-to-file.rq") && target.fragment().is_none()
    }));
    let first = by_text("ishouldlink");
    let second = by_text("ishouldbeasecondlink");
    let alias = by_text("ishouldbeathirdvalidlink");
    for link in [first, second, alias] {
        assert!(link.target.as_ref().is_some_and(|target| {
            target.path().ends_with("links-to-file.rq")
                && target.fragment().is_some_and(|line| line.starts_with('L'))
        }));
    }
    let second_target = second.target.clone();
    assert_eq!(alias.target, second_target);
    assert!(links.iter().all(|link| {
        let text = text_at(source, &link.range);
        text != "from" && text != "import" && text != "as"
    }));
    let _ = fs::remove_dir_all(&root);
}

/// oracle: linking.test.ts namespace import bracket reference links only the alias name
#[test]
fn namespace_alias_is_a_file_link() {
    let root = scratch("namespace");
    fs::write(root.join("lib.rq"), "beta {\n}\n").unwrap();
    let host = root.join("host.rq");
    let source = "import \"./lib.rq\" as Lib\nhost {\n    [Lib]\n}\n";
    fs::write(&host, source).unwrap();
    let uri = file_uri(&host);
    let mut session = Session::new();
    session.open(&uri, source.into());
    let found = messages(&mut session, &uri);
    assert!(found.iter().all(|message| !message.contains("IdeaDeclaration")), "{found:?}");
    let links = session.links(&uri);
    let alias: Vec<_> = links.iter().filter(|link| text_at(source, &link.range) == "Lib").collect();
    assert_eq!(alias.len(), 2, "{links:?}");
    assert!(alias.iter().all(|link| {
        link.target
            .as_ref()
            .is_some_and(|target| target.path().ends_with("lib.rq") && target.fragment().is_none())
    }));
    let _ = fs::remove_dir_all(&root);
}

/// oracle: inlay-hints.test.ts formats inbound referencers as an inlayed attribute
#[test]
fn formats_inbound_referencers_as_an_inlayed_attribute() {
    let mut session = Session::new();
    let uri = "file:///target.rq";
    session.open(uri, "target {\n}\n".into());
    session.note_inbound(
        uri,
        vec![(
            "target".into(),
            vec![
                referencer("beta", "file:///beta.rq", 3),
                referencer("alpha", "file:///alpha.rq", 1),
            ],
        )],
    );
    let hints = session.inlays(uri);
    assert_eq!(hints.len(), 1, "{hints:?}");
    assert_eq!(hints[0].position, Position { line: 0, character: 6 });
    assert_eq!(hint_text(&hints[0].label), "@referenced-by: (alpha, beta)");
    let tooltip = hint_tooltip(&hints[0]);
    assert!(tooltip.starts_with("**Referenced by**\n\n"), "{tooltip}");
    assert!(tooltip.contains("[alpha](file:///alpha.rq#L2)"), "{tooltip}");
    assert!(tooltip.contains("[beta](file:///beta.rq#L4)"), "{tooltip}");
}

fn hint_tooltip(hint: &lsp_types::InlayHint) -> String {
    match &hint.tooltip {
        Some(lsp_types::InlayHintTooltip::MarkupContent(markup)) => markup.value.clone(),
        other => panic!("markdown tooltip, got {other:?}"),
    }
}

/// oracle: inlay-hints.test.ts truncates long referencer lists with a remainder suffix
#[test]
fn truncates_long_referencer_lists_with_a_remainder_suffix() {
    let mut session = Session::new();
    let uri = "file:///target.rq";
    session.open(uri, "target {\n}\n".into());
    session.note_inbound(
        uri,
        vec![(
            "target".into(),
            vec![
                referencer("e", "file:///e.rq", 4),
                referencer("d", "file:///d.rq", 3),
                referencer("c", "file:///c.rq", 2),
                referencer("b", "file:///b.rq", 1),
                referencer("a", "file:///a.rq", 0),
            ],
        )],
    );
    let hints = session.inlays(uri);
    assert_eq!(hint_text(&hints[0].label), "@referenced-by: (a, b, c, +2 more)");
    let tooltip = hint_tooltip(&hints[0]);
    assert!(tooltip.contains("[e](file:///e.rq#L5)"), "{tooltip}");
    assert!(tooltip.contains("[a](file:///a.rq#L1)"), "{tooltip}");
}

/// oracle: inlay-hints.test.ts omits the attribute when there are no inbound referencers
#[test]
fn omits_the_inlay_when_there_are_no_inbound_referencers() {
    let mut session = Session::new();
    let uri = "file:///target.rq";
    session.open(uri, "target {\n}\n".into());
    assert!(session.inlays(uri).is_empty());
}

/// rq:["../../../reqlan rq/core_analysis/check.rq".check_qualified_missing_idea]
/// rq:["../../../reqlan rq/language/imports.rq".import_namespace]
/// rq:["../../../reqlan rq/core_analysis/rust_port.rq".golden_corpus]
#[test]
fn golden_corpus_import_alias_is_not_an_unresolved_idea() {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../testdata/golden-corpus/language/import-alias-qualified");
    let host = root.join("host.rq");
    let source = fs::read_to_string(&host).unwrap();
    let uri = file_uri(&host);
    let mut session = Session::new();
    session.open(&uri, source);
    let found = messages(&mut session, &uri);
    assert!(found.iter().all(|message| !message.contains("analysis_runtime")), "{found:?}");
    assert!(found.iter().any(|message| message.contains("missing_leaf")), "{found:?}");
}
