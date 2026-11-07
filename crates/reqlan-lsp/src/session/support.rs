//! Small helpers shared by the session feature modules.
//! rq:["../../../../reqlan rq/extension/language/syntax/features-syntax-highlighting.rq.reference_underline_syntax_align]

use std::path::PathBuf;

use lsp_types::Url;

pub(super) fn utf16_len_name(name: &str) -> u32 {
    name.encode_utf16().count() as u32
}

pub(super) fn path_of_file(value: &str) -> Option<PathBuf> {
    if let Ok(url) = Url::parse(value) {
        if let Ok(path) = url.to_file_path() {
            return Some(path);
        }
    }
    let path = PathBuf::from(value);
    path.is_absolute().then_some(path)
}
