import { memo, useCallback, useMemo, useState, useEffect, useRef } from 'react';
import {
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  Database,
  FileSpreadsheet,
  Terminal,
  FileCode,
  Braces,
  Package,
  FileText,
  Edit3,
  Trash2,
  FolderInput,
} from 'lucide-react';
import { useProjectStore, ProjectFileNode } from '@/stores/projectStore';
import { useNotify, useConfirm, usePrompt } from '@/hooks/useNotify';
import styles from './ProjectExplorer.module.css';

interface ProjectFileTreeProps {
  onOpen: (node: ProjectFileNode) => void;
  /** 父级搜索匹配状态（用于在搜索模式下显示整个树） */
  ancestorMatch?: boolean;
  /** 当前节点的深度（用于缩进） */
  depth?: number;
}

interface ContextMenuState {
  x: number;
  y: number;
  node: ProjectFileNode;
}

interface NodeProps extends ProjectFileTreeProps {
  node: ProjectFileNode;
}

/**
 * 树形节点视图：递归渲染 ProjectFileNode。
 * 文件夹：可点击展开/折叠。
 * 文件：根据扩展名显示对应图标。
 */
function ProjectFileTreeNode({ node, onOpen, ancestorMatch = false, depth = 0 }: NodeProps) {
  const expandedFolders = useProjectStore((s) => s.expandedFolders);
  const toggleFolder = useProjectStore((s) => s.toggleFolder);
  const selectedFile = useProjectStore((s) => s.selectedFile);
  const setSelectedFile = useProjectStore((s) => s.setSelectedFile);
  const searchQuery = useProjectStore((s) => s.searchQuery);

  const isFolder = node.type === 'folder';
  const isExpanded = expandedFolders.has(node.path);
  const isSelected = !isFolder && selectedFile === node.path;
  const isRoot = depth === 0;
  const rowRef = useRef<HTMLDivElement | null>(null);

  // 当文件被外部（如切换标签页）选中时，自动滚动到可视区域
  useEffect(() => {
    if (isSelected && rowRef.current) {
      // 延迟一帧，等待展开动画与高亮应用
      requestAnimationFrame(() => {
        rowRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      });
    }
  }, [isSelected, selectedFile]);

  // 搜索匹配判断：自身名称匹配 OR 任意后代匹配 OR 父级已匹配
  const selfMatch = useMemo(() => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return node.name.toLowerCase().includes(q);
  }, [node.name, searchQuery]);

  const childMatch = useMemo(() => {
    if (!searchQuery) return false;
    if (!node.children) return false;
    return filterMatchedPaths(node, searchQuery).length > 0;
  }, [node, searchQuery]);

  const visible = !searchQuery || ancestorMatch || selfMatch || childMatch;

  // 右键菜单
  const [menu, setMenu] = useState<ContextMenuState | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const notify = useNotify();
  const confirm = useConfirm();
  const promptFn = usePrompt();

  // 点击其他位置关闭右键菜单
  useEffect(() => {
    if (!menu) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenu(null);
      }
    };
    const onScroll = () => setMenu(null);
    document.addEventListener('mousedown', handler);
    document.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('scroll', onScroll, true);
    };
  }, [menu]);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ x: e.clientX, y: e.clientY, node });
  }, [node]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (isFolder) {
      toggleFolder(node.path);
    } else {
      // 单击文件：直接打开（与 VSCode / 大多数 IDE 一致）
      setSelectedFile(node.path);
      onOpen(node);
    }
  }, [isFolder, node, toggleFolder, setSelectedFile, onOpen]);

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (isFolder) {
      // 双击文件夹：强制展开
      toggleFolder(node.path);
    }
  }, [isFolder, node, toggleFolder]);

  if (!visible) return null;

  // 获取文件图标与颜色
  const fileIcon = isFolder
    ? (isExpanded ? FolderOpen : Folder)
    : getFileIcon(node.ext);
  const fileColor = isFolder ? undefined : getFileColor(node.ext);

  // 右键菜单 actions
  const handleReveal = useCallback(async () => {
    setMenu(null);
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('reveal_in_explorer', { path: node.path });
    } catch (err) {
      notify('error', `无法在文件管理器中显示: ${err}`);
    }
  }, [node.path, notify]);

  const handleRename = useCallback(async () => {
    setMenu(null);
    const newName = await promptFn(`重命名 "${node.name}"：`, '重命名', node.name);
    if (!newName || newName === node.name) return;
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const sep = node.path.includes('\\') ? '\\' : '/';
      const parent = node.path.substring(0, node.path.lastIndexOf(sep));
      const newPath = `${parent}${sep}${newName}`;
      await invoke('rename_path', { oldPath: node.path, newPath });
      // 通知 projectStore 刷新：调用方（ProjectExplorer）会响应
      window.dispatchEvent(new CustomEvent('pocketdata:project-refresh'));
    } catch (err) {
      notify('error', `重命名失败: ${err}`);
    }
  }, [node, notify, promptFn]);

  const handleDelete = useCallback(async () => {
    setMenu(null);
    const kind = isFolder ? '文件夹' : '文件';
    const ok = await confirm(`确定要删除${kind} "${node.name}" 吗？此操作不可恢复。`, '删除确认');
    if (!ok) return;
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('delete_path', { path: node.path });
      window.dispatchEvent(new CustomEvent('pocketdata:project-refresh'));
      notify('success', `已删除: ${node.name}`, 2000);
    } catch (err) {
      notify('error', `删除失败: ${err}`);
    }
  }, [isFolder, node, notify, confirm]);

  const handleOpenClick = useCallback(() => {
    setMenu(null);
    if (isFolder) {
      toggleFolder(node.path);
    } else {
      onOpen(node);
    }
  }, [isFolder, node, onOpen, toggleFolder]);

  return (
    <div className={styles.treeNode}>
      <div
        ref={rowRef}
        className={`${styles.treeRow} ${isSelected ? styles.selected : ''} ${isRoot ? styles.rootRow : ''}`}
        style={{ paddingLeft: `${depth * 14 + 6}px` }}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onContextMenu={handleContextMenu}
        title={node.relativePath || node.name}
      >
        <span className={styles.chevron}>
          {isFolder && (isExpanded
            ? <ChevronDown size={14} />
            : <ChevronRight size={14} />)}
        </span>
        {(() => {
          const Icon = fileIcon;
          return (
            <Icon
              size={14}
              className={styles.fileIcon}
              style={fileColor ? { color: fileColor } : undefined}
            />
          );
        })()}
        <span className={styles.fileName}>{node.name}</span>
      </div>

      {isFolder && isExpanded && node.children && (
        <div className={styles.treeChildren}>
          {node.children.map((child) => (
            <ProjectFileTreeNodeMemo
              key={child.path}
              node={child}
              onOpen={onOpen}
              ancestorMatch={ancestorMatch || selfMatch}
              depth={depth + 1}
            />
          ))}
        </div>
      )}

      {menu && (
        <div
          ref={menuRef}
          className={styles.contextMenu}
          style={{ top: menu.y, left: menu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          {!isFolder && (
            <button className={styles.contextMenuItem} onClick={handleOpenClick}>
              <FileText size={14} />
              <span>打开</span>
            </button>
          )}
          <button className={styles.contextMenuItem} onClick={handleReveal}>
            <FolderInput size={14} />
            <span>在文件管理器中显示</span>
          </button>
          <button className={styles.contextMenuItem} onClick={handleRename}>
            <Edit3 size={14} />
            <span>重命名</span>
          </button>
          <div className={styles.contextMenuSeparator} />
          <button
            className={`${styles.contextMenuItem} ${styles.contextMenuDanger}`}
            onClick={handleDelete}
          >
            <Trash2 size={14} />
            <span>删除</span>
          </button>
        </div>
      )}
    </div>
  );
}

const ProjectFileTreeNodeMemo = memo(ProjectFileTreeNode);

/**
 * 树入口：渲染根节点的子树。
 */
export function ProjectFileTree({ onOpen }: ProjectFileTreeProps) {
  const root = useProjectStore((s) => s.fileTree);
  const searchQuery = useProjectStore((s) => s.searchQuery);

  if (!root) return null;

  // 搜索过滤：保留命中节点及其祖先链
  const filteredRoot = useMemo(() => {
    if (!searchQuery) return root;
    return filterNode(root, searchQuery);
  }, [root, searchQuery]);

  if (!filteredRoot || !filteredRoot.children || filteredRoot.children.length === 0) {
    return (
      <div className={styles.emptyState}>
        {searchQuery ? '没有匹配的文件或文件夹' : '项目为空'}
      </div>
    );
  }

  return (
    <div className={styles.treeContainer}>
      {filteredRoot.children.map((child) => (
        <ProjectFileTreeNodeMemo
          key={child.path}
          node={child}
          onOpen={onOpen}
          depth={0}
        />
      ))}
    </div>
  );
}

/* ---------------------------- 工具函数 ---------------------------- */

/**
 * 根据扩展名返回图标组件。
 */
function getFileIcon(ext?: string) {
  switch (ext?.toLowerCase()) {
    case 'dta':
      return Database;
    case 'csv':
    case 'tsv':
    case 'xls':
    case 'xlsx':
      return FileSpreadsheet;
    case 'do':
    case 'ado':
    case 'mata':
      return Terminal;
    case 'py':
      return FileCode;
    case 'json':
      return Braces;
    case 'pocketdata':
      return Package;
    case 'md':
    case 'txt':
      return FileText;
    default:
      return FileText;
  }
}

/**
 * 根据扩展名返回图标颜色。
 */
function getFileColor(ext?: string): string | undefined {
  switch (ext?.toLowerCase()) {
    case 'dta':
      return '#2563EB'; // 蓝
    case 'csv':
    case 'tsv':
    case 'xls':
    case 'xlsx':
      return '#10B981'; // 绿
    case 'do':
    case 'ado':
    case 'mata':
      return '#8B5CF6'; // 紫
    case 'py':
      return '#F59E0B'; // 黄
    default:
      return undefined;
  }
}

/**
 * 递归判断是否有后代匹配查询，并构造一个保留命中路径的子节点集合。
 */
function filterNode(node: ProjectFileNode, query: string): ProjectFileNode | null {
  const q = query.toLowerCase();
  const selfMatch = node.name.toLowerCase().includes(q);

  if (node.type !== 'folder' || !node.children) {
    return selfMatch ? node : null;
  }

  const filteredChildren: ProjectFileNode[] = [];
  for (const child of node.children) {
    const f = filterNode(child, q);
    if (f) filteredChildren.push(f);
  }

  if (selfMatch || filteredChildren.length > 0) {
    return { ...node, children: filteredChildren };
  }
  return null;
}

/**
 * 仅判断后代是否有命中（不返回新树），用于祖先级状态计算。
 */
function filterMatchedPaths(node: ProjectFileNode, query: string): string[] {
  const q = query.toLowerCase();
  const matched: string[] = [];
  if (node.name.toLowerCase().includes(q)) matched.push(node.path);
  if (node.children) {
    for (const c of node.children) {
      matched.push(...filterMatchedPaths(c, q));
    }
  }
  return matched;
}
