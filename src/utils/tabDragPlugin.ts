import { invoke } from '@tauri-apps/api/core';

// 拖拽状态
export type DragState = 'Idle' | 'Dragging' | 'Detaching' | 'Merging';

// 拖拽结果
export interface DragResult {
  state: DragState;
  draggedTabId: string | null;
  sourceWindow: string | null;
  targetWindow: string | null;
  finalPos: [number, number] | null;
}

// 开始拖拽
export async function startTabDrag(
  tabId: string,
  x: number,
  y: number,
  windowLabel: string
): Promise<void> {
  await invoke('start_tab_drag', {
    tabId,
    x,
    y,
    windowLabel,
  });
}

// 更新拖拽位置
export async function updateDragPosition(
  x: number,
  y: number
): Promise<{ tabId: string; x: number; y: number } | null> {
  const result = await invoke<[string, number, number] | null>('update_drag_position', {
    x,
    y,
  });
  
  if (result) {
    return {
      tabId: result[0],
      x: result[1],
      y: result[2],
    };
  }
  
  return null;
}

// 结束拖拽
export async function endTabDrag(): Promise<DragResult> {
  const result = await invoke<{
    state: string;
    dragged_tab_id: string | null;
    source_window: string | null;
    target_window: string | null;
    final_pos: [number, number] | null;
  }>('end_tab_drag');
  
  return {
    state: result.state as DragState,
    draggedTabId: result.dragged_tab_id,
    sourceWindow: result.source_window,
    targetWindow: result.target_window,
    finalPos: result.final_pos,
  };
}

// 获取拖拽状态
export async function getDragState(): Promise<DragState> {
  const state = await invoke<string>('get_drag_state');
  return state as DragState;
}

// 获取目标窗口
export async function getTargetWindow(): Promise<string | null> {
  return await invoke<string | null>('get_target_window');
}

// 拖拽管理器类
export class TabDragManager {
  private isDragging = false;
  private onDetachCallback: ((tabId: string, x: number, y: number) => void) | null = null;
  private onMergeCallback: ((tabId: string, targetWindow: string) => void) | null = null;
  private animationFrameId: number | null = null;

  // 设置分离回调
  public onDetach(callback: (tabId: string, x: number, y: number) => void) {
    this.onDetachCallback = callback;
  }

  // 设置合并回调
  public onMerge(callback: (tabId: string, targetWindow: string) => void) {
    this.onMergeCallback = callback;
  }

  // 开始拖拽
  public async startDrag(tabId: string, x: number, y: number, windowLabel: string) {
    this.isDragging = true;
    await startTabDrag(tabId, x, y, windowLabel);
    this.startTracking();
  }

  // 开始跟踪鼠标位置
  private startTracking() {
    const track = async () => {
      if (!this.isDragging) return;

      // 获取当前鼠标位置
      // 注意：这里我们需要一种方式获取全局鼠标位置
      // 由于浏览器安全限制，我们无法直接获取全局鼠标位置
      // 需要通过 Rust 插件来获取

      // 检查目标窗口
      const targetWindow = await getTargetWindow();
      if (targetWindow) {
        console.log('[TabDragManager] Target window detected:', targetWindow);
      }

      this.animationFrameId = requestAnimationFrame(track);
    };

    this.animationFrameId = requestAnimationFrame(track);
  }

  // 更新位置（从鼠标事件调用）
  public async updatePosition(x: number, y: number) {
    if (!this.isDragging) return;

    const result = await updateDragPosition(x, y);
    if (result) {
      console.log('[TabDragManager] Detach detected:', result);
      if (this.onDetachCallback) {
        this.onDetachCallback(result.tabId, result.x, result.y);
      }
    }
  }

  // 结束拖拽
  public async endDrag(): Promise<DragResult> {
    this.isDragging = false;
    
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    const result = await endTabDrag();
    console.log('[TabDragManager] Drag ended:', result);

    // 如果检测到合并
    if (result.state === 'Merging' && result.targetWindow && this.onMergeCallback) {
      this.onMergeCallback(result.draggedTabId!, result.targetWindow);
    }

    return result;
  }

  // 获取是否正在拖拽
  public getIsDragging(): boolean {
    return this.isDragging;
  }
}

// 创建拖拽管理器实例
export function createTabDragManager(): TabDragManager {
  return new TabDragManager();
}
