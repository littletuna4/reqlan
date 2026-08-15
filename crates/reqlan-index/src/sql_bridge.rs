//! Generic rusqlite connection for TS query facades (replaces sql.js).
//! rq:["../../../reqlan rq/core_analysis/rust_port.rq".native_bridge]
//! rq:["../../../reqlan rq/indexer/indexer.rq".indexer_rust]

use rusqlite::{params_from_iter, types::Value, Connection};
use serde_json::{Map, Number, Value as JsonValue};
use std::path::Path;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum SqlBridgeError {
    #[error("sqlite: {0}")]
    Sqlite(#[from] rusqlite::Error),
    #[error("io: {0}")]
    Io(#[from] std::io::Error),
    #[error("{0}")]
    Message(String),
}

/// File-backed SQLite connection with JSON row I/O for the TS store layer.
pub struct SqlBridge {
    conn: Connection,
}

impl SqlBridge {
    pub fn open(path: &Path) -> Result<Self, SqlBridgeError> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let conn = Connection::open(path)?;
        conn.execute_batch("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;")?;
        Ok(Self { conn })
    }

    pub fn open_in_memory() -> Result<Self, SqlBridgeError> {
        let conn = Connection::open_in_memory()?;
        conn.execute_batch("PRAGMA foreign_keys = ON;")?;
        Ok(Self { conn })
    }

    pub fn execute_batch(&self, sql: &str) -> Result<(), SqlBridgeError> {
        execute_batch(&self.conn, sql)
    }

    pub fn execute(&self, sql: &str, params: &[JsonValue]) -> Result<usize, SqlBridgeError> {
        execute(&self.conn, sql, params)
    }

    pub fn query(&self, sql: &str, params: &[JsonValue]) -> Result<Vec<JsonValue>, SqlBridgeError> {
        query(&self.conn, sql, params)
    }

    pub fn last_insert_rowid(&self) -> i64 {
        self.conn.last_insert_rowid()
    }

    pub fn connection(&self) -> &Connection {
        &self.conn
    }
}

pub fn execute_batch(conn: &Connection, sql: &str) -> Result<(), SqlBridgeError> {
    conn.execute_batch(sql)?;
    Ok(())
}

pub fn execute(conn: &Connection, sql: &str, params: &[JsonValue]) -> Result<usize, SqlBridgeError> {
    let values = json_params(params)?;
    let changed = conn.execute(sql, params_from_iter(values))?;
    Ok(changed)
}

pub fn query(
    conn: &Connection,
    sql: &str,
    params: &[JsonValue],
) -> Result<Vec<JsonValue>, SqlBridgeError> {
    let values = json_params(params)?;
    let mut stmt = conn.prepare(sql)?;
    let column_names: Vec<String> = stmt.column_names().iter().map(|name| (*name).to_string()).collect();
    let mut rows = stmt.query(params_from_iter(values))?;
    let mut out = Vec::new();
    while let Some(row) = rows.next()? {
        let mut object = Map::new();
        for (index, name) in column_names.iter().enumerate() {
            let value: Value = row.get_ref(index)?.into();
            object.insert(name.clone(), sqlite_to_json(value));
        }
        out.push(JsonValue::Object(object));
    }
    Ok(out)
}

fn json_params(params: &[JsonValue]) -> Result<Vec<Value>, SqlBridgeError> {
    params.iter().map(json_to_sqlite).collect()
}

fn json_to_sqlite(value: &JsonValue) -> Result<Value, SqlBridgeError> {
    Ok(match value {
        JsonValue::Null => Value::Null,
        JsonValue::Bool(flag) => Value::Integer(if *flag { 1 } else { 0 }),
        JsonValue::Number(number) => {
            if let Some(int) = number.as_i64() {
                Value::Integer(int)
            } else if let Some(float) = number.as_f64() {
                Value::Real(float)
            } else {
                return Err(SqlBridgeError::Message(format!("unsupported number: {number}")));
            }
        }
        JsonValue::String(text) => Value::Text(text.clone()),
        JsonValue::Array(_) | JsonValue::Object(_) => Value::Text(
            serde_json::to_string(value)
                .map_err(|error| SqlBridgeError::Message(error.to_string()))?,
        ),
    })
}

fn sqlite_to_json(value: Value) -> JsonValue {
    match value {
        Value::Null => JsonValue::Null,
        Value::Integer(int) => JsonValue::Number(Number::from(int)),
        Value::Real(float) => Number::from_f64(float)
            .map(JsonValue::Number)
            .unwrap_or(JsonValue::Null),
        Value::Text(text) => JsonValue::String(text),
        Value::Blob(bytes) => JsonValue::Array(
            bytes
                .into_iter()
                .map(|byte| JsonValue::Number(Number::from(byte)))
                .collect(),
        ),
    }
}
