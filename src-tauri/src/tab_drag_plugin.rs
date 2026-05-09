use tauri::{
    plugin::{Builder, TauriPlugin},
    Runtime, Manager,
};
use std::sync::{Arc, Mutex};
use std::collections::HashMap;

// 拖拽状态
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum DragState {
    Idle,
    Dragging,
    Detaching,
    Merging,
}

// 窗口信息
#[derive(Debug, Clone)]
pub struct WindowInfo {
    pub label: String,
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub tab_bar_rect: Option<(i32, i32, u32, u32)>,
}

// 拖拽管理器状态
pub struct DragManager {
    state: DragState,
    dragged_tab_id: Option<String>,
    drag_start_pos: Option<(i32, i32)>,
    current_mouse_pos: Option<(i32, i32)>,
    source_window: Option<String>,
    target_window: Option<String>,
    windows: HashMap<String, WindowInfo>,
}

impl DragManager {
    pub fn new() -> Self {
        Self {
            state: DragState::Idle,
            dragged_tab_id: None,
            drag_start_pos: None,
            current_mouse_pos: None,
            source_window: None,
            target_window: None,
            windows: HashMap::new(),
        }
    }

    pub fn start_drag(&mut self, tab_id: String, x: i32, y: i32, window_label: String) {
        self.state = DragState::Dragging;
        self.dragged_tab_id = Some(tab_id);
        self.drag_start_pos = Some((x, y));
        self.current_mouse_pos = Some((x, y));
        self.source_window = Some(window_label);
        self.target_window = None;
    }

    pub fn update_mouse_pos(&mut self, x: i32, y: i32) -> Option<(String, i32, i32)> {
        self.current_mouse_pos = Some((x, y));
        
        if self.state == DragState::Dragging {
            if let Some((start_x, start_y)) = self.drag_start_pos {
                let distance = ((x - start_x).pow(2) + (y - start_y).pow(2)) as f64;
                let distance = distance.sqrt();
                
                // 超过阈值，开始分离
                if distance > 60.0 {
                    self.state = DragState::Detaching;
                    return Some((self.dragged_tab_id.clone()?, x, y));
                }
            }
        }
        
        // 检测是否在目标窗口上
        if self.state == DragState::Dragging || self.state == DragState::Detaching {
            self.detect_target_window(x, y);
        }
        
        None
    }

    fn detect_target_window(&mut self, x: i32, y: i32) {
        for (label, info) in &self.windows {
            if Some(label.clone()) == self.source_window {
                continue;
            }
            
            if x >= info.x && x <= info.x + info.width as i32 &&
               y >= info.y && y <= info.y + info.height as i32 {
                self.target_window = Some(label.clone());
                self.state = DragState::Merging;
                return;
            }
        }
        
        if self.state == DragState::Merging {
            self.state = DragState::Dragging;
            self.target_window = None;
        }
    }

    pub fn end_drag(&mut self) -> DragResult {
        let result = DragResult {
            state: self.state,
            dragged_tab_id: self.dragged_tab_id.clone(),
            source_window: self.source_window.clone(),
            target_window: self.target_window.clone(),
            final_pos: self.current_mouse_pos,
        };
        
        // 重置状态
        self.state = DragState::Idle;
        self.dragged_tab_id = None;
        self.drag_start_pos = None;
        self.current_mouse_pos = None;
        self.source_window = None;
        self.target_window = None;
        
        result
    }

    pub fn update_window_info(&mut self, label: String, x: i32, y: i32, width: u32, height: u32) {
        self.windows.insert(label.clone(), WindowInfo {
            label,
            x,
            y,
            width,
            height,
            tab_bar_rect: None,
        });
    }

    pub fn remove_window(&mut self, label: &str) {
        self.windows.remove(label);
    }

    pub fn get_state(&self) -> DragState {
        self.state
    }

    pub fn get_target_window(&self) -> Option<String> {
        self.target_window.clone()
    }
}

// 拖拽结果
pub struct DragResult {
    pub state: DragState,
    pub dragged_tab_id: Option<String>,
    pub source_window: Option<String>,
    pub target_window: Option<String>,
    pub final_pos: Option<(i32, i32)>,
}

// 插件状态
pub struct TabDragPluginState {
    pub drag_manager: Arc<Mutex<DragManager>>,
}

impl TabDragPluginState {
    pub fn new() -> Self {
        Self {
            drag_manager: Arc::new(Mutex::new(DragManager::new())),
        }
    }
}

// 初始化插件
pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("tab-drag")
        .setup(|app, _api| {
            // 初始化插件状态
            app.manage(TabDragPluginState::new());
            
            // 监听窗口事件
            let app_handle = app.app_handle().clone();
            
            // 定期更新窗口位置信息
            std::thread::spawn(move || {
                loop {
                    std::thread::sleep(std::time::Duration::from_millis(100));
                    
                    // 获取所有窗口并更新位置信息
                    let windows = app_handle.webview_windows();
                    for (label, window) in windows {
                        if let Ok(position) = window.outer_position() {
                            if let Ok(size) = window.inner_size() {
                                if let Some(state) = app_handle.try_state::<TabDragPluginState>() {
                                    if let Ok(mut manager) = state.drag_manager.lock() {
                                        manager.update_window_info(
                                            label,
                                            position.x,
                                            position.y,
                                            size.width,
                                            size.height,
                                        );
                                    }
                                }
                            }
                        }
                    }
                }
            });
            
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            start_tab_drag,
            update_drag_position,
            end_tab_drag,
            get_drag_state,
            get_target_window,
        ])
        .build()
}

// 命令：开始拖拽
#[tauri::command]
async fn start_tab_drag(
    tab_id: String,
    x: i32,
    y: i32,
    window_label: String,
    state: tauri::State<'_, TabDragPluginState>,
) -> Result<(), String> {
    let mut manager = state.drag_manager.lock().map_err(|e| e.to_string())?;
    manager.start_drag(tab_id, x, y, window_label);
    Ok(())
}

// 命令：更新拖拽位置
#[tauri::command]
async fn update_drag_position(
    x: i32,
    y: i32,
    state: tauri::State<'_, TabDragPluginState>,
) -> Result<Option<(String, i32, i32)>, String> {
    let mut manager = state.drag_manager.lock().map_err(|e| e.to_string())?;
    Ok(manager.update_mouse_pos(x, y))
}

// 命令：结束拖拽
#[tauri::command]
async fn end_tab_drag(
    state: tauri::State<'_, TabDragPluginState>,
) -> Result<DragResultJson, String> {
    let mut manager = state.drag_manager.lock().map_err(|e| e.to_string())?;
    let result = manager.end_drag();
    
    Ok(DragResultJson {
        state: format!("{:?}", result.state),
        dragged_tab_id: result.dragged_tab_id,
        source_window: result.source_window,
        target_window: result.target_window,
        final_pos: result.final_pos,
    })
}

// 命令：获取拖拽状态
#[tauri::command]
async fn get_drag_state(
    state: tauri::State<'_, TabDragPluginState>,
) -> Result<String, String> {
    let manager = state.drag_manager.lock().map_err(|e| e.to_string())?;
    Ok(format!("{:?}", manager.get_state()))
}

// 命令：获取目标窗口
#[tauri::command]
async fn get_target_window(
    state: tauri::State<'_, TabDragPluginState>,
) -> Result<Option<String>, String> {
    let manager = state.drag_manager.lock().map_err(|e| e.to_string())?;
    Ok(manager.get_target_window())
}

// JSON 序列化的拖拽结果
#[derive(serde::Serialize)]
pub struct DragResultJson {
    pub state: String,
    pub dragged_tab_id: Option<String>,
    pub source_window: Option<String>,
    pub target_window: Option<String>,
    pub final_pos: Option<(i32, i32)>,
}
