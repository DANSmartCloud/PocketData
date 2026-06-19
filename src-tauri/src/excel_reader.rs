use serde::{Deserialize, Serialize};
use std::fs::File;
use std::io::BufReader;
use std::path::Path;
use thiserror::Error;
use calamine::Reader;

#[derive(Debug, Error)]
pub enum ExcelError {
    #[error("文件无法打开: {0}")]
    FileOpen(String),
    #[error("Excel解析错误: {0}")]
    ParseError(String),
    #[error("不支持的文件格式: {0}")]
    UnsupportedFormat(String),
    #[error("工作表不存在: {0}")]
    SheetNotFound(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExcelSheet {
    pub name: String,
    pub index: usize,
    pub rows: usize,
    pub columns: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExcelFile {
    pub path: String,
    pub name: String,
    pub sheets: Vec<ExcelSheet>,
    pub headers: Vec<String>,
    pub data: Vec<Vec<serde_json::Value>>,
    pub file_size: u64,
    pub active_sheet: String,
}

pub struct ExcelReader;

impl ExcelReader {
    pub fn read_file<P: AsRef<Path>>(path: P) -> Result<ExcelFile, ExcelError> {
        Self::read_sheet(path, None)
    }

    pub fn read_sheet<P: AsRef<Path>>(
        path: P,
        sheet_name: Option<&str>,
    ) -> Result<ExcelFile, ExcelError> {
        let path = path.as_ref();
        let file = File::open(path).map_err(|e| ExcelError::FileOpen(e.to_string()))?;
        let file_size = file.metadata()
            .map_err(|e| ExcelError::FileOpen(e.to_string()))?
            .len();

        let name = path.file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| "unknown".to_string());

        let mut workbook = calamine::open_workbook_auto(path)
            .map_err(|e| ExcelError::ParseError(e.to_string()))?;

        let sheet_names = workbook.sheet_names();
        if sheet_names.is_empty() {
            return Err(ExcelError::ParseError("Excel文件中没有找到工作表".to_string()));
        }

        let sheets: Vec<ExcelSheet> = sheet_names
            .iter()
            .enumerate()
            .map(|(index, sheet_name)| {
                if let Ok(range) = workbook.worksheet_range(sheet_name) {
                    ExcelSheet {
                        name: sheet_name.clone(),
                        index,
                        rows: range.height(),
                        columns: range.width(),
                    }
                } else {
                    ExcelSheet {
                        name: sheet_name.clone(),
                        index,
                        rows: 0,
                        columns: 0,
                    }
                }
            })
            .collect();

        let target_sheet = sheet_name
            .map(|s| s.to_string())
            .unwrap_or_else(|| sheet_names[0].clone());

        if !sheet_names.contains(&target_sheet) {
            return Err(ExcelError::SheetNotFound(target_sheet));
        }

        let range = workbook
            .worksheet_range(&target_sheet)
            .map_err(|e| ExcelError::ParseError(e.to_string()))?;

        let mut headers = Vec::new();
        let mut data = Vec::new();

        for (row_idx, row) in range.rows().enumerate() {
            if row_idx == 0 {
                headers = row
                    .iter()
                    .map(|cell| Self::cell_to_string(cell))
                    .collect();
            } else {
                let values: Vec<serde_json::Value> = row
                    .iter()
                    .map(|cell| Self::cell_to_json(cell))
                    .collect();
                data.push(values);
            }
        }

        Ok(ExcelFile {
            path: path.to_string_lossy().to_string(),
            name,
            sheets,
            headers,
            data,
            file_size,
            active_sheet: target_sheet,
        })
    }

    pub fn get_sheet_names<P: AsRef<Path>>(path: P) -> Result<Vec<String>, ExcelError> {
        let path = path.as_ref();
        let workbook = calamine::open_workbook_auto(path)
            .map_err(|e| ExcelError::ParseError(e.to_string()))?;

        Ok(workbook.sheet_names().to_vec())
    }

    pub fn read_sheet_range<P: AsRef<Path>>(
        path: P,
        sheet_name: &str,
        start_row: usize,
        end_row: usize,
    ) -> Result<Vec<Vec<serde_json::Value>>, ExcelError> {
        let path = path.as_ref();
        let mut workbook = calamine::open_workbook_auto(path)
            .map_err(|e| ExcelError::ParseError(e.to_string()))?;

        let range = workbook
            .worksheet_range(sheet_name)
            .map_err(|e| ExcelError::ParseError(e.to_string()))?;

        let mut data = Vec::new();
        for (row_idx, row) in range.rows().enumerate() {
            if row_idx < start_row {
                continue;
            }
            if row_idx >= end_row {
                break;
            }
            if row_idx == 0 {
                continue;
            }

            let values: Vec<serde_json::Value> = row
                .iter()
                .map(|cell| Self::cell_to_json(cell))
                .collect();
            data.push(values);
        }

        Ok(data)
    }

    fn cell_to_json(cell: &calamine::Data) -> serde_json::Value {
        match cell {
            calamine::Data::Int(v) => serde_json::Value::Number(serde_json::Number::from(*v)),
            calamine::Data::Float(v) => {
                if v.is_finite() {
                    serde_json::Number::from_f64(*v)
                        .map(serde_json::Value::Number)
                        .unwrap_or(serde_json::Value::Null)
                } else {
                    serde_json::Value::Null
                }
            }
            calamine::Data::String(v) => serde_json::Value::String(v.clone()),
            calamine::Data::Bool(v) => serde_json::Value::Bool(*v),
            calamine::Data::DateTime(v) => {
                serde_json::Value::String(format!("{:?}", v))
            }
            calamine::Data::DateTimeIso(v) => serde_json::Value::String(v.clone()),
            calamine::Data::DurationIso(v) => serde_json::Value::String(v.clone()),
            calamine::Data::Error(e) => serde_json::Value::String(format!("Error: {}", e)),
            calamine::Data::Empty => serde_json::Value::Null,
        }
    }

    fn cell_to_string(cell: &calamine::Data) -> String {
        match cell {
            calamine::Data::Int(v) => v.to_string(),
            calamine::Data::Float(v) => v.to_string(),
            calamine::Data::String(v) => v.clone(),
            calamine::Data::Bool(v) => v.to_string(),
            calamine::Data::DateTime(v) => format!("{:?}", v),
            calamine::Data::DateTimeIso(v) => v.clone(),
            calamine::Data::DurationIso(v) => v.clone(),
            calamine::Data::Error(e) => format!("Error: {}", e),
            calamine::Data::Empty => String::new(),
        }
    }
}

/// 简单 XLSX 写出：使用 rust_xlsxwriter
pub fn write_xlsx_file<P: AsRef<Path>>(
    path: P,
    sheet_name: &str,
    variables: &[String],
    data: &[Vec<serde_json::Value>],
) -> Result<(), ExcelError> {
    use rust_xlsxwriter::{Format, Workbook};

    let mut workbook = Workbook::new();
    let header_format = Format::new()
        .set_bold()
        .set_background_color("#2563eb")
        .set_font_color("#ffffff");

    let sheet = workbook.add_worksheet();
    sheet.set_name(sheet_name).map_err(|e| ExcelError::ParseError(e.to_string()))?;

    // 写表头
    for (col_idx, var_name) in variables.iter().enumerate() {
        sheet
            .write_string_with_format(0, col_idx as u16, var_name, &header_format)
            .map_err(|e| ExcelError::ParseError(e.to_string()))?;
    }

    // 写数据
    for (row_idx, row) in data.iter().enumerate() {
        let excel_row = (row_idx + 1) as u32;
        for (col_idx, value) in row.iter().enumerate() {
            let col = col_idx as u16;
            match value {
                serde_json::Value::Null => {}
                serde_json::Value::Bool(b) => {
                    sheet
                        .write_boolean(excel_row, col, *b)
                        .map_err(|e| ExcelError::ParseError(e.to_string()))?;
                }
                serde_json::Value::Number(n) => {
                    if let Some(int_val) = n.as_i64() {
                        sheet
                            .write_number(excel_row, col, int_val as f64)
                            .map_err(|e| ExcelError::ParseError(e.to_string()))?;
                    } else if let Some(f) = n.as_f64() {
                        sheet
                            .write_number(excel_row, col, f)
                            .map_err(|e| ExcelError::ParseError(e.to_string()))?;
                    }
                }
                serde_json::Value::String(s) => {
                    sheet
                        .write_string(excel_row, col, s)
                        .map_err(|e| ExcelError::ParseError(e.to_string()))?;
                }
                other => {
                    sheet
                        .write_string(excel_row, col, other.to_string())
                        .map_err(|e| ExcelError::ParseError(e.to_string()))?;
                }
            }
        }
    }

    workbook
        .save(path.as_ref())
        .map_err(|e| ExcelError::ParseError(e.to_string()))?;
    Ok(())
}
