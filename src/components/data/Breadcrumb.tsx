import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  FolderOpen,
  Folder,
  FileCode,
  Terminal,
  FileText,
  Database,
  FileSpreadsheet,
  Braces,
  Package,
  ChevronRight,
  ChevronDown,
  Hash,
  X,
} from 'lucide-react';
import { useProjectStore, ProjectFileNode } from '@/stores/projectStore';
import { useFileStore } from '@/stores/fileStore';
import styles from './Breadcrumb.module.css';

interface BreadcrumbProps {
  /** 当前活跃脚本（可空） */
  activeScriptPath?: string;
  activeScriptName?: string;
  /** 当前光标位置（用于行/列显示） */
  cursorPosition?: { line: number; column: number };
  /** 是否脏 */
  isDirty?: boolean;
  /** 打开文件回调 */
  onOpenFile?: (path: string) => void;
}

interface Crumb {
  /** 节点（null 表示项目根） */
  node: ProjectFileNode | null;
  /** 面包屑标签名 */
  label: string;
  /** 用于展示的图标 */
  icon: React.ComponentType<any>;
  /** 该层下所有同级（含文件夹） */
  siblings: ProjectFileNode[];
  /** 绝对路径 */
  path: string;
  /** 是否为当前激活项 */
  active?: boolean;
}

/**
 * 面包屑组件
 * - 每层均使用幽灵按钮 + 图标
 * - 鼠标悬停 / 点击：弹出同层级对象列表
 * - 点击列表项：跳转到对应文件
 * - 超长自动折叠中间部分
 */
export function Breadcrumb({
  activeScriptPath,
  activeScriptName,
  cursorPosition,
  isDirty,
  onOpenFile,
}: BreadcrumbProps) {
  const rootName = useProjectStore((s) => s.rootName);
  const rootPath = useProjectStore((s) => s.rootPath);
  const fileTree = useProjectStore((s) => s.fileTree);
  const expandedFolders = useProjectStore((s) => s.expandedFolders);
  const toggleFolder = useProjectStore((s) => s.toggleFolder);
  const expandFolders = useProjectStore((s) => s.expandFolders);
  const setSelectedFile = useProjectStore((s) => s.setSelectedFile);

  const setActiveTab = useFileStore((s) => s.setActiveTab);
  const tabs = useFileStore((s) => s.tabs);
  const scripts = useFileStore((s) => s.scripts);

  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [collapsedMiddle, setCollapsedMiddle] = useState(false);

  // 关闭所有弹层（点击外部 / 编辑器滚动 / 窗口滚动）
  useEffect(() => {
    if (openIndex === null) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpenIndex(null);
      }
    };
    const onScroll = () => setOpenIndex(null);
    document.addEventListener("mousedown", handler);
    // 监听 Monaco 编辑器滚动（Monaco 使用自己的滚动容器）
    const editorScrollRoot = document.querySelector('.monaco-scrollable-element');
    editorScrollRoot?.addEventListener('scroll', onScroll);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener("mousedown", handler);
      editorScrollRoot?.removeEventListener('scroll', onScroll);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [openIndex]);

  // 计算面包屑层级
  const crumbs = useMemo<Crumb[]>(() => {
    const list: Crumb[] = [];

    // 第 0 层：项目根
    if (rootPath && fileTree) {
      // 根的同级：根节点自身的 children（一级目录/文件）
      const siblings = fileTree.children ?? [];
      list.push({
        node: fileTree,
        label: rootName ?? fileTree.name,
        icon: FolderOpen,
        siblings,
        path: rootPath,
      });
    }

    if (!activeScriptPath) {
      // 没有活动脚本，仅展示项目根
      if (list.length > 0) list[list.length - 1].active = true;
      return list;
    }

    // 解析路径为面包屑层级
    const normalize = (p: string) => p.replace(/\\/g, '/');
    const projectRoot = normalize(rootPath ?? '');
    const filePath = normalize(activeScriptPath);

    // 提取项目根之后的部分
    let rel = filePath;
    if (projectRoot && filePath.startsWith(projectRoot)) {
      rel = filePath.slice(projectRoot.length).replace(/^\/+/, '');
    }

    const parts = rel.split('/').filter(Boolean);
    const fileName = parts.pop() ?? activeScriptName ?? '';

    // 拼接出每一层
    let currentNode: ProjectFileNode | null = fileTree;
    let currentPath = projectRoot;
    for (const part of parts) {
      // 找到该 part 在 currentNode.children 中
      const child = currentNode?.children?.find((c) => c.name === part);
      if (!child) break;
      currentPath += '/' + part;
      list.push({
        node: child,
        label: child.name,
        icon: child.type === 'folder' ? Folder : getFileIcon(child.ext),
        siblings: currentNode?.children ?? [],
        path: currentPath,
      });
      currentNode = child;
    }

    // 最后一层：当前文件
    list.push({
      node: currentNode
        ? {
            ...currentNode,
            name: fileName,
            type: 'file',
            path: filePath,
            relativePath: rel,
          }
        : null,
      label: fileName,
      icon: getFileIcon(fileName.split('.').pop()),
      siblings: currentNode?.children ?? [],
      path: filePath,
      active: true,
    });

    return list;
  }, [activeScriptPath, activeScriptName, fileTree, rootName, rootPath]);

  // 超长折叠中间：当层级数 > 3 时折叠
  useEffect(() => {
    if (crumbs.length > 4) {
      setCollapsedMiddle(true);
    } else {
      setCollapsedMiddle(false);
    }
  }, [crumbs.length]);

  // 展示用 crumbs（按需折叠中间）
  const displayCrumbs = useMemo(() => {
    if (!collapsedMiddle || crumbs.length <= 4) return crumbs;
    return [crumbs[0], { ...crumbs[1], label: '…', icon: ChevronRight, siblings: [], path: '' } as Crumb, ...crumbs.slice(-2)];
  }, [crumbs, collapsedMiddle]);

  /**
   * 切换弹层
   */
  const handleCrumbClick = useCallback((idx: number, crumb: Crumb) => {
    if (openIndex === idx) {
      setOpenIndex(null);
      return;
    }
    setOpenIndex(idx);

    // 若点击的是文件夹，确保其展开（仅触发文件树上的视觉）
    if (crumb.node?.type === 'folder' && !expandedFolders.has(crumb.path)) {
      toggleFolder(crumb.path);
    }
    // 确保所有祖先文件夹都展开
    if (idx > 0) {
      const ancestorPaths: string[] = [];
      for (let i = 0; i < idx; i++) {
        if (crumbs[i].node?.type === 'folder') ancestorPaths.push(crumbs[i].path);
      }
      if (ancestorPaths.length > 0) expandFolders(ancestorPaths);
    }
  }, [openIndex, expandedFolders, toggleFolder, expandFolders, crumbs]);

  /**
   * 跳转到指定文件
   */
  const handleJumpTo = useCallback((node: ProjectFileNode) => {
    setOpenIndex(null);
    if (node.type === 'folder') {
      // 跳到文件夹：仅展开
      if (!expandedFolders.has(node.path)) toggleFolder(node.path);
      return;
    }
    // 设置项目内选中
    setSelectedFile(node.path);
    // 调用方打开
    onOpenFile?.(node.path);
    // 同时尝试设置 Tab 焦点
    const tab = tabs.find(
      (t) => (t.type === 'script' ? scripts[t.fileId]?.path : null) === node.path
    );
    if (tab) setActiveTab(tab.id);
  }, [expandedFolders, toggleFolder, setSelectedFile, onOpenFile, tabs, scripts, setActiveTab]);

  // 没有项目也没有文件时显示空状态
  if (crumbs.length === 0) {
    return (
      <div className={styles.breadcrumbBar}>
        <div className={styles.breadcrumbItems}>
          <span className={styles.breadcrumbEmpty}>未打开文件</span>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.breadcrumbBar} ref={containerRef}>
      <div className={styles.breadcrumbItems}>
        {displayCrumbs.map((crumb, idx) => {
          const isLast = idx === displayCrumbs.length - 1;
          const Icon = crumb.icon;
          return (
            <div key={`${crumb.path}-${idx}`} className={styles.crumbWrap}>
              <button
                className={`${styles.crumbBtn} ${crumb.active ? styles.crumbActive : ''}`}
                onClick={() => handleCrumbClick(idx, crumb)}
                title={crumb.path || crumb.label}
                type="button"
              >
                <Icon size={13} className={styles.crumbIcon} />
                <span className={styles.crumbLabel}>{crumb.label}</span>
                {!isLast && crumb.siblings.length > 0 && (
                  <ChevronDown size={10} className={styles.crumbChevron} />
                )}
              </button>

              {/* 弹层：同级对象列表 */}
              {openIndex === idx && crumb.siblings.length > 0 && (
                <div className={styles.siblingMenu} onClick={(e) => e.stopPropagation()}>
                  <div className={styles.siblingHeader}>
                    <span>{crumb.label}</span>
                    <button
                      className={styles.siblingClose}
                      onClick={(e) => { e.stopPropagation(); setOpenIndex(null); }}
                      title="关闭"
                    >
                      <X size={11} />
                    </button>
                  </div>
                  <div className={styles.siblingList}>
                    {crumb.siblings.map((sib) => {
                      const SibIcon = sib.type === 'folder' ? Folder : getFileIcon(sib.ext);
                      return (
                        <button
                          key={sib.path}
                          className={`${styles.siblingItem} ${
                            sib.path === activeScriptPath ? styles.siblingItemActive : ''
                          }`}
                          onClick={(e) => { e.stopPropagation(); handleJumpTo(sib); }}
                          type="button"
                        >
                          <SibIcon size={13} className={styles.siblingIcon} />
                          <span className={styles.siblingName}>{sib.name}</span>
                        </button>
                      );
                    })}
                    {crumb.siblings.length === 0 && (
                      <div className={styles.siblingEmpty}>（空目录）</div>
                    )}
                  </div>
                </div>
              )}

              {!isLast && (
                <ChevronRight size={10} className={styles.breadcrumbSep} />
              )}
            </div>
          );
        })}

        {/* 折叠展开：双击 root 切换 */}
        {collapsedMiddle && crumbs.length > 4 && (
          <button
            className={styles.crumbBtn}
            onClick={() => setCollapsedMiddle(false)}
            title="展开完整路径"
            type="button"
          >
            <ChevronDown size={11} />
          </button>
        )}

        {/* 光标位置 */}
        {cursorPosition && (
          <span className={styles.breadcrumbPos}>
            <Hash size={10} />
            行 {cursorPosition.line}, 列 {cursorPosition.column}
          </span>
        )}
      </div>
      {isDirty && <span className={styles.dirtyIndicator} title="有未保存的修改" />}
    </div>
  );
}

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
