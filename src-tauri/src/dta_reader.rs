use serde::{Deserialize, Serialize};
use std::collections::HashMap;
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
    #[error("数据类型错误: {0}")]
    TypeError(String),
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
    pub value_labels: HashMap<String, HashMap<i32, String>>,
    pub timestamp: Option<String>,
    pub label: Option<String>,
    pub created_date: Option<String>,
}

#[derive(Debug, Clone)]
enum StataType {
    Byte,
    Int,
    Long,
    Float,
    Double,
    Str(u16),
    StrL,
}

impl StataType {
    fn to_string(&self) -> String {
        match self {
            StataType::Byte => "byte".to_string(),
            StataType::Int => "int".to_string(),
            StataType::Long => "long".to_string(),
            StataType::Float => "float".to_string(),
            StataType::Double => "double".to_string(),
            StataType::Str(len) => format!("str{}", len),
            StataType::StrL => "strL".to_string(),
        }
    }
}

pub struct DTAReader<R: Read + Seek> {
    reader: BufReader<R>,
    version: u16,
    variable_types: Vec<StataType>,
}

impl<R: Read + Seek> DTAReader<R> {
    pub fn new(reader: BufReader<R>) -> Result<Self, DTAError> {
        Ok(Self {
            reader: BufReader::new(reader.into_inner()),
            version: 0,
            variable_types: Vec::new(),
        })
    }

    pub fn read_header(&mut self) -> Result<(u16, usize, usize), DTAError> {
        let mut magic = [0u8; 5];
        self.reader
            .read_exact(&mut magic)
            .map_err(|e| DTAError::ReadError(e.to_string()))?;

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
            _ => {
                return Err(DTAError::FormatError("无效的DTA文件头".to_string()))
            }
        };

        self.reader
            .seek(SeekFrom::Start(0))
            .map_err(|e| DTAError::ReadError(e.to_string()))?;
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
        self.reader
            .read_exact(&mut header)
            .map_err(|e| DTAError::ReadError(e.to_string()))?;

        let nvar = u16::from_le_bytes([header[4], header[5]]) as usize;
        let nobs = u32::from_le_bytes([header[0], header[1], header[2], header[3]]) as usize;

        Ok((13, nvar, nobs))
    }

    fn read_meta_v114(&mut self) -> Result<(u16, usize, usize), DTAError> {
        let mut header = [0u8; 9];
        self.reader
            .read_exact(&mut header)
            .map_err(|e| DTAError::ReadError(e.to_string()))?;

        let nvar = u16::from_le_bytes([header[4], header[5]]) as usize;
        let nobs = u32::from_le_bytes([header[0], header[1], header[2], header[3]]) as usize;

        Ok((114, nvar, nobs))
    }

    fn read_meta_v118(&mut self) -> Result<(u16, usize, usize), DTAError> {
        let mut header = [0u8; 11];
        self.reader
            .read_exact(&mut header)
            .map_err(|e| DTAError::ReadError(e.to_string()))?;

        let nvar = u16::from_le_bytes([header[5], header[6]]) as usize;
        let nobs = u64::from_le_bytes([
            header[0],
            header[1],
            header[2],
            header[3],
            header[4],
            0,
            0,
            0,
        ]) as usize;

        Ok((118, nvar, nobs))
    }

    fn read_variable_types(&mut self, nvar: usize) -> Result<Vec<StataType>, DTAError> {
        let mut types = Vec::with_capacity(nvar);

        for _ in 0..nvar {
            let mut type_byte = [0u8; 1];
            self.reader
                .read_exact(&mut type_byte)
                .map_err(|e| DTAError::ReadError(e.to_string()))?;

            let stata_type = match type_byte[0] {
                251 => StataType::Byte,
                252 => StataType::Int,
                253 => StataType::Long,
                254 => StataType::Float,
                255 => StataType::Double,
                0..=244 => StataType::Str(type_byte[0] as u16 + 1),
                _ => return Err(DTAError::TypeError(format!("未知类型: {}", type_byte[0]))),
            };
            types.push(stata_type);
        }

        Ok(types)
    }

    fn read_value_labels(&mut self) -> Result<HashMap<String, HashMap<i32, String>>, DTAError> {
        let mut labels = HashMap::new();

        loop {
            let mut len_buf = [0u8; 2];
            match self.reader.read_exact(&mut len_buf) {
                Ok(_) => {}
                Err(_) => break,
            }

            let len = u16::from_le_bytes(len_buf) as usize;
            if len == 0 {
                break;
            }

            let mut name_buf = vec![0u8; len];
            self.reader
                .read_exact(&mut name_buf)
                .map_err(|e| DTAError::ReadError(e.to_string()))?;

            let name = String::from_utf8_lossy(&name_buf)
                .trim_end_matches('\0')
                .to_string();

            let mut value_map = HashMap::new();

            loop {
                let mut value_buf = [0u8; 4];
                match self.reader.read_exact(&mut value_buf) {
                    Ok(_) => {}
                    Err(_) => break,
                }

                let value = i32::from_le_bytes(value_buf);

                let mut label_len_buf = [0u8; 2];
                match self.reader.read_exact(&mut label_len_buf) {
                    Ok(_) => {}
                    Err(_) => break,
                }

                let label_len = u16::from_le_bytes(label_len_buf) as usize;
                if label_len == 0 {
                    break;
                }

                let mut label_buf = vec![0u8; label_len];
                self.reader
                    .read_exact(&mut label_buf)
                    .map_err(|e| DTAError::ReadError(e.to_string()))?;

                let label = String::from_utf8_lossy(&label_buf)
                    .trim_end_matches('\0')
                    .to_string();

                value_map.insert(value, label);
            }

            if !name.is_empty() {
                labels.insert(name, value_map);
            }
        }

        Ok(labels)
    }
}

impl DTAFile {
    pub fn read_file<P: AsRef<Path>>(path: P) -> Result<DTAFile, DTAError> {
        Self::read_file_with_limit(path, None)
    }

    pub fn read_file_with_limit<P: AsRef<Path>>(
        path: P,
        row_limit: Option<usize>,
    ) -> Result<DTAFile, DTAError> {
        let path = path.as_ref();
        let file = File::open(path).map_err(|e| DTAError::FileOpen(e.to_string()))?;
        let mut reader = BufReader::new(file);

        let mut magic = [0u8; 5];
        reader
            .read_exact(&mut magic)
            .map_err(|e| DTAError::ReadError(e.to_string()))?;

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
            _ => {
                return Err(DTAError::FormatError("无效的DTA文件头".to_string()))
            }
        };

        let (nvar, nobs) = if version <= 115 {
            let mut k = [0u8; 2];
            let mut n = [0u8; 4];
            reader
                .read_exact(&mut k)
                .map_err(|e| DTAError::ReadError(e.to_string()))?;
            reader
                .read_exact(&mut n)
                .map_err(|e| DTAError::ReadError(e.to_string()))?;
            (
                u16::from_le_bytes(k) as usize,
                u32::from_le_bytes(n) as usize,
            )
        } else {
            let mut k = [0u8; 2];
            let mut n = [0u8; 8];
            reader
                .read_exact(&mut k)
                .map_err(|e| DTAError::ReadError(e.to_string()))?;
            reader
                .read_exact(&mut n)
                .map_err(|e| DTAError::ReadError(e.to_string()))?;
            (
                u16::from_le_bytes(k) as usize,
                u64::from_le_bytes(n) as usize,
            )
        };

        let var_count = if version <= 115 { 129 } else { 2049 };

        let mut variable_names = Vec::new();
        for _ in 0..var_count {
            let mut char_buf = [0u8; 129];
            if version <= 115 {
                reader
                    .read_exact(&mut char_buf)
                    .map_err(|e| DTAError::ReadError(e.to_string()))?;
            } else {
                let mut len_buf = [0u8; 2];
                reader
                    .read_exact(&mut len_buf)
                    .map_err(|e| DTAError::ReadError(e.to_string()))?;
                let name_len = u16::from_le_bytes(len_buf) as usize;
                if name_len > 0 && name_len < 129 {
                    let mut name_buf = vec![0u8; name_len];
                    reader
                        .read_exact(&mut name_buf)
                        .map_err(|e| DTAError::ReadError(e.to_string()))?;
                    let name = String::from_utf8_lossy(&name_buf)
                        .trim_end_matches('\0')
                        .to_string();
                    variable_names.push(name);
                }
            }
        }

        let actual_var_names: Vec<String> = if version <= 115 {
            variable_names.into_iter().take(nvar).collect()
        } else {
            variable_names
        };

        let mut var_types = Vec::new();
        for _ in 0..nvar {
            let mut type_byte = [0u8; 1];
            reader
                .read_exact(&mut type_byte)
                .map_err(|e| DTAError::ReadError(e.to_string()))?;

            let vtype = match type_byte[0] {
                251 => "byte".to_string(),
                252 => "int".to_string(),
                253 => "long".to_string(),
                254 => "float".to_string(),
                255 => "double".to_string(),
                0..=244 => format!("str{}", type_byte[0] + 1),
                _ => "unknown".to_string(),
            };
            var_types.push(vtype);
        }

        let variables: Vec<Variable> = actual_var_names
            .iter()
            .enumerate()
            .map(|(i, name)| Variable {
                name: name.clone(),
                vtype: var_types.get(i).cloned().unwrap_or("double".to_string()),
                label: None,
                format: None,
                value_label: None,
            })
            .collect();

        let limit = row_limit.unwrap_or_else(|| std::cmp::min(nobs, 10000));
        let mut data: Vec<Vec<serde_json::Value>> = Vec::with_capacity(limit);

        for _row in 0..limit {
            let mut row: Vec<serde_json::Value> = Vec::with_capacity(nvar);
            for var_idx in 0..nvar {
                let vtype = var_types.get(var_idx).map(|s| s.as_str()).unwrap_or("double");

                if vtype.starts_with("str") {
                    let str_len: u16 = vtype[3..].parse().unwrap_or(0);
                    if str_len > 0 {
                        let mut str_buf = vec![0u8; str_len as usize];
                        reader
                            .read_exact(&mut str_buf)
                            .map_err(|e| DTAError::ReadError(e.to_string()))?;
                        let value = String::from_utf8_lossy(&str_buf)
                            .trim_end_matches('\0')
                            .to_string();
                        row.push(serde_json::Value::String(value));
                    } else {
                        let mut double_buf = [0u8; 8];
                        reader
                            .read_exact(&mut double_buf)
                            .map_err(|e| DTAError::ReadError(e.to_string()))?;
                        let value = f64::from_le_bytes(double_buf);
                        if value.is_nan() {
                            row.push(serde_json::Value::Null);
                        } else {
                            row.push(
                                serde_json::Number::from_f64(value)
                                    .map(serde_json::Value::Number)
                                    .unwrap_or(serde_json::Value::Null),
                            );
                        }
                    }
                } else {
                    let mut double_buf = [0u8; 8];
                    reader
                        .read_exact(&mut double_buf)
                        .map_err(|e| DTAError::ReadError(e.to_string()))?;
                    let value = f64::from_le_bytes(double_buf);

                    if Self::is_stata_missing(value, vtype) {
                        row.push(serde_json::Value::Null);
                    } else {
                        if vtype == "byte" || vtype == "int" || vtype == "long" {
                            let int_val = value as i64;
                            row.push(serde_json::Value::Number(serde_json::Number::from(int_val)));
                        } else {
                            row.push(
                                serde_json::Number::from_f64(value)
                                    .map(serde_json::Value::Number)
                                    .unwrap_or(serde_json::Value::Null),
                            );
                        }
                    }
                }
            }
            data.push(row);
        }

        let name = path
            .file_name()
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
            value_labels: HashMap::new(),
            timestamp: None,
            label: None,
            created_date: None,
        })
    }

    fn is_stata_missing(value: f64, vtype: &str) -> bool {
        if value.is_nan() {
            return true;
        }

        match vtype {
            "byte" => (value as i8) as f64 == 127.0,
            "int" => (value as i16) as f64 == 32767.0,
            "long" => (value as i32) as f64 == 2147483647.0,
            "float" => {
                let float_val = value as f32;
                (float_val.to_bits() & 0x7FFFFF) == 0 && float_val > 0.0
            }
            "double" => {
                let bits = value.to_bits();
                (bits & 0xFFFFFFFFFFFFF) == 0x0000000000000
                    && (bits >> 52 & 0x7FF) == 0x7FF
            }
            _ => false,
        }
    }

    pub fn stream_read<P: AsRef<Path>>(
        path: P,
        start_row: usize,
        end_row: usize,
    ) -> Result<Vec<Vec<serde_json::Value>>, DTAError> {
        let path = path.as_ref();
        let file = File::open(path).map_err(|e| DTAError::FileOpen(e.to_string()))?;
        let mut reader = BufReader::new(file);

        let mut magic = [0u8; 5];
        reader
            .read_exact(&mut magic)
            .map_err(|e| DTAError::ReadError(e.to_string()))?;

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
            _ => {
                return Err(DTAError::FormatError("无效的DTA文件头".to_string()))
            }
        };

        let (nvar, _nobs) = if version <= 115 {
            let mut k = [0u8; 2];
            let mut n = [0u8; 4];
            reader
                .read_exact(&mut k)
                .map_err(|e| DTAError::ReadError(e.to_string()))?;
            reader
                .read_exact(&mut n)
                .map_err(|e| DTAError::ReadError(e.to_string()))?;
            (
                u16::from_le_bytes(k) as usize,
                u32::from_le_bytes(n) as usize,
            )
        } else {
            let mut k = [0u8; 2];
            let mut n = [0u8; 8];
            reader
                .read_exact(&mut k)
                .map_err(|e| DTAError::ReadError(e.to_string()))?;
            reader
                .read_exact(&mut n)
                .map_err(|e| DTAError::ReadError(e.to_string()))?;
            (
                u16::from_le_bytes(k) as usize,
                u64::from_le_bytes(n) as usize,
            )
        };

        let var_count = if version <= 115 { 129 } else { 2049 };

        for _ in 0..var_count {
            if version <= 115 {
                let mut char_buf = [0u8; 129];
                reader
                    .read_exact(&mut char_buf)
                    .map_err(|e| DTAError::ReadError(e.to_string()))?;
            } else {
                let mut len_buf = [0u8; 2];
                reader
                    .read_exact(&mut len_buf)
                    .map_err(|e| DTAError::ReadError(e.to_string()))?;
                let name_len = u16::from_le_bytes(len_buf) as usize;
                if name_len > 0 && name_len < 129 {
                    let mut name_buf = vec![0u8; name_len];
                    reader
                        .read_exact(&mut name_buf)
                        .map_err(|e| DTAError::ReadError(e.to_string()))?;
                }
            }
        }

        let mut var_types = Vec::new();
        for _ in 0..nvar {
            let mut type_byte = [0u8; 1];
            reader
                .read_exact(&mut type_byte)
                .map_err(|e| DTAError::ReadError(e.to_string()))?;

            let vtype = match type_byte[0] {
                251 => "byte".to_string(),
                252 => "int".to_string(),
                253 => "long".to_string(),
                254 => "float".to_string(),
                255 => "double".to_string(),
                0..=244 => format!("str{}", type_byte[0] + 1),
                _ => "unknown".to_string(),
            };
            var_types.push(vtype);
        }

        for _ in 0..start_row {
            for var_idx in 0..nvar {
                let vtype = var_types.get(var_idx).map(|s| s.as_str()).unwrap_or("double");
                if vtype.starts_with("str") {
                    let str_len: u16 = vtype[3..].parse().unwrap_or(0);
                    if str_len > 0 {
                        let mut str_buf = vec![0u8; str_len as usize];
                        reader
                            .read_exact(&mut str_buf)
                            .map_err(|e| DTAError::ReadError(e.to_string()))?;
                    } else {
                        let mut double_buf = [0u8; 8];
                        reader
                            .read_exact(&mut double_buf)
                            .map_err(|e| DTAError::ReadError(e.to_string()))?;
                    }
                } else {
                    let mut double_buf = [0u8; 8];
                    reader
                        .read_exact(&mut double_buf)
                        .map_err(|e| DTAError::ReadError(e.to_string()))?;
                }
            }
        }

        let mut data = Vec::new();
        for _row in start_row..end_row {
            let mut row: Vec<serde_json::Value> = Vec::with_capacity(nvar);
            for var_idx in 0..nvar {
                let vtype = var_types.get(var_idx).map(|s| s.as_str()).unwrap_or("double");

                if vtype.starts_with("str") {
                    let str_len: u16 = vtype[3..].parse().unwrap_or(0);
                    if str_len > 0 {
                        let mut str_buf = vec![0u8; str_len as usize];
                        reader
                            .read_exact(&mut str_buf)
                            .map_err(|e| DTAError::ReadError(e.to_string()))?;
                        let value = String::from_utf8_lossy(&str_buf)
                            .trim_end_matches('\0')
                            .to_string();
                        row.push(serde_json::Value::String(value));
                    } else {
                        let mut double_buf = [0u8; 8];
                        reader
                            .read_exact(&mut double_buf)
                            .map_err(|e| DTAError::ReadError(e.to_string()))?;
                        let value = f64::from_le_bytes(double_buf);
                        if value.is_nan() {
                            row.push(serde_json::Value::Null);
                        } else {
                            row.push(
                                serde_json::Number::from_f64(value)
                                    .map(serde_json::Value::Number)
                                    .unwrap_or(serde_json::Value::Null),
                            );
                        }
                    }
                } else {
                    let mut double_buf = [0u8; 8];
                    reader
                        .read_exact(&mut double_buf)
                        .map_err(|e| DTAError::ReadError(e.to_string()))?;
                    let value = f64::from_le_bytes(double_buf);

                    if Self::is_stata_missing(value, vtype) {
                        row.push(serde_json::Value::Null);
                    } else {
                        if vtype == "byte" || vtype == "int" || vtype == "long" {
                            let int_val = value as i64;
                            row.push(serde_json::Value::Number(serde_json::Number::from(int_val)));
                        } else {
                            row.push(
                                serde_json::Number::from_f64(value)
                                    .map(serde_json::Value::Number)
                                    .unwrap_or(serde_json::Value::Null),
                            );
                        }
                    }
                }
            }
            data.push(row);
        }

        Ok(data)
    }
}
