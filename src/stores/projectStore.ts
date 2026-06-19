import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface ProjectFileNode {
  name: string;
  path: string;          // 完整绝对路径
  relativePath: string;  // 相对项目根的路径
  type: 'file' | 'folder';
  ext?: string;          // 文件扩展名（不含.）
  children?: ProjectFileNode[];  // 仅 folder 有
  size?: number;
  modified?: number;     // 时间戳
}

export interface RecentProject {
  rootPath: string;
  name: string;          // 根目录名
  lastOpened: number;    // 时间戳
}

export interface ProjectState {
  // 当前项目
  isOpen: boolean;
  rootPath: string | null;
  rootName: string | null;
  fileTree: ProjectFileNode | null;  // 根节点

  // 最近项目列表（最多 10 个，持久化）
  recentProjects: RecentProject[];

  // UI 状态
  expandedFolders: Set<string>;     // 已展开文件夹路径集合
  selectedFile: string | null;       // 当前选中文件
  searchQuery: string;               // 树搜索关键词

  // Actions
  openProject: (rootPath: string, rootName: string, fileTree: ProjectFileNode) => void;
  closeProject: () => void;
  setFileTree: (tree: ProjectFileNode) => void;
  addRecentProject: (rootPath: string, name: string) => void;
  clearRecentProjects: () => void;
  toggleFolder: (path: string) => void;
  expandFolders: (paths: string[]) => void;
  collapseAll: () => void;
  expandToMatch: (query: string) => void;
  setSelectedFile: (path: string | null) => void;
  setSearchQuery: (q: string) => void;
}

export const useProjectStore = create<ProjectState>()(
  persist(
    (set, get) => ({
      isOpen: false,
      rootPath: null,
      rootName: null,
      fileTree: null,
      recentProjects: [],
      expandedFolders: new Set(),
      selectedFile: null,
      searchQuery: '',

      openProject: (rootPath, rootName, fileTree) => {
        set({ isOpen: true, rootPath, rootName, fileTree, searchQuery: '' });
        get().addRecentProject(rootPath, rootName);
      },

      closeProject: () => {
        set({
          isOpen: false,
          rootPath: null,
          rootName: null,
          fileTree: null,
          expandedFolders: new Set(),
          selectedFile: null,
          searchQuery: ''
        });
      },

      setFileTree: (tree) => set({ fileTree: tree }),

      addRecentProject: (rootPath, name) => {
        const now = Date.now();
        const existing = get().recentProjects.filter(p => p.rootPath !== rootPath);
        const next = [{ rootPath, name, lastOpened: now }, ...existing].slice(0, 10);
        set({ recentProjects: next });
      },

      clearRecentProjects: () => set({ recentProjects: [] }),

      toggleFolder: (path) => {
        const next = new Set(get().expandedFolders);
        if (next.has(path)) next.delete(path);
        else next.add(path);
        set({ expandedFolders: next });
      },

      expandFolders: (paths) => {
        const next = new Set(get().expandedFolders);
        for (const p of paths) next.add(p);
        set({ expandedFolders: next });
      },

      collapseAll: () => set({ expandedFolders: new Set() }),

      expandToMatch: (query) => {
        const { fileTree, expandedFolders } = get();
        if (!query || !fileTree) return;
        const q = query.toLowerCase();
        const ancestors = new Set(expandedFolders);

        const walk = (node: ProjectFileNode, parentChain: ProjectFileNode[]): boolean => {
          if (node.type === 'folder' && node.children) {
            const parentChainNext = [...parentChain, node];
            let hasMatch = node.name.toLowerCase().includes(q);
            for (const child of node.children) {
              if (walk(child, parentChainNext)) hasMatch = true;
            }
            if (hasMatch) {
              for (const p of parentChain) ancestors.add(p.path);
              ancestors.add(node.path);
            }
            return hasMatch;
          }
          return node.name.toLowerCase().includes(q);
        };

        walk(fileTree, []);
        set({ expandedFolders: ancestors });
      },

      setSelectedFile: (path) => set({ selectedFile: path }),
      setSearchQuery: (q) => set({ searchQuery: q })
    }),
    {
      name: 'pocketdata-project',
      partialize: (state) => ({
        recentProjects: state.recentProjects
      })
    }
  )
);
