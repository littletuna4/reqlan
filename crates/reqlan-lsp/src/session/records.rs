//! Session state records: open buffers, comment documents, neighbor parses, and base indexes.
//! rq:["../../../../reqlan rq/extension/language/support/open-file-sequencing.rq".ast_lifecycle]
//! rq:["../../../../reqlan rq/extension/language/support/open-file-sequencing.rq".open_file_hot_path]
//! rq:["../../../../reqlan rq/extension/language/support/open-file-sequencing.rq".native_cache_retention]

use std::cell::RefCell;
use std::collections::{HashMap, VecDeque};
use std::path::{Path, PathBuf};
use std::time::SystemTime;

use lsp_types::Range;
use reqlan_index::IndexStore;
use reqlan_parse::Model;

use crate::analysis::{AttributeCatalog, DocModel, InboundReferencer};
use crate::path_completion::PathCompletionCache;

pub(super) struct OpenDoc {
    pub(super) model: DocModel,
    pub(super) path: Option<PathBuf>,
}

/// A closed `.rq` file parsed once. A lookup checks the file stamp, not the text.
pub(super) struct Neighbor {
    pub(super) path: PathBuf,
    pub(super) stamp: FileStamp,
    pub(super) text: String,
    pub(super) model: Model,
    pub(super) names: Vec<(String, Range)>,
    pub(super) bindings: Vec<(String, u32)>,
}

#[derive(Clone, Copy, PartialEq, Eq)]
pub(super) struct FileStamp {
    pub(super) modified: SystemTime,
    pub(super) len: u64,
}

pub(super) struct BaseIndex {
    pub(super) root: PathBuf,
    pub(super) store: RefCell<Option<IndexStore>>,
}

pub(super) struct CommentDoc {
    pub(super) text: String,
    pub(super) path: PathBuf,
}

/// Language state for one server process.
/// Only open buffers keep a parse.
pub struct Session {
    pub(super) documents: HashMap<String, OpenDoc>,
    pub(super) comments: HashMap<String, CommentDoc>,
    pub(super) folders: Vec<PathBuf>,
    pub(super) indexes: Vec<BaseIndex>,
    pub(super) neighbors: VecDeque<Neighbor>,
    /// Host push of referencer names. Presence of a URI means snapshot-first (no SQLite).
    pub(super) inbound_names: HashMap<String, Vec<(String, Vec<InboundReferencer>)>>,
    /// Host push of file-level inbound referencers for the file CodeLens.
    pub(super) file_referencers: HashMap<String, Vec<InboundReferencer>>,
    /// Host push of attribute keys and values for completion.
    pub(super) attribute_catalog: AttributeCatalog,
    /// When true, a hover shows the styled idea body. Default is on.
    pub(super) idea_content_tooltip: bool,
    /// When true, emit inbound reference inlay hints. Default is off (matches VS Code setting).
    pub(super) reference_inlay_hints: bool,
    pub(super) path_cache: PathCompletionCache,
}

impl BaseIndex {
    pub(super) fn store(&self) -> std::cell::Ref<'_, IndexStore> {
        if self.store.borrow().is_none() {
            let db = self.root.join(".reqlan").join("ideas-index.sqlite");
            let opened =
                IndexStore::open_read_only(&db).expect("failed to open ideas index read-only");
            self.store.replace(Some(opened));
        }
        std::cell::Ref::map(self.store.borrow(), |s| s.as_ref().unwrap())
    }
}

impl Session {
    pub(super) fn open_doc_at(&self, path: &Path) -> Option<&OpenDoc> {
        self.documents.values().find(|doc| doc.path.as_deref() == Some(path))
    }
}
