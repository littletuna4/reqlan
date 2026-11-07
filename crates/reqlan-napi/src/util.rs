//! Shared napi error mappers and wire-JSON decode helper.
//! rq:["../../../reqlan rq/core_analysis/rust_port.rq".native_bridge]

use napi::bindgen_prelude::{Error, Result};

pub(crate) fn map_err(error: reqlan_analytical::AnalysisError) -> Error {
    Error::from_reason(error.to_string())
}
pub(crate) fn map_workspace_err(error: reqlan_analytical::WorkspaceIndexError) -> Error {
    Error::from_reason(error.to_string())
}

pub(crate) fn map_sql_bridge_err(error: reqlan_index::SqlBridgeError) -> Error {
    Error::from_reason(error.to_string())
}

pub(crate) fn map_store_err(error: reqlan_index::StoreError) -> Error {
    Error::from_reason(error.to_string())
}

pub(crate) fn parse_query<T: serde::de::DeserializeOwned>(value: serde_json::Value) -> Result<T> {
    serde_json::from_value(value).map_err(|error| Error::from_reason(error.to_string()))
}
