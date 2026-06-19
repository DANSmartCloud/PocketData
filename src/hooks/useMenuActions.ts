import { useCallback } from 'react';
import { useFileStore } from '@/stores/fileStore';
import { useUIStore } from '@/stores/uiStore';
import { useZoomStore } from '@/stores/zoomStore';
import { useFileOperations } from '@/hooks/useFileOperations';
import { useDataActions } from '@/hooks/useDataActions';
import { useNotify } from '@/hooks/useNotify';
import { isTauri } from '@tauri-apps/api/core';

/** 渲染对话框状态（由 useMenuActions 派发事件控制） */
export type RenderDialogMode = "mermaid" | "latex";

// 图形模板代码
const stataGraphTemplates: Record<string, string> = {
  scatter: 'twoway (scatter y_var x_var), title("散点图")',
  line: 'twoway (line y_var x_var, sort), title("折线图")',
  bar: 'graph bar (mean) var1 var2, title("柱状图")',
  pie: 'graph pie var1 var2, title("饼图")',
  histogram: 'histogram var1, frequency title("直方图")',
  boxplot: 'graph box var1 var2, title("箱线图")',
};

const pythonGraphTemplates: Record<string, string> = {
  scatter: 'import matplotlib.pyplot as plt\nimport pandas as pd\n\nplt.scatter(df["x_var"], df["y_var"])\nplt.title("散点图")\nplt.show()',
  line: 'import matplotlib.pyplot as plt\n\nplt.plot(df["x_var"], df["y_var"])\nplt.title("折线图")\nplt.show()',
  bar: 'import matplotlib.pyplot as plt\n\nplt.bar(df["x_var"], df["y_var"])\nplt.title("柱状图")\nplt.show()',
  pie: 'import matplotlib.pyplot as plt\n\nplt.pie(df["var1"], labels=df["label_col"])\nplt.title("饼图")\nplt.show()',
  histogram: 'import matplotlib.pyplot as plt\n\nplt.hist(df["var1"], bins=20)\nplt.title("直方图")\nplt.show()',
  boxplot: 'import matplotlib.pyplot as plt\n\nplt.boxplot([df["var1"], df["var2"]])\nplt.title("箱线图")\nplt.show()',
};

const graphChineseNames: Record<string, string> = {
  scatter: '散点图',
  line: '折线图',
  bar: '柱状图',
  pie: '饼图',
  histogram: '直方图',
  boxplot: '箱线图',
};

/**
 * 集中所有菜单项（MenuBar / Sidebar / Toolbar）共享的 action 实现。
 * 让 UI 仅负责渲染，真正逻辑只在这里。
 */
export function useMenuActions() {
  const { undo, redo, canUndo, canRedo } = useFileStore();
  const {
    theme, setTheme,
    operationMode, setOperationMode,
    selectedCell, setSelectedCell,
    clearHighlightedCells,
  } = useUIStore();
  const { scale, zoomIn, zoomOut, resetZoom } = useZoomStore();
  const { handleOpenFile, handleSaveFile, handleExportFile, handleImportFile, handleExitApp,
          handleOpenProject, handleCloseProject, handleOpenRecentProject } = useFileOperations();
  const dataActions = useDataActions();
  const notify = useNotify();

  /* ---------------------------- 文件菜单 ---------------------------- */
  const open = useCallback(() => { void handleOpenFile(); }, [handleOpenFile]);
  const save = useCallback(() => { void handleSaveFile(false); }, [handleSaveFile]);
  const saveAs = useCallback(() => { void handleSaveFile(true); }, [handleSaveFile]);
  const importData = useCallback(() => { void handleImportFile(); }, [handleImportFile]);
  const exportCSV = useCallback(() => { void handleExportFile('csv'); }, [handleExportFile]);
  const exportExcel = useCallback(() => { void handleExportFile('xlsx'); }, [handleExportFile]);
  const exportDta = useCallback(() => { void handleExportFile('dta'); }, [handleExportFile]);
  const exit = useCallback(() => { void handleExitApp(); }, [handleExitApp]);

  // 项目相关
  const openProject = useCallback(() => { void handleOpenProject(); }, [handleOpenProject]);
  const closeProject = useCallback(() => { handleCloseProject(); }, [handleCloseProject]);
  const openRecent = useCallback((rootPath: string) => { void handleOpenRecentProject(rootPath); }, [handleOpenRecentProject]);

  /* ---------------------------- 编辑菜单 ---------------------------- */
  const doUndo = useCallback(() => { undo(); }, [undo]);
  const doRedo = useCallback(() => { redo(); }, [redo]);
  const canDoUndo = canUndo();
  const canDoRedo = canRedo();

  const cut = useCallback(() => {
    // 触发数据表剪切事件，让 DataTable 处理 TSV 剪贴板
    window.dispatchEvent(new CustomEvent('pocketdata:clipboard-cut'));
  }, []);

  const copy = useCallback(() => {
    // 触发数据表复制事件
    window.dispatchEvent(new CustomEvent('pocketdata:clipboard-copy'));
  }, []);

  const paste = useCallback(() => {
    // 触发数据表粘贴事件
    window.dispatchEvent(new CustomEvent('pocketdata:clipboard-paste'));
  }, []);

  const find = useCallback(() => {
    // 派发打开查找面板事件，让 CodeEditor 打开右侧查找面板
    window.dispatchEvent(new CustomEvent('pocketdata:open-find-panel'));
  }, []);

  const replace = useCallback(() => {
    // 派发打开替换面板事件，让 CodeEditor 打开右侧替换面板
    window.dispatchEvent(new CustomEvent('pocketdata:open-replace-panel'));
  }, []);

  /* ---------------------------- 数据菜单 ---------------------------- */
  const describe = useCallback(() => { void dataActions.describe(); }, [dataActions]);
  const clean = useCallback(() => { void dataActions.dropMissing(); }, [dataActions]);
  const sort = useCallback(() => { void dataActions.sort(); }, [dataActions]);
  const filter = useCallback(() => { void dataActions.filter(); }, [dataActions]);
  const generate = useCallback(() => { void dataActions.generateVariable(); }, [dataActions]);
  const rename = useCallback(() => { void dataActions.renameVariable(); }, [dataActions]);

  /* ---------------------------- 图形菜单 ---------------------------- */
  // 创建包含图表代码模板的新脚本标签页
  const graphAction = useCallback((graphType: string) => {
    const mode = useUIStore.getState().operationMode;
    const { openScript } = useFileStore.getState();
    const chineseName = graphChineseNames[graphType] || graphType;

    if (mode === 'stata') {
      const template = stataGraphTemplates[graphType];
      if (template) {
        openScript({
          id: `script_${Date.now()}`,
          path: `chart_${graphType}.do`,
          name: `${chineseName}.do`,
          content: template,
          language: 'stata',
          isDirty: false,
        });
        notify('success', `已创建图表脚本: ${chineseName}`, 2500);
      }
    } else {
      const template = pythonGraphTemplates[graphType];
      if (template) {
        openScript({
          id: `script_${Date.now()}`,
          path: `chart_${graphType}.py`,
          name: `${chineseName}.py`,
          content: template,
          language: 'python',
          isDirty: false,
        });
        notify('success', `已创建图表脚本: ${chineseName}`, 2500);
      }
    }
  }, [notify]);

  /* ---------------------------- 图形菜单：渲染对话框 ---------------------------- */
  const mermaidRender = useCallback(() => {
    window.dispatchEvent(new CustomEvent('pocketdata:open-render-dialog', { detail: { mode: 'mermaid' } }));
  }, []);

  const latexRender = useCallback(() => {
    window.dispatchEvent(new CustomEvent('pocketdata:open-render-dialog', { detail: { mode: 'latex' } }));
  }, []);

  /* ---------------------------- 查看菜单 ---------------------------- */
  const toggleTheme = useCallback(() => {
    setTheme(theme === 'light' ? 'dark' : 'light');
  }, [theme, setTheme]);

  const toggleMode = useCallback(() => {
    setOperationMode(operationMode === 'stata' ? 'excel' : 'stata');
  }, [operationMode, setOperationMode]);

  const fullscreen = useCallback(async () => {
    try {
      if (await isTauri()) {
        const { getCurrentWebviewWindow } = await import('@tauri-apps/api/webviewWindow');
        const win = getCurrentWebviewWindow();
        const isFs = await win.isFullscreen().catch(() => false);
        await win.setFullscreen(!isFs).catch(() => {});
      } else if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await document.documentElement.requestFullscreen();
      }
    } catch (err) {
      console.warn('fullscreen toggle failed:', err);
    }
  }, []);

  const clearHighlights = useCallback(() => {
    clearHighlightedCells();
    notify('info', '已清除所有高亮', 1500);
  }, [clearHighlightedCells, notify]);

  /* ---------------------------- 统计菜单 ---------------------------- */
  const correlation = useCallback(() => { void dataActions.correlation(); }, [dataActions]);
  const regression = useCallback(() => { void dataActions.regression(); }, [dataActions]);
  const ttest = useCallback(() => { void dataActions.ttest(); }, [dataActions]);
  const anova = useCallback(() => { void dataActions.anova(); }, [dataActions]);
  const chisq = useCallback(() => { void dataActions.chisq(); }, [dataActions]);

  /* ---------------------------- 帮助菜单 ---------------------------- */
  const docs = useCallback(async () => {
    // 跨平台：在 Tauri 中用 shell.open 调起系统默认浏览器；
    // 浏览器环境中 window.open 仍然有效。
    if (await isTauri()) {
      try {
        const { open } = await import('@tauri-apps/plugin-shell');
        await open('https://github.com/PocketData/docs');
      } catch (err) {
        // 回退：尝试 window.open
        console.warn('[useMenuActions] shell.open failed, fallback to window.open', err);
        window.open('https://github.com/PocketData/docs', '_blank', 'noopener');
      }
    } else {
      window.open('https://github.com/PocketData/docs', '_blank', 'noopener');
    }
  }, []);

  const shortcuts = useCallback(() => {
    // 派发事件让 App 层显示快捷键面板
    window.dispatchEvent(new CustomEvent('pocketdata:show-shortcuts'));
  }, []);

  const checkUpdate = useCallback(() => {
    notify('info', '当前已是最新版本 PocketData v1.0.0', 3500);
  }, [notify]);

  return {
    // 文件
    open, save, saveAs, importData, exportCSV, exportExcel, exportDta, exit,
    // 项目
    openProject, closeProject, openRecent,
    // 编辑
    undo: doUndo, redo: doRedo, canUndo: canDoUndo, canRedo: canDoRedo,
    cut, copy, paste, find, replace,
    // 数据
    describe, clean, sort, filter, generate, rename,
    // 图形
    scatter: () => graphAction('scatter'),
    line: () => graphAction('line'),
    bar: () => graphAction('bar'),
    pie: () => graphAction('pie'),
    histogram: () => graphAction('histogram'),
    boxplot: () => graphAction('boxplot'),
    graphEditor: () => graphAction('图形编辑器'),
    mermaidRender,
    latexRender,
    // 查看
    toggleTheme, toggleMode, fullscreen,
    zoomIn, zoomOut, resetZoom, scale,
    clearHighlights,
    // 统计
    correlation, regression, ttest, anova, chisq,
    // 帮助
    docs, shortcuts, checkUpdate,
    // 杂项
    selectedCell, setSelectedCell,
  };
}
