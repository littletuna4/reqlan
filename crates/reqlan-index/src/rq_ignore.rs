//! `//rq-ignore-error` suppresses diagnostics on the immediately following line.
//! rq:["../../../reqlan rq/language/syntax.rq".comment_reference_ignore]
//! rq:["../../../reqlan rq/language/syntax-edge-cases.rq".fencing_comments]

use reqlan_parse::is_inside_line_fence;
use std::collections::HashSet;

/// 0-based line indexes whose diagnostics `//rq-ignore-error` suppresses.
pub fn find_rq_ignore_error_target_lines(text: &str) -> HashSet<u32> {
    let mut targets = HashSet::new();
    let lines: Vec<&str> = text.split('\n').collect();
    for (index, raw) in lines.iter().enumerate() {
        let line = raw.strip_suffix('\r').unwrap_or(raw);
        let Some(comment_start) = find_line_comment_start(line) else {
            continue;
        };
        if comment_has_rq_ignore_error(&line[comment_start..]) && index + 1 < lines.len() {
            targets.insert((index + 1) as u32);
        }
    }
    targets
}

fn comment_has_rq_ignore_error(comment: &str) -> bool {
    let Some(after_slashes) = comment.strip_prefix("//") else {
        return false;
    };
    let rest = after_slashes.trim_start();
    let marker = "rq-ignore-error";
    let Some(after) = rest.strip_prefix(marker) else {
        return false;
    };
    after.is_empty()
        || after.chars().next().is_some_and(|ch| !ch.is_ascii_alphanumeric() && ch != '_')
}

/// Line-comment start outside complete same-line fences. `//` after `:` or `/` is not a comment.
fn find_line_comment_start(line: &str) -> Option<usize> {
    let bytes = line.as_bytes();
    let mut index = 0;
    while index < bytes.len() {
        let char = bytes[index];
        let next = bytes.get(index + 1).copied();
        if char == b'/' && next == Some(b'/') {
            if is_inside_line_fence(bytes, index) {
                index += 2;
                continue;
            }
            let mut previous = index;
            let mut skip = false;
            while previous > 0 {
                previous -= 1;
                let ch = bytes[previous];
                if ch == b' ' || ch == b'\t' {
                    continue;
                }
                skip = ch == b':' || ch == b'/';
                break;
            }
            if !skip {
                return Some(index);
            }
            index += 2;
            continue;
        }
        index += 1;
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    // rq:["../../../reqlan rq/language/syntax.rq".comment_reference_ignore]
    #[test]
    fn marks_the_line_after_the_directive() {
        let text = "keep this //rq-ignore-error\nnext line\n//rq-ignore-error\nanother line\n";
        let mut lines: Vec<u32> = find_rq_ignore_error_target_lines(text).into_iter().collect();
        lines.sort();
        assert_eq!(lines, vec![1, 3]);
    }

    // rq:["../../../reqlan rq/language/syntax.rq".comment_reference_ignore]
    #[test]
    fn does_not_treat_marker_inside_strings_as_a_directive() {
        let text = "demo { note \"//rq-ignore-error\" here\nbroken line }";
        assert!(find_rq_ignore_error_target_lines(text).is_empty());
    }

    // rq:["../../../reqlan rq/language/syntax.rq".comment_reference_ignore]
    #[test]
    fn allows_space_after_slashes_and_trailing_note() {
        let text = "keep\n// rq-ignore-error because tests\nnext line\n";
        let mut lines: Vec<u32> = find_rq_ignore_error_target_lines(text).into_iter().collect();
        lines.sort();
        assert_eq!(lines, vec![2]);
    }

    // rq:["../../../reqlan rq/language/syntax.rq".comment_reference_ignore]
    #[test]
    fn does_not_match_marker_prefix_inside_a_longer_word() {
        let text = "//rq-ignore-errors\nnext line\n";
        assert!(find_rq_ignore_error_target_lines(text).is_empty());
    }

    // rq:["../../../reqlan rq/language/syntax-edge-cases.rq".fencing_comments]
    #[test]
    fn does_not_treat_marker_inside_backticks_as_a_directive() {
        let text = "demo { note `//rq-ignore-error` here\nbroken line }";
        assert!(find_rq_ignore_error_target_lines(text).is_empty());
    }
}
