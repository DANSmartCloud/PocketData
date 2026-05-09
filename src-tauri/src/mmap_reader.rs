use std::fs::File;
use std::io::{BufReader, Read, Seek, SeekFrom};
use std::path::Path;
use memmap2::Mmap;
use rayon::prelude::*;
use serde::{Deserialize, Serialize};
use thiserror::Error;

#[derive(Debug, Error)]
pub enum MmapError {
    #[error("文件无法打开: {0}")]
    FileOpen(String),
    #[error("内存映射失败: {0}")]
    MmapFailed(String),
    #[error("数据解析错误: {0}")]
    ParseError(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MmapFileInfo {
    pub file_size: u64,
    pub page_size: usize,
    pub is_large_file: bool,
    pub chunk_count: usize,
}

pub struct MmapReader {
    file: File,
    mmap: Option<Mmap>,
    chunk_size: usize,
}

impl MmapReader {
    pub fn new<P: AsRef<Path>>(path: P) -> Result<Self, MmapError> {
        let file = File::open(path).map_err(|e| MmapError::FileOpen(e.to_string()))?;
        Ok(Self {
            file,
            mmap: None,
            chunk_size: 8 * 1024 * 1024,
        })
    }

    pub fn with_chunk_size(mut self, chunk_size: usize) -> Self {
        self.chunk_size = chunk_size;
        self
    }

    pub fn get_file_info(&self) -> Result<MmapFileInfo, MmapError> {
        let metadata = self.file.metadata()
            .map_err(|e| MmapError::FileOpen(e.to_string()))?;
        let file_size = metadata.len();
        let page_size = self.chunk_size;
        let is_large_file = file_size > 100 * 1024 * 1024;
        let chunk_count = ((file_size as usize) + page_size - 1) / page_size;

        Ok(MmapFileInfo {
            file_size,
            page_size,
            is_large_file,
            chunk_count,
        })
    }

    pub fn create_mmap(&mut self) -> Result<(), MmapError> {
        let mmap = unsafe {
            Mmap::map(&self.file).map_err(|e| MmapError::MmapFailed(e.to_string()))?
        };
        self.mmap = Some(mmap);
        Ok(())
    }

    pub fn read_chunk(&self, offset: usize, size: usize) -> Result<Vec<u8>, MmapError> {
        if let Some(ref mmap) = self.mmap {
            let end = std::cmp::min(offset + size, mmap.len());
            if offset >= end {
                return Ok(Vec::new());
            }
            Ok(mmap[offset..end].to_vec())
        } else {
            let mut file = &self.file;
            file.seek(SeekFrom::Start(offset as u64))
                .map_err(|e| MmapError::ParseError(e.to_string()))?;
            
            let mut buffer = vec![0u8; size];
            let bytes_read = file.read(&mut buffer)
                .map_err(|e| MmapError::ParseError(e.to_string()))?;
            buffer.truncate(bytes_read);
            Ok(buffer)
        }
    }

    pub fn read_chunks_parallel(
        &self,
        total_size: usize,
        processor: impl Fn(&[u8]) -> Vec<serde_json::Value> + Send + Sync,
    ) -> Result<Vec<serde_json::Value>, MmapError> {
        let processor = &processor;
        
        if let Some(ref mmap) = self.mmap {
            let chunks: Vec<Vec<serde_json::Value>> = (0..total_size)
                .step_by(self.chunk_size)
                .par_bridge()
                .map(|offset| {
                    let end = std::cmp::min(offset + self.chunk_size, total_size);
                    let chunk_data = &mmap[offset..end];
                    processor(chunk_data)
                })
                .collect();

            let mut result = Vec::new();
            for chunk in chunks {
                result.extend(chunk);
            }
            Ok(result)
        } else {
            let mut result = Vec::new();
            let file = &self.file;
            for offset in (0..total_size).step_by(self.chunk_size) {
                let size = std::cmp::min(self.chunk_size, total_size - offset);
                let mut f = file.try_clone()
                    .map_err(|e| MmapError::ParseError(e.to_string()))?;
                f.seek(SeekFrom::Start(offset as u64))
                    .map_err(|e| MmapError::ParseError(e.to_string()))?;
                let mut buffer = vec![0u8; size];
                f.read(&mut buffer)
                    .map_err(|e| MmapError::ParseError(e.to_string()))?;
                let chunk_result = processor(&buffer);
                result.extend(chunk_result);
            }
            Ok(result)
        }
    }

    pub fn find_line_boundaries(
        &self,
        start: usize,
        end: usize,
    ) -> Result<Vec<usize>, MmapError> {
        if let Some(ref mmap) = self.mmap {
            let mut boundaries = Vec::new();
            let mut pos = start;
            
            while pos < end && pos < mmap.len() {
                if mmap[pos] == b'\n' {
                    boundaries.push(pos + 1);
                }
                pos += 1;
            }
            
            Ok(boundaries)
        } else {
            Ok(Vec::new())
        }
    }
}

pub struct BufferPool {
    buffers: parking_lot::Mutex<Vec<Vec<u8>>>,
    buffer_size: usize,
}

impl BufferPool {
    pub fn new(buffer_size: usize, initial_count: usize) -> Self {
        let mut buffers = Vec::with_capacity(initial_count);
        for _ in 0..initial_count {
            buffers.push(vec![0u8; buffer_size]);
        }
        Self {
            buffers: parking_lot::Mutex::new(buffers),
            buffer_size,
        }
    }

    pub fn acquire(&self) -> Vec<u8> {
        let mut pool = self.buffers.lock();
        pool.pop().unwrap_or_else(|| vec![0u8; self.buffer_size])
    }

    pub fn release(&self, mut buffer: Vec<u8>) {
        buffer.clear();
        buffer.resize(self.buffer_size, 0);
        let mut pool = self.buffers.lock();
        if pool.len() < 32 {
            pool.push(buffer);
        }
    }
}

pub struct LazyDataLoader {
    file_path: std::path::PathBuf,
    total_rows: usize,
    row_positions: Vec<usize>,
    cache: parking_lot::Mutex<lru::LruCache<usize, Vec<serde_json::Value>>>,
}

impl LazyDataLoader {
    pub fn new<P: AsRef<Path>>(
        file_path: P,
        total_rows: usize,
        row_positions: Vec<usize>,
        cache_size: usize,
    ) -> Self {
        use lru::LruCache;
        Self {
            file_path: file_path.as_ref().to_path_buf(),
            total_rows,
            row_positions,
            cache: parking_lot::Mutex::new(LruCache::new(
                std::num::NonZero::new(cache_size).unwrap()
            )),
        }
    }

    pub fn get_row(&self, row_index: usize) -> Option<Vec<serde_json::Value>> {
        let mut cache = self.cache.lock();
        if let Some(row) = cache.get(&row_index) {
            return Some(row.clone());
        }
        None
    }

    pub fn prefetch_rows(&self, start: usize, end: usize) {
        for row_idx in start..end {
            self.get_row(row_idx);
        }
    }
}

pub fn estimate_memory_usage(
    rows: usize,
    columns: usize,
    avg_cell_size: usize,
) -> u64 {
    (rows as u64) * (columns as u64) * (avg_cell_size as u64)
}

pub fn calculate_optimal_chunk_size(
    file_size: u64,
    available_memory: u64,
) -> usize {
    const MIN_CHUNK_SIZE: usize = 1 * 1024 * 1024;
    const MAX_CHUNK_SIZE: usize = 64 * 1024 * 1024;
    
    let target_chunks = available_memory / (256 * 1024 * 1024);
    let chunk_size = if target_chunks > 0 {
        file_size as usize / target_chunks as usize
    } else {
        MAX_CHUNK_SIZE
    };
    
    chunk_size.clamp(MIN_CHUNK_SIZE, MAX_CHUNK_SIZE)
}
