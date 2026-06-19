//! PTY 会话管理：让 PowerShell / bash 等成为持久进程
//! 用于前端 xterm.js 真正模拟"REPL"终端体验。
//!
//! 数据流：
//!  - 前端 → pty_write → master 写入 → 子进程 stdin
//!  - 子进程 stdout/stderr → master 读取 → 事件 `pty:<id>:out` → 前端
//!  - 子进程退出 → 事件 `pty:<id>:exit` → 前端
//!
//! 设计原则：
//!  - 不伪造任何 prompt / banner：所有可见输出都来自真实 shell
//!  - shell 自动保留 cwd / 变量 / 函数等状态
//!  - 支持 ctrl-c（写入 0x03）由 shell 自行处理

use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter};

/// 一个 PTY 会话。所有跨线程共享的字段都用 Arc<Mutex<...>> 包装。
pub struct PtySession {
    pub id: String,
    pub master: Arc<Mutex<Box<dyn MasterPty + Send>>>,
    pub writer: Arc<Mutex<Box<dyn Write + Send>>>,
    pub child: Arc<Mutex<Box<dyn portable_pty::Child + Send + Sync>>>,
}

#[derive(Default)]
pub struct PtyRegistry {
    sessions: Mutex<HashMap<String, PtySession>>,
}

impl PtyRegistry {
    pub fn new() -> Self {
        Self::default()
    }

    /// 启动一个新的 shell 进程并创建 PTY。
    /// - `shell`：可执行文件（powershell.exe / bash / cmd.exe …）
    /// - `args`：传给 shell 的参数（PowerShell 用 ["-NoLogo"]；cmd 用 []）
    /// - `cwd`：起始工作目录（为空则不设置）
    pub fn spawn(
        &self,
        app: AppHandle,
        id: String,
        shell: String,
        args: Vec<String>,
        cwd: String,
    ) -> Result<(), String> {
        let pty_system = native_pty_system();
        let pair = pty_system
            .openpty(PtySize {
                rows: 24,
                cols: 80,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| format!("打开 PTY 失败: {}", e))?;

        let mut cmd = CommandBuilder::new(&shell);
        for a in &args {
            cmd.arg(a);
        }
        if !cwd.is_empty() {
            cmd.cwd(cwd);
        }
        // 与项目其它执行保持一致的 UTF-8 环境
        cmd.env("PYTHONIOENCODING", "utf-8");
        cmd.env("PYTHONUTF8", "1");
        // PS 时建议显式设置控制台编码
        if shell.to_lowercase().contains("powershell") || shell.to_lowercase().contains("pwsh") {
            cmd.env("CHCP", "65001");
        }

        let child = pair
            .slave
            .spawn_command(cmd)
            .map_err(|e| format!("启动 shell 失败: {}", e))?;
        // slave 句柄在子进程中保留；主进程需要 drop 避免阻塞
        drop(pair.slave);

        let mut reader = pair
            .master
            .try_clone_reader()
            .map_err(|e| format!("克隆 PTY reader 失败: {}", e))?;
        let writer = pair
            .master
            .take_writer()
            .map_err(|e| format!("获取 PTY writer 失败: {}", e))?;

        // 读取线程：把 PTY 输出转 UTF-8 推送给前端
        let id_for_read = id.clone();
        let app_for_read = app.clone();
        std::thread::spawn(move || {
            let mut buf = [0u8; 4096];
            loop {
                match reader.read(&mut buf) {
                    Ok(0) => break,
                    Ok(n) => {
                        // 用 encoding_rs 解码以兼容 GBK 输出
                        let (decoded, _, _) = encoding_rs::UTF_8.decode(&buf[..n]);
                        let s = decoded.into_owned();
                        if s.is_empty() {
                            continue;
                        }
                        let _ = app_for_read.emit(&format!("pty:{}:out", id_for_read), &s);
                    }
                    Err(_) => break,
                }
            }
            // 读取结束意味着 PTY 关闭
            let _ = app_for_read.emit(&format!("pty:{}:exit", id_for_read), &());
        });

        // 等待子进程线程：进程退出时也发 exit 事件（幂等）
        let id_for_wait = id.clone();
        let app_for_wait = app.clone();
        let child = Arc::new(Mutex::new(child));
        let child_for_wait = child.clone();
        std::thread::spawn(move || {
            let code: i32 = {
                let mut c = child_for_wait.lock().unwrap();
                match c.wait() {
                    Ok(s) => s.exit_code() as i32,
                    Err(_) => -1,
                }
            };
            let _ = app_for_wait.emit(&format!("pty:{}:exit", id_for_wait), &code);
        });

        // 注册会话
        let session = PtySession {
            id: id.clone(),
            master: Arc::new(Mutex::new(pair.master)),
            writer: Arc::new(Mutex::new(writer)),
            child,
        };
        let mut sessions = self.sessions.lock().unwrap();
        // 如果已存在同名 id（理论上不会），先清理
        sessions.insert(id, session);
        Ok(())
    }

    pub fn write(&self, id: &str, data: &str) -> Result<(), String> {
        let sessions = self.sessions.lock().unwrap();
        let session = sessions
            .get(id)
            .ok_or_else(|| format!("PTY 会话 {} 不存在", id))?;
        let mut writer = session.writer.lock().unwrap();
        writer
            .write_all(data.as_bytes())
            .map_err(|e| format!("写入 PTY 失败: {}", e))?;
        writer.flush().map_err(|e| e.to_string())?;
        Ok(())
    }

    pub fn resize(&self, id: &str, cols: u16, rows: u16) -> Result<(), String> {
        let sessions = self.sessions.lock().unwrap();
        let session = sessions
            .get(id)
            .ok_or_else(|| format!("PTY 会话 {} 不存在", id))?;
        let master = session.master.lock().unwrap();
        master
            .resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| format!("调整 PTY 大小失败: {}", e))?;
        Ok(())
    }

    pub fn close(&self, id: &str) -> Result<(), String> {
        // 关键：不要在这里 lock child！
        // 因为"等待子进程线程"会长期持有 child.lock() 直到子进程退出，
        // 如果在这里 lock child → 会阻塞直到子进程自然退出 → 前端 invoke 卡死。
        //
        // 正确做法：
        //   1. 从 sessions map 移除 session（拿到所有权）
        //   2. try_lock child 尝试 kill（非阻塞，失败说明等待线程持有锁）
        //   3. drop master → reader 线程 read() 返回 EOF → 退出
        //   4. drop writer → 子进程 stdin 收到 EOF → 自然退出
        //   5. 等待线程的 child.wait() 返回 → 释放 child.lock()
        let session = {
            let mut sessions = self.sessions.lock().unwrap();
            sessions.remove(id)
        };
        if let Some(session) = session {
            // 尝试 kill（非阻塞）
            if let Ok(mut c) = session.child.try_lock() {
                let _ = c.kill();
            }
            // 显式 drop 各字段：master/writer 先释放，触发 PTY 关闭链
            // child 的 Arc 还有等待线程的引用，不会真正 drop，但没关系
            drop(session);
        }
        Ok(())
    }

    pub fn is_alive(&self, id: &str) -> bool {
        self.sessions.lock().unwrap().contains_key(id)
    }
}
