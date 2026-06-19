import { useEffect, useCallback, useMemo, useState, useRef } from "react";
import {
  FolderOpen,
  FolderTree,
  FileText,
  FolderPlus,
  History,
  Database,
  Code2,
} from "lucide-react";
import { useFileStore, DTAFile } from "./stores/fileStore";
import { useUIStore } from "./stores/uiStore";
// RightPanel 已合并到左侧 Sidebar 设置栏内的导航：主界面不再有右侧边栏
import { useProjectStore, ProjectFileNode } from "./stores/projectStore";
import { Logo } from "./components/common/Logo";
import { Header } from "./components/layout/Header";
import { Sidebar } from "./components/layout/Sidebar";
import { StatusBar } from "./components/layout/StatusBar";
import { DataTable } from "./components/data/DataTable";
import { FormulaBar } from "./components/data/FormulaBar";
import { CodeEditor } from "./components/data/CodeEditor";
import { MarkdownViewer } from "./components/data/MarkdownViewer";
import { Toolbar } from "./components/layout/Toolbar";
import { MenuBar } from "./components/layout/MenuBar";
import { PowerShellTerminal, PowerShellTerminalRef } from "./components/terminal/PowerShellTerminal";
// 右侧面板 RightPanel 已删除：设置与 AI 配置合并到左侧 Sidebar 设置栏内导航
// import { RightPanel } from "./components/layout/RightPanel";
import { Notifications } from "./components/common/Notifications";
import { ProjectCreateModal } from "./components/project/ProjectCreateModal";
import { RenderDialog } from "./components/common/RenderDialog";
import { type RenderDialogMode } from "./hooks/useMenuActions";
import { useFileOperations } from "./hooks/useFileOperations";
import { useIsDesktop } from "./hooks/useMediaQuery";
import { useFileDropHandler } from "./hooks/useFileDropHandler";
import { isTauri } from "@tauri-apps/api/core";
import {
  listenForThemeChange,
  parseLayoutFromUrl,
  registerLayoutSnapshotGetter,
  type WindowLayoutState,
} from "./utils/windowManager";
import { useFontStore } from "./stores/fontStore";
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
  const terminalRef = useRef<PowerShellTerminalRef>(null);
  const { theme, operationMode, sidebarCollapsed, sidebarWidth, setSidebarCollapsed, setSidebarWidth, toggleSidebar } = useUIStore();
  // 将 "system" 解析为实际的 "light" | "dark"，确保 data-theme 属性正确
  const [systemIsDark, setSystemIsDark] = useState(
    () => window.matchMedia('(prefers-color-scheme: dark)').matches
  );

  // 监听系统主题变化，当 theme="system" 时自动切换
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => setSystemIsDark(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const resolvedTheme = theme === 'system'
    ? (systemIsDark ? 'dark' : 'light')
    : theme;

  // 关键：把 data-theme 同步到 <html> 元素（document.documentElement）
  // 这样 Portal 到 document.body 的弹层（如 FloatingDropdown 模型下拉菜单）
  // 不在 .app 子树内，也能通过 [data-theme="dark"] 选择器匹配深色主题样式
  // 覆盖场景：首次加载、theme='system' 时系统主题切换（此时 setTheme 不会被调用）
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', resolvedTheme);
  }, [resolvedTheme]);

  const { tabs, activeTabId, files, scripts, markdowns, openFile, updateMarkdownContent } = useFileStore();
  const { handleOpenFile, handleSaveFile, handleSaveMarkdown, handleOpenProject, handleOpenRecentProject, openProjectFile } = useFileOperations();
  const { handleDrop, handleDragOver } = useFileDropHandler();
  const isDesktop = useIsDesktop();
  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [renderDialogOpen, setRenderDialogOpen] = useState(false);
  const [renderDialogMode, setRenderDialogMode] = useState<RenderDialogMode>("mermaid");
  const recentProjects = useProjectStore((s) => s.recentProjects);

  // 切换标签页时：若打开了项目，则同步在目录树中定位高亮 + 展开祖先
  const projectFileTree = useProjectStore((s) => s.fileTree);
  const projectRoot = useProjectStore((s) => s.rootPath);
  const expandFolders = useProjectStore((s) => s.expandFolders);
  const setSelectedFile = useProjectStore((s) => s.setSelectedFile);
  const projectSelectedFile = useProjectStore((s) => s.selectedFile);

  /**
   * 启动时恢复强调色（用户主题偏好）：从 localStorage 读取并应用到 CSS 变量。
   */
  useEffect(() => {
    try {
      const saved = localStorage.getItem('pocketdata-accent');
      if (saved) {
        useUIStore.getState().setAccentColor(saved as any);
      } else {
        // 首次启动：应用默认（blue）到 CSS 变量，确保 --color-primary 系列一致
        useUIStore.getState().setAccentColor('blue');
      }
    } catch {
      /* 忽略 localStorage 错误 */
    }
  }, []);

  /**
   * 注册实时布局快照 getter，供 windowManager 在创建新窗口时调用。
   * 必须放在所有 useUIStore 选择器之后，确保 store 已初始化。
   */
  useEffect(() => {
    registerLayoutSnapshotGetter(() => {
      const s = useUIStore.getState();
      return {
        theme: s.theme,
        operationMode: s.operationMode,
        sidebarCollapsed: s.sidebarCollapsed,
        sidebarWidth: s.sidebarWidth,
        terminalVisible: s.terminalVisible,
        terminalHeight: s.terminalHeight,
        rightPanelVisible: s.rightPanelVisible,
        rightPanelTab: s.rightPanelTab,
        statusBarVisible: s.statusBarVisible,
        formulaBarVisible: s.formulaBarVisible,
        outlineVisible: s.outlineVisible,
      };
    });
  }, []);

  /**
   * 子窗口初始化：从 URL 的 layout 参数中还原父窗口的窗口布局 & 部件状态。
   * 仅在子窗口（URL 含 layout 参数）中执行一次。
   */
  useEffect(() => {
    const layout: WindowLayoutState | null = parseLayoutFromUrl();
    if (!layout) return;
    const ui = useUIStore.getState();
    if (layout.theme && (layout.theme === 'light' || layout.theme === 'dark' || layout.theme === 'system')) {
      if (ui.theme !== layout.theme) ui.setTheme(layout.theme);
    }
    if (layout.operationMode && (layout.operationMode === 'stata' || layout.operationMode === 'excel')) {
      if (ui.operationMode !== layout.operationMode) ui.setOperationMode(layout.operationMode);
    }
    if (typeof layout.sidebarWidth === 'number' && !isNaN(layout.sidebarWidth)) {
      ui.setSidebarWidth(layout.sidebarWidth);
    }
    if (typeof layout.sidebarCollapsed === 'boolean') {
      ui.setSidebarCollapsed(layout.sidebarCollapsed);
    }
    if (typeof layout.terminalVisible === 'boolean') {
      ui.setTerminalVisible(layout.terminalVisible);
    }
    if (typeof layout.terminalHeight === 'number' && !isNaN(layout.terminalHeight)) {
      ui.setTerminalHeight(layout.terminalHeight);
    }
    if (typeof layout.rightPanelVisible === 'boolean') {
      ui.setRightPanelVisible(layout.rightPanelVisible);
    }
    if (typeof layout.rightPanelTab === 'string' && layout.rightPanelTab) {
      ui.setRightPanelTab(layout.rightPanelTab);
    }
    if (typeof layout.statusBarVisible === 'boolean') {
      ui.setStatusBarVisible(layout.statusBarVisible);
    }
    if (typeof layout.formulaBarVisible === 'boolean') {
      ui.setFormulaBarVisible(layout.formulaBarVisible);
    }
    if (typeof layout.outlineVisible === 'boolean') {
      ui.setOutlineVisible(layout.outlineVisible);
    }
    console.log('[App] Applied layout from URL:', layout);
    // 清理 URL 中的 layout 参数，避免刷新时重复应用
    if (window.history && window.history.replaceState) {
      const params = new URLSearchParams(window.location.search);
      params.delete('layout');
      const remaining = params.toString();
      const newSearch = remaining ? `?${remaining}` : '';
      const newUrl = `${window.location.pathname}${newSearch}${window.location.hash}`;
      window.history.replaceState({}, document.title, newUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * 挂载时套用字体设置（来自 fontStore，含每个窗格的覆盖）。
   * 监听 fontStore 变化：用户改字体后实时套用。
   */
  useEffect(() => {
    useFontStore.getState().applyFonts();
    const unsub = useFontStore.subscribe(() => {
      useFontStore.getState().applyFonts();
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!projectRoot || !projectFileTree) {
      // 未打开项目：清空项目树选中态
      if (projectSelectedFile) setSelectedFile(null);
      return;
    }
    if (!activeTabId) {
      // 无活动标签：清空项目树选中态
      if (projectSelectedFile) setSelectedFile(null);
      return;
    }
    const tab = tabs.find(t => t.id === activeTabId);
    if (!tab) {
      if (projectSelectedFile) setSelectedFile(null);
      return;
    }
    let filePath: string | undefined;
    if (tab.type === 'script') {
      filePath = scripts[tab.fileId]?.path;
    } else if (tab.type === 'markdown') {
      filePath = markdowns[tab.fileId]?.path;
    } else {
      filePath = files[tab.fileId]?.path;
    }
    if (!filePath) {
      if (projectSelectedFile) setSelectedFile(null);
      return;
    }
    // 归一化路径
    const norm = (p: string) => p.replace(/\\/g, '/').toLowerCase();
    const fileNorm = norm(filePath);
    const rootNorm = norm(projectRoot);
    if (!fileNorm.startsWith(rootNorm)) {
      // 文件不在项目内：清空选中
      if (projectSelectedFile) setSelectedFile(null);
      return;
    }

    // 收集祖先路径（所有需要展开的文件夹）
    const ancestors: string[] = [];
    const findNode = (node: ProjectFileNode | null, relParts: string[]): ProjectFileNode | null => {
      if (!node || relParts.length === 0) return node;
      if (!node.children) return null;
      const part = relParts[0].toLowerCase();
      const child = node.children.find(c => norm(c.name) === part);
      if (!child) return null;
      if (child.type === 'folder') ancestors.push(child.path);
      return findNode(child, relParts.slice(1));
    };
    const rel = fileNorm.slice(rootNorm.length).replace(/^\/+/, '');
    const relParts = rel.split('/').filter(Boolean);
    // 最后一段是文件名，从路径树上找其父链
    const found = findNode(projectFileTree, relParts);

    if (found) {
      if (ancestors.length > 0) expandFolders(ancestors);
      // 高亮当前文件（仅当不同时才更新，避免无谓渲染）
      if (projectSelectedFile !== found.path) setSelectedFile(found.path);
    } else {
      // 文件不在树中（可能刚被外部删除）：清空选中
      if (projectSelectedFile) setSelectedFile(null);
    }
  }, [activeTabId, tabs, files, scripts, markdowns, projectRoot, projectFileTree, expandFolders, setSelectedFile, projectSelectedFile]);

  // 调试：自动加载示例数据
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('debug') === 'true' && tabs.length === 0) {
      openFile(debugSampleFile);
    }
  }, []);

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

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'o') {
      e.preventDefault();
      handleOpenFile();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      handleSaveFile();
    }
    if (e.key === 'F5') {
      e.preventDefault();
      window.dispatchEvent(new CustomEvent('pocketdata:run-script'));
    }
  }, [handleOpenFile, handleSaveFile]);

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
          const { tab, file, project, terminalSessions } = JSON.parse(storedData);
          console.log('[App] Loading tab data from localStorage:', tab.title);
          useFileStore.getState().receiveTabFromWindow(tab, file, 0);
          // 如果原窗口打开了项目，则一并恢复项目状态
          if (project && project.isOpen && project.rootPath && project.fileTree) {
            useProjectStore.getState().openProject(
              project.rootPath,
              project.rootName ?? '',
              project.fileTree
            );
            // 恢复展开状态
            if (Array.isArray(project.expandedFolders) && project.expandedFolders.length > 0) {
              useProjectStore.getState().expandFolders(project.expandedFolders);
            }
          }
          // 恢复终端会话
          if (Array.isArray(terminalSessions) && terminalSessions.length > 0) {
            // 延迟创建，等 PowerShellTerminal 挂载后
            setTimeout(() => {
              terminalRef.current?.createSessionsFromInfos(terminalSessions);
            }, 500);
          }
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

  // 从 URL 参数读取主题（用于子窗口初始化），并监听主题变更事件
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlTheme = params.get('theme');
    // 如果 URL 中已有 layout 参数，主题已经在 layout 应用阶段处理过了，避免重复
    const hasLayout = params.has('layout');
    if (urlTheme && !hasLayout && (urlTheme === 'light' || urlTheme === 'dark' || urlTheme === 'system')) {
      const currentTheme = useUIStore.getState().theme;
      if (currentTheme !== urlTheme) {
        console.log('[App] Applying theme from URL:', urlTheme);
        useUIStore.getState().setTheme(urlTheme as 'light' | 'dark' | 'system');
      }
    }

    // 监听来自父窗口的主题变更事件
    let cleanupThemeListener: (() => void) | null = null;
    listenForThemeChange((newTheme) => {
      const current = useUIStore.getState().theme;
      if (current !== newTheme) {
        console.log('[App] Received theme change event:', newTheme);
        useUIStore.getState().setTheme(newTheme as 'light' | 'dark' | 'system');
      }
    }).then(fn => { cleanupThemeListener = fn; }).catch(() => {});

    return () => {
      if (cleanupThemeListener) cleanupThemeListener();
    };
  }, []);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('drop', handleDrop);
    document.addEventListener('dragover', handleDragOver);

    // 监听 Tauri 原生文件拖放事件（从 OS 拖入窗口时）
    let unlistenDrop: (() => void) | null = null;

    const setupTauriDrop = async () => {
      try {
        const isTauriEnv = await isTauri();
        if (!isTauriEnv) return;
        const { getCurrentWebviewWindow } = await import('@tauri-apps/api/webviewWindow');
        const win = getCurrentWebviewWindow();
        unlistenDrop = await win.onDragDropEvent(async (event) => {
          if (event.payload.type === 'drop' && 'paths' in event.payload) {
            const paths = (event.payload as { paths: string[] }).paths;
            if (paths && paths.length > 0) {
              const { useFileStore } = await import('./stores/fileStore');
              const { useUIStore } = await import('./stores/uiStore');
              const { openFile, openScript, openMarkdown } = useFileStore.getState();
              const setOpMode = useUIStore.getState().setOperationMode;
              for (const path of paths) {
                const fileName = path.split(/[/\\]/).pop() || path;
                const ext = (fileName.split('.').pop() ?? '').toLowerCase();
                try {
                  if (ext === 'do' || ext === 'py') {
                    const { readScriptFileFromPath } = await import('./hooks/useFileDropHandler');
                    openScript(await readScriptFileFromPath(path, fileName));
                  } else if (ext === 'md' || ext === 'markdown') {
                    const { readMarkdownFileFromPath } = await import('./hooks/useFileDropHandler');
                    openMarkdown(await readMarkdownFileFromPath(path, fileName));
                  } else if (ext === 'dta') {
                    const { readDtaFileFromPath } = await import('./hooks/useFileDropHandler');
                    openFile(await readDtaFileFromPath(path));
                    setOpMode('stata');
                  } else if (ext === 'xls' || ext === 'xlsx') {
                    const { readExcelFileFromPath } = await import('./hooks/useFileDropHandler');
                    openFile(await readExcelFileFromPath(path));
                    setOpMode('excel');
                  } else if (ext === 'csv' || ext === 'tsv' || ext === 'txt') {
                    const { parseCSVText } = await import('./hooks/useFileDropHandler');
                    const { readTextFile } = await import('@tauri-apps/plugin-fs');
                    const text = await readTextFile(path);
                    openFile(await parseCSVText(text, fileName, path));
                  } else if (ext === 'json') {
                    const { readJsonFileFromPath } = await import('./hooks/useFileDropHandler');
                    openFile(await readJsonFileFromPath(path, fileName));
                  }
                } catch (err) {
                  console.error('[tauri drop] 打开文件失败:', err);
                }
              }
            }
          }
        });
      } catch (err) {
        // 非 Tauri 环境或不支持该事件
        console.debug('[App] Tauri drag-drop event not available:', err);
      }
    };
    setupTauriDrop();

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('drop', handleDrop);
      document.removeEventListener('dragover', handleDragOver);
      if (unlistenDrop) unlistenDrop();
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

  // 加载持久化的侧边栏宽度
  useEffect(() => {
    try {
      const saved = localStorage.getItem('pocketdata-sidebar-width');
      if (saved) {
        const w = parseInt(saved, 10);
        if (!isNaN(w) && w !== sidebarWidth) setSidebarWidth(w);
      }
    } catch {}
    // 仅运行一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 侧边栏拖拽调整宽度
  const handleSidebarResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = sidebarWidth;
    const onMove = (ev: MouseEvent) => {
      const delta = ev.clientX - startX;
      setSidebarWidth(startWidth + delta);
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [sidebarWidth, setSidebarWidth]);

  // 监听面包屑/侧边栏发起的"打开文件"事件
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ path: string }>).detail;
      const p = detail?.path;
      if (!p) return;
      void openProjectFile(p);
    };
    window.addEventListener('pocketdata:open-file', handler);
    return () => window.removeEventListener('pocketdata:open-file', handler);
  }, [openProjectFile]);

  // 监听渲染对话框事件
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { mode: RenderDialogMode };
      setRenderDialogMode(detail.mode);
      setRenderDialogOpen(true);
    };
    window.addEventListener('pocketdata:open-render-dialog', handler);
    return () => window.removeEventListener('pocketdata:open-render-dialog', handler);
  }, []);

  return (
    <div className={`app ${resolvedTheme}`} data-theme={resolvedTheme}>
      <Header onToggleSidebar={toggleSidebar} showSidebarButton={isDesktop} isMobile={!isDesktop} terminalRef={terminalRef} />
      <MenuBar />
      <Toolbar onOpenFile={handleOpenFile} onToggleSidebar={toggleSidebar} />
      <div className="main-content">
        <div style={{ display: sidebarCollapsed ? 'none' : undefined }}>
          {!isDesktop && !sidebarCollapsed && <div className={styles.sidebarBackdrop} onClick={() => setSidebarCollapsed(true)} />}
          <Sidebar
            onClose={!isDesktop ? () => setSidebarCollapsed(true) : undefined}
            width={isDesktop ? sidebarWidth : undefined}
            onResizeStart={isDesktop ? handleSidebarResizeStart : undefined}
          />
        </div>
        <div className="data-area">
          <div className={styles.mainRow}>
            <div className={styles.contentArea}>
              {tabs.length === 0 && (
                <div className={styles.welcome}>
                  <div className={styles.welcomeHero}>
                    <div className={styles.welcomeLogo}>
                      <Logo size={64} />
                    </div>
                    <h2 className={styles.welcomeTitle}>欢迎使用 PocketData</h2>
                    <p className={styles.welcomeSubtitle}>
                      面向 <strong>Stata · Python · R</strong> 的数据科学与统计分析桌面工具
                    </p>
                  </div>

                  {/* 主操作 */}
                  <div className={styles.actionGrid}>
                    <button className={styles.actionCard} onClick={handleOpenFile}>
                      <div className={styles.actionIcon}><FileText size={20} /></div>
                      <div className={styles.actionLabel}>打开文件</div>
                      <div className={styles.actionDesc}>DTA / CSV / Excel / .do / .py / .md</div>
                    </button>
                    <button className={styles.actionCard} onClick={() => void handleOpenProject()}>
                      <div className={styles.actionIcon}><FolderOpen size={20} /></div>
                      <div className={styles.actionLabel}>打开项目</div>
                      <div className={styles.actionDesc}>浏览项目根目录</div>
                    </button>
                    <button className={`${styles.actionCard} ${styles.actionCardPrimary}`} onClick={() => setProjectModalOpen(true)}>
                      <div className={styles.actionIcon}><FolderPlus size={20} /></div>
                      <div className={styles.actionLabel}>新建项目</div>
                      <div className={styles.actionDesc}>选择模板：Stata / Python / 调查 / R</div>
                    </button>
                  </div>

                  {/* 最近项目 */}
                  {recentProjects.length > 0 && (
                    <div className={styles.recentSection}>
                      <div className={styles.sectionTitle}>
                        <History size={14} />
                        最近打开
                      </div>
                      <div className={styles.recentList}>
                        {recentProjects.slice(0, 5).map((p) => (
                          <button
                            key={p.rootPath}
                            className={styles.recentItem}
                            onClick={() => void handleOpenRecentProject(p.rootPath)}
                            title={p.rootPath}
                          >
                            <FolderTree size={14} className={styles.recentIcon} />
                            <div className={styles.recentMeta}>
                              <div className={styles.recentName}>{p.name}</div>
                              <div className={styles.recentPath}>{p.rootPath}</div>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 数据类型提示 */}
                  <div className={styles.tipGrid}>
                    <div className={styles.tipItem}>
                      <Database size={14} />
                      <span><strong>数据文件</strong>：DTA · CSV · Excel</span>
                    </div>
                    <div className={styles.tipItem}>
                      <Code2 size={14} />
                      <span><strong>脚本</strong>：.do · .py · R</span>
                    </div>
                    <div className={styles.tipItem}>
                      <FileText size={14} />
                      <span><strong>文档</strong>：Markdown</span>
                    </div>
                  </div>

                  <div className={styles.dropHint}>把文件拖到此处也可以打开</div>
                </div>
              )}
              {tabs.map(tab => {
                const isActive = tab.id === activeTabId;
                if (tab.type === 'script') {
                  const script = scripts[tab.fileId];
                  if (!script) return null;
                  return (
                    <div key={tab.id} className={isActive ? styles.tabContent : styles.tabContentHidden}>
                      <CodeEditor scriptId={tab.fileId} />
                    </div>
                  );
                }
                if (tab.type === 'markdown') {
                  const md = markdowns[tab.fileId];
                  if (!md) return null;
                  return (
                    <div key={tab.id} className={isActive ? styles.tabContent : styles.tabContentHidden}>
                      <MarkdownViewer
                        filePath={md.path}
                        fileName={md.name}
                        initialContent={md.content}
                        onSave={(content) => {
                          updateMarkdownContent(md.id, content);
                          void handleSaveMarkdown(content);
                        }}
                      />
                    </div>
                  );
                }
                // 数据文件标签
                const file = files[tab.fileId];
                if (!file) return null;
                return (
                  <div key={tab.id} className={isActive ? styles.tabContent : styles.tabContentHidden}>
                    {operationMode === 'excel' && <FormulaBar fileId={tab.fileId} />}
                    <DataTable fileId={tab.fileId} />
                  </div>
                );
              })}
              {/* PowerShell 终端：仅占中间内容区域。右侧面板已合并到左侧设置栏。 */}
              <PowerShellTerminal ref={terminalRef} />
            </div>
            {/* 右侧面板已移除：设置与 AI 配置全部合并到左侧 Sidebar 设置栏内的导航 */}
          </div>
        </div>
      </div>
      <StatusBar />
      <Notifications />
      <ProjectCreateModal
        open={projectModalOpen}
        onClose={() => setProjectModalOpen(false)}
        onCreated={(path) => {
          setProjectModalOpen(false);
          void handleOpenRecentProject(path);
        }}
      />
      <RenderDialog
        open={renderDialogOpen}
        onClose={() => setRenderDialogOpen(false)}
        mode={renderDialogMode}
      />
    </div>
  );
}

export default App;