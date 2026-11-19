#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::{
    io::{BufRead, BufReader, Write},
    process::{Child, ChildStdin, Command, Stdio},
    sync::Mutex,
    thread,
};

use tauri::{AppHandle, Emitter, Manager, State};
use tauri::path::BaseDirectory;

struct EngineSession { child: Child, stdin: ChildStdin }
struct EngineState(Mutex<Option<EngineSession>>);

impl Drop for EngineState {
    fn drop(&mut self) {
        if let Ok(slot) = self.0.get_mut() {
            if let Some(mut session) = slot.take() {
                let _ = session.stdin.write_all(b"quit\n");
                let _ = session.stdin.flush();
                let _ = session.child.kill();
                let _ = session.child.wait();
            }
        }
    }
}

fn find_engine(app: &AppHandle) -> Result<std::path::PathBuf, String> {
    app.path().resolve("stockfish/stockfish.exe", BaseDirectory::Resource)
        .map_err(|error| format!("Не удалось найти Stockfish: {error}"))
}

#[tauri::command]
fn start_engine(app: AppHandle, state: State<'_, EngineState>) -> Result<(), String> {
    let mut slot = state.0.lock().map_err(|_| "Не удалось получить доступ к движку".to_string())?;
    if slot.is_some() { return Ok(()); }

    let engine_path = find_engine(&app)?;
    if !engine_path.is_file() { return Err(format!("Файл Stockfish не найден: {}", engine_path.display())); }
    let working_dir = engine_path.parent().ok_or_else(|| "Не найдена папка Stockfish".to_string())?;

    let mut child = Command::new(&engine_path)
        .current_dir(working_dir)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn().map_err(|error| format!("Не удалось запустить Stockfish: {error}"))?;

    let stdin = child.stdin.take().ok_or_else(|| "Stockfish не открыл stdin".to_string())?;
    let stdout = child.stdout.take().ok_or_else(|| "Stockfish не открыл stdout".to_string())?;
    let stderr = child.stderr.take().ok_or_else(|| "Stockfish не открыл stderr".to_string())?;

    let stdout_app = app.clone();
    thread::spawn(move || {
        for line in BufReader::new(stdout).lines() {
            match line {
                Ok(line) => { if stdout_app.emit("engine-message", line).is_err() { break; } }
                Err(error) => { let _ = stdout_app.emit("engine-error", format!("Ошибка чтения Stockfish: {error}")); break; }
            }
        }
    });

    let stderr_app = app.clone();
    thread::spawn(move || {
        for line in BufReader::new(stderr).lines().flatten() {
            let line = line.trim();
            if !line.is_empty() { let _ = stderr_app.emit("engine-error", line.to_string()); }
        }
    });

    *slot = Some(EngineSession { child, stdin });
    Ok(())
}

#[tauri::command]
fn send_engine_command(command: String, state: State<'_, EngineState>) -> Result<(), String> {
    if command.contains('\n') || command.contains('\r') {
        return Err("Команда Stockfish содержит недопустимый перенос строки".to_string());
    }
    let mut slot = state.0.lock().map_err(|_| "Не удалось получить доступ к движку".to_string())?;
    let session = slot.as_mut().ok_or_else(|| "Stockfish ещё не запущен".to_string())?;
    session.stdin.write_all(command.as_bytes())
        .and_then(|_| session.stdin.write_all(b"\n"))
        .and_then(|_| session.stdin.flush())
        .map_err(|error| format!("Не удалось отправить команду Stockfish: {error}"))
}

#[tauri::command]
fn stop_engine(state: State<'_, EngineState>) -> Result<(), String> {
    let mut slot = state.0.lock().map_err(|_| "Не удалось получить доступ к движку".to_string())?;
    if let Some(mut session) = slot.take() {
        let _ = session.stdin.write_all(b"quit\n");
        let _ = session.stdin.flush();
        let _ = session.child.kill();
        let _ = session.child.wait();
    }
    Ok(())
}

fn main() {
    tauri::Builder::default()
        .manage(EngineState(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![start_engine, send_engine_command, stop_engine])
        .run(tauri::generate_context!())
        .expect("Ошибка запуска ChessStudy Pro");
}
