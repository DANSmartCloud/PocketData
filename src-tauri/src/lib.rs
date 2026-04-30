mod dta_reader;

use dta_reader::{DTAFile, DTAReader};
use std::path::PathBuf;
use tauri::command;

#[command]
fn open_dta_file(path: String) -> Result<DTAFile, String> {
    log::info!("Opening DTA file: {}", path);
    let path_buf = PathBuf::from(&path);

    DTAReader::read_file(&path_buf).map_err(|e| {
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
        b"<stata" => 13,
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info"))
        .init();

    log::info!("Starting PocketStata v1.0.0");

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![open_dta_file, get_file_info])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
