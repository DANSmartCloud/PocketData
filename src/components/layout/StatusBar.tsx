import { Ruler, Columns, ZoomIn, ZoomOut, FileText } from "lucide-react";
import { useFileStore } from "@/stores/fileStore";
import { useUIStore } from "@/stores/uiStore";
import { useZoomStore } from "@/stores/zoomStore";
import styles from "./StatusBar.module.css";

export function StatusBar() {
  const { getActiveFile, tabs, activeTabId } = useFileStore();
  const { operationMode, setOperationMode } = useUIStore();
  const { scale, zoomIn, zoomOut, resetZoom } = useZoomStore();

  const activeFile = getActiveFile();

  // 获取当前活动标签页的标题
  const activeTab = tabs.find(t => t.id === activeTabId);
  const activeTabTitle = activeTab?.title || '';

  const handleModeToggle = () => {
    setOperationMode(operationMode === 'stata' ? 'excel' : 'stata');
  };

  return (
    <footer className={styles.statusBar}>
      <div className={styles.left}>
        {activeFile ? (
          <>
            <span className={styles.item}>
              <Ruler size={14} />
              <span className={styles.itemText}>{activeFile.nobs.toLocaleString()} 行</span>
            </span>
            <span className={styles.item}>
              <Columns size={14} />
              <span className={styles.itemText}>{activeFile.nvar} 列</span>
            </span>
            <button
              className={`${styles.modeTag} ${operationMode === 'stata' ? styles.modeStata : styles.modeExcel}`}
              onClick={handleModeToggle}
              title="点击切换操作模式"
            >
              {operationMode === 'stata' ? 'Stata 模式' : 'Excel 模式'}
            </button>
          </>
        ) : (
          <span className={styles.item}>未打开文件</span>
        )}
      </div>
      
      {/* 缩放控制 - 全端显示 */}
      {activeFile && (
        <div className={styles.zoomControls}>
          <button
            className={styles.zoomBtn}
            onClick={zoomOut}
            disabled={scale <= 0.5}
            title="缩小"
          >
            <ZoomOut size={14} />
          </button>
          <button
            className={styles.zoomBtn}
            onClick={resetZoom}
            disabled={scale === 1}
            title="重置缩放"
          >
            <span className={styles.zoomScale}>{Math.round(scale * 100)}%</span>
          </button>
          <button
            className={styles.zoomBtn}
            onClick={zoomIn}
            disabled={scale >= 2}
            title="放大"
          >
            <ZoomIn size={14} />
          </button>
        </div>
      )}
      
      <div className={styles.right}>
        {/* 当前活动文件标识 */}
        {activeTabTitle && (
          <span className={`${styles.item} ${styles.fileIndicator}`}>
            <FileText size={14} />
            <span className={styles.itemText}>{activeTabTitle}</span>
          </span>
        )}
        {/* 编码信息 - 桌面端显示 */}
        <span className={`${styles.item} ${styles.desktopOnly}`}>UTF-8</span>
      </div>
    </footer>
  );
}
