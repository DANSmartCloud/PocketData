import { useCallback, useEffect, useRef } from 'react';
import { X, Search, FolderOpen, FolderPlus, RefreshCw, ChevronsDownUp, ChevronsUpDown } from 'lucide-react';
import { useProjectStore, ProjectFileNode } from '@/stores/projectStore';
import { useFileStore } from '@/stores/fileStore';
import { useFileOperations } from '@/hooks/useFileOperations';
import { useNotify } from '@/hooks/useNotify';
import { ProjectFileTree } from './ProjectFileTree';
import styles from './ProjectExplorer.module.css';

interface ProjectExplorerProps {
  /** 移动端点击关闭按钮的回调 */
  onClose?: () => void;
}

/**
 * 类 VSCode 树形文件侧边栏。
 * 顶部：项目名 + 关闭按钮
 * 中部：搜索框
 * 下部：文件树
 */
export function ProjectExplorer(_props: ProjectExplorerProps) {
  const rootPath = useProjectStore((s) => s.rootPath);
  const rootName = useProjectStore((s) => s.rootName);
  const searchQuery = useProjectStore((s) => s.searchQuery);
  const setSearchQuery = useProjectStore((s) => s.setSearchQuery);
  const setFileTree = useProjectStore((s) => s.setFileTree);
  const collapseAll = useProjectStore((s) => s.collapseAll);
  const expandToMatch = useProjectStore((s) => s.expandToMatch);
  const setSelectedFile = useProjectStore((s) => s.setSelectedFile);

  const { openProjectFile, handleOpenProject } = useFileOperations();
  const notify = useNotify();
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  /**
   * 重新扫描文件树。
   */
  const refreshTree = useCallback(async () => {
    if (!rootPath) return;
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const tree = await invoke<ProjectFileNode>('read_project_tree', { path: rootPath });
      setFileTree(tree);
      notify('success', '文件树已刷新', 1500);
    } catch (err) {
      notify('error', `刷新文件树失败: ${err}`);
    }
  }, [rootPath, setFileTree, notify]);

  /**
   * 监听子树组件派发的刷新事件。
   */
  useEffect(() => {
    const handler = () => { void refreshTree(); };
    window.addEventListener('pocketdata:project-refresh', handler);
    return () => window.removeEventListener('pocketdata:project-refresh', handler);
  }, [refreshTree]);

  /**
   * 搜索时自动展开所有包含匹配项的父文件夹。
   */
  useEffect(() => {
    if (searchQuery) {
      expandToMatch(searchQuery);
    }
  }, [searchQuery, expandToMatch]);

  /**
   * 单击/双击文件节点：先尝试激活已存在的 tab，否则再打开新 tab。
   * 这样能确保 文件树高亮 / 顶部标签页高亮 / 内容显示 三者绝对同步。
   */
  const handleOpen = useCallback((node: ProjectFileNode) => {
    if (node.type !== 'file') return;
    setSelectedFile(node.path);
    // 1) 优先激活已存在 tab（避免重复创建）
    const activated = useFileStore.getState().activateTabByPath(node.path);
    if (activated) return;
    // 2) 没有已存在 tab：异步打开新文件
    void openProjectFile(node.path);
  }, [openProjectFile, setSelectedFile]);

  /**
   * 搜索模式：全部展开匹配项；非搜索模式：全部折叠。
   */
  const handleCollapseToggle = useCallback(() => {
    if (searchQuery) {
      expandToMatch(searchQuery);
    } else {
      collapseAll();
    }
  }, [searchQuery, expandToMatch, collapseAll]);

  return (
    <div className={styles.explorer}>
      {/* 顶部 header：仅显示项目名（操作按钮合并到底部工具栏） */}
      <div className={styles.header}>
        <div className={styles.headerTitle}>
          <FolderOpen size={16} />
          <span className={styles.projectName} title={rootPath || ''}>
            {rootName || '项目'}
          </span>
        </div>
      </div>

      {/* 搜索框 */}
      <div className={styles.searchRow}>
        <div className={styles.searchInputWrapper}>
          <Search size={14} className={styles.searchIcon} />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索文件"
            className={styles.searchInput}
            spellCheck={false}
          />
          {searchQuery && (
            <button
              className={styles.clearBtn}
              onClick={() => setSearchQuery('')}
              title="清空搜索"
              aria-label="清空搜索"
            >
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {/* 文件树 */}
      <div className={styles.treeScroll}>
        <ProjectFileTree onOpen={handleOpen} />
      </div>

      {/* 底部三按钮工具栏：折叠/刷新/打开项目 */}
      <div className={styles.footerBar}>
        <button
          className={styles.footerBtn}
          onClick={handleCollapseToggle}
          title={searchQuery ? '全部展开' : '全部折叠'}
          aria-label={searchQuery ? '全部展开' : '全部折叠'}
        >
          {searchQuery ? <ChevronsUpDown size={14} /> : <ChevronsDownUp size={14} />}
        </button>
        <button
          className={styles.footerBtn}
          onClick={() => void refreshTree()}
          title="刷新文件树"
          aria-label="刷新文件树"
        >
          <RefreshCw size={14} />
        </button>
        <button
          className={styles.footerBtn}
          onClick={() => void handleOpenProject()}
          title="打开其他项目"
          aria-label="打开其他项目"
        >
          <FolderPlus size={14} />
        </button>
      </div>
    </div>
  );
}
