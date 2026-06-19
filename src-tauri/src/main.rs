#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod tab_drag_plugin;
mod csv_reader;
mod excel_reader;
mod dta_reader;
mod mmap_reader;
mod script_executor;
mod project_manager;

use std::path::PathBuf;
use std::sync::Arc;
use tauri::command;
use tauri::Emitter;
use tokio::sync::Mutex;
use tokio::process::Command as TokioCommand;
use std::process::Stdio;
use tokio::io::{AsyncBufReadExt, BufReader};
use std::fs;
use std::io::Read as IoRead;

use csv_reader::ChunkedCSVReader;
use excel_reader::ExcelReader;
use dta_reader::DTAFile;
use script_executor::{ScriptExecutor, ScriptType, StataCompleter};
mod pty_session;

struct AppState {
    script_executor: Arc<Mutex<ScriptExecutor>>,
    pty_registry: Arc<pty_session::PtyRegistry>,
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
    use encoding_rs::{UTF_8, GBK, GB18030};

    // 注入 UTF-8 输出编码设置
    let ps_prefix = "$OutputEncoding = [System.Text.Encoding]::UTF8; \
                     [Console]::OutputEncoding = [System.Text.Encoding]::UTF8; \
                     $PSDefaultParameterValues['Out-File:Encoding'] = 'utf8'; \
                     chcp 65001 | Out-Null; ";
    let wrapped = format!("{}{}", ps_prefix, code);

    let mut cmd = TokioCommand::new("powershell.exe");
    cmd.arg("-NoProfile")
        .arg("-NonInteractive")
        .arg("-Command")
        .arg(&wrapped)
        .env("PYTHONIOENCODING", "utf-8")
        .env("PYTHONUTF8", "1")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    let mut child = cmd.spawn().map_err(|e| format!("无法启动 PowerShell: {}", e))?;

    let stdout = child.stdout.take().expect("Failed to get stdout");
    let stderr = child.stderr.take().expect("Failed to get stderr");

    // 统一解码：优先 UTF-8，失败回退 GBK/GB18030
    fn decode_bytes(bytes: &[u8]) -> String {
        if bytes.is_empty() {
            return String::new();
        }
        let (cow, _, had) = UTF_8.decode(bytes);
        if !had {
            return cow.into_owned();
        }
        for enc in &[GBK, GB18030] {
            let (c, _, h) = enc.decode(bytes);
            if !h {
                return c.into_owned();
            }
        }
        String::from_utf8_lossy(bytes).into_owned()
    }

    // 读取 stdout：按 UTF-8 抓换行符分段（兼容 Windows CRLF）
    let mut stdout_buf: Vec<u8> = Vec::new();
    let mut stdout_reader = BufReader::new(stdout);
    let mut tmp = [0u8; 1024];
    use tokio::io::AsyncReadExt;
    loop {
        match stdout_reader.read(&mut tmp).await {
            Ok(0) => break,
            Ok(n) => {
                stdout_buf.extend_from_slice(&tmp[..n]);
                // 按行发射（CRLF / LF 都视为换行）
                while let Some(idx) = stdout_buf.iter().position(|&b| b == b'\n') {
                    let line_bytes: Vec<u8> = stdout_buf.drain(..=idx).collect();
                    let line = decode_bytes(&line_bytes);
                    let trimmed = line.trim_end_matches(&['\r', '\n'][..]).to_string();
                    app.emit("powershell:output", &trimmed).map_err(|e| e.to_string())?;
                }
            }
            Err(_) => break,
        }
    }
    if !stdout_buf.is_empty() {
        let line = decode_bytes(&stdout_buf);
        app.emit("powershell:output", &line).map_err(|e| e.to_string())?;
    }

    // 读取 stderr
    let mut stderr_buf: Vec<u8> = Vec::new();
    let mut stderr_reader = BufReader::new(stderr);
    loop {
        match stderr_reader.read(&mut tmp).await {
            Ok(0) => break,
            Ok(n) => {
                stderr_buf.extend_from_slice(&tmp[..n]);
                while let Some(idx) = stderr_buf.iter().position(|&b| b == b'\n') {
                    let line_bytes: Vec<u8> = stderr_buf.drain(..=idx).collect();
                    let line = decode_bytes(&line_bytes);
                    let trimmed = line.trim_end_matches(&['\r', '\n'][..]).to_string();
                    app.emit("powershell:error", &trimmed).map_err(|e| e.to_string())?;
                }
            }
            Err(_) => break,
        }
    }
    if !stderr_buf.is_empty() {
        let line = decode_bytes(&stderr_buf);
        app.emit("powershell:error", &line).map_err(|e| e.to_string())?;
    }

    let status = child.wait().await.map_err(|e| e.to_string())?;
    let exit_code = status.code().unwrap_or(-1);

    app.emit("powershell:done", exit_code).map_err(|e| e.to_string())?;

    Ok(())
}

/* =================================================================
 * 真正的 PTY 终端（xterm.js 后端）：
 *  - pty_spawn / pty_write / pty_resize / pty_close
 *  - 输出 / 退出事件：pty:<id>:out  /  pty:<id>:exit
 * ================================================================= */

#[command]
fn pty_spawn(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    id: String,
    shell: String,
    args: Option<Vec<String>>,
    cwd: Option<String>,
) -> Result<(), String> {
    let args = args.unwrap_or_default();
    let cwd = cwd.unwrap_or_default();
    state
        .pty_registry
        .spawn(app, id, shell, args, cwd)
}

#[command]
fn pty_write(
    state: tauri::State<'_, AppState>,
    id: String,
    data: String,
) -> Result<(), String> {
    state.pty_registry.write(&id, &data)
}

#[command]
fn pty_resize(
    state: tauri::State<'_, AppState>,
    id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    state.pty_registry.resize(&id, cols, rows)
}

#[command]
fn pty_close(
    state: tauri::State<'_, AppState>,
    id: String,
) -> Result<(), String> {
    state.pty_registry.close(&id)
}

#[command]
fn pty_is_alive(
    state: tauri::State<'_, AppState>,
    id: String,
) -> Result<bool, String> {
    Ok(state.pty_registry.is_alive(&id))
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

/// 枚举系统已安装的字体（跨平台）
///
/// - Windows: 扫描 `C:\Windows\Fonts` 下所有 .ttf/.otf 文件并尝试读取 family name
/// - macOS:   扫描 /System/Library/Fonts, /Library/Fonts, $HOME/Library/Fonts
/// - Linux:   扫描 /usr/share/fonts, /usr/local/share/fonts, $HOME/.fonts, $HOME/.local/share/fonts
///
/// 实现策略：直接扫描字体文件，从 TTF/OTF 的 name 表中解析 family 名称（仅 name ID=1），
/// 失败时回退到去除扩展名的文件名。
#[command]
fn list_system_fonts() -> Vec<String> {
    use std::collections::BTreeSet;

    let mut dirs: Vec<PathBuf> = Vec::new();
    #[cfg(target_os = "windows")]
    {
        if let Ok(winfonts) = std::env::var("WINDIR") {
            dirs.push(PathBuf::from(winfonts).join("Fonts"));
        } else {
            dirs.push(PathBuf::from("C:\\Windows\\Fonts"));
        }
        if let Ok(local) = std::env::var("LOCALAPPDATA") {
            dirs.push(PathBuf::from(local).join("Microsoft\\Windows\\Fonts"));
        }
    }
    #[cfg(target_os = "macos")]
    {
        dirs.push(PathBuf::from("/System/Library/Fonts"));
        dirs.push(PathBuf::from("/Library/Fonts"));
        if let Ok(home) = std::env::var("HOME") {
            dirs.push(PathBuf::from(home).join("Library/Fonts"));
        }
    }
    #[cfg(target_os = "linux")]
    {
        dirs.push(PathBuf::from("/usr/share/fonts"));
        dirs.push(PathBuf::from("/usr/local/share/fonts"));
        if let Ok(home) = std::env::var("HOME") {
            dirs.push(PathBuf::from(home).join(".fonts"));
            dirs.push(PathBuf::from(home).join(".local/share/fonts"));
        }
    }

    let mut set: BTreeSet<String> = BTreeSet::new();
    for dir in &dirs {
        walk_font_dir(dir, &mut set, 0);
    }

    set.into_iter().collect()
}

fn walk_font_dir(dir: &std::path::Path, set: &mut std::collections::BTreeSet<String>, depth: u32) {
    if depth > 4 {
        return;
    }
    let Ok(rd) = fs::read_dir(dir) else { return; };
    for entry in rd.flatten() {
        let path = entry.path();
        if path.is_dir() {
            walk_font_dir(&path, set, depth + 1);
            continue;
        }
        let ext = path
            .extension()
            .and_then(|s| s.to_str())
            .map(|s| s.to_ascii_lowercase());
        if !matches!(ext.as_deref(), Some("ttf") | Some("otf") | Some("ttc")) {
            continue;
        }
        // 1. 尝试从 TTF/OTF 解析 family name（仅 name ID=1，platform=3/0）
        if let Some(name) = read_ttf_family_name(&path) {
            let trimmed = name.trim();
            if !trimmed.is_empty() {
                set.insert(trimmed.to_string());
                continue;
            }
        }
        // 2. 回退到文件主名
        if let Some(stem) = path.file_stem().and_then(|s| s.to_str()) {
            // 常见命名约定：FamilyName-Style（如 "MapleMono-NF-CN-Regular"）
            // 简单按 '-' 切分，取前两段
            let parts: Vec<&str> = stem.split('-').collect();
            let candidate = if parts.len() >= 2 {
                format!("{} {}", parts[0], parts[1])
            } else {
                stem.to_string()
            };
            set.insert(candidate);
        }
    }
}

/// 极简 TTF/OTF family name 解析：仅读取 name table 中的 name ID=1 (family) 记录。
/// 兼容 TrueType (TTF) 与 OpenType (OTF) 字体；TTC 字体取第一个 face。
fn read_ttf_family_name(path: &std::path::Path) -> Option<String> {
    let mut file = fs::File::open(path).ok()?;
    // TTF 头：4 字节 tag + 4 字节 numTables
    let mut header = [0u8; 12];
    file.read_exact(&mut header).ok()?;
    let num_tables = u16::from_be_bytes([header[4], header[5]]) as usize;

    // 读取 offset table 之后的所有内容
    let mut table = [0u8; 16];
    for _ in 0..num_tables {
        if file.read_exact(&mut table).is_err() {
            return None;
        }
        let tag = &table[0..4];
        if tag == b"name" {
            let string_offset = u16::from_be_bytes([table[4], table[5]]) as u64;
            let storage_offset = u16::from_be_bytes([table[6], table[7]]) as u64;
            let table_length = u32::from_be_bytes([table[12], table[13], table[14], table[15]]) as u64;

            // 跳转至 string_offset
            use std::io::Seek;
            use std::io::SeekFrom;
            file.seek(SeekFrom::Start(string_offset)).ok()?;
            let mut name_data = vec![0u8; (table_length.saturating_sub(string_offset)) as usize];
            // 简化：直接读取整张 name table（不超 2MB）
            file.seek(SeekFrom::Start(string_offset)).ok()?;
            let mut name_table_full = vec![0u8; table_length.min(2 * 1024 * 1024) as usize];
            if file.read_exact(&mut name_table_full).is_err() {
                return None;
            }

            // name table: 6 字节 header (format, count, stringOffset)
            if name_table_full.len() < 6 {
                return None;
            }
            let count = u16::from_be_bytes([name_table_full[2], name_table_full[3]]) as usize;
            let mut offset = 6;
            for _ in 0..count {
                if offset + 12 > name_table_full.len() {
                    return None;
                }
                let platform = u16::from_be_bytes([name_table_full[offset], name_table_full[offset + 1]]);
                let name_id = u16::from_be_bytes([name_table_full[offset + 6], name_table_full[offset + 7]]);
                // name ID 1 = Font Family
                if name_id == 1 {
                    let length = u16::from_be_bytes([name_table_full[offset + 8], name_table_full[offset + 9]]) as usize;
                    let str_off = u16::from_be_bytes([name_table_full[offset + 10], name_table_full[offset + 11]]) as usize;
                    let storage_off_in_name = u16::from_be_bytes([name_table_full[4], name_table_full[5]]) as usize;
                    let abs_off = storage_off_in_name + str_off;
                    if abs_off + length <= name_table_full.len() {
                        let bytes = &name_table_full[abs_off..abs_off + length];
                        // 优先 Windows Unicode (platform=3, encoding=1)
                        let s = if platform == 3 || platform == 0 {
                            // UTF-16BE
                            let mut chars: Vec<u16> = Vec::with_capacity(bytes.len() / 2);
                            for chunk in bytes.chunks_exact(2) {
                                chars.push(u16::from_be_bytes([chunk[0], chunk[1]]));
                            }
                            String::from_utf16_lossy(&chars)
                        } else {
                            // 平台 1 = Macintosh，单字节字符集
                            String::from_utf8_lossy(bytes).into_owned()
                        };
                        if !s.trim().is_empty() {
                            return Some(s);
                        }
                    }
                }
                offset += 12;
            }
            return None;
        }
    }
    None
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

/// 保存 DTA 文件（简化版，使用 POCKETSTATA_DTA_V1 + CSV 编码）
#[command]
fn save_dta_file(path: String, file: dta_reader::DTAFile) -> Result<(), String> {
    log::info!("Saving DTA file to: {}", path);
    let path_buf = PathBuf::from(&path);
    DTAFile::write_file(&path_buf, &file).map_err(|e| e.to_string())
}

/// 保存 XLSX 文件
#[command]
fn save_xlsx_file(
    path: String,
    file: serde_json::Value,
) -> Result<(), String> {
    log::info!("Saving XLSX file to: {}", path);
    let name = file
        .get("name")
        .and_then(|v| v.as_str())
        .unwrap_or("Sheet1");
    let sheet_name = name.replace(['.', '/', '\\', '?', '*', '[', ']', ':'], "_");
    let variables: Vec<String> = file
        .get("variables")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(|s| s.to_string()))
                .collect()
        })
        .unwrap_or_default();
    let data: Vec<Vec<serde_json::Value>> = file
        .get("data")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|row| row.as_array().cloned())
                .collect()
        })
        .unwrap_or_default();

    let path_buf = PathBuf::from(&path);
    excel_reader::write_xlsx_file(&path_buf, &sheet_name, &variables, &data)
        .map_err(|e| e.to_string())
}

/// 退出应用（关闭所有窗口并退出进程）
#[command]
fn exit_app(app: tauri::AppHandle) {
    log::info!("Exit app requested");
    app.exit(0);
}

#[derive(serde::Serialize)]
struct ShellOutput {
    stdout: String,
    stderr: String,
    exit_code: i32,
}

/// 终端上下文：用户的家目录与默认当前工作目录
/// Windows：家目录取自 `USERPROFILE`，否则 `C:\Users\<user>`
/// 其他平台：取自 `HOME`
#[derive(serde::Serialize)]
struct TerminalContext {
    home_dir: String,
    cwd: String,
    username: String,
    is_windows: bool,
    powershell_path: String,
}

/// 检查路径是否存在且为目录（用于终端 cd 校验）
#[command]
fn path_exists(path: String) -> bool {
    let p = std::path::Path::new(&path);
    p.exists() && p.is_dir()
}

#[command]
fn get_terminal_context() -> Result<TerminalContext, String> {
    use std::env;
    let is_windows = cfg!(target_os = "windows");
    let username = if is_windows {
        env::var("USERNAME").unwrap_or_else(|_| "User".to_string())
    } else {
        env::var("USER").unwrap_or_else(|_| "user".to_string())
    };
    let home_dir = if is_windows {
        env::var("USERPROFILE")
            .or_else(|_| env::var("HOME"))
            .unwrap_or_else(|_| {
                // 回退：C:\Users\<username>
                if !username.is_empty() {
                    format!("C:\\Users\\{}", username)
                } else {
                    "C:\\".to_string()
                }
            })
    } else {
        env::var("HOME").unwrap_or_else(|_| "/".to_string())
    };
    let cwd = env::current_dir()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|_| home_dir.clone());
    // 尝试定位 PowerShell 路径（仅 Windows）；找不到时回退到 "powershell"
    let powershell_path = if is_windows {
        // 优先 pwsh（PowerShell Core 7+），再回退 Windows PowerShell 5.1
        let candidates = [
            "pwsh.exe",
            "C:\\Program Files\\PowerShell\\7\\pwsh.exe",
            "C:\\Program Files (x86)\\PowerShell\\7\\pwsh.exe",
            "powershell.exe",
        ];
        let mut found = "powershell.exe".to_string();
        for cand in &candidates {
            if std::path::Path::new(cand).exists() {
                found = cand.to_string();
                break;
            }
        }
        // 用 where 命令兜底查找
        if !std::path::Path::new(&found).exists() {
            if let Ok(out) = std::process::Command::new("where").arg("pwsh").output() {
                if out.status.success() {
                    if let Some(line) = String::from_utf8_lossy(&out.stdout).lines().next() {
                        if !line.trim().is_empty() {
                            found = line.trim().to_string();
                        }
                    }
                }
            }
        }
        found
    } else {
        "bash".to_string()
    };
    Ok(TerminalContext {
        home_dir,
        cwd,
        username,
        is_windows,
        powershell_path,
    })
}

/// 执行 PowerShell 命令并返回完整输出
///
/// 关键：PowerShell 在 Windows 上默认按系统活动代码页（中文环境通常为 GBK/CP936）
/// 输出字节流，UTF-8 文本会变成乱码。解决方式：
/// 1. 在命令前注入设置 `[Console]::OutputEncoding` 与 `$OutputEncoding` 为 UTF-8
/// 2. 设置子进程环境变量（`PYTHONIOENCODING` / `PYTHONUTF8`）让 Python 等子进程也输出 UTF-8
/// 3. 输出字节优先按 UTF-8 解码；失败时尝试 GBK/GB18030 兜底（兼容旧 PowerShell）
#[command]
fn execute_shell(command: String, cwd: Option<String>) -> Result<ShellOutput, String> {
    use encoding_rs::{UTF_8, GBK, GB18030};

    // 注入 UTF-8 输出编码设置
    let ps_prefix = "$OutputEncoding = [System.Text.Encoding]::UTF8; \
                     [Console]::OutputEncoding = [System.Text.Encoding]::UTF8; \
                     $PSDefaultParameterValues['Out-File:Encoding'] = 'utf8'; \
                     chcp 65001 | Out-Null; ";
    let wrapped = format!("{}{}", ps_prefix, command);

    let mut cmd = std::process::Command::new("powershell");
    cmd.args(["-NoProfile", "-NonInteractive", "-Command", &wrapped]);

    if let Some(dir) = &cwd {
        cmd.current_dir(dir);
    }

    // 子进程统一使用 UTF-8
    cmd.env("PYTHONIOENCODING", "utf-8")
        .env("PYTHONUTF8", "1")
        .env("CHCP", "65001");

    let output = cmd.output().map_err(|e| format!("无法启动 PowerShell: {}", e))?;

    let decode = |bytes: &[u8]| -> String {
        if bytes.is_empty() {
            return String::new();
        }
        // 1. 优先尝试 UTF-8（PowerShell 设置后应当走这条路径）
        let (cow, _, had_errors) = UTF_8.decode(bytes);
        if !had_errors {
            return cow.into_owned();
        }
        // 2. 兜底：尝试 GBK -> GB18030（中文 Windows 常见代码页）
        for enc in &[GBK, GB18030] {
            let (cow2, _, had2) = enc.decode(bytes);
            if !had2 {
                return cow2.into_owned();
            }
        }
        // 3. 最后兜底：lossy UTF-8
        String::from_utf8_lossy(bytes).into_owned()
    };

    Ok(ShellOutput {
        stdout: decode(&output.stdout),
        stderr: decode(&output.stderr),
        exit_code: output.status.code().unwrap_or(-1),
    })
}

fn main() {
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info"))
        .init();

    log::info!("Starting PocketData v1.0.0");

    let app_state = AppState {
        script_executor: Arc::new(Mutex::new(ScriptExecutor::new())),
        pty_registry: Arc::new(pty_session::PtyRegistry::new()),
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_clipboard_manager::init())
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
            execute_shell,
            pty_spawn,
            pty_write,
            pty_resize,
            pty_close,
            pty_is_alive,
            get_terminal_context,
            path_exists,
            window_minimize,
            window_toggle_maximize,
            window_close,
            window_snap,
            save_dta_file,
            save_xlsx_file,
            exit_app,
            project_manager::read_project_tree,
            project_manager::save_project,
            project_manager::read_project,
            project_manager::reveal_in_explorer,
            project_manager::rename_path,
            project_manager::delete_path,
            project_manager::copy_file_to_project,
            project_manager::create_project,
            list_system_fonts,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
