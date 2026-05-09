use serde::{Deserialize, Serialize};
use std::fs::File;
use std::io::{BufReader, BufRead};
use std::path::Path;
use thiserror::Error;
use rayon::prelude::*;
use std::sync::Arc;

#[derive(Debug, Error)]
pub enum CSVError {
    #[error("文件无法打开: {0}")]
    FileOpen(String),
    #[error("CSV解析错误: {0}")]
    ParseError(String),
    #[error("读取错误: {0}")]
    ReadError(String),
    #[error("内存映射错误: {0}")]
    MmapError(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CSVFile {
    pub path: String,
    pub name: String,
    pub headers: Vec<String>,
    pub total_rows: usize,
    pub data: Vec<Vec<serde_json::Value>>,
    pub file_size: u64,
    pub is_large_file: bool,
}

pub struct ChunkedCSVReader {
    chunk_size: usize,
}

impl ChunkedCSVReader {
    pub fn new(chunk_size: usize) -> Self {
        Self { chunk_size }
    }

    pub fn read_file<P: AsRef<Path>>(path: P) -> Result<CSVFile, CSVError> {
        Self::read_file_with_limit(path, None)
    }

    pub fn read_file_with_limit<P: AsRef<Path>>(
        path: P,
        row_limit: Option<usize>,
    ) -> Result<CSVFile, CSVError> {
        let path = path.as_ref();
        let file = File::open(path).map_err(|e| CSVError::FileOpen(e.to_string()))?;
        let file_size = file.metadata()
            .map_err(|e| CSVError::FileOpen(e.to_string()))?
            .len();
        
        const LARGE_FILE_THRESHOLD: u64 = 100 * 1024 * 1024;
        let is_large_file = file_size > LARGE_FILE_THRESHOLD;

        let name = path.file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| "unknown".to_string());

        if is_large_file {
            Self::read_large_file(path, file_size, &name, row_limit)
        } else {
            Self::read_small_file(path, file_size, &name, row_limit)
        }
    }

    fn read_small_file<P: AsRef<Path>>(
        path: P,
        file_size: u64,
        name: &str,
        row_limit: Option<usize>,
    ) -> Result<CSVFile, CSVError> {
        let path = path.as_ref();
        let file = File::open(path).map_err(|e| CSVError::FileOpen(e.to_string()))?;
        let reader = BufReader::new(file);
        let mut csv_reader = csv::ReaderBuilder::new()
            .flexible(true)
            .has_headers(true)
            .from_reader(reader);

        let headers = csv_reader
            .headers()
            .map_err(|e| CSVError::ParseError(e.to_string()))?
            .iter()
            .map(|h| h.to_string())
            .collect();

        let mut data = Vec::new();
        let mut count = 0;
        
        for result in csv_reader.records() {
            let record = result.map_err(|e| CSVError::ParseError(e.to_string()))?;
            let row: Vec<serde_json::Value> = record
                .iter()
                .map(|field| Self::parse_field(field))
                .collect();
            data.push(row);
            count += 1;

            if let Some(limit) = row_limit {
                if count >= limit {
                    break;
                }
            }
        }

        Ok(CSVFile {
            path: path.to_string_lossy().to_string(),
            name: name.to_string(),
            headers,
            total_rows: count,
            data,
            file_size,
            is_large_file: false,
        })
    }

    fn read_large_file<P: AsRef<Path>>(
        path: P,
        file_size: u64,
        name: &str,
        row_limit: Option<usize>,
    ) -> Result<CSVFile, CSVError> {
        let path = path.as_ref();
        let file = File::open(path).map_err(|e| CSVError::FileOpen(e.to_string()))?;
        let mut reader = BufReader::with_capacity(8 * 1024 * 1024, file);

        let mut header_line = String::new();
        reader.read_line(&mut header_line)
            .map_err(|e| CSVError::ReadError(e.to_string()))?;

        let headers: Vec<String> = csv::ReaderBuilder::new()
            .has_headers(false)
            .from_reader(header_line.as_bytes())
            .headers()
            .map_err(|e| CSVError::ParseError(e.to_string()))?
            .iter()
            .map(|h| h.trim().to_string())
            .collect();

        let chunk_data = Self::read_chunks_parallel(&mut reader, row_limit)?;

        Ok(CSVFile {
            path: path.to_string_lossy().to_string(),
            name: name.to_string(),
            headers,
            total_rows: chunk_data.len(),
            data: chunk_data,
            file_size,
            is_large_file: true,
        })
    }

    fn read_chunks_parallel(
        reader: &mut BufReader<File>,
        row_limit: Option<usize>,
    ) -> Result<Vec<Vec<serde_json::Value>>, CSVError> {
        let mut all_lines = Vec::new();
        let mut line = String::new();
        let mut count = 0;

        loop {
            line.clear();
            let bytes_read = reader.read_line(&mut line)
                .map_err(|e| CSVError::ReadError(e.to_string()))?;
            
            if bytes_read == 0 {
                break;
            }

            if let Some(limit) = row_limit {
                if count >= limit {
                    break;
                }
            }

            if line.trim().is_empty() {
                continue;
            }

            all_lines.push(line.clone());
            count += 1;
        }

        let lines = Arc::new(all_lines);
        let chunk_size = std::cmp::max(10000, lines.len() / rayon::current_num_threads());

        let chunks: Vec<Vec<Vec<serde_json::Value>>> = lines
            .chunks(chunk_size)
            .par_bridge()
            .map(|chunk| {
                chunk
                    .iter()
                    .filter(|line| !line.trim().is_empty())
                    .map(|line| {
                        let line_bytes = line.as_bytes();
                        let mut csv_reader = csv::ReaderBuilder::new()
                            .has_headers(false)
                            .flexible(true)
                            .from_reader(line_bytes);

                        if let Some(record) = csv_reader.records().next() {
                            match record {
                                Ok(r) => r.iter().map(|field| Self::parse_field(field)).collect(),
                                Err(_) => vec![serde_json::Value::String(line.trim().to_string())],
                            }
                        } else {
                            vec![]
                        }
                    })
                    .collect()
            })
            .collect();

        let mut result = Vec::with_capacity(lines.len());
        for chunk in chunks {
            result.extend(chunk);
        }

        Ok(result)
    }

    pub fn stream_read<P: AsRef<Path>>(
        path: P,
        start_row: usize,
        end_row: usize,
    ) -> Result<Vec<Vec<serde_json::Value>>, CSVError> {
        let path = path.as_ref();
        let file = File::open(path).map_err(|e| CSVError::FileOpen(e.to_string()))?;
        let mut reader = BufReader::with_capacity(8 * 1024 * 1024, file);

        let mut line = String::new();
        let mut current_row = 0;
        let mut result = Vec::new();

        reader.read_line(&mut line)
            .map_err(|e| CSVError::ReadError(e.to_string()))?;

        loop {
            line.clear();
            let bytes_read = reader.read_line(&mut line)
                .map_err(|e| CSVError::ReadError(e.to_string()))?;

            if bytes_read == 0 {
                break;
            }

            if current_row >= start_row && current_row < end_row {
                if line.trim().is_empty() {
                    continue;
                }

                let line_bytes = line.as_bytes();
                let mut csv_reader = csv::ReaderBuilder::new()
                    .has_headers(false)
                    .flexible(true)
                    .from_reader(line_bytes);

                if let Some(record) = csv_reader.records().next() {
                    match record {
                        Ok(r) => {
                            let row: Vec<serde_json::Value> = r
                                .iter()
                                .map(|field| Self::parse_field(field))
                                .collect();
                            result.push(row);
                        }
                        Err(_) => continue,
                    }
                }
            }

            if current_row >= end_row {
                break;
            }

            current_row += 1;
        }

        Ok(result)
    }

    fn parse_field(field: &str) -> serde_json::Value {
        let trimmed = field.trim();
        
        if trimmed.is_empty() {
            return serde_json::Value::Null;
        }

        if let Ok(i) = trimmed.parse::<i64>() {
            return serde_json::Value::Number(serde_json::Number::from(i));
        }

        if let Ok(f) = trimmed.parse::<f64>() {
            if f.is_finite() {
                if let Some(n) = serde_json::Number::from_f64(f) {
                    return serde_json::Value::Number(n);
                }
            }
            return serde_json::Value::Null;
        }

        let lower = trimmed.to_lowercase();
        match lower.as_str() {
            "true" | "1" => return serde_json::Value::Bool(true),
            "false" | "0" => return serde_json::Value::Bool(false),
            _ => {}
        }

        serde_json::Value::String(trimmed.to_string())
    }

    pub fn read_file_chunked<P: AsRef<Path>>(
        path: P,
        chunk_start: usize,
        chunk_end: usize,
    ) -> Result<Vec<Vec<serde_json::Value>>, CSVError> {
        Self::stream_read(path, chunk_start, chunk_end)
    }
}

pub fn detect_csv_encoding<P: AsRef<Path>>(_path: P) -> Result<String, CSVError> {
    Ok("UTF-8".to_string())
}
