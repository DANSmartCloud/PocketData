import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useUIStore } from "@/stores/uiStore";
import { useFileStore } from "@/stores/fileStore";
import { useProjectStore } from "@/stores/projectStore";
import { useMenuActions } from "@/hooks/useMenuActions";
import { formatShortcut } from "@/utils/platformShortcut";
import {
  File, Edit3, Database, BarChart3, Eye, Download, Calculator, HelpCircle,
  FolderOpen, Save, Upload, LogOut, Undo2, Redo2, Scissors, Copy, Clipboard,
  Search, SortAsc, Filter, TrendingUp, Type, Image, Layers, Maximize2,
  Info, FolderTree, FolderX, ChevronRight, History, LayoutGrid,
  PanelLeft, Sidebar, Terminal, Check, GitBranch, Sigma
} from "lucide-react";
import styles from "./MenuBar.module.css";

interface MenuItem {
  label: string;
  key: string;
  shortcut?: string;
  disabled?: boolean;
  separator?: boolean;
  checked?: boolean;
  action?: () => void;
  icon?: React.ReactNode;
  children?: MenuItem[];  // 子菜单（如"最近项目 >"）
}

interface Menu {
  label: string;
  key: string;
  icon?: React.ReactNode;
  items: MenuItem[];
}

export function MenuBar() {
  const _ui = useUIStore();
  const activeFile = useFileStore((s) => {
    const tab = s.tabs.find(t => t.id === s.activeTabId);
    if (!tab) return null;
    return s.files[tab.fileId] || null;
  });
  const recentProjects = useProjectStore((s) => s.recentProjects);
  const isProjectOpen = useProjectStore((s) => s.isOpen);
  const a = useMenuActions();
  const navigate = useNavigate();
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [closingMenu, setClosingMenu] = useState<string | null>(null);
  const [activeSubmenu, setActiveSubmenu] = useState<string | null>(null);
  const [closingSubmenu, setClosingSubmenu] = useState<string | null>(null);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastClickedMenu = useRef<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const hasFile = !!activeFile;
  // 订阅需要响应的窗格显隐状态（确保菜单的勾选符号实时变化）
  const sidebarCollapsed = useUIStore((s) => s.sidebarCollapsed);
  const terminalVisible = useUIStore((s) => s.terminalVisible);
  const statusBarVisible = useUIStore((s) => s.statusBarVisible);
  const formulaBarVisible = useUIStore((s) => s.formulaBarVisible);
  const outlineVisible = useUIStore((s) => s.outlineVisible);

  // 最近项目子菜单项（动态生成）
  const recentProjectItems: MenuItem[] = recentProjects.length > 0
    ? recentProjects.map((rp, idx) => ({
        label: rp.name,
        key: `recent_${idx}`,
        icon: <FolderTree size={14} />,
        action: () => a.openRecent(rp.rootPath)
      }))
    : [{ label: "（暂无最近项目）", key: "recent_empty", disabled: true }];

  const menus: Menu[] = [
    {
      label: "文件",
      key: "file",
      icon: <File size={14} />,
      items: [
        { label: "打开...", key: "open", shortcut: "Ctrl+O", action: a.open, icon: <FolderOpen size={14} /> },
        { label: "", key: "sepProj", separator: true },
        { label: "打开项目...", key: "openProject", shortcut: "Ctrl+Shift+O", action: a.openProject, icon: <FolderTree size={14} /> },
        { label: "关闭项目", key: "closeProject", disabled: !isProjectOpen, action: a.closeProject, icon: <FolderX size={14} /> },
        {
          label: "最近项目",
          key: "recentProjects",
          icon: <History size={14} />,
          children: recentProjectItems
        },
        { label: "", key: "sep0", separator: true },
        { label: "保存", key: "save", shortcut: "Ctrl+S", disabled: !hasFile, action: a.save, icon: <Save size={14} /> },
        { label: "另存为...", key: "saveAs", disabled: !hasFile, action: a.saveAs, icon: <Save size={14} /> },
        { label: "", key: "sep1", separator: true },
        { label: "导入数据...", key: "import", action: a.importData, icon: <Upload size={14} /> },
        { label: "导出为 CSV", key: "exportCsv", disabled: !hasFile, action: a.exportCSV, icon: <Download size={14} /> },
        { label: "导出为 Excel", key: "exportXlsx", disabled: !hasFile, action: a.exportExcel, icon: <Download size={14} /> },
        { label: "导出为 Stata", key: "exportDta", disabled: !hasFile, action: a.exportDta, icon: <Download size={14} /> },
        { label: "", key: "sep2", separator: true },
        { label: "退出", key: "exit", action: a.exit, icon: <LogOut size={14} /> },
      ],
    },
    {
      label: "编辑",
      key: "edit",
      icon: <Edit3 size={14} />,
      items: [
        { label: "撤销", key: "undo", shortcut: "Ctrl+Z", disabled: !a.canUndo, action: a.undo, icon: <Undo2 size={14} /> },
        { label: "重做", key: "redo", shortcut: "Ctrl+Y", disabled: !a.canRedo, action: a.redo, icon: <Redo2 size={14} /> },
        { label: "", key: "sep1", separator: true },
        { label: "剪切", key: "cut", shortcut: "Ctrl+X", disabled: !hasFile, action: a.cut, icon: <Scissors size={14} /> },
        { label: "复制", key: "copy", shortcut: "Ctrl+C", disabled: !hasFile, action: a.copy, icon: <Copy size={14} /> },
        { label: "粘贴", key: "paste", shortcut: "Ctrl+V", disabled: !hasFile, action: a.paste, icon: <Clipboard size={14} /> },
        { label: "", key: "sep2", separator: true },
        { label: "查找...", key: "find", shortcut: "Ctrl+F", disabled: !hasFile, action: a.find, icon: <Search size={14} /> },
        { label: "替换...", key: "replace", shortcut: "Ctrl+H", disabled: !hasFile, action: a.replace, icon: <Search size={14} /> },
      ],
    },
    {
      label: "数据",
      key: "data",
      icon: <Database size={14} />,
      items: [
        { label: "描述统计", key: "describe", disabled: !hasFile, action: a.describe, icon: <BarChart3 size={14} /> },
        { label: "缺失值处理", key: "clean", disabled: !hasFile, action: a.clean, icon: <Layers size={14} /> },
        { label: "", key: "sep1", separator: true },
        { label: "排序...", key: "sort", disabled: !hasFile, action: a.sort, icon: <SortAsc size={14} /> },
        { label: "筛选...", key: "filter", disabled: !hasFile, action: a.filter, icon: <Filter size={14} /> },
        { label: "", key: "sep2", separator: true },
        { label: "生成变量...", key: "generate", disabled: !hasFile, action: a.generate, icon: <TrendingUp size={14} /> },
        { label: "重命名变量...", key: "rename", disabled: !hasFile, action: a.rename, icon: <Type size={14} /> },
      ],
    },
    {
      label: "图形",
      key: "graph",
      icon: <BarChart3 size={14} />,
      items: [
        { label: "散点图", key: "scatter", disabled: !hasFile, action: a.scatter, icon: <Image size={14} /> },
        { label: "折线图", key: "line", disabled: !hasFile, action: a.line, icon: <TrendingUp size={14} /> },
        { label: "柱状图", key: "bar", disabled: !hasFile, action: a.bar, icon: <BarChart3 size={14} /> },
        { label: "饼图", key: "pie", disabled: !hasFile, action: a.pie, icon: <Layers size={14} /> },
        { label: "", key: "sep1", separator: true },
        { label: "直方图", key: "histogram", disabled: !hasFile, action: a.histogram, icon: <BarChart3 size={14} /> },
        { label: "箱线图", key: "boxplot", disabled: !hasFile, action: a.boxplot, icon: <Image size={14} /> },
        { label: "", key: "sep2", separator: true },
        { label: "图形编辑器", key: "editor", disabled: !hasFile, action: a.graphEditor, icon: <Image size={14} /> },
        { label: "", key: "sep3", separator: true },
        { label: "Mermaid 渲染", key: "mermaidRender", action: a.mermaidRender, icon: <GitBranch size={14} /> },
        { label: "公式渲染", key: "latexRender", action: a.latexRender, icon: <Sigma size={14} /> },
      ],
    },
    {
      label: "查看",
      key: "view",
      icon: <Eye size={14} />,
      items: [
        { label: `切换${_ui.theme === 'light' ? '深色' : '浅色'}模式`, key: "theme", action: a.toggleTheme, icon: <Eye size={14} /> },
        { label: `切换到${_ui.operationMode === 'stata' ? 'Excel' : 'Stata'}模式`, key: "mode", action: a.toggleMode, icon: <Type size={14} /> },
        { label: "", key: "sep1", separator: true },
        { label: "放大", key: "zoomIn", shortcut: "Ctrl++", action: a.zoomIn, icon: <TrendingUp size={14} /> },
        { label: "缩小", key: "zoomOut", shortcut: "Ctrl+-", action: a.zoomOut, icon: <TrendingUp size={14} style={{ transform: 'rotate(180deg)' }} /> },
        { label: "重置缩放", key: "zoomReset", shortcut: "Ctrl+0", action: a.resetZoom, icon: <Eye size={14} /> },
        { label: "", key: "sep2", separator: true },
        { label: "全屏", key: "fullscreen", shortcut: "F11", action: a.fullscreen, icon: <Maximize2 size={14} /> },
      ],
    },
    {
      label: "窗格",
      key: "pane",
      icon: <LayoutGrid size={14} />,
      items: [
        {
          label: "左侧边栏",
          key: "pane-sidebar",
          checked: !sidebarCollapsed,
          action: () => useUIStore.getState().toggleSidebar(),
          icon: <PanelLeft size={14} />
        },
        {
          label: "终端抽屉",
          key: "pane-terminal",
          checked: terminalVisible,
          action: () => useUIStore.getState().toggleTerminal(),
          icon: <Terminal size={14} />
        },
        { label: "", key: "sep1", separator: true },
        {
          label: "公式栏",
          key: "pane-formula",
          checked: formulaBarVisible,
          action: () => useUIStore.getState().toggleFormulaBar(),
          icon: <Type size={14} />
        },
        {
          label: "大纲面板",
          key: "pane-outline",
          checked: outlineVisible,
          action: () => useUIStore.getState().toggleOutline(),
          icon: <Layers size={14} />
        },
        {
          label: "状态栏",
          key: "pane-status",
          checked: statusBarVisible,
          action: () => useUIStore.getState().toggleStatusBar(),
          icon: <Sidebar size={14} />
        },
      ],
    },
    {
      label: "导出",
      key: "export",
      icon: <Download size={14} />,
      items: [
        { label: "导出为 CSV", key: "csv", disabled: !hasFile, action: a.exportCSV, icon: <File size={14} /> },
        { label: "导出为 Excel", key: "excel", disabled: !hasFile, action: a.exportExcel, icon: <File size={14} /> },
        { label: "导出为 Stata", key: "stata", disabled: !hasFile, action: a.exportDta, icon: <File size={14} /> },
        { label: "", key: "sep1", separator: true },
        { label: "导出图形...", key: "exportGraph", disabled: true, icon: <Image size={14} /> },
        { label: "导出报告...", key: "report", disabled: true, icon: <File size={14} /> },
      ],
    },
    {
      label: "统计",
      key: "stats",
      icon: <Calculator size={14} />,
      items: [
        { label: "描述统计", key: "descriptive", disabled: !hasFile, action: a.describe, icon: <BarChart3 size={14} /> },
        { label: "相关性分析", key: "correlation", disabled: !hasFile, action: a.correlation, icon: <TrendingUp size={14} /> },
        { label: "回归分析", key: "regression", disabled: !hasFile, action: a.regression, icon: <TrendingUp size={14} /> },
        { label: "", key: "sep1", separator: true },
        { label: "T 检验", key: "ttest", disabled: !hasFile, action: a.ttest, icon: <Calculator size={14} /> },
        { label: "方差分析", key: "anova", disabled: !hasFile, action: a.anova, icon: <Calculator size={14} /> },
        { label: "卡方检验", key: "chisq", disabled: !hasFile, action: a.chisq, icon: <Calculator size={14} /> },
      ],
    },
    {
      label: "帮助",
      key: "help",
      icon: <HelpCircle size={14} />,
      items: [
        { label: "使用文档", key: "docs", action: a.docs, icon: <File size={14} /> },
        { label: "快捷键参考", key: "shortcuts", action: a.shortcuts, icon: <Type size={14} /> },
        { label: "", key: "sep1", separator: true },
        { label: "检查更新", key: "update", action: a.checkUpdate, icon: <Download size={14} /> },
        { label: "", key: "sep2", separator: true },
        { label: "关于 PocketData", key: "about", action: () => navigate("/about"), icon: <Info size={14} /> },
      ],
    },
  ];

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setActiveMenu(null);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    };
  }, []);

  const handleMenuClick = (menuKey: string) => {
    lastClickedMenu.current = menuKey;
    if (activeMenu === menuKey) {
      setClosingMenu(menuKey);
      setTimeout(() => {
        setClosingMenu(null);
        setActiveMenu(null);
      }, 150);
    } else if (activeMenu) {
      setClosingMenu(activeMenu);
      setTimeout(() => {
        setClosingMenu(null);
        setActiveMenu(menuKey);
      }, 150);
    } else {
      setActiveMenu(menuKey);
    }
  };

  const handleItemClick = (item: MenuItem) => {
    if (item.disabled || item.separator) return;
    // 有子菜单的项：点击切换子菜单显示（带动画）
    if (item.children && item.children.length > 0) {
      if (activeSubmenu === item.key) {
        // 关闭子菜单，带退出动画
        setClosingSubmenu(item.key);
        setActiveSubmenu(null);
        setTimeout(() => {
          setClosingSubmenu(null);
        }, 200);
      } else {
        setActiveSubmenu(item.key);
      }
      return;
    }
    if (item.action) {
      try {
        item.action();
      } catch (err) {
        console.error("Menu action error:", err);
      }
    }
    const currentMenu = activeMenu;
    const currentSubmenu = activeSubmenu;
    setClosingMenu(currentMenu);
    if (currentSubmenu) {
      setClosingSubmenu(currentSubmenu);
      setActiveSubmenu(null);
    }
    setTimeout(() => {
      setClosingMenu(null);
      setClosingSubmenu(null);
      setActiveMenu(null);
    }, 150);
  };

  const closeAllMenus = () => {
    const currentMenu = activeMenu;
    const currentSubmenu = activeSubmenu;
    setClosingMenu(currentMenu);
    if (currentSubmenu) {
      setClosingSubmenu(currentSubmenu);
      setActiveSubmenu(null);
    }
    setTimeout(() => {
      setClosingMenu(null);
      setClosingSubmenu(null);
      setActiveMenu(null);
    }, 150);
  };

  return (
    <div className={styles.menuBar} ref={menuRef}>
      {menus.map((menu) => (
        <div key={menu.key} className={styles.menuContainer}>
          <button
            className={`${styles.menuButton} ${activeMenu === menu.key ? styles.active : ""}`}
            onClick={() => handleMenuClick(menu.key)}
            onMouseEnter={() => {
              if (activeMenu && activeMenu !== menu.key) {
                lastClickedMenu.current = null;
                setActiveMenu(menu.key);
              }
            }}
          >
            {menu.icon && <span className={styles.menuIcon}>{menu.icon}</span>}
            <span className={styles.menuLabel}>{menu.label}</span>
          </button>
          {(activeMenu === menu.key || closingMenu === menu.key) && (
            <div
              className={`${styles.dropdown} ${closingMenu === menu.key ? styles.dropdownExit : styles.dropdownEnter}`}
              onMouseLeave={() => {
              const sub = activeSubmenu;
              if (sub) {
                setClosingSubmenu(sub);
                setActiveSubmenu(null);
                setTimeout(() => setClosingSubmenu(null), 200);
              }
            }}
            >
              {menu.items.map((item) =>
                item.separator ? (
                  <div key={item.key} className={styles.separator} />
                ) : item.children && item.children.length > 0 ? (
                  <div
                    key={item.key}
                    className={styles.submenuWrapper}
                    onMouseEnter={() => {
                      if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
                      setActiveSubmenu(item.key);
                    }}
                    onMouseLeave={() => {
                      hoverTimeoutRef.current = setTimeout(() => {
                        const sub = activeSubmenu;
                        if (sub) {
                          setClosingSubmenu(sub);
                          setActiveSubmenu(null);
                          setTimeout(() => setClosingSubmenu(null), 200);
                        }
                      }, 200);
                    }}
                  >
                    <button
                      className={`${styles.menuItem} ${item.disabled ? styles.disabled : ""} ${activeSubmenu === item.key ? styles.submenuActive : ""}`}
                      onClick={() => handleItemClick(item)}
                      disabled={item.disabled}
                    >
                      {item.icon && <span className={styles.itemIcon}>{item.icon}</span>}
                      <span className={styles.itemLabel}>{item.label}</span>
                      <ChevronRight size={12} className={styles.submenuArrow} />
                    </button>
                    {(activeSubmenu === item.key || closingSubmenu === item.key) && (
                      <div
                        className={`${styles.submenu} ${closingSubmenu === item.key ? styles.submenuClosing : ""}`}
                        onMouseEnter={() => {
                          if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
                        }}
                      >
                        {item.children.map((child) =>
                          child.separator ? (
                            <div key={child.key} className={styles.separator} />
                          ) : (
                            <button
                              key={child.key}
                              className={`${styles.menuItem} ${child.disabled ? styles.disabled : ""}`}
                              onClick={() => {
                                if (child.disabled) return;
                                if (child.action) {
                                  try { child.action(); } catch (err) { console.error("Submenu action error:", err); }
                                }
                                closeAllMenus();
                              }}
                              disabled={child.disabled}
                              title={child.label}
                            >
                              {child.icon && <span className={styles.itemIcon}>{child.icon}</span>}
                              <span className={styles.itemLabel}>{child.label}</span>
                              {child.checked !== undefined && (
                                <span className={styles.checkmark}>{child.checked ? <Check size={14} /> : null}</span>
                              )}
                            </button>
                          )
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <button
                    key={item.key}
                    className={`${styles.menuItem} ${item.disabled ? styles.disabled : ""}`}
                    onClick={() => handleItemClick(item)}
                    disabled={item.disabled}
                  >
                    {item.icon && <span className={styles.itemIcon}>{item.icon}</span>}
                    <span className={styles.itemLabel}>{item.label}</span>
                    {item.checked !== undefined && (
                      <span className={styles.checkmark}>{item.checked ? <Check size={14} /> : null}</span>
                    )}
                    {item.shortcut && (
                      <span className={styles.shortcut}>{formatShortcut(item.shortcut)}</span>
                    )}
                  </button>
                )
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
