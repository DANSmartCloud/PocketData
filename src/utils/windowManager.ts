import { WebviewWindow, getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { emit, listen } from '@tauri-apps/api/event';
import { DTAFile, Tab } from '@/stores/fileStore';

export const TAB_MIME_TYPE = 'application/x-pocketstata-tab';

export interface TabTransferData {
  tab: Tab;
  file: DTAFile;
  sourceWindowLabel: string;
}

export interface WindowCreatedEvent {
  windowLabel: string;
}

export interface TabReceivedEvent {
  tab: Tab;
  file: DTAFile;
  insertIndex?: number;
}

export interface DragTakeoverData {
  tab: Tab;
  file: DTAFile;
  mouseX: number;
  mouseY: number;
  mouseInTabX: number;
  mouseInTabY: number;
  tabScreenX: number;
  tabScreenY: number;
  newWindowTabOffsetX: number;
  newWindowTabOffsetY: number;
  tabWidth: number;
  tabHeight: number;
  sourceWindowLabel: string;
}

export interface DragTakeoverEvent extends DragTakeoverData {
  targetWindow: string;
}

const WINDOW_CREATED_EVENT = 'window:created';
const TAB_TRANSFER_EVENT = 'tab:transfer';
const TAB_MERGE_REQUEST_EVENT = 'tab:merge-request';
const TAB_MERGE_RESPONSE_EVENT = 'tab:merge-response';
const DRAG_TAKEOVER_EVENT = 'drag:takeover';

let windowCounter = 0;

// 存储活跃的窗口标签（用于合并检测）
const activeWindowRects = new Map<string, { x: number; y: number; width: number; height: number }>();

/**
 * 创建拖拽预览窗口（半透明、无边框、跟随鼠标）
 */
export async function createDragPreviewWindow(
  tab: Tab,
  mouseX: number,
  mouseY: number
): Promise<WebviewWindow | null> {
  try {
    const windowLabel = `window-preview-${Date.now()}`;
    
    const previewWindow = new WebviewWindow(windowLabel, {
      url: `/drag-preview?tabTitle=${encodeURIComponent(tab.title)}`,
      title: tab.title,
      width: 280,
      height: 60,
      x: mouseX - 140,
      y: mouseY - 30,
      resizable: false,
      decorations: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      visible: true,
      focus: false,
    });

    console.log('Drag preview window created:', windowLabel);
    return previewWindow;
  } catch (error) {
    console.error('Failed to create drag preview window:', error);
    return null;
  }
}

/**
 * 更新拖拽预览窗口位置
 */
export async function updateDragPreviewWindow(
  window: WebviewWindow,
  mouseX: number,
  mouseY: number
): Promise<void> {
  try {
    const { LogicalPosition } = await import('@tauri-apps/api/dpi');
    await window.setPosition(new LogicalPosition(mouseX - 140, mouseY - 30));
  } catch (error) {
    console.error('Failed to update drag preview position:', error);
  }
}

/**
 * 将预览窗口转换为正式窗口
 */
export async function convertPreviewToWindow(
  previewWindow: WebviewWindow,
  tab: Tab,
  file: DTAFile
): Promise<WebviewWindow | null> {
  try {
    const windowLabel = `window-${Date.now()}-${++windowCounter}`;
    const position = await previewWindow.outerPosition();
    
    // 关闭预览窗口
    await previewWindow.close();
    
    // 创建正式窗口
    // 在开发模式下使用完整的 devUrl
    const isDev = import.meta.env.DEV;
    const windowUrl = isDev ? 'http://localhost:1420' : '/';
    
    console.log('[windowManager] Creating window with URL:', windowUrl, 'isDev:', isDev);
    
    const newWindow = new WebviewWindow(windowLabel, {
      url: windowUrl,
      title: 'PocketStata - 口袋Stata',
      width: 1200,
      height: 800,
      minWidth: 800,
      minHeight: 600,
      x: position.x,
      y: position.y,
      resizable: true,
      decorations: false,
      visible: true,
      focus: true,
    });

    console.log('Converted preview to window:', windowLabel);
    
    // 等待窗口创建完成并发送标签页数据
    await newWindow.once('tauri://created', async () => {
      console.log('New window created, sending tab data');
      setTimeout(async () => {
        await sendTabToWindow(windowLabel, tab, file);
      }, 300);
    });

    await emit(WINDOW_CREATED_EVENT, { windowLabel } as WindowCreatedEvent);
    
    return newWindow;
  } catch (error) {
    console.error('Failed to convert preview to window:', error);
    return null;
  }
}

/**
 * 创建新窗口（用于拖拽释放时）
 */
export async function createNewWindow(
  tab?: Tab, 
  file?: DTAFile,
  position?: { x: number; y: number }
): Promise<WebviewWindow | null> {
  console.log('[windowManager] createNewWindow called:', { tab: tab?.title, file: file?.name, position });
  
  try {
    const windowLabel = `window-${Date.now()}-${++windowCounter}`;
    
    // 如果没有指定位置，使用偏移
    const currentWindow = getCurrentWebviewWindow();
    let windowX = 100;
    let windowY = 100;
    
    if (position) {
      windowX = position.x;
      windowY = position.y;
    } else {
      const currentPosition = await currentWindow.outerPosition();
      windowX = currentPosition.x + 50;
      windowY = currentPosition.y + 50;
    }
    
    console.log('[windowManager] Creating new window:', {
      label: windowLabel,
      x: windowX,
      y: windowY,
      hasTab: !!tab,
      hasFile: !!file
    });
    
    // 在开发模式下使用完整的 devUrl
    const isDev = import.meta.env.DEV;
    const windowUrl = isDev ? 'http://localhost:1420' : '/';
    
    console.log('[windowManager] Creating window with URL:', windowUrl, 'isDev:', isDev);
    
    const newWindow = new WebviewWindow(windowLabel, {
      url: windowUrl,
      title: 'PocketStata - 口袋Stata',
      width: 1200,
      height: 800,
      minWidth: 800,
      minHeight: 600,
      resizable: true,
      decorations: false,
      x: windowX,
      y: windowY,
      visible: true,
      focus: true,
    });

    console.log('[windowManager] WebviewWindow instance created:', windowLabel);
    
    // 使用局部变量保存 windowLabel，避免闭包问题
    const targetWindowLabel = windowLabel;
    
    // 等待窗口加载完成
    newWindow.once('tauri://created', async () => {
      console.log('[windowManager] New window created successfully:', targetWindowLabel);
      
      // 立即启动窗口拖动，让用户可以继续拖拽新窗口
      try {
        console.log('[windowManager] Starting window drag for new window...');
        await newWindow.startDragging();
        console.log('[windowManager] Window drag started');
      } catch (err) {
        console.error('[windowManager] Failed to start window drag:', err);
      }
      
      if (tab && file) {
        console.log('[windowManager] Sending tab to new window:', { targetWindowLabel, tab: tab.title, file: file.name });
        // 增加延迟，确保新窗口已完全加载并准备好接收事件
        setTimeout(async () => {
          console.log('[windowManager] Actually sending tab now...');
          await sendTabToWindow(targetWindowLabel, tab, file);
        }, 1000);
      }
    });

    newWindow.once('tauri://error', (e) => {
      console.error('[windowManager] Failed to create window:', e);
    });

    await emit(WINDOW_CREATED_EVENT, { windowLabel } as WindowCreatedEvent);

    console.log('[windowManager] Returning newWindow:', windowLabel);
    return newWindow;
  } catch (error) {
    console.error('[windowManager] Failed to create new window:', error);
    return null;
  }
}

/**
 * 发送标签页到指定窗口
 */
export async function sendTabToWindow(
  targetWindowLabel: string,
  tab: Tab,
  file: DTAFile,
  insertIndex?: number
): Promise<void> {
  try {
    const currentWindow = getCurrentWebviewWindow();
    
    // 确保数据可以被序列化
    const safeTab = { ...tab };
    const safeFile = { 
      ...file,
      // 确保 data 是数组
      data: Array.isArray(file.data) ? file.data : [],
      // 确保 variables 是数组
      variables: Array.isArray(file.variables) ? file.variables : [],
      // 确保 valueLabels 是对象
      valueLabels: file.valueLabels || {}
    };
    
    const transferData: TabTransferData = {
      tab: safeTab,
      file: safeFile,
      sourceWindowLabel: currentWindow.label,
    };

    console.log('[windowManager] Emitting tab transfer event:', {
      targetWindow: targetWindowLabel,
      tabTitle: safeTab.title,
      fileName: safeFile.name,
      dataLength: safeFile.data.length,
      variablesLength: safeFile.variables.length
    });

    await emit(TAB_TRANSFER_EVENT, {
      targetWindow: targetWindowLabel,
      data: transferData,
      insertIndex,
    });
    
    console.log('[windowManager] Tab transfer event emitted successfully');
  } catch (error) {
    console.error('[windowManager] Failed to send tab to window:', error);
  }
}

/**
 * 监听标签页传输事件
 */
export async function listenForTabTransfer(
  callback: (data: TabTransferData, insertIndex?: number) => void
): Promise<() => void> {
  // 延迟获取窗口实例，避免在Tauri未完全初始化时调用
  let cachedLabel = '';
  try {
    const win = getCurrentWebviewWindow();
    cachedLabel = win.label;
  } catch {
    cachedLabel = 'unknown';
  }
  
  console.log('[windowManager] Setting up tab transfer listener for window:', cachedLabel);
  
  // 使用 Set 来跟踪已处理的事件，防止重复处理
  const processedEvents = new Set<string>();
  
  const unlisten = await listen<{ targetWindow: string; data: TabTransferData; insertIndex?: number }>(
    TAB_TRANSFER_EVENT,
    (event) => {
      try {
        const win = getCurrentWebviewWindow();
        // 生成唯一事件标识
        const eventId = `${event.payload.targetWindow}-${event.payload.data.tab.id}-${Date.now()}`;
        
        console.log('[windowManager] Received tab transfer event:', {
          targetWindow: event.payload.targetWindow,
          currentWindow: win.label,
          matches: event.payload.targetWindow === win.label,
          eventId,
          alreadyProcessed: processedEvents.has(eventId)
        });
        
        if (event.payload.targetWindow !== win.label) {
          console.log('[windowManager] Event not for this window (target: ' + event.payload.targetWindow + ', current: ' + win.label + '), ignoring');
          return;
        }
        
        // 检查是否已处理过此事件（500ms 内的重复事件视为同一事件）
        const recentEvent = Array.from(processedEvents).find(id => 
          id.startsWith(`${event.payload.targetWindow}-${event.payload.data.tab.id}-`)
        );
        if (recentEvent) {
          const eventTime = parseInt(recentEvent.split('-').pop() || '0');
          if (Date.now() - eventTime < 500) {
            console.log('[windowManager] Duplicate event detected, skipping');
            return;
          }
        }
        
        // 记录已处理的事件
        processedEvents.add(eventId);
        // 清理旧的事件记录
        setTimeout(() => processedEvents.delete(eventId), 1000);
        
        console.log('[windowManager] Event matches this window, calling callback');
        callback(event.payload.data, event.payload.insertIndex);
      } catch (e) {
        console.warn('[windowManager] Error handling tab transfer event:', e);
      }
    }
  );

  return unlisten;
}

/**
 * 发送拖拽接管事件给目标窗口（合并后不松手继续拖拽）
 */
export async function sendDragTakeover(
  targetWindowLabel: string,
  data: DragTakeoverData
): Promise<void> {
  try {
    await emit(DRAG_TAKEOVER_EVENT, {
      targetWindow: targetWindowLabel,
      ...data
    });
  } catch (error) {
    console.error('[windowManager] Failed to send drag takeover:', error);
  }
}

/**
 * 监听拖拽接管事件
 */
export async function listenForDragTakeover(
  callback: (data: DragTakeoverData) => void
): Promise<() => void> {
  const currentWindow = getCurrentWebviewWindow();
  
  const unlisten = await listen<DragTakeoverEvent>(DRAG_TAKEOVER_EVENT, (event) => {
    if (event.payload.targetWindow === currentWindow.label) {
      console.log('[windowManager] Received drag takeover');
      callback({
        tab: event.payload.tab,
        file: event.payload.file,
        mouseX: event.payload.mouseX,
        mouseY: event.payload.mouseY,
        mouseInTabX: event.payload.mouseInTabX,
        mouseInTabY: event.payload.mouseInTabY,
        tabScreenX: event.payload.tabScreenX,
        tabScreenY: event.payload.tabScreenY,
        newWindowTabOffsetX: event.payload.newWindowTabOffsetX,
        newWindowTabOffsetY: event.payload.newWindowTabOffsetY,
        tabWidth: event.payload.tabWidth,
        tabHeight: event.payload.tabHeight,
        sourceWindowLabel: event.payload.sourceWindowLabel,
      });
    }
  });
  
  return unlisten;
}

/**
 * 监听窗口创建事件
 */
export async function listenForWindowCreated(
  callback: (event: WindowCreatedEvent) => void
): Promise<() => void> {
  const unlisten = await listen<WindowCreatedEvent>(
    WINDOW_CREATED_EVENT,
    (event) => {
      callback(event.payload);
    }
  );

  return unlisten;
}

/**
 * 检查是否拖拽到窗口外（即时检测）
 */
export function isDragOutsideWindow(
  startX: number, 
  startY: number, 
  currentX: number, 
  currentY: number,
  threshold: number = 60
): boolean {
  const dx = currentX - startX;
  const dy = currentY - startY;
  const distance = Math.sqrt(dx * dx + dy * dy);
  
  return distance > threshold;
}

/**
 * 获取拖拽方向
 */
export function getDragDirection(
  startX: number, 
  startY: number, 
  currentX: number, 
  currentY: number
): 'up' | 'down' | 'left' | 'right' | 'none' {
  const dx = currentX - startX;
  const dy = currentY - startY;
  const absX = Math.abs(dx);
  const absY = Math.abs(dy);
  
  if (absX < 10 && absY < 10) return 'none';
  
  if (absY > absX) {
    return dy > 0 ? 'down' : 'up';
  } else {
    return dx > 0 ? 'right' : 'left';
  }
}

export async function getCurrentWindowLabel(): Promise<string> {
  try {
    const currentWindow = getCurrentWebviewWindow();
    return currentWindow.label;
  } catch {
    return 'unknown';
  }
}

export async function closeCurrentWindow(): Promise<void> {
  const currentWindow = getCurrentWebviewWindow();
  await currentWindow.close();
}

export async function focusWindow(windowLabel: string): Promise<void> {
  try {
    const window = await WebviewWindow.getByLabel(windowLabel);
    if (window) {
      await window.setFocus();
    }
  } catch (error) {
    console.error('Failed to focus window:', error);
  }
}

/**
 * 获取所有 Webview 窗口
 */
export async function getAllWebviewWindows(): Promise<WebviewWindow[]> {
  try {
    // Tauri 2.0 中没有直接获取所有窗口的 API
    // 我们需要通过其他方式跟踪窗口
    // 暂时返回空数组，后续可以通过事件跟踪窗口创建
    return [];
  } catch (error) {
    console.error('Failed to get all windows:', error);
    return [];
  }
}

// 全局窗口注册表（用于跨窗口检测）
const WINDOW_REGISTRY_KEY = 'pocketstata_window_registry';

// 检查是否在 Tauri 环境中
function isTauriAvailable(): boolean {
  try {
    return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
  } catch {
    return false;
  }
}

// 注册当前窗口到全局注册表
export async function registerWindow(): Promise<void> {
  if (!isTauriAvailable()) return;
  
  try {
    const currentWindow = getCurrentWebviewWindow();
    const position = await currentWindow.outerPosition();
    const size = await currentWindow.innerSize();
    
    const registryStr = localStorage.getItem(WINDOW_REGISTRY_KEY) || '{}';
    const registry = JSON.parse(registryStr);
    
    registry[currentWindow.label] = {
      label: currentWindow.label,
      x: position.x,
      y: position.y,
      width: size.width,
      height: size.height,
      tabBarRect: null,
      timestamp: Date.now()
    };
    
    localStorage.setItem(WINDOW_REGISTRY_KEY, JSON.stringify(registry));
  } catch (error) {
    console.error('[windowManager] Failed to register window:', error);
  }
}

// 更新窗口位置信息
export async function updateWindowPosition(): Promise<void> {
  if (!isTauriAvailable()) return;
  
  try {
    const currentWindow = getCurrentWebviewWindow();
    const position = await currentWindow.outerPosition();
    const size = await currentWindow.innerSize();
    
    const registryStr = localStorage.getItem(WINDOW_REGISTRY_KEY) || '{}';
    const registry = JSON.parse(registryStr);
    
    if (registry[currentWindow.label]) {
      registry[currentWindow.label].x = position.x;
      registry[currentWindow.label].y = position.y;
      registry[currentWindow.label].width = size.width;
      registry[currentWindow.label].height = size.height;
      registry[currentWindow.label].timestamp = Date.now();
      
      localStorage.setItem(WINDOW_REGISTRY_KEY, JSON.stringify(registry));
    }
  } catch (error) {
    // 静默处理，避免过多日志
  }
}

// 注销窗口
export async function unregisterWindow(): Promise<void> {
  if (!isTauriAvailable()) return;
  
  try {
    const currentWindow = getCurrentWebviewWindow();
    
    const registryStr = localStorage.getItem(WINDOW_REGISTRY_KEY) || '{}';
    const registry = JSON.parse(registryStr);
    
    delete registry[currentWindow.label];
    
    localStorage.setItem(WINDOW_REGISTRY_KEY, JSON.stringify(registry));
  } catch (error) {
    console.error('[windowManager] Failed to unregister window:', error);
  }
}

// 获取所有活动窗口
export function getActiveWindows(): Record<string, any> {
  try {
    const registryStr = localStorage.getItem(WINDOW_REGISTRY_KEY) || '{}';
    const registry = JSON.parse(registryStr);
    
    // 清理超过5秒未更新的窗口（可能已关闭）
    const now = Date.now();
    const activeWindows: Record<string, any> = {};
    
    for (const [label, info] of Object.entries(registry)) {
      if ((info as any).timestamp > now - 5000) {
        activeWindows[label] = info;
      }
    }
    
    return activeWindows;
  } catch (error) {
    console.error('[windowManager] Failed to get active windows:', error);
    return {};
  }
}

/**
 * 更新当前窗口的标签栏区域（用于其他窗口检测是否可以合并）
 */
export async function updateWindowTabBarRect(
  rect: { x: number; y: number; width: number; height: number } | null
): Promise<void> {
  const currentWindow = getCurrentWebviewWindow();
  if (rect) {
    activeWindowRects.set(currentWindow.label, rect);
  } else {
    activeWindowRects.delete(currentWindow.label);
  }
}

/**
 * 检查鼠标位置是否在任意其他窗口的标签栏区域内
 */
export async function checkMergeTarget(
  mouseX: number,
  mouseY: number
): Promise<{ windowLabel: string; insertIndex: number; tabBarRect: { x: number; y: number; width: number; height: number } } | null> {
  const currentWindow = getCurrentWebviewWindow();
  const activeWindows = getActiveWindows();
  
  // 首先检查localStorage中存储的tabBar矩形
  for (const [windowLabel, rect] of activeWindowRects.entries()) {
    if (windowLabel === currentWindow.label) continue;
    
    // 检查鼠标是否在标签栏区域内
    if (
      mouseX >= rect.x &&
      mouseX <= rect.x + rect.width &&
      mouseY >= rect.y &&
      mouseY <= rect.y + rect.height
    ) {
      return { windowLabel, insertIndex: -1, tabBarRect: rect };
    }
  }
  
  // 然后通过窗口注册表检测（检查是否在窗口顶部区域）
  for (const [windowLabel, info] of Object.entries(activeWindows)) {
    if (windowLabel === currentWindow.label) continue;
    
    // 标签栏通常在窗口顶部40px高度
    const tabBarHeight = 40;
    const tabBarRect = {
      x: info.x,
      y: info.y,
      width: info.width,
      height: tabBarHeight
    };
    
    // 检查鼠标是否在标签栏区域内
    if (
      mouseX >= tabBarRect.x &&
      mouseX <= tabBarRect.x + tabBarRect.width &&
      mouseY >= tabBarRect.y &&
      mouseY <= tabBarRect.y + tabBarRect.height
    ) {
      return { windowLabel, insertIndex: -1, tabBarRect };
    }
  }
  
  return null;
}

/**
 * 请求合并标签页到目标窗口
 */
export async function requestTabMerge(
  targetWindowLabel: string,
  tab: Tab,
  file: DTAFile,
  sourceWindowLabel: string
): Promise<boolean> {
  try {
    console.log('[windowManager] Requesting tab merge:', {
      targetWindow: targetWindowLabel,
      sourceWindow: sourceWindowLabel,
      tabTitle: tab.title
    });
    
    await emit(TAB_MERGE_REQUEST_EVENT, {
      targetWindow: targetWindowLabel,
      sourceWindow: sourceWindowLabel,
      tab,
      file
    });
    
    return true;
  } catch (error) {
    console.error('[windowManager] Failed to request tab merge:', error);
    return false;
  }
}

/**
 * 监听标签页合并请求
 */
export async function listenForTabMergeRequest(
  callback: (data: { tab: Tab; file: DTAFile; sourceWindowLabel: string }) => void
): Promise<() => void> {
  const currentWindow = getCurrentWebviewWindow();
  
  console.log('[windowManager] Setting up tab merge request listener for window:', currentWindow.label);
  
  const unlisten = await listen<{
    targetWindow: string;
    sourceWindow: string;
    tab: Tab;
    file: DTAFile;
  }>(TAB_MERGE_REQUEST_EVENT, (event) => {
    if (event.payload.targetWindow === currentWindow.label) {
      console.log('[windowManager] Received tab merge request:', event.payload);
      callback({
        tab: event.payload.tab,
        file: event.payload.file,
        sourceWindowLabel: event.payload.sourceWindow
      });
    }
  });
  
  return unlisten;
}

/**
 * 发送合并响应给源窗口
 */
export async function sendMergeResponse(
  sourceWindowLabel: string,
  success: boolean
): Promise<void> {
  try {
    await emit(TAB_MERGE_RESPONSE_EVENT, {
      sourceWindow: sourceWindowLabel,
      success
    });
  } catch (error) {
    console.error('[windowManager] Failed to send merge response:', error);
  }
}

/**
 * 监听合并响应
 */
export async function listenForMergeResponse(
  callback: (success: boolean) => void
): Promise<() => void> {
  const currentWindow = getCurrentWebviewWindow();
  
  const unlisten = await listen<{
    sourceWindow: string;
    success: boolean;
  }>(TAB_MERGE_RESPONSE_EVENT, (event) => {
    if (event.payload.sourceWindow === currentWindow.label) {
      console.log('[windowManager] Received merge response:', event.payload);
      callback(event.payload.success);
    }
  });
  
  return unlisten;
}
