#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod tab_drag_plugin;
mod csv_reader;
mod excel_reader;
mod dta_reader;
mod mmap_reader;
mod script_executor;

use std::path::PathBuf;
use std::sync::Arc;
use tauri::command;
use tauri::Emitter;
use tokio::sync::Mutex;
use tokio::process::Command as TokioCommand;
use std::process::Stdio;
use tokio::io::{AsyncBufReadExt, BufReader};

use csv_reader::ChunkedCSVReader;
use excel_reader::ExcelReader;
use dta_reader::DTAFile;
use script_executor::{ScriptExecutor, ScriptType, StataCompleter};

struct AppState {
    script_executor: Arc<Mutex<ScriptExecutor>>,
}

#[command]
fn open_dta_file(path: String, row_limit: Option<usize>) -> Result<dta_reader::DTAFile, String> {
    log::info!("Opening DTA file: {}", path);
    let path_buf = PathBuf::from(&path);

    match row_limit {
        Some(limit) => DTAFile::read_file_with_limit(&path_buf, Some(limit)),
        None => DTAFile::read_file(&path_buf),
    }
    .map_err(|e| {
        log::error!("Failed to open DTA file: {}", e);
        e.to_string()
    })
}

#[command]
fn get_file_info(path: String) -> Result<(u16, usize, usize), String> {
    let path_buf = PathBuf::from(&path);
    let file = std::fs::File::open(&path_buf).map_err(|e| e.to_string())?;
    let mut reader = std::io::BufReader::new(file);

    let mut magic = [0u8; 5];
    std::io::Read::read_exact(&mut reader, &mut magic).map_err(|e| e.to_string())?;

    let version = match &magic {
        b"<stat" => 13,
        b"<ds13" => 113,
        b"<ds14" => 114,
        b"<ds15" => 115,
        b"<ds18" => 118,
        b"<ds20" => 119,
        b"<ds30" => 126,
        b"<ds31" => 127,
        b"<ds32" => 128,
        b"<ds33" => 129,
        b"<ds34" => 130,
        _ => return Err("无效的DTA文件头".to_string()),
    };

    if version <= 115 {
        let mut k = [0u8; 2];
        let mut n = [0u8; 4];
        std::io::Read::read_exact(&mut reader, &mut k).map_err(|e| e.to_string())?;
        std::io::Read::read_exact(&mut reader, &mut n).map_err(|e| e.to_string())?;
        let nvar = u16::from_le_bytes(k) as usize;
        let nobs = u32::from_le_bytes(n) as usize;
        Ok((version, nvar, nobs))
    } else {
        let mut k = [0u8; 2];
        let mut n = [0u8; 8];
        std::io::Read::read_exact(&mut reader, &mut k).map_err(|e| e.to_string())?;
        std::io::Read::read_exact(&mut reader, &mut n).map_err(|e| e.to_string())?;
        let nvar = u16::from_le_bytes(k) as usize;
        let nobs = u64::from_le_bytes(n) as usize;
        Ok((version, nvar, nobs))
    }
}

#[command]
fn stream_read_dta(path: String, start_row: usize, end_row: usize) -> Result<Vec<Vec<serde_json::Value>>, String> {
    log::info!("Streaming DTA file rows {} to {}", start_row, end_row);
    DTAFile::stream_read(&path, start_row, end_row)
        .map_err(|e| e.to_string())
}

#[command]
fn open_csv_file(path: String, row_limit: Option<usize>) -> Result<csv_reader::CSVFile, String> {
    log::info!("Opening CSV file: {}", path);
    let path_buf = PathBuf::from(&path);

    match row_limit {
        Some(limit) => ChunkedCSVReader::read_file_with_limit(&path_buf, Some(limit)),
        None => ChunkedCSVReader::read_file(&path_buf),
    }
    .map_err(|e| {
        log::error!("Failed to open CSV file: {}", e);
        e.to_string()
    })
}

#[command]
fn stream_read_csv(path: String, start_row: usize, end_row: usize) -> Result<Vec<Vec<serde_json::Value>>, String> {
    log::info!("Streaming CSV file rows {} to {}", start_row, end_row);
    ChunkedCSVReader::stream_read(&path, start_row, end_row)
        .map_err(|e| e.to_string())
}

#[command]
fn read_csv_chunk(path: String, chunk_start: usize, chunk_end: usize) -> Result<Vec<Vec<serde_json::Value>>, String> {
    log::info!("Reading CSV chunk {} to {}", chunk_start, chunk_end);
    ChunkedCSVReader::read_file_chunked(&path, chunk_start, chunk_end)
        .map_err(|e| e.to_string())
}

#[command]
fn open_excel_file(path: String, sheet_name: Option<String>) -> Result<excel_reader::ExcelFile, String> {
    log::info!("Opening Excel file: {}", path);
    let path_buf = PathBuf::from(&path);

    match sheet_name {
        Some(name) => ExcelReader::read_sheet(&path_buf, Some(&name)),
        None => ExcelReader::read_file(&path_buf),
    }
    .map_err(|e| {
        log::error!("Failed to open Excel file: {}", e);
        e.to_string()
    })
}

#[command]
fn get_excel_sheets(path: String) -> Result<Vec<String>, String> {
    log::info!("Getting Excel sheets: {}", path);
    let path_buf = PathBuf::from(&path);

    ExcelReader::get_sheet_names(&path_buf).map_err(|e| {
        log::error!("Failed to get sheet names: {}", e);
        e.to_string()
    })
}

#[command]
fn read_excel_range(path: String, sheet_name: String, start_row: usize, end_row: usize) -> Result<Vec<Vec<serde_json::Value>>, String> {
    log::info!("Reading Excel range: {}!{}:{}", sheet_name, start_row, end_row);

    ExcelReader::read_sheet_range(&path, &sheet_name, start_row, end_row)
        .map_err(|e| e.to_string())
}

#[command]
async fn create_script_session(state: tauri::State<'_, AppState>, script_type: String) -> Result<String, String> {
    let executor = state.script_executor.lock().await;
    let stype = match script_type.as_str() {
        "stata" => ScriptType::Stata,
        "python" => ScriptType::Python,
        _ => return Err("Unsupported script type".to_string()),
    };
    Ok(executor.create_session(stype).await)
}

#[command]
async fn execute_do_file(state: tauri::State<'_, AppState>, session_id: String, do_file_path: String, working_dir: Option<String>) -> Result<script_executor::ExecutionResult, String> {
    let executor = state.script_executor.lock().await;
    executor.execute_stata_do_file(&session_id, &do_file_path, working_dir.as_deref()).await
}

#[command]
async fn execute_do_content(state: tauri::State<'_, AppState>, session_id: String, do_content: String) -> Result<script_executor::ExecutionResult, String> {
    let executor = state.script_executor.lock().await;
    executor.execute_stata_interpret(&session_id, &do_content).await
}

#[command]
async fn execute_python_script(state: tauri::State<'_, AppState>, session_id: String, script_path: Option<String>, script_content: Option<String>, working_dir: Option<String>) -> Result<script_executor::ExecutionResult, String> {
    let executor = state.script_executor.lock().await;
    executor.execute_python_script(&session_id, script_path.as_deref(), script_content.as_deref(), working_dir.as_deref()).await
}

#[command]
async fn get_session_info(state: tauri::State<'_, AppState>, session_id: String) -> Result<Option<script_executor::ExecutionSession>, String> {
    let executor = state.script_executor.lock().await;
    Ok(executor.get_session(&session_id).await)
}

#[command]
async fn list_sessions(state: tauri::State<'_, AppState>) -> Result<Vec<script_executor::ExecutionSession>, String> {
    let executor = state.script_executor.lock().await;
    Ok(executor.list_sessions().await)
}

#[command]
async fn stop_session(state: tauri::State<'_, AppState>, session_id: String) -> Result<(), String> {
    let executor = state.script_executor.lock().await;
    executor.stop_session(&session_id).await
}

#[command]
fn get_stata_commands() -> Vec<script_executor::StataCommandInfo> {
    let executor = ScriptExecutor::new();
    executor.get_stata_commands()
}

#[command]
fn get_stata_completions(input: String) -> Vec<String> {
    StataCompleter::get_completions(&input)
}

#[command]
fn get_file_mmap_info(path: String) -> Result<mmap_reader::MmapFileInfo, String> {
    let reader = mmap_reader::MmapReader::new(&path).map_err(|e| e.to_string())?;
    reader.get_file_info().map_err(|e| e.to_string())
}

#[command]
fn estimate_memory_usage(rows: usize, columns: usize, avg_cell_size: usize) -> u64 {
    mmap_reader::estimate_memory_usage(rows, columns, avg_cell_size)
}

#[command]
fn calculate_optimal_chunk_size(file_size: u64, available_memory: u64) -> usize {
    mmap_reader::calculate_optimal_chunk_size(file_size, available_memory)
}

#[command]
async fn execute_powershell_command(
    app: tauri::AppHandle,
    code: String,
) -> Result<(), String> {
    let mut cmd = TokioCommand::new("powershell.exe");
    cmd.arg("-NoProfile")
        .arg("-NonInteractive")
        .arg("-Command")
        .arg(&code)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let mut child = cmd.spawn().map_err(|e| format!("无法启动 PowerShell: {}", e))?;
    
    let stdout = child.stdout.take().expect("Failed to get stdout");
    let stderr = child.stderr.take().expect("Failed to get stderr");
    
    let mut stdout_reader = BufReader::new(stdout).lines();
    let mut stderr_reader = BufReader::new(stderr).lines();
    
    // 读取标准输出
    while let Ok(Some(line)) = stdout_reader.next_line().await {
        app.emit("powershell:output", &line).map_err(|e| e.to_string())?;
    }
    
    // 读取错误输出
    while let Ok(Some(line)) = stderr_reader.next_line().await {
        app.emit("powershell:error", &line).map_err(|e| e.to_string())?;
    }
    
    let status = child.wait().await.map_err(|e| e.to_string())?;
    let exit_code = status.code().unwrap_or(-1);
    
    app.emit("powershell:done", exit_code).map_err(|e| e.to_string())?;
    
    Ok(())
}

#[command]
async fn window_minimize(window: tauri::Window) {
    window.minimize().unwrap();
}

#[command]
async fn window_toggle_maximize(window: tauri::Window) -> Result<serde_json::Value, String> {
    let is_maximized = window.is_maximized().map_err(|e| e.to_string())?;
    if is_maximized {
        window.unmaximize().map_err(|e| e.to_string())?;
        Ok(serde_json::json!({ "is_maximized": false }))
    } else {
        window.maximize().map_err(|e| e.to_string())?;
        Ok(serde_json::json!({ "is_maximized": true }))
    }
}

#[command]
async fn window_close(window: tauri::Window) {
    window.close().unwrap();
}

#[command]
async fn window_snap(window: tauri::Window, edge: String) -> Result<(), String> {
    let monitor = window.current_monitor().map_err(|e| e.to_string())?;
    let monitor = monitor.ok_or("No monitor found".to_string())?;
    let monitor_size = monitor.size();
    let monitor_pos = monitor.position();
    
    let screen_width = monitor_size.width as i32;
    let screen_height = monitor_size.height as i32;
    let screen_x = monitor_pos.x;
    let screen_y = monitor_pos.y;
    
    let current_size = window.inner_size().map_err(|e| e.to_string())?;
    let _window_height = current_size.height as i32;
    let half_width = screen_width / 2;
    
    let (x, y, width, height) = match edge.as_str() {
        "left" => (
            screen_x,
            screen_y,
            half_width,
            screen_height,
        ),
        "right" => (
            screen_x + half_width,
            screen_y,
            half_width,
            screen_height,
        ),
        "top" => (
            screen_x,
            screen_y,
            screen_width,
            screen_height,
        ),
        _ => return Err(format!("Unknown edge: {}", edge)),
    };
    
    window.set_size(tauri::Size::Physical(tauri::PhysicalSize {
        width: width as u32,
        height: height as u32,
    })).map_err(|e| e.to_string())?;
    
    window.set_position(tauri::Position::Physical(tauri::PhysicalPosition {
        x,
        y,
    })).map_err(|e| e.to_string())?;
    
    Ok(())
}

fn main() {
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info"))
        .init();

    log::info!("Starting PocketStata v1.0.0");

    let app_state = AppState {
        script_executor: Arc::new(Mutex::new(ScriptExecutor::new())),
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tab_drag_plugin::init())
        .manage(app_state)
        .invoke_handler(tauri::generate_handler![
            open_dta_file,
            get_file_info,
            stream_read_dta,
            open_csv_file,
            stream_read_csv,
            read_csv_chunk,
            open_excel_file,
            get_excel_sheets,
            read_excel_range,
            create_script_session,
            execute_do_file,
            execute_do_content,
            execute_python_script,
            get_session_info,
            list_sessions,
            stop_session,
            get_stata_commands,
            get_stata_completions,
            get_file_mmap_info,
            estimate_memory_usage,
            calculate_optimal_chunk_size,
            execute_powershell_command,
            window_minimize,
            window_toggle_maximize,
            window_close,
            window_snap,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
