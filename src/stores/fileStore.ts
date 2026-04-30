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
}

export interface Tab {
  id: string;
  fileId: string;
  title: string;
  isActive: boolean;
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
  tabs: Tab[];
  activeTabId: string | null;
  history: Record<string, HistoryEntry[]>;
  historyIndex: Record<string, number>;

  openFile: (file: DTAFile) => string;
  closeTab: (tabId: string) => void;
  setActiveTab: (tabId: string) => void;
  updateCell: (fileId: string, rowIndex: number, colIndex: number, value: unknown) => void;
  getActiveFile: () => DTAFile | null;
  markFileClean: (fileId: string) => void;
  renameTab: (tabId: string, title: string) => void;
  reorderTabs: (tabIds: string[]) => void;
  moveTabToNewWindow: (tabId: string) => void;
  mergeTabs: (tabIds: string[]) => void;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
}

let tabCounter = 0;

export const useFileStore = create<FileState>((set, get) => ({
  files: {},
  tabs: [],
  activeTabId: null,
  history: {},
  historyIndex: {},

  openFile: (file) => {
    const existingTab = Object.values(get().files).find(f => f.path === file.path);
    if (existingTab) {
      const tab = get().tabs.find(t => t.fileId === existingTab.id);
      if (tab) {
        set({ activeTabId: tab.id });
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

  closeTab: (tabId) => {
    const { tabs, activeTabId, files } = get();
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
    const otherTabsForFile = newTabs.filter(t => t.fileId === fileId);
    if (otherTabsForFile.length === 0) {
      delete newFiles[fileId];
    }

    set({
      tabs: newTabs,
      activeTabId: newActiveTabId,
      files: newFiles
    });
  },

  setActiveTab: (tabId) => {
    set(state => ({
      tabs: state.tabs.map(t => ({ ...t, isActive: t.id === tabId })),
      activeTabId: tabId
    }));
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

  markFileClean: (fileId) => {
    set(state => ({
      files: {
        ...state.files,
        [fileId]: { ...state.files[fileId], isDirty: false }
      }
    }));
  },

  renameTab: (tabId, title) => {
    set(state => ({
      tabs: state.tabs.map(t => t.id === tabId ? { ...t, title } : t)
    }));
  },

  reorderTabs: (tabIds) => {
    set(state => {
      const tabMap = new Map(state.tabs.map(t => [t.id, t]));
      const reorderedTabs = tabIds.map(id => tabMap.get(id)!).filter(Boolean);
      return { tabs: reorderedTabs };
    });
  },

  moveTabToNewWindow: (tabId) => {
    console.log('Move tab to new window:', tabId);
  },

  mergeTabs: (tabIds) => {
    console.log('Merge tabs:', tabIds);
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
    if (!entry || entry.type !== 'cell_edit') return;
    
    // 恢复到之前的状态
    const file = files[fileId];
    if (!file || entry.rowIndex === undefined || entry.colIndex === undefined) return;
    
    const variable = file.variables[entry.colIndex];
    if (!variable) return;
    
    const newData = [...file.data];
    newData[entry.rowIndex] = {
      ...newData[entry.rowIndex],
      [variable.name]: entry.before
    };
    
    set(state => ({
      files: {
        ...state.files,
        [fileId]: { ...file, data: newData, isDirty: true }
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
    if (!entry || entry.type !== 'cell_edit') return;
    
    // 恢复到之后的状态
    const file = files[fileId];
    if (!file || entry.rowIndex === undefined || entry.colIndex === undefined) return;
    
    const variable = file.variables[entry.colIndex];
    if (!variable) return;
    
    const newData = [...file.data];
    newData[entry.rowIndex] = {
      ...newData[entry.rowIndex],
      [variable.name]: entry.after
    };
    
    set(state => ({
      files: {
        ...state.files,
        [fileId]: { ...file, data: newData, isDirty: true }
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
