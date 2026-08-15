//! Idea and edge identifiers matching the TypeScript index.
//! rq:["../../../reqlan rq/indexer/indexer.rq".index]

pub fn idea_id(file_uri: &str, name: &str) -> String {
    format!("{file_uri}#{name}")
}

pub fn edge_id(source_id: &str, kind: &str, target: &str) -> String {
    format!("{source_id}->{kind}:{target}")
}
