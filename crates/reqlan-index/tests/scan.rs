//! rq:["../../../reqlan rq/indexer/cache-reuse.rq".single_sync_walk]
//! rq:["../../../reqlan rq/indexer/sequencing.rq".scan_limits]
//! rq:["../../../reqlan rq/extension/index-host/index.rq".text_prefix_skip]
use reqlan_index::{
    index_one_file, read_index_text, scan_workspace, IndexStore, IndexText, ScanLimits,
};
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

fn scratch(name: &str) -> PathBuf {
    let nanos = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
    let path = std::env::temp_dir().join(format!("reqlan-scan-{name}-{nanos}"));
    fs::create_dir_all(&path).unwrap();
    path
}

fn write(path: &Path, bytes: &[u8]) {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).unwrap();
    }
    let mut file = fs::File::create(path).unwrap();
    file.write_all(bytes).unwrap();
}

#[test]
fn one_walk_returns_bases_rq_and_code_and_skips_ignored_dirs() {
    let root = scratch("one");
    fs::create_dir_all(root.join(".reqlan")).unwrap();
    write(&root.join("keep.rq"), b"keep {\n}\n");
    write(&root.join("src").join("app.ts"), b"export const n = 1;\n");
    write(&root.join("node_modules").join("pkg").join("skip.rq"), b"skip {\n}\n");
    fs::create_dir_all(root.join("node_modules").join("pkg").join(".reqlan")).unwrap();
    write(&root.join("target").join("debug").join("out.rs"), b"fn hidden() {}\n");
    fs::create_dir_all(root.join("target").join("nested").join(".reqlan")).unwrap();

    let scan = scan_workspace(std::slice::from_ref(&root), ScanLimits::default());
    let bases: Vec<_> = scan.bases.iter().map(|path| path.canonicalize().unwrap()).collect();
    assert_eq!(bases, vec![root.canonicalize().unwrap()]);
    assert!(scan.rq_files.iter().any(|path| path.ends_with("keep.rq")));
    assert!(scan
        .rq_files
        .iter()
        .all(|path| !path.components().any(|c| c.as_os_str() == "node_modules")));
    assert!(scan.code_files.iter().any(|path| path.ends_with("app.ts")));
    assert!(scan
        .code_files
        .iter()
        .all(|path| !path.components().any(|c| c.as_os_str() == "target")));
    assert!(!scan.truncated);
    fs::remove_dir_all(&root).ok();
}

#[test]
fn depth_2_does_not_return_a_deeper_base_or_rq() {
    let root = scratch("depth");
    fs::create_dir_all(root.join(".reqlan")).unwrap();
    write(&root.join("a").join("b").join("shallow.rq"), b"shallow {\n}\n");
    write(&root.join("a").join("b").join("c").join("deep.rq"), b"deep {\n}\n");
    fs::create_dir_all(root.join("a").join("b").join("c").join(".reqlan")).unwrap();

    let scan = scan_workspace(
        std::slice::from_ref(&root),
        ScanLimits { max_depth: 2, ..ScanLimits::default() },
    );
    assert!(scan.rq_files.iter().any(|path| path.ends_with("shallow.rq")));
    assert!(scan.rq_files.iter().all(|path| !path.ends_with("deep.rq")));
    let root_canon = root.canonicalize().unwrap();
    assert!(scan.bases.iter().all(|path| path.canonicalize().unwrap() == root_canon));
    assert!(scan.truncated);
    assert_eq!(scan.truncation_reason.as_deref(), Some("maxDepth"));
    fs::remove_dir_all(&root).ok();
}

#[test]
fn entry_cap_stops_and_reports_truncation() {
    let root = scratch("entries");
    fs::create_dir_all(root.join(".reqlan")).unwrap();
    for index in 0..30 {
        write(&root.join(format!("f{index}.rq")), b"idea {\n}\n");
    }
    let scan = scan_workspace(
        std::slice::from_ref(&root),
        ScanLimits { max_entries: 5, ..ScanLimits::default() },
    );
    assert!(scan.truncated);
    assert_eq!(scan.truncation_reason.as_deref(), Some("maxEntries"));
    assert!(scan.rq_files.len() < 30);
    fs::remove_dir_all(&root).ok();
}

#[test]
fn prefix_skip_does_not_index_non_text() {
    let root = scratch("prefix");
    let db = root.join(".reqlan").join("ideas-index.sqlite");
    fs::create_dir_all(db.parent().unwrap()).unwrap();
    let mut store = IndexStore::open(&db).unwrap();

    let nul = root.join("nul.rq");
    let mut big = vec![0u8, b'x'];
    big.extend(std::iter::repeat(b'a').take(64 * 1024));
    write(&nul, &big);
    assert!(matches!(read_index_text(&nul).unwrap(), IndexText::Skip));
    let skipped = index_one_file(&mut store, &root, nul.to_str().unwrap()).unwrap();
    assert!(skipped.diagnostics.is_empty());

    let utf16 = root.join("wide.ts");
    write(&utf16, &[0xFF, 0xFE, 0x61, 0x00]);
    assert!(matches!(read_index_text(&utf16).unwrap(), IndexText::Skip));

    let bad = root.join("bad.rq");
    write(&bad, &[0xFF, 0x61, b'q']);
    assert!(matches!(read_index_text(&bad).unwrap(), IndexText::Skip));

    let good = root.join("good.rq");
    write(&good, b"alpha {\n    summary\n}\n");
    index_one_file(&mut store, &root, good.to_str().unwrap()).unwrap();
    let names: Vec<_> = store.list_all_ideas().unwrap().into_iter().map(|idea| idea.name).collect();
    assert_eq!(names, vec!["alpha".to_string()]);

    let code = root.join("host.ts");
    write(&code, b"// rq:[alpha]\n");
    index_one_file(&mut store, &root, code.to_str().unwrap()).unwrap();
    assert!(store.list_code_document_uris().unwrap().iter().any(|uri| uri.ends_with("host.ts")));

    drop(store);
    fs::remove_dir_all(&root).ok();
}
