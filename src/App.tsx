import { useEffect, useCallback, useMemo, useState } from "react";
import { FolderOpen } from "lucide-react";
import { useFileStore, DTAFile } from "./stores/fileStore";
import { useUIStore } from "./stores/uiStore";
import { Header } from "./components/layout/Header";
import { Sidebar } from "./components/layout/Sidebar";
import { StatusBar } from "./components/layout/StatusBar";
import { DataTable } from "./components/data/DataTable";
import { FormulaBar } from "./components/data/FormulaBar";
import { CodeEditor } from "./components/data/CodeEditor";
import { Toolbar } from "./components/layout/Toolbar";
import { MenuBar } from "./components/layout/MenuBar";
import { useFileOperations } from "./hooks/useFileOperations";
import styles from "./App.module.css";

// 调试用的示例数据
const debugSampleFile: DTAFile = {
  id: "debug_sample",
  path: "debug_sample.csv",
  name: "测试数据.csv",
  version: 0,
  nvar: 3,
  nobs: 3,
  variables: [
    { name: "姓名", type: "string", label: "姓名" },
    { name: "年龄", type: "int", label: "年龄" },
    { name: "城市", type: "string", label: "城市" }
  ],
  data: [
    { "姓名": "张三", "年龄": 25, "城市": "北京" },
    { "姓名": "李四", "年龄": 30, "城市": "上海" },
    { "姓名": "王五", "年龄": 28, "城市": "广州" }
  ],
  valueLabels: {},
  timestamp: new Date().toISOString().split("T")[0],
  label: "测试数据",
  isDirty: false
};

function App() {
  const { theme, operationMode, sidebarCollapsed, setSidebarCollapsed } = useUIStore();
  const { tabs, activeTabId, files, scripts, openFile } = useFileStore();
  const { handleOpenFile, handleSaveFile } = useFileOperations();

  // 调试：自动加载示例数据
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('debug') === 'true' && tabs.length === 0) {
      openFile(debugSampleFile);
    }
  }, []);

  // 计算当前活动文件（数据文件）
  const activeFile = useMemo(() => {
    const activeTab = tabs.find(t => t.id === activeTabId);
    if (!activeTab) return null;
    return files[activeTab.fileId] || null;
  }, [tabs, activeTabId, files]);

  // 计算当前活动脚本文件
  const activeScript = useMemo(() => {
    const activeTab = tabs.find(t => t.id === activeTabId);
    if (!activeTab || activeTab.type !== 'script') return null;
    return scripts[activeTab.fileId] || null;
  }, [tabs, activeTabId, scripts]);

  const isDragPreviewMode = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('dragpreview') === 'true';
  }, []);

  // Drag preview mode: render minimal content only
  if (isDragPreviewMode) {
    const params = new URLSearchParams(window.location.search);
    const title = params.get('title') || 'Drag Preview';
    const w = parseInt(params.get('w') || '150');
    const h = parseInt(params.get('h') || '32');
    const badge = params.get('badge') || 'none';
    
    console.log('[App] Drag preview mode:', { title, w, h, badge, url: window.location.href });
    
    // 确保 body 背景为实色，防止窗口透明时内容不可见
    document.body.style.background = '#f1f5f9';
    document.documentElement.style.background = '#f1f5f9';
    document.body.style.margin = '0';
    document.body.style.padding = '0';
    document.body.style.overflow = 'hidden';
    
    const [currentBadge, setCurrentBadge] = useState<'reorder' | 'new-window' | null>(
      badge === 'reorder' ? 'reorder' : badge === 'new-window' ? 'new-window' : null
    );
    
    useEffect(() => {
      let unlistenFn: (() => void) | null = null;
      import('@tauri-apps/api/event').then(({ listen }) => {
        listen<string>('dragpreview:badge', (event) => {
          setCurrentBadge(event.payload === 'reorder' ? 'reorder' : event.payload === 'new-window' ? 'new-window' : null);
        }).then(fn => { unlistenFn = fn; });
      });
      return () => { if (unlistenFn) unlistenFn(); };
    }, []);
    
    const badgeText = currentBadge === 'reorder' ? '易序' : currentBadge === 'new-window' ? '新窗口' : null;
    const badgeBg = currentBadge === 'reorder' ? '#f59e0b' : '#3b82f6';
    
    return (
      <div style={{
        width: `${w}px`,
        height: `${h}px`,
        background: '#ffffff',
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        fontSize: 12,
        fontWeight: 500,
        color: '#334155',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        pointerEvents: 'none',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        overflow: 'hidden',
        whiteSpace: 'nowrap',
        padding: '0 8px 0 6px',
        position: 'fixed',
        top: 0,
        left: 0,
        zIndex: 1,
      }}>
        <svg width={16} height={16} viewBox="0 0 174.55 182.43" style={{ flexShrink: 0 }}>
          <polyline points="158.13 60.75 85.21 102.87 43.09 29.95" fill="none" stroke="#3b82f6" strokeLinecap="round" strokeLinejoin="round" strokeWidth="10" />
          <path d="M59.75,17.64C35.13,26.41,15.09,46.72,7.82,73.88c-11.75,43.88,14.3,88.98,58.19,100.73,43.88,11.75,88.98-14.3,100.73-58.19,7.46-27.85-.33-56.18-18.22-76.17" fill="none" stroke="#3b82f6" strokeLinecap="round" strokeLinejoin="round" strokeWidth="10" />
          <line x1="80.99" y1="48.05" x2="96.25" y2="74.36" fill="none" stroke="#3b82f6" strokeLinecap="round" strokeLinejoin="round" strokeWidth="10" />
          <line x1="78.47" y1="5" x2="113.04" y2="64.62" fill="none" stroke="#3b82f6" strokeLinecap="round" strokeLinejoin="round" strokeWidth="10" />
          <line x1="104.06" y1="8.32" x2="130.76" y2="54.35" fill="none" stroke="#3b82f6" strokeLinecap="round" strokeLinejoin="round" strokeWidth="10" />
        </svg>
        <span style={{
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          flex: 1,
          lineHeight: '1',
        }}>
          {title}
        </span>
        {badgeText && (
          <div style={{
            marginLeft: '4px',
            padding: '1px 5px',
            background: badgeBg,
            color: 'white',
            borderRadius: 3,
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: '0.5px',
            flexShrink: 0,
          }}>
            {badgeText}
          </div>
        )}
      </div>
    );
  }

  const isDesktop = typeof window !== 'undefined' && window.innerWidth >= 768;

  const handleDrop = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      const file = files[0];
      if (file.name.endsWith('.dta') || file.name.endsWith('.csv') || file.name.endsWith('.xls') || file.name.endsWith('.xlsx') || file.name.endsWith('.do') || file.name.endsWith('.py')) {
        console.log('Dropped file:', file.name);
      }
    }
  }, []);

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'o') {
      e.preventDefault();
      handleOpenFile();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      handleSaveFile();
    }
  }, [handleOpenFile, handleSaveFile]);

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed(!sidebarCollapsed);
  }, [sidebarCollapsed, setSidebarCollapsed]);

  useEffect(() => {
    if (isDesktop) {
      setSidebarCollapsed(false);
    }
  }, [isDesktop, setSidebarCollapsed]);

  // Window with tab transfer
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const isGhost = params.get('ghost') === 'true';
    const transferKey = params.get('tabTransferKey');
    
    if (transferKey) {
      try {
        const storedData = localStorage.getItem(transferKey);
        if (storedData) {
          const { tab, file } = JSON.parse(storedData);
          console.log('[App] Loading tab data from localStorage:', tab.title);
          useFileStore.getState().receiveTabFromWindow(tab, file, 0);
          localStorage.removeItem(transferKey);
        }
      } catch (err) {
        console.error('[App] Failed to load tab data from localStorage:', err);
      }
    }
    
    if (isGhost) {
      document.body.style.opacity = '0.5';
      
      // 清理 URL 参数，防止手动刷新后再次进入幽灵状态
      if (window.history && window.history.replaceState) {
        const cleanUrl = window.location.pathname;
        window.history.replaceState({}, document.title, cleanUrl);
        console.log('[App] Ghost URL cleaned up');
      }
      
      // 监听实体化事件（通过事件系统）
      let unlistenSolidify: (() => void) | null = null;
      
      import('@tauri-apps/api/event').then(({ listen }) => {
        import('@tauri-apps/api/webviewWindow').then(({ getCurrentWebviewWindow }) => {
          const solidify = async () => {
            const win = getCurrentWebviewWindow();
            document.body.style.opacity = '1';
            await win.setAlwaysOnTop(false).catch(() => {});
            await win.setSkipTaskbar(false).catch(() => {});
            await win.setFocus().catch(() => {});
            console.log('[App] Ghost window solidified via event');
          };
          
          listen<{ targetWindow: string }>('window:solidify', (event) => {
            const win = getCurrentWebviewWindow();
            if (event.payload.targetWindow === win.label) {
              solidify();
              if (unlistenSolidify) unlistenSolidify();
            }
          }).then(fn => { unlistenSolidify = fn; });
        });
      }).catch(() => {});
      
      return () => {
        if (unlistenSolidify) unlistenSolidify();
      };
    }
  }, []);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('drop', handleDrop);
    document.addEventListener('dragover', handleDragOver);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('drop', handleDrop);
      document.removeEventListener('dragover', handleDragOver);
    };
  }, [handleKeyDown, handleDrop, handleDragOver]);

  // 移动端侧扫呼出侧边栏
  useEffect(() => {
    if (isDesktop) return;
    
    let touchStartX = 0;
    let touchEndX = 0;
    const minSwipeDistance = 50;

    const handleTouchStart = (e: TouchEvent) => {
      touchStartX = e.changedTouches[0].screenX;
    };

    const handleTouchEnd = (e: TouchEvent) => {
      touchEndX = e.changedTouches[0].screenX;
      const distance = touchEndX - touchStartX;
      
      // 从左边缘向右滑动打开侧边栏
      if (distance > minSwipeDistance && touchStartX < 30) {
        setSidebarCollapsed(false);
      }
      
      // 向左滑动关闭侧边栏
      if (distance < -minSwipeDistance && !sidebarCollapsed) {
        setSidebarCollapsed(true);
      }
    };

    document.addEventListener('touchstart', handleTouchStart, { passive: true });
    document.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchend', handleTouchEnd);
    };
  }, [isDesktop, sidebarCollapsed, setSidebarCollapsed]);

  return (
    <div className={`app ${theme}`} data-theme={theme}>
      <Header onToggleSidebar={toggleSidebar} showSidebarButton={isDesktop} isMobile={!isDesktop} />
      <MenuBar />
      <Toolbar onOpenFile={handleOpenFile} onToggleSidebar={toggleSidebar} />
      <div className="main-content">
        {!sidebarCollapsed && (
          <>
            {!isDesktop && <div className={styles.sidebarBackdrop} onClick={() => setSidebarCollapsed(true)} />}
            <Sidebar onClose={!isDesktop ? () => setSidebarCollapsed(true) : undefined} />
          </>
        )}
        <div className="data-area">
          {activeScript ? (
            <CodeEditor />
          ) : activeFile ? (
            <>
              {operationMode === 'excel' && <FormulaBar />}
              <DataTable />
            </>
          ) : (
            <div className={styles.emptyState}>
              <FolderOpen className={styles.emptyIcon} />
              <h2>欢迎使用 PocketStata</h2>
              <p>支持 DTA、CSV、Excel 数据文件，以及 .do、.py 脚本文件</p>
              <p>拖拽文件到此处，或点击下方按钮打开文件</p>
              <button className={styles.openBtn} onClick={handleOpenFile}>
                打开文件
              </button>
            </div>
          )}
        </div>
      </div>
      <StatusBar />
    </div>
  );
}

export default App;