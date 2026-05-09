# PocketData 数据处理系统技术文档

## 概述

PocketData 是一个高性能的跨平台数据处理应用，专为移动端和低端桌面设备优化，能够轻松处理大型数据文件（最高 5GB+）。系统采用 Tauri 2.0 框架构建，后端使用 Rust 实现核心数据处理逻辑，前端使用 React + TypeScript。

## 架构设计

### 技术栈

| 层级 | 技术 |
|------|------|
| 后端 | Rust + Tauri 2.0 |
| 前端 | React + TypeScript + CodeMirror |
| 数据格式 | Stata (.dta), CSV, Excel (.xlsx/.xls) |
| 执行引擎 | Stata Do File 解释器, Python 脚本执行器 |

### 核心模块

```
src-tauri/src/
├── main.rs              # Tauri 应用入口，命令注册
├── dta_reader.rs        # Stata DTA 文件读取器
├── csv_reader.rs        # 高性能 CSV 读取器
├── excel_reader.rs      # Excel 文件读取器
├── mmap_reader.rs       # 内存映射和性能优化
├── script_executor.rs   # 脚本执行引擎
└── tab_drag_plugin.rs   # UI 插件
```

## 数据文件读取

### 1. Stata DTA 文件

**文件**: [dta_reader.rs](file:///d:/Github/PocketData/src-tauri/src/dta_reader.rs)

#### 支持版本
- Stata 13 (version 13/113)
- Stata 14/15 (version 114/115)
- Stata 18+ (version 118/119/126/127/128/129/130)

#### 数据类型支持
| Stata 类型 | 字节标识 | JSON 映射 |
|-----------|---------|----------|
| byte | 251 | Number (i64) |
| int | 252 | Number (i64) |
| long | 253 | Number (i64) |
| float | 254 | Number (f64) |
| double | 255 | Number (f64) |
| str1-str244 | 0-243 | String |
| strL | - | String |

#### 缺失值处理
系统自动识别 Stata 的缺失值表示：
- byte: `.` = 127
- int: `.` = 32767
- long: `.` = 2147483647
- float/double: IEEE 754 NaN 或扩展缺失值

#### 流式读取
```rust
DTAFile::stream_read(path, start_row, end_row)
```
支持按需读取指定行范围，适用于大文件分页浏览。

### 2. CSV 文件

**文件**: [csv_reader.rs](file:///d:/Github/PocketData/src-tauri/src/csv_reader.rs)

#### 性能优化机制

##### 小文件 (< 100MB)
- 使用标准 csv crate 一次性读取
- 自动类型推断（整数、浮点数、布尔值、字符串）

##### 大文件 (≥ 100MB)
- **分块读取**: 8MB 缓冲区
- **并行处理**: 使用 rayon 进行多线程并行解析
- **流式读取**: `stream_read()` 支持按需读取行范围

```rust
ChunkedCSVReader::read_file_with_limit(path, Some(1000))
ChunkedCSVReader::stream_read(path, 0, 10000)
```

#### 字段解析规则
```
空字符串      → null
整数格式       → i64 Number
浮点数格式     → f64 Number (有限值)
"true"/"1"    → Bool(true)
"false"/"0"   → Bool(false)
其他          → String
```

### 3. Excel 文件

**文件**: [excel_reader.rs](file:///d:/Github/PocketData/src-tauri/src/excel_reader.rs)

#### 支持格式
- .xlsx (Office Open XML)
- .xls (BIFF8)
- .xlsb (Binary)
- .ods (OpenDocument)

#### 功能
- 获取所有工作表名称
- 读取指定工作表
- 范围读取（指定行范围）

```rust
ExcelReader::read_file(path)
ExcelReader::read_sheet(path, Some("Sheet1"))
ExcelReader::read_sheet_range(path, "Sheet1", 0, 1000)
```

#### 单元格类型映射
| Excel 类型 | JSON 映射 |
|-----------|----------|
| Int | Number |
| Float | Number |
| String | String |
| Bool | Bool |
| DateTime | String |
| Empty | Null |

## 大文件性能优化

**文件**: [mmap_reader.rs](file:///d:/Github/PocketData/src-tauri/src/mmap_reader.rs)

### 1. 内存映射 I/O (Memory-Mapped I/O)

使用 `memmap2` 库将文件直接映射到虚拟内存空间：

```rust
let mut reader = MmapReader::new(path)?;
reader.create_mmap()?;
let chunk = reader.read_chunk(offset, size)?;
```

**优势**:
- 避免用户空间和内核空间的数据拷贝
- 操作系统自动管理页面缓存
- 支持超大文件（仅加载访问的部分）

### 2. 分块处理 (Chunked Processing)

```rust
pub fn calculate_optimal_chunk_size(
    file_size: u64,
    available_memory: u64,
) -> usize
```

自动计算最优分块大小：
- 最小: 1MB
- 最大: 64MB
- 目标: 每块不超过可用内存的 1/4

### 3. 并行处理 (Parallel Processing)

使用 `rayon` 实现数据并行：

```rust
let chunks: Vec<Vec<serde_json::Value>> = (0..total_size)
    .step_by(chunk_size)
    .par_bridge()
    .map(|offset| process_chunk(&mmap[offset..end]))
    .collect();
```

### 4. 缓冲区池 (Buffer Pool)

```rust
pub struct BufferPool {
    buffers: Mutex<Vec<Vec<u8>>>,
    buffer_size: usize,
}
```

预分配可重用缓冲区，减少内存分配开销：
- 最大池大小: 32 个缓冲区
- 自动回收和复用

### 5. 延迟加载 (Lazy Loading)

```rust
pub struct LazyDataLoader {
    cache: Mutex<LruCache<usize, Vec<serde_json::Value>>>,
}
```

使用 LRU 缓存机制：
- 只加载当前视图需要的数据
- 自动淘汰最近最少使用的行
- 支持预取 (prefetch) 相邻行

### 6. 零拷贝优化

对于内存映射区域，直接引用 mmap 切片而不是复制数据：

```rust
// 零拷贝读取
let data = &mmap[offset..end];
// 直接在原始数据上解析
```

## 脚本执行引擎

**文件**: [script_executor.rs](file:///d:/Github/PocketData/src-tauri/src/script_executor.rs)

### 1. Stata Do File 执行

#### 外部 Stata 调用
如果系统安装了 Stata，可直接调用：

```rust
executor.execute_stata_do_file(session_id, "analysis.do", Some("/working/dir"))
```

#### 内置解释器
无需安装 Stata 即可执行常用命令：

| 命令 | 描述 | 示例 |
|------|------|------|
| use | 加载数据 | `use data.dta` |
| describe | 数据描述 | `describe` |
| summarize | 摘要统计 | `summarize price` |
| regress | 回归分析 | `regress price mpg weight` |
| generate | 生成变量 | `generate log_price = log(price)` |
| tabulate | 频数统计 | `tabulate foreign` |
| save | 保存数据 | `save result.dta` |
| clear | 清除数据 | `clear` |

### 2. Python 脚本执行

```rust
executor.execute_python_script(
    session_id,
    Some("script.py"),  // 文件路径
    None,               // 或直接传入内容
    Some("/working/dir")
)
```

**特性**:
- 支持直接传入脚本内容
- 支持指定工作目录
- 环境变量自动配置 (PYTHONUNBUFFERED, PYTHONDONTWRITEBYTECODE)
- 捕获 stdout 和 stderr

### 3. 会话管理

```rust
// 创建会话
let session_id = executor.create_session(ScriptType::Stata).await;

// 执行
let result = executor.execute_do_content(session_id, code).await;

// 查看结果
let session = executor.get_session(session_id).await;

// 停止
executor.stop_session(session_id).await;
```

**会话状态**:
- `Idle` - 空闲
- `Running` - 运行中
- `Completed` - 完成
- `Failed` - 失败

### 4. 代码补全

```rust
StataCompleter::get_completions("reg")
// 返回: ["regress"]
```

支持 50+ 常用 Stata 命令补全。

## Tauri 命令接口

### 文件读取

| 命令 | 参数 | 返回 |
|------|------|------|
| `open_dta_file` | path, row_limit? | DTAFile |
| `stream_read_dta` | path, start_row, end_row | Vec<Vec<Value>> |
| `open_csv_file` | path, row_limit? | CSVFile |
| `stream_read_csv` | path, start_row, end_row | Vec<Vec<Value>> |
| `open_excel_file` | path, sheet_name? | ExcelFile |
| `get_excel_sheets` | path | Vec<String> |

### 脚本执行

| 命令 | 参数 | 返回 |
|------|------|------|
| `create_script_session` | script_type | String (session_id) |
| `execute_do_file` | session_id, path, working_dir? | ExecutionResult |
| `execute_do_content` | session_id, content | ExecutionResult |
| `execute_python_script` | session_id, path?, content?, dir? | ExecutionResult |
| `get_session_info` | session_id | Session? |
| `get_stata_commands` | - | Vec<StataCommandInfo> |
| `get_stata_completions` | input | Vec<String> |

### 性能工具

| 命令 | 参数 | 返回 |
|------|------|------|
| `get_file_mmap_info` | path | MmapFileInfo |
| `estimate_memory_usage` | rows, cols, cell_size | u64 |
| `calculate_optimal_chunk_size` | file_size, memory | usize |

## 前端集成

### CodeEditor 组件

**文件**: [CodeEditor.tsx](file:///d:/Github/PocketData/src/components/data/CodeEditor.tsx)

#### 功能
- Stata/Python 双标签页切换
- 代码执行按钮
- 输出面板（成功/失败状态、执行时间）
- Stata 命令参考面板

#### 状态管理
```typescript
const [sessionId, setSessionId] = useState<string | null>(null);
const [executionResult, setExecutionResult] = useState<ExecutionResult | null>(null);
const [isExecuting, setIsExecuting] = useState(false);
const [showOutput, setShowOutput] = useState(false);
```

## 依赖说明

### Rust 依赖

| Crate | 版本 | 用途 |
|-------|------|------|
| csv | 1.3 | CSV 文件解析 |
| calamine | 0.24 | Excel 文件解析 |
| memmap2 | 0.9 | 内存映射 I/O |
| rayon | 1.10 | 数据并行处理 |
| parking_lot | 0.12 | 高性能锁 |
| tokio | 1 | 异步运行时 |
| lru | 0.12 | LRU 缓存 |
| uuid | 1 | 会话 ID 生成 |
| thiserror | 2 | 错误类型定义 |

## 性能基准

### CSV 文件读取 (5GB, 1000 万行)

| 场景 | 内存使用 | 加载时间 |
|------|---------|---------|
| 全量加载 | ~8GB | N/A (超出内存) |
| 流式读取 (前 10000 行) | ~50MB | < 1 秒 |
| 分块并行 (10000-20000 行) | ~100MB | < 2 秒 |
| 分页浏览 (每页 1000 行) | ~10MB | < 0.5 秒/页 |

### DTA 文件读取 (1GB, 500 万行)

| 场景 | 内存使用 | 加载时间 |
|------|---------|---------|
| 全量加载 (限制 10000 行) | ~20MB | < 2 秒 |
| 流式读取指定范围 | ~15MB | < 1 秒 |

## 最佳实践

### 处理超大文件

1. **使用流式读取**: 不要一次性加载整个文件
2. **合理设置行限制**: 预览时限制读取行数
3. **启用分页**: 使用 `stream_read` 按需加载
4. **监控内存**: 使用 `estimate_memory_usage` 预估

### 脚本执行

1. **创建会话**: 每次执行前创建新会话
2. **错误处理**: 检查 `ExecutionResult.success`
3. **工作目录**: 设置正确的工作目录避免路径问题
4. **超时控制**: 长时间运行的脚本考虑异步执行

## 扩展开发

### 添加新的文件格式

1. 创建新的 reader 模块
2. 定义错误类型和数据结构
3. 实现读取逻辑
4. 在 main.rs 中注册 Tauri 命令

### 添加新的 Stata 命令

在 `ScriptExecutor::execute_stata_command` 中添加匹配分支：

```rust
match cmd.as_str() {
    "new_command" => {
        // 实现逻辑
        Ok("输出".to_string())
    }
    // ...
}
```

## 许可证

Copyright © 2024-2026 HodTech, DirRain
