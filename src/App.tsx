import { useEffect, useCallback, useMemo } from "react";
import { FolderOpen } from "lucide-react";
import { useFileStore, DTAFile } from "./stores/fileStore";
import { useUIStore } from "./stores/uiStore";
import { Header } from "./components/layout/Header";
import { Sidebar } from "./components/layout/Sidebar";
import { StatusBar } from "./components/layout/StatusBar";
import { DataTable } from "./components/data/DataTable";
import { FormulaBar } from "./components/data/FormulaBar";
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
  const { tabs, activeTabId, files, openFile } = useFileStore();
  const { handleOpenFile } = useFileOperations();

  // 调试：自动加载示例数据
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('debug') === 'true' && tabs.length === 0) {
      openFile(debugSampleFile);
    }
  }, []);

  // 计算当前活动文件
  const activeFile = useMemo(() => {
    const activeTab = tabs.find(t => t.id === activeTabId);
    if (!activeTab) return null;
    return files[activeTab.fileId] || null;
  }, [tabs, activeTabId, files]);

  const isDesktop = typeof window !== 'undefined' && window.innerWidth >= 768;

  const handleDrop = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      const file = files[0];
      if (file.name.endsWith('.dta') || file.name.endsWith('.csv') || file.name.endsWith('.xls') || file.name.endsWith('.xlsx')) {
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
      console.log('Save shortcut triggered');
    }
  }, [handleOpenFile]);

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed(!sidebarCollapsed);
  }, [sidebarCollapsed, setSidebarCollapsed]);

  useEffect(() => {
    if (isDesktop) {
      setSidebarCollapsed(false);
    }
  }, [isDesktop, setSidebarCollapsed]);

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
          {activeFile ? (
            <>
              {operationMode === 'excel' && <FormulaBar />}
              <DataTable />
            </>
          ) : (
            <div className={styles.emptyState}>
              <FolderOpen className={styles.emptyIcon} />
              <h2>欢迎使用 PocketStata</h2>
              <p>支持 DTA、CSV、Excel 文件格式</p>
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