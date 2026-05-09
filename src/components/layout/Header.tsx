import { useRef, useState, useCallback, useEffect } from "react";
import { Menu, X, Code, FileText, Table, FileSpreadsheet, FileType } from "lucide-react";
import { useFileStore } from "@/stores/fileStore";
import { Logo } from "@/components/common/Logo";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWebviewWindow, WebviewWindow } from '@tauri-apps/api/webviewWindow';
import {
  listenForTabTransfer,
  listenForTabMergeRequest,
  sendMergeResponse,
  listenForMergeResponse,
  listenForDragTakeover,
  sendDragTakeover,
  registerWindow,
  updateWindowPosition,
  unregisterWindow,
  sendTabToWindow,
} from "@/utils/windowManager";
import styles from "./Header.module.css";

interface HeaderProps {
  onToggleSidebar?: () => void;
  showSidebarButton?: boolean;
  isMobile?: boolean;
}

type DragPhase = 'idle' | 'dragging' | 'preview' | 'merged';
type BadgeMode = 'reorder' | 'new-window' | 'merge' | null;

interface DragInfo {
  phase: DragPhase;
  tabId: string | null;
  tabData: { tab: any; file: any } | null;
  mouseX: number;
  mouseY: number;
  startX: number;
  startY: number;
  mouseInTabX: number;
  mouseInTabY: number;
  tabScreenX: number;
  tabScreenY: number;
  newWindowTabOffsetX: number;
  newWindowTabOffsetY: number;
  tabWidth: number;
  tabHeight: number;
  detachedWindow: WebviewWindow | null;
  sourceWindowLabel: string;
  targetWindowLabel: string;
  isMerged: boolean;
  isGhostMode: boolean;
  badgeMode: BadgeMode;
}

const reorderTabToIndex = (tabId: string, targetIndex: number) => {
  const store = useFileStore.getState();
  const currentIndex = store.tabs.findIndex(t => t.id === tabId);
  if (currentIndex < 0 || currentIndex === targetIndex) return;

  const tabs = [...store.tabs];
  const [movedTab] = tabs.splice(currentIndex, 1);
  tabs.splice(targetIndex, 0, movedTab);

  const tabIds = tabs.map(t => t.id);
  store.reorderTabs(tabIds);
};

const REORDER_THRESHOLD = 40;
const DETACH_THRESHOLD = 80;

let globalDragInfo: DragInfo = {
  phase: 'idle',
  tabId: null,
  tabData: null,
  mouseX: 0,
  mouseY: 0,
  startX: 0,
  startY: 0,
  mouseInTabX: 0,
  mouseInTabY: 0,
  tabScreenX: 0,
  tabScreenY: 0,
  newWindowTabOffsetX: 0,
  newWindowTabOffsetY: 0,
  tabWidth: 0,
  tabHeight: 0,
  detachedWindow: null,
  sourceWindowLabel: '',
  targetWindowLabel: '',
  isMerged: false,
  isGhostMode: false,
  badgeMode: null,
};

function cloneDragInfo(): DragInfo {
  return { ...globalDragInfo };
}

export function Header({ onToggleSidebar, showSidebarButton = true, isMobile = false }: HeaderProps) {
  const { tabs, setActiveTab, closeTab, getTabData, receiveTabFromWindow, scripts } = useFileStore();
  const [isMaximized, setIsMaximized] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const [_ghostState, setGhostState] = useState(false);
  const [dragInfo, setDragInfo] = useState<DragInfo>(cloneDragInfo());

  const containerRef = useRef<HTMLDivElement | null>(null);
  const isDraggingRef = useRef(false);
  const isGhostWindowRef = useRef(false);
  const dragTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragStartMouseRef = useRef<{ x: number; y: number } | null>(null);
  const dragTabRectRef = useRef<DOMRect | null>(null);
  const dragTabDataRef = useRef<{ tab: any; file: any } | null>(null);
  const dragTabIdRef = useRef<string | null>(null);
  const isCreatingWindowRef = useRef(false);
  const globalDragInfoRef = useRef<DragInfo>(globalDragInfo);
  const dragSessionRef = useRef(0);
  const mergeBadgeWindowRef = useRef<WebviewWindow | null>(null);
  const isCreatingBadgeRef = useRef(false);

  const getTabDataRef = useRef(getTabData);
  const closeTabRef = useRef(closeTab);
  const setActiveTabRef = useRef(setActiveTab);
  useEffect(() => {
    getTabDataRef.current = getTabData;
    closeTabRef.current = closeTab;
    setActiveTabRef.current = setActiveTab;
  }, [getTabData, closeTab, setActiveTab]);

  const resetDragState = useCallback(() => {
    if (dragTimerRef.current) {
      clearTimeout(dragTimerRef.current);
      dragTimerRef.current = null;
    }
    dragStartMouseRef.current = null;
    dragTabRectRef.current = null;
    dragTabDataRef.current = null;
    dragTabIdRef.current = null;
    isDraggingRef.current = false;
    isCreatingWindowRef.current = false;
    dragSessionRef.current++;

    if (mergeBadgeWindowRef.current) {
      mergeBadgeWindowRef.current.close().catch(() => {});
      mergeBadgeWindowRef.current = null;
    }

    globalDragInfo = {
      phase: 'idle',
      tabId: null,
      tabData: null,
      mouseX: 0,
      mouseY: 0,
      startX: 0,
      startY: 0,
      mouseInTabX: 0,
      mouseInTabY: 0,
      tabScreenX: 0,
      tabScreenY: 0,
      newWindowTabOffsetX: 0,
      newWindowTabOffsetY: 0,
      tabWidth: 0,
      tabHeight: 0,
      detachedWindow: null,
      sourceWindowLabel: '',
      targetWindowLabel: '',
      isMerged: false,
      isGhostMode: false,
      badgeMode: null,
    };
    globalDragInfoRef.current = globalDragInfo;
    setDragInfo(cloneDragInfo());
  }, []);

  const getTargetWindow = async (mouseX: number, mouseY: number): Promise<{ window: WebviewWindow | null; verticalDist: number }> => {
    try {
      const { getAllWebviewWindows } = await import('@tauri-apps/api/webviewWindow');
      const allWindows = await getAllWebviewWindows();
      const currentWindow = getCurrentWebviewWindow();

      let nearestWindow: WebviewWindow | null = null;
      let nearestDist = Infinity;

      for (const w of allWindows) {
        if (w.label === currentWindow.label) continue;
        if (w.label === globalDragInfo.detachedWindow?.label) continue;

        try {
          const outerPos = await w.outerPosition();
          const outerSize = await w.outerSize();

          const left = outerPos.x;
          const top = outerPos.y;
          const right = left + outerSize.width;

          // 检测鼠标是否在目标窗口的水平范围内
          const isHorizontallyInRange = mouseX >= left && mouseX <= right;
          
          if (!isHorizontallyInRange) continue;

          // 计算垂直方向到目标窗口标签栏上边缘的距离
          const verticalDist = mouseY - top;

          // 只关心鼠标在窗口上方的距离（负值表示在上方）
          if (verticalDist >= -50 && verticalDist < nearestDist) {
            nearestDist = verticalDist;
            nearestWindow = w;
          }
        } catch {}
      }

      return { window: nearestWindow, verticalDist: nearestDist };
    } catch {
      return { window: null, verticalDist: Infinity };
    }
  };

  const cleanupRef = useRef<(() => void) | null>(null);

  const setupDragListeners = useCallback((element: HTMLDivElement | null) => {
    // Clean up previous listeners
    if (cleanupRef.current) {
      cleanupRef.current();
      cleanupRef.current = null;
    }

    if (containerRef.current && containerRef.current !== element) {
      // Ref changed, reset state
    }

    containerRef.current = element;

    if (!element) return;

    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return;

      const target = e.target as HTMLElement;
      if (target.closest('button') || target.closest('[role="button"]')) return;

      const currentWindow = getCurrentWebviewWindow();

      const tabEl = target.closest('[data-tab-id]') as HTMLElement;
      if (!tabEl) {
        if (isDraggingRef.current) return;
        resetDragState();
        dragStartMouseRef.current = { x: e.screenX, y: e.screenY };
        dragTabRectRef.current = null;
        dragTabDataRef.current = null;
        dragTabIdRef.current = null;

        dragTimerRef.current = setTimeout(() => {
          if (!dragStartMouseRef.current) return;
          isDraggingRef.current = false;
          dragStartMouseRef.current = null;
        }, 200);
        return;
      }

      const tabId = tabEl.getAttribute('data-tab-id');
      if (!tabId) return;

      const tabData = getTabDataRef.current(tabId);
      if (!tabData) return;

      if (isDraggingRef.current) return;

      const tabRect = tabEl.getBoundingClientRect();

      const firstTab = containerRef.current?.querySelector('[data-tab-id]') as HTMLElement;
      const firstTabRect = firstTab?.getBoundingClientRect();

      const mouseInTabX = e.clientX - tabRect.left;
      const mouseInTabY = e.clientY - tabRect.top;

      const webviewOffsetX = e.screenX - e.clientX;
      const webviewOffsetY = e.screenY - e.clientY;
      const tabScreenX = tabRect.left + webviewOffsetX;
      const tabScreenY = tabRect.top + webviewOffsetY;

      const newWindowTabOffsetX = firstTabRect ? firstTabRect.left : tabRect.left;
      const newWindowTabOffsetY = firstTabRect ? firstTabRect.top : tabRect.top;

      dragSessionRef.current++;

      dragStartMouseRef.current = { x: e.screenX, y: e.screenY };
      dragTabRectRef.current = tabRect;
      dragTabDataRef.current = tabData;
      dragTabIdRef.current = tabId;

      dragTimerRef.current = setTimeout(() => {
        if (!dragStartMouseRef.current) return;
        if (!dragTabDataRef.current) return;

        isDraggingRef.current = true;

        globalDragInfo = {
          phase: 'dragging',
          tabId: dragTabIdRef.current,
          tabData: dragTabDataRef.current,
          mouseX: dragStartMouseRef.current.x,
          mouseY: dragStartMouseRef.current.y,
          startX: dragStartMouseRef.current.x,
          startY: dragStartMouseRef.current.y,
          mouseInTabX,
          mouseInTabY,
          tabScreenX,
          tabScreenY,
          newWindowTabOffsetX,
          newWindowTabOffsetY,
          tabWidth: dragTabRectRef.current!.width,
          tabHeight: dragTabRectRef.current!.height,
          detachedWindow: null,
          sourceWindowLabel: currentWindow.label,
          targetWindowLabel: '',
          isMerged: false,
          isGhostMode: false,
          badgeMode: 'reorder',
        };

        globalDragInfoRef.current = globalDragInfo;
        setDragInfo(cloneDragInfo());

        if (dragTimerRef.current) {
          clearTimeout(dragTimerRef.current);
          dragTimerRef.current = null;
        }
      }, 200);
    };

    const closeBadgeWindow = async () => {
      if (mergeBadgeWindowRef.current) {
        try { await mergeBadgeWindowRef.current.close(); } catch {}
        mergeBadgeWindowRef.current = null;
      }
      isCreatingBadgeRef.current = false;
    };

    const createBadgeWindow = async (title: string, width: number, height: number, badge: BadgeMode) => {
      if (badge === 'reorder' || !globalDragInfo.tabData) return;
      if (isCreatingBadgeRef.current) return;
      isCreatingBadgeRef.current = true;

      const session = dragSessionRef.current;

      await closeBadgeWindow();

      if (dragSessionRef.current !== session || !isDraggingRef.current || globalDragInfoRef.current.phase === 'idle') {
        isCreatingBadgeRef.current = false;
        return;
      }

      try {
        const previewX = globalDragInfo.tabScreenX;
        const previewY = globalDragInfo.tabScreenY;

        const previewLabel = `window-badge-${Date.now()}`;
        const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');

        const isDev = import.meta.env.DEV;
        const previewUrl = isDev
          ? `http://localhost:1420?dragpreview=true&badge=${badge || 'none'}&title=${encodeURIComponent(title)}&w=${Math.round(width)}&h=${Math.round(height)}`
          : `/?dragpreview=true&badge=${badge || 'none'}&title=${encodeURIComponent(title)}&w=${Math.round(width)}&h=${Math.round(height)}`;

        const previewWindow = new WebviewWindow(previewLabel, {
          url: previewUrl,
          title: 'Drag Preview',
          width: Math.round(width),
          height: Math.round(height),
          x: previewX,
          y: previewY,
          resizable: false,
          decorations: false,
          transparent: true,
          alwaysOnTop: true,
          skipTaskbar: true,
          visible: true,
          focus: false,
        });

        if (dragSessionRef.current !== session || !isDraggingRef.current) {
          try { await previewWindow.close(); } catch {}
          isCreatingBadgeRef.current = false;
          return;
        }

        mergeBadgeWindowRef.current = previewWindow;

        try {
          const { emit } = await import('@tauri-apps/api/event');
          await emit('dragpreview:badge', badge);
        } catch (err) {}
      } catch (err) {
        console.error('[Header] Failed to create badge window:', err);
      }

      isCreatingBadgeRef.current = false;
    };

    const createDetachedWindow = async (mouseScreenX: number, mouseScreenY: number) => {
      if (isCreatingWindowRef.current) return;
      isCreatingWindowRef.current = true;

      const session = dragSessionRef.current;
      const currentWindow = getCurrentWebviewWindow();
      const dpr = window.devicePixelRatio || 1;
      const innerSize = await currentWindow.innerSize();

      const windowWidth = innerSize.width / dpr;
      const windowHeight = innerSize.height / dpr;

      const dx = mouseScreenX - globalDragInfo.startX;
      const dy = mouseScreenY - globalDragInfo.startY;

      const windowX = Math.round(globalDragInfo.tabScreenX + dx - globalDragInfo.newWindowTabOffsetX);
      const windowY = Math.round(globalDragInfo.tabScreenY + dy - globalDragInfo.newWindowTabOffsetY);

      try {
        const tabData = globalDragInfo.tabData;
        if (!tabData) {
          isCreatingWindowRef.current = false;
          return;
        }

        const windowLabel = `window-${Date.now()}`;
        const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');

        const transferKey = `pocketstata_tab_transfer_${windowLabel}`;
        const safeFile = {
          ...tabData.file,
          data: Array.isArray(tabData.file.data) ? tabData.file.data : [],
          variables: Array.isArray(tabData.file.variables) ? tabData.file.variables : [],
          valueLabels: tabData.file.valueLabels || {}
        };
        try {
          localStorage.setItem(transferKey, JSON.stringify({
            tab: { ...tabData.tab, isActive: true },
            file: safeFile,
            sourceWindow: globalDragInfo.sourceWindowLabel,
            mouseInTabX: globalDragInfo.mouseInTabX,
            mouseInTabY: globalDragInfo.mouseInTabY,
          }));
        } catch (err) {
          console.error('[Header] Failed to store tab data:', err);
        }

        const isDev = import.meta.env.DEV;
        const windowUrl = isDev
          ? `http://localhost:1420?ghost=false&tabTransferKey=${encodeURIComponent(transferKey)}`
          : `/?ghost=false&tabTransferKey=${encodeURIComponent(transferKey)}`;

        const newWindow = new WebviewWindow(windowLabel, {
          url: windowUrl,
          title: tabData.tab.title,
          width: windowWidth,
          height: windowHeight,
          minWidth: 400,
          minHeight: 400,
          x: windowX,
          y: windowY,
          resizable: true,
          decorations: false,
          transparent: true,
          alwaysOnTop: false,
          skipTaskbar: false,
          visible: true,
          focus: false,
        });

        if (dragSessionRef.current !== session || !isDraggingRef.current) {
          try { await newWindow.close(); } catch {}
          isCreatingWindowRef.current = false;

          // Restore source window if it was set to ghost
          if (isGhostWindowRef.current) {
            isGhostWindowRef.current = false;
            setGhostState(false);
            document.body.style.opacity = '1';
            try {
              const cw = getCurrentWebviewWindow();
              await cw.setAlwaysOnTop(false);
              await cw.setSkipTaskbar(false);
            } catch {}
          }

          // Re-add the tab if it was removed
          if (globalDragInfo.tabData && globalDragInfo.tabId) {
            const store = useFileStore.getState();
            if (!store.tabs.find(t => t.id === globalDragInfo.tabId)) {
              store.receiveTabFromWindow(globalDragInfo.tabData.tab, globalDragInfo.tabData.file, 0);
            }
            setActiveTabRef.current(globalDragInfo.tabId);
          }
          return;
        }

        globalDragInfo.detachedWindow = newWindow;
        globalDragInfo.phase = 'preview';
        globalDragInfo.isGhostMode = false;
        globalDragInfoRef.current = globalDragInfo;

        await closeBadgeWindow();

        if (globalDragInfo.tabId) {
          closeTabRef.current(globalDragInfo.tabId);
        }
        globalDragInfo.tabId = null;
        globalDragInfoRef.current = globalDragInfo;

        const remainingTabs = useFileStore.getState().tabs;
        if (remainingTabs.length === 0) {
          isGhostWindowRef.current = true;
          setGhostState(true);
          document.body.style.opacity = '0.5';

          try {
            const cw = getCurrentWebviewWindow();
            await cw.setAlwaysOnTop(true);
            await cw.setSkipTaskbar(true);
          } catch {}
        }
      } catch (err) {
        console.error('[Header] Failed to create detached window:', err);
      }

      isCreatingWindowRef.current = false;
    };

    const onMouseMove = async (e: MouseEvent) => {
      if (!dragStartMouseRef.current) return;

      if (!isDraggingRef.current) return;

      const di = globalDragInfoRef.current;
      if (di.phase === 'idle') return;

      const dx = e.screenX - globalDragInfo.startX;
      const dy = e.screenY - globalDragInfo.startY;
      const absDy = Math.abs(dy);

      globalDragInfo.mouseX = e.screenX;
      globalDragInfo.mouseY = e.screenY;
      globalDragInfoRef.current = globalDragInfo;

      let badgeChanged = false;
      let newBadge: BadgeMode = globalDragInfo.badgeMode;

      if (globalDragInfo.detachedWindow) {
        const detachedWin = globalDragInfo.detachedWindow;

        // Position immediately before any await
        const pwX = Math.round(globalDragInfo.tabScreenX + dx - globalDragInfo.newWindowTabOffsetX);
        const pwY = Math.round(globalDragInfo.tabScreenY + dy - globalDragInfo.newWindowTabOffsetY);
        try {
          const { LogicalPosition } = await import('@tauri-apps/api/dpi');
          detachedWin.setPosition(new LogicalPosition(pwX, pwY)).catch(() => {});
        } catch (err) {}

        const session = dragSessionRef.current;
        const { window: targetWindow, verticalDist } = await getTargetWindow(e.screenX, e.screenY);

        if (dragSessionRef.current !== session) return;

        if (verticalDist <= DETACH_THRESHOLD && verticalDist >= 0) {
          if (!globalDragInfo.isGhostMode) {
            globalDragInfo.isGhostMode = true;
            try {
              await detachedWin.setAlwaysOnTop(true);
              await detachedWin.setSkipTaskbar(true);
            } catch {}

            if (isGhostWindowRef.current) {
              setGhostState(false);
              isGhostWindowRef.current = false;
              document.body.style.opacity = '1';
              try {
                const cw = getCurrentWebviewWindow();
                await cw.setAlwaysOnTop(false);
                await cw.setSkipTaskbar(false);
              } catch {}
            }
          }

          if (globalDragInfo.badgeMode !== 'merge') {
            newBadge = 'merge';
            badgeChanged = true;
          }
        } else {
          if (globalDragInfo.isGhostMode) {
            globalDragInfo.isGhostMode = false;
            try {
              await detachedWin.setAlwaysOnTop(false);
              await detachedWin.setSkipTaskbar(false);
            } catch {}
          }

          if (globalDragInfo.badgeMode !== 'new-window') {
            newBadge = 'new-window';
            badgeChanged = true;
          }
        }

        if (dragSessionRef.current !== session) return;

        if (verticalDist <= REORDER_THRESHOLD && verticalDist >= 0 && targetWindow && globalDragInfo.tabData && !globalDragInfo.isMerged) {
          try {
            await sendTabToWindow(
              targetWindow.label,
              globalDragInfo.tabData.tab,
              globalDragInfo.tabData.file
            );

            globalDragInfo.isMerged = true;
            globalDragInfo.targetWindowLabel = targetWindow.label;
            globalDragInfoRef.current = globalDragInfo;

            if (mergeBadgeWindowRef.current) {
              try { await mergeBadgeWindowRef.current.close(); } catch {}
              mergeBadgeWindowRef.current = null;
            }

            // 发送接管事件给目标窗口
            try {
              await sendDragTakeover(targetWindow.label, {
                tab: globalDragInfo.tabData.tab,
                file: globalDragInfo.tabData.file,
                mouseX: globalDragInfo.mouseX,
                mouseY: globalDragInfo.mouseY,
                mouseInTabX: globalDragInfo.mouseInTabX,
                mouseInTabY: globalDragInfo.mouseInTabY,
                tabScreenX: globalDragInfo.tabScreenX,
                tabScreenY: globalDragInfo.tabScreenY,
                newWindowTabOffsetX: globalDragInfo.newWindowTabOffsetX,
                newWindowTabOffsetY: globalDragInfo.newWindowTabOffsetY,
                tabWidth: globalDragInfo.tabWidth,
                tabHeight: globalDragInfo.tabHeight,
                sourceWindowLabel: globalDragInfo.sourceWindowLabel,
              });
            } catch (err) {
              console.warn('[Header] Drag takeover send failed, keeping detachedWindow:', err);
              // Fallback: keep detachedWindow alive
              globalDragInfo.badgeMode = null;
              globalDragInfo.isGhostMode = false;
              try {
                await detachedWin.setAlwaysOnTop(false);
                await detachedWin.setSkipTaskbar(false);
              } catch {}
              globalDragInfoRef.current = globalDragInfo;
              return;
            }

            // 接管成功后关闭 detachedWindow，目标窗口会接管后续操作
            try { await detachedWin.close(); } catch {}
            globalDragInfo.detachedWindow = null;

            // 恢复源窗口
            if (isGhostWindowRef.current) {
              isGhostWindowRef.current = false;
              setGhostState(false);
              document.body.style.opacity = '1';
              try {
                const cw = getCurrentWebviewWindow();
                await cw.setAlwaysOnTop(false);
                await cw.setSkipTaskbar(false);
              } catch {}
            }

            // 结束当前拖拽会话（目标窗口已接管）
            resetDragState();
          } catch (err) {
            console.error('[Header] Immediate merge failed:', err);
          }
        } else if (globalDragInfo.isMerged && globalDragInfo.detachedWindow) {
          // Already merged: keep following mouse. Close badge if visible.
          if (mergeBadgeWindowRef.current) {
            try { await mergeBadgeWindowRef.current.close(); } catch {}
            mergeBadgeWindowRef.current = null;
          }

          if (globalDragInfo.isGhostMode) {
            globalDragInfo.isGhostMode = false;
            try {
              await detachedWin.setAlwaysOnTop(false);
              await detachedWin.setSkipTaskbar(false);
            } catch {}
          }
        }
      } else {
        const isSingleTabWindow = useFileStore.getState().tabs.length <= 1;

        if (isSingleTabWindow) {
          const currentWindow = getCurrentWebviewWindow();

          // Position immediately before any await
          const pwX = Math.round(globalDragInfo.tabScreenX + dx - globalDragInfo.newWindowTabOffsetX);
          const pwY = Math.round(globalDragInfo.tabScreenY + dy - globalDragInfo.newWindowTabOffsetY);
          try {
            const { LogicalPosition } = await import('@tauri-apps/api/dpi');
            currentWindow.setPosition(new LogicalPosition(pwX, pwY)).catch(() => {});
          } catch (err) {}

          const { window: targetWindow, verticalDist } = await getTargetWindow(e.screenX, e.screenY);

          if (verticalDist <= DETACH_THRESHOLD && verticalDist >= 0) {
            if (!globalDragInfo.isGhostMode) {
              globalDragInfo.isGhostMode = true;
              try {
                await currentWindow.setAlwaysOnTop(true);
                await currentWindow.setSkipTaskbar(true);
              } catch {}
              document.body.style.opacity = '0.5';
            }

            if (globalDragInfo.badgeMode !== 'merge') {
              newBadge = 'merge';
              badgeChanged = true;
            }
          } else {
            if (globalDragInfo.isGhostMode) {
              globalDragInfo.isGhostMode = false;
              try {
                await currentWindow.setAlwaysOnTop(false);
                await currentWindow.setSkipTaskbar(false);
              } catch {}
              document.body.style.opacity = '1';
            }

            if (globalDragInfo.badgeMode !== null) {
              newBadge = null;
              badgeChanged = true;
            }
          }

          if (verticalDist <= REORDER_THRESHOLD && verticalDist >= 0 && targetWindow && globalDragInfo.tabData && !globalDragInfo.isMerged) {
            try {
              await sendTabToWindow(
                targetWindow.label,
                globalDragInfo.tabData.tab,
                globalDragInfo.tabData.file
              );

              globalDragInfo.isMerged = true;
              globalDragInfoRef.current = globalDragInfo;

              await closeBadgeWindow();

              // 发送接管事件给目标窗口
              try {
                await sendDragTakeover(targetWindow.label, {
                  tab: globalDragInfo.tabData.tab,
                  file: globalDragInfo.tabData.file,
                  mouseX: globalDragInfo.mouseX,
                  mouseY: globalDragInfo.mouseY,
                  mouseInTabX: globalDragInfo.mouseInTabX,
                  mouseInTabY: globalDragInfo.mouseInTabY,
                  tabScreenX: globalDragInfo.tabScreenX,
                  tabScreenY: globalDragInfo.tabScreenY,
                  newWindowTabOffsetX: globalDragInfo.newWindowTabOffsetX,
                  newWindowTabOffsetY: globalDragInfo.newWindowTabOffsetY,
                  tabWidth: globalDragInfo.tabWidth,
                  tabHeight: globalDragInfo.tabHeight,
                  sourceWindowLabel: globalDragInfo.sourceWindowLabel,
                });
              } catch (err) {
                console.warn('[Header] Single-tab drag takeover send failed:', err);
              }

              try { await currentWindow.close(); } catch {}

              isGhostWindowRef.current = false;
              setGhostState(false);
              document.body.style.opacity = '1';

              resetDragState();
            } catch (err) {
              console.error('[Header] Single-tab merge failed:', err);
            }
          }
        } else {
          if (absDy <= REORDER_THRESHOLD) {
            if (globalDragInfo.badgeMode !== 'reorder') {
              newBadge = 'reorder';
              badgeChanged = true;
            }
          } else if (absDy <= DETACH_THRESHOLD) {
            if (globalDragInfo.badgeMode !== 'new-window') {
              newBadge = 'new-window';
              badgeChanged = true;
            }
          }

          if (globalDragInfo.phase === 'dragging' && absDy <= REORDER_THRESHOLD) {
            const targetTabIndex = findTargetTabForReorder(e.clientX);
            if (targetTabIndex >= 0 && globalDragInfo.tabId && targetTabIndex !== (globalDragInfo as any).lastReorderIndex) {
              reorderTabToIndex(globalDragInfo.tabId, targetTabIndex);
              (globalDragInfo as any).lastReorderIndex = targetTabIndex;
            }
          }

          if (globalDragInfo.phase === 'dragging' && absDy > DETACH_THRESHOLD && !isCreatingWindowRef.current) {
            await createDetachedWindow(e.screenX, e.screenY);
          }
        }
      }

      if (badgeChanged && globalDragInfo.tabData) {
        globalDragInfo.badgeMode = newBadge;
        globalDragInfoRef.current = globalDragInfo;

        if (newBadge === 'reorder' || globalDragInfo.detachedWindow) {
          await closeBadgeWindow();
        } else if (newBadge === 'new-window' || newBadge === 'merge') {
          await createBadgeWindow(
            globalDragInfo.tabData.tab.title,
            globalDragInfo.tabWidth,
            globalDragInfo.tabHeight,
            newBadge
          );
        }
      }

      if (mergeBadgeWindowRef.current && !globalDragInfo.detachedWindow) {
        try {
          const { LogicalPosition } = await import('@tauri-apps/api/dpi');
          const badgeX = Math.round(globalDragInfo.tabScreenX + dx);
          const badgeY = Math.round(globalDragInfo.tabScreenY + dy);
          await mergeBadgeWindowRef.current.setPosition(new LogicalPosition(badgeX, badgeY));
        } catch (err) {}
      }

      setDragInfo(cloneDragInfo());
    };

    const findTargetTabForReorder = (clientX: number): number => {
      const tabElements = containerRef.current?.querySelectorAll('[data-tab-id]');
      if (!tabElements) return -1;

      for (let i = 0; i < tabElements.length; i++) {
        const rect = tabElements[i].getBoundingClientRect();
        if (clientX >= rect.left && clientX <= rect.right) {
          return i;
        }
      }
      return -1;
    };

    const onMouseUp = async () => {
      isDraggingRef.current = false;
      dragSessionRef.current++;

      if (dragStartMouseRef.current) {
        dragStartMouseRef.current = null;
      }

      if (dragTimerRef.current) {
        clearTimeout(dragTimerRef.current);
        dragTimerRef.current = null;
      }

      if (globalDragInfo.detachedWindow) {
        if (globalDragInfo.isGhostMode && !globalDragInfo.isMerged) {
          try {
            await globalDragInfo.detachedWindow.setAlwaysOnTop(false);
            await globalDragInfo.detachedWindow.setSkipTaskbar(false);
            await globalDragInfo.detachedWindow.setFocus();
          } catch {}
        }
      } else if (globalDragInfo.isGhostMode) {
        // Single-tab window dragging: restore current window
        const currentWindow = getCurrentWebviewWindow();
        try {
          await currentWindow.setAlwaysOnTop(false);
          await currentWindow.setSkipTaskbar(false);
        } catch {}
        document.body.style.opacity = '1';
        globalDragInfo.isGhostMode = false;
      }

      await closeBadgeWindow();

      if (isGhostWindowRef.current) {
        isGhostWindowRef.current = false;
        setGhostState(false);
        document.body.style.opacity = '1';
        try {
          const cw = getCurrentWebviewWindow();
          await cw.setAlwaysOnTop(false);
          await cw.setSkipTaskbar(false);
        } catch {}
      }

      resetDragState();

      setTimeout(async () => {
        try {
          const { getAllWebviewWindows } = await import('@tauri-apps/api/webviewWindow');
          const allWindows = await getAllWebviewWindows();
          for (const w of allWindows) {
            if (w.label.startsWith('window-badge-')) {
              try { await w.close(); } catch {}
            }
          }
        } catch {}
      }, 100);
    };

    element.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);

    cleanupRef.current = () => {
      element.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);

      if (mergeBadgeWindowRef.current) {
        mergeBadgeWindowRef.current.close().catch(() => {});
        mergeBadgeWindowRef.current = null;
      }

      resetDragState();
    };
  }, [resetDragState]);

  useEffect(() => {
    const checkTauri = async () => {
      const tauriEnv = await isTauri();
      setIsDesktop(tauriEnv && !isMobile);
    };
    checkTauri();

    registerWindow();

    const updateInterval = setInterval(() => {
      updateWindowPosition();
    }, 200);

    return () => {
      clearInterval(updateInterval);
      unregisterWindow();
    };
  }, [isMobile]);

  useEffect(() => {
    const checkMaximized = async () => {
      if (isDesktop) {
        try {
          const window = getCurrentWebviewWindow();
          const maximized = await window.isMaximized();
          setIsMaximized(maximized);
        } catch (e) {
          console.error("Failed to check window state:", e);
        }
      }
    };
    checkMaximized();
  }, [isDesktop]);

  useEffect(() => {
    let cleanupTransferFn: (() => void) | null = null;
    let cleanupMergeRequestFn: (() => void) | null = null;
    let cleanupMergeResponseFn: (() => void) | null = null;
    let cleanupSolidifyFn: (() => void) | null = null;
    let cleanupDragTakeoverFn: (() => void) | null = null;
    let solidifyHandledRef = false;
    let takeoverCleanupRef = { mousemove: null as (() => void) | null, mouseup: null as (() => void) | null };

    const setupListeners = async () => {
      // 检查是否在 Tauri 环境中
      let tauriEnv = false;
      try {
        tauriEnv = await isTauri();
      } catch {
        tauriEnv = false;
      }
      
      if (!tauriEnv) {
        console.log('[Header] Not in Tauri environment, skipping event listeners');
        return;
      }

      cleanupTransferFn = await listenForTabTransfer((data, insertIndex) => {
        receiveTabFromWindow(data.tab, data.file, insertIndex);

        if (isGhostWindowRef.current) {
          isGhostWindowRef.current = false;
          setGhostState(false);
          document.body.style.opacity = '1';
          const currentWindow = getCurrentWebviewWindow();
          currentWindow.setAlwaysOnTop(false).catch(() => {});
          currentWindow.setSkipTaskbar(false).catch(() => {});
        }
      });

      cleanupMergeRequestFn = await listenForTabMergeRequest(async (data) => {
        receiveTabFromWindow(data.tab, data.file);
        await sendMergeResponse(data.sourceWindowLabel, true);
        const currentWindow = getCurrentWebviewWindow();
        await currentWindow.setFocus();

        if (isGhostWindowRef.current) {
          isGhostWindowRef.current = false;
          setGhostState(false);
          document.body.style.opacity = '1';
          try {
            await currentWindow.setAlwaysOnTop(false);
            await currentWindow.setSkipTaskbar(false);
          } catch {}
        }
      });

      cleanupMergeResponseFn = await listenForMergeResponse(async (success) => {
        if (success && !globalDragInfo.isMerged) {
          globalDragInfo.isMerged = true;
          globalDragInfoRef.current = globalDragInfo;

          if (globalDragInfo.detachedWindow) {
            try {
              await globalDragInfo.detachedWindow.close();
            } catch (e) {
              console.error('[Header] Failed to close detached window:', e);
            }
            globalDragInfo.detachedWindow = null;
            globalDragInfoRef.current = globalDragInfo;
          }

          if (mergeBadgeWindowRef.current) {
            try { await mergeBadgeWindowRef.current.close(); } catch {}
            mergeBadgeWindowRef.current = null;
          }

          globalDragInfo.phase = 'merged';
          globalDragInfoRef.current = globalDragInfo;
          setDragInfo(cloneDragInfo());
        }
      });

      // 监听拖拽接管：合并后目标窗口接管鼠标事件
      cleanupDragTakeoverFn = await listenForDragTakeover(async (data) => {
        console.log('[Header] Drag takeover received, starting takeover session');

        // 接收标签页数据
        const insertIndex = useFileStore.getState().tabs.length;
        useFileStore.getState().receiveTabFromWindow(data.tab, data.file, insertIndex);

        // 等待 React 渲染完成
        await new Promise(r => setTimeout(r, 50));

        const currentWindow = getCurrentWebviewWindow();
        const takeoverSession = dragSessionRef.current;

        // 注册临时 document-level 鼠标事件
        const onTakeoverMouseMove = async (e: MouseEvent) => {
          if (dragSessionRef.current !== takeoverSession) return;

          const dy = e.screenY - data.mouseY;
          const absDy = Math.abs(dy);

          // 检查是否应该重新拖出（鼠标远离当前窗口）
          const outerPos = await currentWindow.outerPosition().catch(() => ({ x: 0, y: 0 }));
          const outerSize = await currentWindow.innerSize().catch(() => ({ width: 800, height: 600 }));
          const dpr = window.devicePixelRatio || 1;

          const winLeft = outerPos.x;
          const winTop = outerPos.y;
          const winRight = winLeft + outerSize.width / dpr;
          const winBottom = winTop + outerSize.height / dpr;

          const isOutsideWindow = e.screenX < winLeft || e.screenX > winRight || e.screenY < winTop || e.screenY > winBottom;

          if (isOutsideWindow && absDy > DETACH_THRESHOLD) {
            // 用户正在拖出：创建新的 detachedWindow
            const tabData = getTabDataRef.current(data.tab.id);
            if (tabData) {
              // 关闭当前接管会话
              document.removeEventListener('mousemove', onTakeoverMouseMove);
              document.removeEventListener('mouseup', onTakeoverMouseUp);

              // 从当前窗口移除该标签页
              closeTabRef.current(data.tab.id);

              // 启动新的拖拽会话
              isDraggingRef.current = true;
              globalDragInfo = {
                phase: 'dragging',
                tabId: data.tab.id,
                tabData: tabData,
                mouseX: e.screenX,
                mouseY: e.screenY,
                startX: e.screenX,
                startY: e.screenY,
                mouseInTabX: data.mouseInTabX,
                mouseInTabY: data.mouseInTabY,
                tabScreenX: e.screenX - data.mouseInTabX,
                tabScreenY: e.screenY - data.mouseInTabY,
                newWindowTabOffsetX: data.newWindowTabOffsetX,
                newWindowTabOffsetY: data.newWindowTabOffsetY,
                tabWidth: data.tabWidth,
                tabHeight: data.tabHeight,
                detachedWindow: null,
                sourceWindowLabel: currentWindow.label,
                targetWindowLabel: '',
                isMerged: false,
                isGhostMode: false,
                badgeMode: 'reorder',
              };
              globalDragInfoRef.current = globalDragInfo;
              setDragInfo(cloneDragInfo());
            }
            return;
          }

          // 在当前窗口内：检测横向排序
          if (absDy <= REORDER_THRESHOLD) {
            const tabElements = containerRef.current?.querySelectorAll('[data-tab-id]');
            if (tabElements) {
              for (let i = 0; i < tabElements.length; i++) {
                const rect = tabElements[i].getBoundingClientRect();
                if (e.clientX >= rect.left && e.clientX <= rect.right) {
                  const store = useFileStore.getState();
                  const currentIndex = store.tabs.findIndex(t => t.id === data.tab.id);
                  if (currentIndex >= 0 && currentIndex !== i) {
                    reorderTabToIndex(data.tab.id, i);
                  }
                  break;
                }
              }
            }
          }

          setDragInfo(cloneDragInfo());
        };

        const onTakeoverMouseUp = async () => {
          console.log('[Header] Takeover mouseup');
          dragSessionRef.current++;

          document.removeEventListener('mousemove', onTakeoverMouseMove);
          document.removeEventListener('mouseup', onTakeoverMouseUp);

          // 清理幽灵状态
          if (isGhostWindowRef.current) {
            isGhostWindowRef.current = false;
            setGhostState(false);
            document.body.style.opacity = '1';
            try {
              await currentWindow.setAlwaysOnTop(false);
              await currentWindow.setSkipTaskbar(false);
            } catch {}
          }

          resetDragState();
        };

        document.addEventListener('mousemove', onTakeoverMouseMove);
        document.addEventListener('mouseup', onTakeoverMouseUp);

        takeoverCleanupRef.mousemove = () => {
          document.removeEventListener('mousemove', onTakeoverMouseMove);
        };
        takeoverCleanupRef.mouseup = () => {
          document.removeEventListener('mouseup', onTakeoverMouseUp);
        };
      });

      const { listen } = await import('@tauri-apps/api/event');
      cleanupSolidifyFn = await listen<{ targetWindow: string }>('window:solidify', async (event) => {
        const currentWindow = getCurrentWebviewWindow();

        if (event.payload.targetWindow !== currentWindow.label) {
          return;
        }

        if (solidifyHandledRef) return;
        solidifyHandledRef = true;

        try {
          await currentWindow.setAlwaysOnTop(false);
          await currentWindow.setSkipTaskbar(false);
          await currentWindow.setFocus();
        } catch (e) {
          console.error('[Header] Solidify failed:', e);
        }

        document.body.style.opacity = '1';
      });
    };

    setupListeners();

    return () => {
      if (cleanupTransferFn) cleanupTransferFn();
      if (cleanupMergeRequestFn) cleanupMergeRequestFn();
      if (cleanupMergeResponseFn) cleanupMergeResponseFn();
      if (cleanupSolidifyFn) cleanupSolidifyFn();
      if (cleanupDragTakeoverFn) cleanupDragTakeoverFn();
      if (takeoverCleanupRef.mousemove) takeoverCleanupRef.mousemove();
      if (takeoverCleanupRef.mouseup) takeoverCleanupRef.mouseup();
    };
  }, [receiveTabFromWindow, closeTab]);

  useEffect(() => {
    return () => {
      if (dragTimerRef.current) {
        clearTimeout(dragTimerRef.current);
      }
      if (mergeBadgeWindowRef.current) {
        mergeBadgeWindowRef.current.close().catch(() => {});
        mergeBadgeWindowRef.current = null;
      }
      isCreatingBadgeRef.current = false;
    };
  }, []);

  const handleTabClick = useCallback((tabId: string) => {
    if (globalDragInfoRef.current.phase === 'idle') {
      setActiveTab(tabId);
    }
  }, [setActiveTab]);

  const handleCloseTab = useCallback((e: React.MouseEvent, tabId: string) => {
    e.stopPropagation();
    if (globalDragInfoRef.current.phase === 'idle') {
      closeTab(tabId);
    }
  }, [closeTab]);

  const handleMinimize = async () => {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("window_minimize");
    } catch (e) {
      console.error("Failed to minimize window:", e);
    }
  };

  const handleMaximize = async () => {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const result: { is_maximized: boolean } = await invoke("window_toggle_maximize");
      setIsMaximized(result.is_maximized);
    } catch (e) {
      console.error("Failed to toggle maximize:", e);
    }
  };

  const handleClose = async () => {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("window_close");
    } catch (e) {
      console.error("Failed to close window:", e);
    }
  };

  const draggingTabId = dragInfo.tabId;
  const isTabDragging = (tabId: string) => draggingTabId === tabId;

  return (
    <header className={styles.header} data-tauri-drag-region>
      <div className={styles.leftSection}>
        {!isMobile && onToggleSidebar && showSidebarButton && (
          <button
            className={styles.menuBtn}
            onClick={onToggleSidebar}
            title="打开侧边栏"
          >
            <Menu size={20} />
          </button>
        )}
        <div
          className={`${styles.logo} ${isMobile ? styles.logoClickable : ''}`}
          onClick={isMobile && onToggleSidebar ? onToggleSidebar : undefined}
          title={isMobile ? "打开侧边栏" : undefined}
        >
          <Logo size={28} className={styles.logoIcon} />
          <div className={styles.logoTextWrapper}>
            <span className={styles.logoText}>PocketStata</span>
            <span className={styles.versionBadge}>v1.0.0</span>
          </div>
        </div>
      </div>

      {tabs.length > 0 && (
        <div
          className={styles.tabBar}
          ref={setupDragListeners}
          style={{
            ['WebkitAppRegion' as string]: 'drag',
          }}
        >
          <div className={styles.tabList}>
            {tabs.map((tab) => {
              const isDraggingThis = isTabDragging(tab.id);
              const isGhost = isDraggingThis && dragInfo.phase === 'preview';

              const getTabIcon = () => {
                if (tab.type === 'script') {
                  const file = scripts[tab.fileId];
                  if (file) {
                    if (file.language === 'stata') return <Code size={14} color="#2196f3" />;
                    if (file.language === 'python') return <Code size={14} color="#f59e0b" />;
                  }
                  return <Code size={14} color="#9ca3af" />;
                }
                
                const fileName = tab.title.toLowerCase();
                if (fileName.endsWith('.dta')) return <Table size={14} color="#10b981" />;
                if (fileName.endsWith('.csv')) return <FileText size={14} color="#3b82f6" />;
                if (fileName.endsWith('.xls') || fileName.endsWith('.xlsx')) return <FileSpreadsheet size={14} color="#22c55e" />;
                return <FileType size={14} color="#9ca3af" />;
              };

              return (
                <div
                  key={tab.id}
                  data-tab-id={tab.id}
                  className={`${styles.tab} ${tab.isActive ? styles.active : ""} ${isDraggingThis ? styles.dragging : ""} ${isGhost ? styles.ghost : ""}`}
                  onClick={() => handleTabClick(tab.id)}
                  style={{
                    ['WebkitAppRegion' as string]: 'no-drag',
                  }}
                >
                  <span className={styles.tabIcon}>{getTabIcon()}</span>
                  <span className={styles.tabTitle}>{tab.title}</span>
                  {tabs.length > 1 && (
                    <button
                      className={styles.closeBtn}
                      onClick={(e) => handleCloseTab(e, tab.id)}
                      title="关闭标签"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {isDesktop && (
        <div className={styles.windowControls}>
          <button className={styles.windowBtn} onClick={handleMinimize} title="最小化">
            <svg className={styles.windowIcon} viewBox="0 0 16 16" fill="none">
              <line x1="3" y1="8" x2="13" y2="8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
          <button className={styles.windowBtn} onClick={handleMaximize} title={isMaximized ? "还原" : "最大化"}>
            {isMaximized ? (
              <svg className={styles.windowIcon} viewBox="0 0 16 16" fill="none">
                <rect x="5" y="5" width="8" height="8" rx="1" stroke="currentColor" strokeWidth="1.5" />
                <rect x="2" y="2" width="8" height="8" rx="1" stroke="currentColor" strokeWidth="1.5" />
              </svg>
            ) : (
              <svg className={styles.windowIcon} viewBox="0 0 16 16" fill="none">
                <rect x="3" y="3" width="10" height="10" rx="1" stroke="currentColor" strokeWidth="1.5" />
              </svg>
            )}
          </button>
          <button className={styles.windowBtnClose} onClick={handleClose} title="关闭">
            <svg className={styles.windowIcon} viewBox="0 0 16 16" fill="none">
              <line x1="4" y1="4" x2="12" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <line x1="12" y1="4" x2="4" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      )}

    </header>
  );
}
