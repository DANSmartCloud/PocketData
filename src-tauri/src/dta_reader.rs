use serde::{Deserialize, Serialize};
use std::fs::File;
use std::io::{BufReader, Read, Seek, SeekFrom};
use std::path::Path;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum DTAError {
    #[error("文件无法打开: {0}")]
    FileOpen(String),
    #[error("文件格式错误: {0}")]
    FormatError(String),
    #[error("不支持的版本: {0}")]
    UnsupportedVersion(u16),
    #[error("读取错误: {0}")]
    ReadError(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Variable {
    pub name: String,
    pub vtype: String,
    pub label: Option<String>,
    pub format: Option<String>,
    pub value_label: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DTAFile {
    pub path: String,
    pub name: String,
    pub version: u16,
    pub nvar: usize,
    pub nobs: usize,
    pub variables: Vec<Variable>,
    pub data: Vec<Vec<serde_json::Value>>,
    pub value_labels: std::collections::HashMap<String, std::collections::HashMap<i32, String>>,
    pub timestamp: Option<String>,
    pub label: Option<String>,
    pub created_date: Option<String>,
}

pub struct DTAReader<R: Read + Seek> {
    reader: BufReader<R>,
    version: u16,
}

impl<R: Read + Seek> DTAReader<R> {
    pub fn new(reader: BufReader<R>) -> Result<Self, DTAError> {
        Ok(Self { reader: BufReader::new(reader.into_inner()), version: 0 })
    }

    pub fn read_header(&mut self) -> Result<(u16, usize, usize), DTAError> {
        let mut magic = [0u8; 5];
        self.reader.read_exact(&mut magic).map_err(|e| DTAError::ReadError(e.to_string()))?;

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
            _ => return Err(DTAError::FormatError("无效的DTA文件头".to_string())),
        };

        self.reader.seek(SeekFrom::Start(0)).map_err(|e| DTAError::ReadError(e.to_string()))?;
        self.version = version;

        self.read_metadata_internal()
    }

    fn read_metadata_internal(&mut self) -> Result<(u16, usize, usize), DTAError> {
        match self.version {
            13 | 113 => self.read_meta_v13(),
            114 | 115 => self.read_meta_v114(),
            118 | 119 | 126 | 127 | 128 | 129 | 130 => self.read_meta_v118(),
            _ => Err(DTAError::UnsupportedVersion(self.version)),
        }
    }

    fn read_meta_v13(&mut self) -> Result<(u16, usize, usize), DTAError> {
        let mut header = [0u8; 8];
        self.reader.read_exact(&mut header).map_err(|e| DTAError::ReadError(e.to_string()))?;

        let nvar = u16::from_le_bytes([header[4], header[5]]) as usize;
        let nobs = u32::from_le_bytes([header[0], header[1], header[2], header[3]]) as usize;

        Ok((13, nvar, nobs))
    }

    fn read_meta_v114(&mut self) -> Result<(u16, usize, usize), DTAError> {
        let mut header = [0u8; 9];
        self.reader.read_exact(&mut header).map_err(|e| DTAError::ReadError(e.to_string()))?;

        let nvar = u16::from_le_bytes([header[4], header[5]]) as usize;
        let nobs = u32::from_le_bytes([header[0], header[1], header[2], header[3]]) as usize;

        Ok((114, nvar, nobs))
    }

    fn read_meta_v118(&mut self) -> Result<(u16, usize, usize), DTAError> {
        let mut header = [0u8; 11];
        self.reader.read_exact(&mut header).map_err(|e| DTAError::ReadError(e.to_string()))?;

        let nvar = u16::from_le_bytes([header[5], header[6]]) as usize;
        let nobs = u64::from_le_bytes([
            header[0], header[1], header[2], header[3], header[4], 0, 0, 0
        ]) as usize;

        Ok((118, nvar, nobs))
    }

    pub fn read_file<P: AsRef<Path>>(path: P) -> Result<DTAFile, DTAError> {
        let path = path.as_ref();
        let file = File::open(path).map_err(|e| DTAError::FileOpen(e.to_string()))?;
        let mut reader = BufReader::new(file);

        let mut magic = [0u8; 5];
        reader.read_exact(&mut magic).map_err(|e| DTAError::ReadError(e.to_string()))?;

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
            _ => return Err(DTAError::FormatError("无效的DTA文件头".to_string())),
        };

        let (nvar, nobs) = if version <= 115 {
            let mut k = [0u8; 2];
            let mut n = [0u8; 4];
            reader.read_exact(&mut k).map_err(|e| DTAError::ReadError(e.to_string()))?;
            reader.read_exact(&mut n).map_err(|e| DTAError::ReadError(e.to_string()))?;
            (u16::from_le_bytes(k) as usize, u32::from_le_bytes(n) as usize)
        } else {
            let mut k = [0u8; 2];
            let mut n = [0u8; 8];
            reader.read_exact(&mut k).map_err(|e| DTAError::ReadError(e.to_string()))?;
            reader.read_exact(&mut n).map_err(|e| DTAError::ReadError(e.to_string()))?;
            (u16::from_le_bytes(k) as usize, u64::from_le_bytes(n) as usize)
        };

        let var_count = if version <= 115 { 129 } else { 2049 };

        let mut variable_names = Vec::new();
        for _ in 0..var_count {
            let mut char_buf = [0u8; 129];
            if version <= 115 {
                reader.read_exact(&mut char_buf).map_err(|e| DTAError::ReadError(e.to_string()))?;
            } else {
                let mut len_buf = [0u8; 2];
                reader.read_exact(&mut len_buf).map_err(|e| DTAError::ReadError(e.to_string()))?;
                let name_len = u16::from_le_bytes(len_buf) as usize;
                if name_len > 0 && name_len < 129 {
                    let mut name_buf = vec![0u8; name_len];
                    reader.read_exact(&mut name_buf).map_err(|e| DTAError::ReadError(e.to_string()))?;
                    let name = String::from_utf8_lossy(&name_buf).trim_end_matches('\0').to_string();
                    variable_names.push(name);
                }
            }
        }

        let actual_var_names: Vec<String> = if version <= 115 {
            variable_names.into_iter().take(nvar).collect()
        } else {
            variable_names
        };

        let variables: Vec<Variable> = actual_var_names
            .iter()
            .enumerate()
            .map(|(i, name)| Variable {
                name: name.clone(),
                vtype: "double".to_string(),
                label: None,
                format: None,
                value_label: None,
            })
            .collect();

        let mut data: Vec<Vec<serde_json::Value>> = Vec::new();
        let limit = std::cmp::min(nobs, 10000);

        for _ in 0..limit {
            let mut row: Vec<serde_json::Value> = Vec::new();
            for _ in 0..nvar {
                let mut double_buf = [0u8; 8];
                reader.read_exact(&mut double_buf).map_err(|e| DTAError::ReadError(e.to_string()))?;
                let value = f64::from_le_bytes(double_buf);
                if value.is_nan() {
                    row.push(serde_json::Value::Null);
                } else {
                    row.push(serde_json::Value::Number(serde_json::Number::from_f64(value).unwrap_or_default()));
                }
            }
            data.push(row);
        }

        let name = path.file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| "unknown".to_string());

        Ok(DTAFile {
            path: path.to_string_lossy().to_string(),
            name,
            version,
            nvar,
            nobs,
            variables,
            data,
            value_labels: std::collections::HashMap::new(),
            timestamp: None,
            label: None,
            created_date: None,
        })
    }
}
