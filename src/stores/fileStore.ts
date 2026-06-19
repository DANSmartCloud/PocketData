import { create } from 'zustand';

export interface Variable {
  name: string;
  type: 'byte' | 'int' | 'long' | 'float' | 'double' | 'string';
  label?: string;
  format?: string;
  valueLabel?: string;
}

export interface DTAFile {
  id: string;
  path: string;
  name: string;
  version: number;
  nvar: number;
  nobs: number;
  variables: Variable[];
  data: Record<string, unknown>[];
  valueLabels: Record<string, Record<number, string>>;
  timestamp?: string;
  label?: string;
  createdDate?: string;
  isDirty: boolean;
  modifiedAt?: string;
}

export interface Tab {
  id: string;
  fileId: string;
  title: string;
  isActive: boolean;
  type?: 'data' | 'script' | 'markdown';
}

export interface ScriptFile {
  id: string;
  path: string;
  name: string;
  content: string;
  language: 'stata' | 'python';
  isDirty: boolean;
}

export interface MarkdownFile {
  id: string;
  path: string;
  name: string;
  content: string;
  isDirty: boolean;
}

export interface HistoryEntry {
  type: 'cell_edit' | 'add_variable' | 'delete_variable' | 'rename_variable' | 'sort';
  timestamp: number;
  description: string;
  before: unknown;
  after: unknown;
  rowIndex?: number;
  colIndex?: number;
}

interface FileState {
  files: Record<string, DTAFile>;
  scripts: Record<string, ScriptFile>;
  markdowns: Record<string, MarkdownFile>;
  tabs: Tab[];
  activeTabId: string | null;
  history: Record<string, HistoryEntry[]>;
  historyIndex: Record<string, number>;

  openFile: (file: DTAFile) => string;
  openScript: (script: ScriptFile) => string;
  openMarkdown: (md: MarkdownFile) => string;
  updateScriptContent: (scriptId: string, content: string) => void;
  updateScriptLanguage: (scriptId: string, language: 'stata' | 'python') => void;
  updateMarkdownContent: (mdId: string, content: string) => void;
  markMarkdownClean: (mdId: string) => void;
  closeTab: (tabId: string) => void;
  setActiveTab: (tabId: string) => void;
  activateTabByPath: (filePath: string) => boolean;
  updateCell: (fileId: string, rowIndex: number, colIndex: number, value: unknown) => void;
  getActiveFile: () => DTAFile | null;
  getActiveScript: () => ScriptFile | null;
  getActiveMarkdown: () => MarkdownFile | null;
  markFileClean: (fileId: string) => void;
  updateFilePath: (fileId: string, path: string) => void;
  renameTab: (tabId: string, title: string) => void;
  reorderTabs: (tabIds: string[]) => void;
  moveTabToNewWindow: (tabId: string) => Promise<void>;
  mergeTabs: (tabIds: string[]) => void;
  receiveTabFromWindow: (tab: Tab, file: DTAFile | ScriptFile | MarkdownFile, insertIndex?: number) => void;
  getTabData: (tabId: string) => { tab: Tab; file: DTAFile | ScriptFile | MarkdownFile } | null;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
}

let tabCounter = 0;

export const useFileStore = create<FileState>((set, get) => ({
  files: {},
  scripts: {},
  markdowns: {},
  tabs: [],
  activeTabId: null,
  history: {},
  historyIndex: {},

  openFile: (file) => {
    const existingTab = Object.values(get().files).find(f => f.path === file.path);
    if (existingTab) {
      const tab = get().tabs.find(t => t.fileId === existingTab.id);
      if (tab) {
        // 修复：激活已存在 tab 时，同时把 isActive 标志同步更新，否则标签页高亮会不同步
        set(state => ({
          tabs: state.tabs.map(t => ({ ...t, isActive: t.id === tab.id })),
          activeTabId: tab.id,
        }));
        return tab.id;
      }
    }

    const fileId = file.id || `file_${Date.now()}`;
    const tabId = `tab_${++tabCounter}`;
    const newFile = { ...file, id: fileId, isDirty: false };
    const newTab: Tab = {
      id: tabId,
      fileId,
      title: file.name,
      isActive: true
    };

    set(state => {
      const otherTabs = state.tabs.map(t => ({ ...t, isActive: false }));
      return {
        files: { ...state.files, [fileId]: newFile },
        tabs: [...otherTabs, newTab],
        activeTabId: tabId,
        history: { ...state.history, [fileId]: [] },
        historyIndex: { ...state.historyIndex, [fileId]: -1 }
      };
    });

    return tabId;
  },

  openScript: (script) => {
    const existingTab = Object.values(get().scripts).find(s => s.path === script.path);
    if (existingTab) {
      const tab = get().tabs.find(t => t.fileId === existingTab.id);
      if (tab) {
        set(state => ({
          tabs: state.tabs.map(t => ({ ...t, isActive: t.id === tab.id })),
          activeTabId: tab.id,
        }));
        return tab.id;
      }
    }

    const scriptId = script.id || `script_${Date.now()}`;
    const tabId = `tab_${++tabCounter}`;
    const newScript = { ...script, id: scriptId, isDirty: false };
    const newTab: Tab = {
      id: tabId,
      fileId: scriptId,
      title: script.name,
      isActive: true,
      type: 'script'
    };

    set(state => {
      const otherTabs = state.tabs.map(t => ({ ...t, isActive: false }));
      return {
        scripts: { ...state.scripts, [scriptId]: newScript },
        tabs: [...otherTabs, newTab],
        activeTabId: tabId
      };
    });

    return tabId;
  },

  openMarkdown: (md) => {
    const existingTab = Object.values(get().markdowns).find(m => m.path === md.path);
    if (existingTab) {
      const tab = get().tabs.find(t => t.fileId === existingTab.id);
      if (tab) {
        set(state => ({
          tabs: state.tabs.map(t => ({ ...t, isActive: t.id === tab.id })),
          activeTabId: tab.id,
        }));
        return tab.id;
      }
    }

    const mdId = md.id || `md_${Date.now()}`;
    const tabId = `tab_${++tabCounter}`;
    const newMd = { ...md, id: mdId, isDirty: false };
    const newTab: Tab = {
      id: tabId,
      fileId: mdId,
      title: md.name,
      isActive: true,
      type: 'markdown'
    };

    set(state => {
      const otherTabs = state.tabs.map(t => ({ ...t, isActive: false }));
      return {
        markdowns: { ...state.markdowns, [mdId]: newMd },
        tabs: [...otherTabs, newTab],
        activeTabId: tabId
      };
    });

    return tabId;
  },

  updateMarkdownContent: (mdId, content) => {
    set(state => ({
      markdowns: {
        ...state.markdowns,
        [mdId]: { ...state.markdowns[mdId], content, isDirty: true }
      }
    }));
  },

  markMarkdownClean: (mdId: string) => {
    set(state => ({
      markdowns: {
        ...state.markdowns,
        [mdId]: { ...state.markdowns[mdId], isDirty: false }
      }
    }));
  },

  updateScriptContent: (scriptId, content) => {
    set(state => ({
      scripts: {
        ...state.scripts,
        [scriptId]: { ...state.scripts[scriptId], content, isDirty: true }
      }
    }));
  },

  updateScriptLanguage: (scriptId, language) => {
    set(state => ({
      scripts: {
        ...state.scripts,
        [scriptId]: { ...state.scripts[scriptId], language, isDirty: true }
      }
    }));
  },

  closeTab: (tabId) => {
    const { tabs, activeTabId, files, scripts, markdowns } = get();
    const tabIndex = tabs.findIndex(t => t.id === tabId);
    if (tabIndex === -1) return;

    const tab = tabs[tabIndex];
    const fileId = tab.fileId;

    const newTabs = tabs.filter(t => t.id !== tabId);
    let newActiveTabId = activeTabId;

    if (tab.isActive && newTabs.length > 0) {
      const newIndex = Math.min(tabIndex, newTabs.length - 1);
      newActiveTabId = newTabs[newIndex].id;
      newTabs[newIndex] = { ...newTabs[newIndex], isActive: true };
    } else if (newTabs.length === 0) {
      newActiveTabId = null;
    }

    const newFiles = { ...files };
    const newScripts = { ...scripts };
    const newMarkdowns = { ...markdowns };
    const otherTabsForFile = newTabs.filter(t => t.fileId === fileId);
    if (otherTabsForFile.length === 0) {
      delete newFiles[fileId];
      delete newScripts[fileId];
      delete newMarkdowns[fileId];
    }

    set({
      tabs: newTabs,
      activeTabId: newActiveTabId,
      files: newFiles,
      scripts: newScripts,
      markdowns: newMarkdowns
    });
  },

  setActiveTab: (tabId) => {
    set(state => ({
      tabs: state.tabs.map(t => ({ ...t, isActive: t.id === tabId })),
      activeTabId: tabId
    }));
  },

  /**
   * 按文件路径激活已存在的标签页（文件树单击已打开文件时使用）。
   * 返回是否找到并激活。
   * 注意：不做任何 setProjectStore 同步——调用方负责。
   */
  activateTabByPath: (filePath: string): boolean => {
    const { tabs, files, scripts, markdowns } = get();
    // 1. 找完全匹配的 tab
    for (const t of tabs) {
      const f = t.type === 'script' ? scripts[t.fileId]
        : t.type === 'markdown' ? markdowns[t.fileId]
        : files[t.fileId];
      if (f && f.path === filePath) {
        set(state => ({
          tabs: state.tabs.map(x => ({ ...x, isActive: x.id === t.id })),
          activeTabId: t.id,
        }));
        return true;
      }
    }
    // 2. 模糊匹配：忽略大小写 + 统一斜杠
    const norm = (p: string) => p.replace(/\\/g, '/').toLowerCase();
    const target = norm(filePath);
    for (const t of tabs) {
      const f = t.type === 'script' ? scripts[t.fileId]
        : t.type === 'markdown' ? markdowns[t.fileId]
        : files[t.fileId];
      if (f && norm(f.path) === target) {
        set(state => ({
          tabs: state.tabs.map(x => ({ ...x, isActive: x.id === t.id })),
          activeTabId: t.id,
        }));
        return true;
      }
    }
    return false;
  },

  updateCell: (fileId, rowIndex, colIndex, value) => {
    const { files, history, historyIndex } = get();
    const file = files[fileId];
    if (!file) return;

    const varName = file.variables[colIndex].name;
    const oldValue = file.data[rowIndex][varName];
    if (oldValue === value) return;

    const newData = [...file.data];
    newData[rowIndex] = { ...newData[rowIndex], [varName]: value };

    const entry: HistoryEntry = {
      type: 'cell_edit',
      timestamp: Date.now(),
      description: `修改单元格 (${rowIndex + 1}, ${varName})`,
      before: { rowIndex, colIndex, value: oldValue },
      after: { rowIndex, colIndex, value },
      rowIndex,
      colIndex
    };

    const fileHistory = history[fileId] || [];
    const fileHistoryIndex = historyIndex[fileId] ?? -1;
    const newHistory = fileHistory.slice(0, fileHistoryIndex + 1);
    newHistory.push(entry);
    if (newHistory.length > 50) newHistory.shift();

    set(state => ({
      files: {
        ...state.files,
        [fileId]: { ...file, data: newData, isDirty: true }
      },
      history: { ...state.history, [fileId]: newHistory },
      historyIndex: { ...state.historyIndex, [fileId]: newHistory.length - 1 }
    }));
  },

  getActiveFile: () => {
    const { tabs, activeTabId, files } = get();
    const activeTab = tabs.find(t => t.id === activeTabId);
    if (!activeTab) return null;
    return files[activeTab.fileId] || null;
  },

  getActiveScript: () => {
    const { tabs, activeTabId, scripts } = get();
    const activeTab = tabs.find(t => t.id === activeTabId);
    if (!activeTab || activeTab.type !== 'script') return null;
    return scripts[activeTab.fileId] || null;
  },

  getActiveMarkdown: () => {
    const { tabs, activeTabId, markdowns } = get();
    const activeTab = tabs.find(t => t.id === activeTabId);
    if (!activeTab || activeTab.type !== 'markdown') return null;
    return markdowns[activeTab.fileId] || null;
  },

  markFileClean: (fileId) => {
    set(state => ({
      files: {
        ...state.files,
        [fileId]: { ...state.files[fileId], isDirty: false }
      }
    }));
  },

  updateFilePath: (fileId, path) => {
    const file = get().files[fileId];
    if (!file) return;
    const newName = path.split(/[/\\]/).pop() || file.name;
    set(state => ({
      files: {
        ...state.files,
        [fileId]: { ...file, path, name: newName }
      },
      tabs: state.tabs.map(t => t.fileId === fileId ? { ...t, title: newName } : t)
    }));
  },

  renameTab: (tabId, title) => {
    set(state => ({
      tabs: state.tabs.map(t =>
        t.id === tabId ? { ...t, title } : t
      )
    }));
  },

  reorderTabs: (tabIds) => {
    set(state => {
      const newTabs = tabIds
        .map(id => state.tabs.find(t => t.id === id))
        .filter((t): t is Tab => t !== undefined);
      return { tabs: newTabs };
    });
  },

  moveTabToNewWindow: async (tabId) => {
    const { tabs, files } = get();
    const tab = tabs.find(t => t.id === tabId);
    if (!tab) return;

    const file = files[tab.fileId];
    if (!file) return;

    // 实际移动逻辑在 Header.tsx 中处理
    console.log('Moving tab to new window:', { tab, file });
  },

  mergeTabs: (tabIds) => {
    console.log('Merge tabs:', tabIds);
  },

  receiveTabFromWindow: (tab, file, insertIndex) => {
    console.log('[fileStore] receiveTabFromWindow called:', { tab, file, insertIndex });

    const isScript = tab.type === 'script';
    const isMarkdown = tab.type === 'markdown';

    set(state => {
      // 防重复：检查是否已存在相同来源的标签页（通过 tab.title 和 file.path 判断）
      const existingTab = isScript
        ? state.tabs.find(t =>
            t.title === tab.title &&
            state.scripts[t.fileId]?.path === (file as ScriptFile).path
          )
        : isMarkdown
        ? state.tabs.find(t =>
            t.title === tab.title &&
            state.markdowns[t.fileId]?.path === (file as MarkdownFile).path
          )
        : state.tabs.find(t =>
            t.title === tab.title &&
            state.files[t.fileId]?.path === (file as DTAFile).path
          );
      if (existingTab) {
        console.log('[fileStore] Tab already exists, activating it:', existingTab.id);
        // 修复：即使标签页已存在，也激活它，而不是跳过
        return {
          tabs: state.tabs.map(t => ({ ...t, isActive: t.id === existingTab.id })),
          activeTabId: existingTab.id
        };
      }

      // 生成新的 ID，避免冲突
      const newFileId = `file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const newTabId = `tab_${++tabCounter}`;

      if (isScript) {
        const scriptFile = file as ScriptFile;
        const newScript: ScriptFile = {
          ...scriptFile,
          id: newFileId,
          content: scriptFile.content || '',
          language: scriptFile.language || 'stata',
          isDirty: false
        };

        const newTab: Tab = {
          ...tab,
          id: newTabId,
          fileId: newFileId,
          type: 'script',
          isActive: true
        };

        const otherTabs = state.tabs.map(t => ({ ...t, isActive: false }));
        let newTabs: Tab[];
        if (insertIndex !== undefined && insertIndex >= 0 && insertIndex <= otherTabs.length) {
          newTabs = [...otherTabs.slice(0, insertIndex), newTab, ...otherTabs.slice(insertIndex)];
        } else {
          newTabs = [...otherTabs, newTab];
        }

        return {
          scripts: { ...state.scripts, [newFileId]: newScript },
          tabs: newTabs,
          activeTabId: newTabId
        };
      }

      if (isMarkdown) {
        const mdFile = file as MarkdownFile;
        const newMd: MarkdownFile = {
          ...mdFile,
          id: newFileId,
          content: mdFile.content || '',
          isDirty: false
        };

        const newTab: Tab = {
          ...tab,
          id: newTabId,
          fileId: newFileId,
          type: 'markdown',
          isActive: true
        };

        const otherTabs = state.tabs.map(t => ({ ...t, isActive: false }));
        let newTabs: Tab[];
        if (insertIndex !== undefined && insertIndex >= 0 && insertIndex <= otherTabs.length) {
          newTabs = [...otherTabs.slice(0, insertIndex), newTab, ...otherTabs.slice(insertIndex)];
        } else {
          newTabs = [...otherTabs, newTab];
        }

        return {
          markdowns: { ...state.markdowns, [newFileId]: newMd },
          tabs: newTabs,
          activeTabId: newTabId
        };
      }

      // 原有 DTAFile 逻辑
      // 深拷贝文件数据，确保完整性
      const dtaFile = file as DTAFile;
      const newFile: DTAFile = {
        ...dtaFile,
        id: newFileId,
        // 确保 data 被正确复制
        data: dtaFile.data ? [...dtaFile.data.map(row => ({ ...row }))] : [],
        variables: dtaFile.variables ? [...dtaFile.variables] : [],
        valueLabels: dtaFile.valueLabels ? { ...dtaFile.valueLabels } : {},
        isDirty: dtaFile.isDirty ?? false
      };

      const newTab: Tab = {
        ...tab,
        id: newTabId,
        fileId: newFileId,
        isActive: true
      };

      console.log('[fileStore] Created new file and tab:', { newFileId, newTabId, dataLength: newFile.data.length });

      const otherTabs = state.tabs.map(t => ({ ...t, isActive: false }));

      let newTabs: Tab[];
      if (insertIndex !== undefined && insertIndex >= 0 && insertIndex <= otherTabs.length) {
        newTabs = [...otherTabs.slice(0, insertIndex), newTab, ...otherTabs.slice(insertIndex)];
      } else {
        newTabs = [...otherTabs, newTab];
      }

      return {
        files: { ...state.files, [newFileId]: newFile },
        tabs: newTabs,
        activeTabId: newTabId,
        history: { ...state.history, [newFileId]: [] },
        historyIndex: { ...state.historyIndex, [newFileId]: -1 }
      };
    });
  },

  getTabData: (tabId) => {
    const { tabs, files, scripts, markdowns } = get();
    const tab = tabs.find(t => t.id === tabId);
    if (!tab) return null;

    if (tab.type === 'script') {
      const script = scripts[tab.fileId];
      if (!script) return null;
      return { tab, file: script };
    }

    if (tab.type === 'markdown') {
      const md = markdowns[tab.fileId];
      if (!md) return null;
      return { tab, file: md };
    }

    const file = files[tab.fileId];
    if (!file) return null;

    return { tab, file };
  },

  undo: () => {
    const { activeTabId, tabs, files, history, historyIndex } = get();
    if (!activeTabId) return;
    
    const activeTab = tabs.find(t => t.id === activeTabId);
    if (!activeTab) return;
    
    const fileId = activeTab.fileId;
    const fileHistory = history[fileId] || [];
    const currentIndex = historyIndex[fileId] ?? -1;
    
    if (currentIndex < 0) return;
    
    const entry = fileHistory[currentIndex];
    if (!entry) return;
    
    const file = files[fileId];
    if (!file) return;
    
    const newData = [...file.data];
    if (entry.type === 'cell_edit' && entry.before && typeof entry.before === 'object') {
      const { rowIndex, value } = entry.before as { rowIndex: number; value: unknown };
      const varName = file.variables[(entry.before as { colIndex: number }).colIndex].name;
      newData[rowIndex] = { ...newData[rowIndex], [varName]: value };
    }
    
    set(state => ({
      files: {
        ...state.files,
        [fileId]: { ...file, data: newData }
      },
      historyIndex: {
        ...state.historyIndex,
        [fileId]: currentIndex - 1
      }
    }));
  },
  
  redo: () => {
    const { activeTabId, tabs, files, history, historyIndex } = get();
    if (!activeTabId) return;
    
    const activeTab = tabs.find(t => t.id === activeTabId);
    if (!activeTab) return;
    
    const fileId = activeTab.fileId;
    const fileHistory = history[fileId] || [];
    const currentIndex = historyIndex[fileId] ?? -1;
    
    if (currentIndex >= fileHistory.length - 1) return;
    
    const nextIndex = currentIndex + 1;
    const entry = fileHistory[nextIndex];
    if (!entry) return;
    
    const file = files[fileId];
    if (!file) return;
    
    const newData = [...file.data];
    if (entry.type === 'cell_edit' && entry.after && typeof entry.after === 'object') {
      const { rowIndex, value } = entry.after as { rowIndex: number; value: unknown };
      const varName = file.variables[(entry.after as { colIndex: number }).colIndex].name;
      newData[rowIndex] = { ...newData[rowIndex], [varName]: value };
    }
    
    set(state => ({
      files: {
        ...state.files,
        [fileId]: { ...file, data: newData }
      },
      historyIndex: {
        ...state.historyIndex,
        [fileId]: nextIndex
      }
    }));
  },
  
  canUndo: () => {
    const { activeTabId, tabs, historyIndex } = get();
    if (!activeTabId) return false;
    
    const activeTab = tabs.find(t => t.id === activeTabId);
    if (!activeTab) return false;
    
    const fileId = activeTab.fileId;
    const currentIndex = historyIndex[fileId] ?? -1;
    return currentIndex >= 0;
  },
  
  canRedo: () => {
    const { activeTabId, tabs, history, historyIndex } = get();
    if (!activeTabId) return false;
    
    const activeTab = tabs.find(t => t.id === activeTabId);
    if (!activeTab) return false;
    
    const fileId = activeTab.fileId;
    const fileHistory = history[fileId] || [];
    const currentIndex = historyIndex[fileId] ?? -1;
    
    return currentIndex < fileHistory.length - 1;
  }
}));
