//! Read index sources as UTF-8. Reject binary and non-UTF-8 from a short prefix.
//! rq:["../../../reqlan rq/extension/index-host/index.rq".text_prefix_skip]

use std::fs::File;
use std::io::{self, Read};
use std::path::Path;

/// Largest file body the index will read. Matches the former code-file cap.
pub const MAX_INDEX_FILE_BYTES: u64 = 1_048_576;
/// Bytes inspected before a full read. A reject does not read the rest of the file.
pub const TEXT_SNIFF_BYTES: usize = 8_192;

pub enum IndexText {
    Text(String),
    Skip,
}

/// Open `path` and return its UTF-8 text, or [`IndexText::Skip`] when it is too large,
/// UTF-16, contains a NUL, or is not valid UTF-8.
/// A rejected prefix is not followed by a read of the remainder.
pub fn read_index_text(path: &Path) -> io::Result<IndexText> {
    let mut file = File::open(path)?;
    let len = file.metadata()?.len();
    if len > MAX_INDEX_FILE_BYTES {
        return Ok(IndexText::Skip);
    }
    let want = TEXT_SNIFF_BYTES.min(len as usize);
    let mut prefix = vec![0u8; want];
    let mut read = 0;
    while read < prefix.len() {
        match file.read(&mut prefix[read..])? {
            0 => break,
            n => read += n,
        }
    }
    prefix.truncate(read);
    if prefix_rejects(&prefix) {
        return Ok(IndexText::Skip);
    }
    if (len as usize) <= prefix.len() {
        return match String::from_utf8(prefix) {
            Ok(text) => Ok(IndexText::Text(text)),
            Err(_) => Ok(IndexText::Skip),
        };
    }
    drop(file);
    match std::fs::read_to_string(path) {
        Ok(text) => Ok(IndexText::Text(text)),
        Err(err) if err.kind() == io::ErrorKind::InvalidData => Ok(IndexText::Skip),
        Err(err) => Err(err),
    }
}

/// True when `bytes` must not be indexed as text.
/// A trailing incomplete UTF-8 code unit is not a reject: the rest of the file may finish it.
pub fn prefix_rejects(bytes: &[u8]) -> bool {
    if bytes.starts_with(&[0xFF, 0xFE]) || bytes.starts_with(&[0xFE, 0xFF]) {
        return true;
    }
    if bytes.contains(&0) {
        return true;
    }
    match std::str::from_utf8(bytes) {
        Ok(_) => false,
        Err(err) => {
            let incomplete_tail = err.error_len().is_none() && err.valid_up_to() + 3 >= bytes.len();
            !incomplete_tail
        }
    }
}

#[cfg(test)]
mod tests {
    use super::prefix_rejects;

    #[test]
    fn nul_rejects() {
        assert!(prefix_rejects(&[b'a', 0, b'b']));
    }

    #[test]
    fn utf16_bom_rejects() {
        assert!(prefix_rejects(&[0xFF, 0xFE, 0x61, 0x00]));
        assert!(prefix_rejects(&[0xFE, 0xFF, 0x00, 0x61]));
    }

    #[test]
    fn invalid_utf8_rejects() {
        assert!(prefix_rejects(&[0xFF, 0x61]));
    }

    #[test]
    fn trailing_incomplete_utf8_is_not_a_reject() {
        let mut bytes = vec![b'a'; 8];
        bytes.push(0xC2);
        assert!(!prefix_rejects(&bytes));
    }

    #[test]
    fn plain_utf8_is_not_a_reject() {
        assert!(!prefix_rejects(b"idea { }\n"));
    }
}
