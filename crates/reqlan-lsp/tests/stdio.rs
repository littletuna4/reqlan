//! rq:["../../../reqlan rq/extension/language/support/language-server-rust.rq".language_server_rust]
use std::io::{Read, Write};
use std::process::{Command, Stdio};
use std::time::Duration;

fn frame(message: &str) -> Vec<u8> {
    let body = message.as_bytes();
    format!("Content-Length: {}\r\n\r\n", body.len())
        .into_bytes()
        .into_iter()
        .chain(body.iter().copied())
        .collect()
}

fn read_message(reader: &mut impl Read) -> String {
    let mut header = Vec::new();
    let mut byte = [0u8; 1];
    loop {
        reader.read_exact(&mut byte).unwrap();
        header.push(byte[0]);
        if header.ends_with(b"\r\n\r\n") {
            break;
        }
    }
    let header = String::from_utf8(header).unwrap();
    let length = header
        .lines()
        .find_map(|line| line.strip_prefix("Content-Length: "))
        .unwrap()
        .trim()
        .parse::<usize>()
        .unwrap();
    let mut body = vec![0u8; length];
    reader.read_exact(&mut body).unwrap();
    String::from_utf8(body).unwrap()
}

#[test]
fn stdio_initialize_and_shutdown() {
    let bin = env!("CARGO_BIN_EXE_reqlan-lsp");
    let mut child = Command::new(bin)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .unwrap();
    let mut stdin = child.stdin.take().unwrap();
    let mut stdout = child.stdout.take().unwrap();
    stdin.write_all(&frame(
        r#"{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"processId":null,"capabilities":{}}}"#,
    )).unwrap();
    stdin.flush().unwrap();
    let response = read_message(&mut stdout);
    assert!(response.contains("semanticTokensProvider"), "{response}");
    stdin.write_all(&frame(r#"{"jsonrpc":"2.0","method":"initialized","params":{}}"#)).unwrap();
    stdin
        .write_all(&frame(r#"{"jsonrpc":"2.0","id":2,"method":"shutdown","params":null}"#))
        .unwrap();
    stdin.flush().unwrap();
    let shutdown = read_message(&mut stdout);
    assert!(shutdown.contains("\"id\":2") || shutdown.contains("\"id\": 2"), "{shutdown}");
    stdin.write_all(&frame(r#"{"jsonrpc":"2.0","method":"exit","params":null}"#)).unwrap();
    let _ = stdin.flush();
    drop(stdin);
    let finished = wait_timeout(&mut child, Duration::from_secs(5));
    assert!(finished, "language server did not exit");
}

fn wait_timeout(child: &mut std::process::Child, limit: Duration) -> bool {
    let start = std::time::Instant::now();
    loop {
        if child.try_wait().ok().flatten().is_some() {
            return true;
        }
        if start.elapsed() > limit {
            let _ = child.kill();
            return false;
        }
        std::thread::sleep(Duration::from_millis(20));
    }
}
