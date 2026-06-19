import { useState, useEffect } from "react";
import { Ruler, Columns, ZoomIn, ZoomOut, FileText, Code, FileCode, CheckCircle2, Terminal, Folder } from "lucide-react";
import { useFileStore } from "@/stores/fileStore";
import { useUIStore } from "@/stores/uiStore";
import { useZoomStore } from "@/stores/zoomStore";
import { useShallow } from "zustand/react/shallow";
import styles from "./StatusBar.module.css";

interface EditorState {
  language: string;
  lineCount: number;
  charCount: number;
  isDirty: boolean;
  tabSize: number;
}

export function StatusBar() {
  const { getActiveFile, tabs, activeTabId } = useFileStore();
  const { operationMode, setOperationMode, selectionRange, terminalVisible, toggleTerminal } = useUIStore();
  const { scale, zoomIn, zoomOut, resetZoom } = useZoomStore();

  const activeFile = getActiveFile();

  // 检测当前活动 tab 类型
  const currentActiveTab = useFileStore(useShallow(s => {
    return s.tabs.find(t => t.id === s.activeTabId);
  }));
  const isScriptMode = currentActiveTab?.type === 'script';
  const isMarkdownMode = currentActiveTab?.type === 'markdown';
  const isProjectMode = !currentActiveTab;

  // Editor state from CodeEditor
  const [editorState, setEditorState] = useState<EditorState>({
    language: '',
    lineCount: 0,
    charCount: 0,
    isDirty: false,
    tabSize: 2,
  });

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      setEditorState({
        language: detail.language ?? '',
        lineCount: detail.lineCount ?? 0,
        charCount: detail.charCount ?? 0,
        isDirty: detail.isDirty ?? false,
        tabSize: detail.tabSize ?? 2,
      });
    };
    window.addEventListener('pocketdata:editor-state', handler);
    return () => window.removeEventListener('pocketdata:editor-state', handler);
  }, []);

  // 获取当前活动标签页的标题
  const activeTab = tabs.find(t => t.id === activeTabId);
  const activeTabTitle = activeTab?.title || '';

  const handleModeToggle = () => {
    setOperationMode(operationMode === 'stata' ? 'excel' : 'stata');
  };

  // 代码编辑模式下切换底栏语言标识
  const currentScriptLanguage = useFileStore(useShallow(s => {
    const tab = s.tabs.find(t => t.id === s.activeTabId);
    if (tab?.type === 'script' && s.scripts[tab.fileId]) {
      return s.scripts[tab.fileId].language;
    }
    return null;
  }));

  const handleScriptLanguageToggle = () => {
    const activeScriptId = (() => {
      const tab = useFileStore.getState().tabs.find(t => t.id === useFileStore.getState().activeTabId);
      if (tab?.type === 'script') return tab.fileId;
      return null;
    })();
    if (!activeScriptId) return;
    const newLang = currentScriptLanguage === 'python' ? 'stata' : 'python';
    useFileStore.getState().updateScriptLanguage(activeScriptId, newLang);
  };

  const getSelectionDisplay = () => {
    if (!selectionRange) return null;
    
    const { start, end } = selectionRange;
    const isSingleCell = start.row === end.row && start.col === end.col;
    
    // 将列号转换为Excel风格字母（0=A, 1=B, 26=AA）
    const colToLetter = (col: number) => {
      let letter = '';
      let n = col;
      while (n >= 0) {
        letter = String.fromCharCode(65 + (n % 26)) + letter;
        n = Math.floor(n / 26) - 1;
      }
      return letter;
    };
    
    if (isSingleCell) {
      return `${colToLetter(start.col)}${start.row + 1}`;
    }
    
    const rowStart = Math.min(start.row, end.row) + 1;
    const rowEnd = Math.max(start.row, end.row) + 1;
    const colStart = Math.min(start.col, end.col);
    const colEnd = Math.max(start.col, end.col);
    
    return `${colToLetter(colStart)}${rowStart}:${colToLetter(colEnd)}${rowEnd}`;
  };

  return (
    <footer className={styles.statusBar}>
      <div className={styles.left}>
        {isScriptMode ? (
          <>
            {/* 脚本编辑模式状态 */}
            <span className={styles.item}>
              {editorState.language === 'Python' ? <Code size={14} /> : <FileCode size={14} />}
              <span className={styles.itemText}>{editorState.language || 'Stata'}</span>
            </span>
            <span className={styles.item}>
              <span className={styles.itemText}>行 {editorState.lineCount}</span>
            </span>
            <span className={styles.item}>
              <span className={styles.itemText}>字符 {editorState.charCount}</span>
            </span>
            <span className={styles.item}>
              <span className={styles.itemText}>Tab: {editorState.tabSize}</span>
            </span>
            {editorState.isDirty ? (
              <span className={`${styles.item} ${styles.statusDirty}`}>已修改</span>
            ) : editorState.language ? (
              <span className={styles.item}><CheckCircle2 size={11} /> 已保存</span>
            ) : null}
            <button
              className={`${styles.modeTag} ${currentScriptLanguage === 'stata' || !currentScriptLanguage ? styles.modeStata : styles.modePython}`}
              onClick={handleScriptLanguageToggle}
              title="点击切换脚本语言"
            >
              {currentScriptLanguage === 'python' ? 'Python' : 'Stata'}
            </button>
          </>
        ) : isMarkdownMode ? (
          <>
            <span className={styles.item}>
              <FileText size={14} />
              <span className={styles.itemText}>Markdown</span>
            </span>
            <span className={styles.item}>
              <span className={styles.itemText}>行 {editorState.lineCount}</span>
            </span>
            <span className={styles.item}>
              <span className={styles.itemText}>字符 {editorState.charCount}</span>
            </span>
            {editorState.isDirty ? (
              <span className={`${styles.item} ${styles.statusDirty}`}>已修改</span>
            ) : (
              <span className={styles.item}><CheckCircle2 size={11} /> 已保存</span>
            )}
          </>
        ) : isProjectMode ? (
          <span className={styles.item}>
            <Folder size={14} />
            <span className={styles.itemText}>项目已打开</span>
          </span>
        ) : activeFile ? (
          <>
            <span className={styles.item}>
              <Ruler size={14} />
              <span className={styles.itemText}>{activeFile.nobs.toLocaleString()} 行</span>
            </span>
            <span className={styles.item}>
              <Columns size={14} />
              <span className={styles.itemText}>{activeFile.nvar} 列</span>
            </span>
            <span className={styles.item}>
              <span className={styles.selectionText}>{getSelectionDisplay() || '未选择'}</span>
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
          <span className={styles.item}>
            <FileText size={14} />
            <span className={styles.itemText}>就绪</span>
          </span>
        )}
      </div>
      
      {/* 缩放控制 - 仅在数据模式显示 */}
      {activeFile && !isScriptMode && (
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
        {/* 终端切换 - 任何模式均可用 */}
        <button
          className={`${styles.zoomBtn} ${terminalVisible ? styles.terminalToggleActive : ''}`}
          onClick={() => toggleTerminal()}
          title={terminalVisible ? "关闭终端" : "打开终端"}
        >
          <Terminal size={14} />
        </button>
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