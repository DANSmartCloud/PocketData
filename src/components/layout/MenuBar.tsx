import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useFileStore } from "@/stores/fileStore";
import { useUIStore } from "@/stores/uiStore";
import { useFileOperations } from "@/hooks/useFileOperations";
import {
  File, Edit3, Database, BarChart3, Eye, Download, Calculator, HelpCircle,
  FolderOpen, Save, Upload, LogOut, Undo2, Redo2, Scissors, Copy, Clipboard,
  Search, SortAsc, Filter, TrendingUp, Type, Image, Layers, Maximize2,
  ChevronRight, Info
} from "lucide-react";
import styles from "./MenuBar.module.css";

interface MenuItem {
  label: string;
  key: string;
  shortcut?: string;
  disabled?: boolean;
  separator?: boolean;
  action?: () => void;
  icon?: React.ReactNode;
}

interface Menu {
  label: string;
  key: string;
  icon?: React.ReactNode;
  items: MenuItem[];
}

export function MenuBar() {
  const { getActiveFile, undo, redo, canUndo, canRedo } = useFileStore();
  const { theme, setTheme, operationMode, setOperationMode } = useUIStore();
  const { handleOpenFile, handleExportFile, handleImportFile, handleSaveFile } = useFileOperations();
  const navigate = useNavigate();
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [closingMenu, setClosingMenu] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const activeFile = getActiveFile();
  const hasFile = !!activeFile;

  const menus: Menu[] = [
    {
      label: "文件",
      key: "file",
      icon: <File size={14} />,
      items: [
        { label: "打开...", key: "open", shortcut: "Ctrl+O", action: handleOpenFile, icon: <FolderOpen size={14} /> },
        { label: "保存", key: "save", shortcut: "Ctrl+S", disabled: !hasFile, action: handleSaveFile, icon: <Save size={14} /> },
        { label: "另存为...", key: "saveAs", disabled: !hasFile, action: handleSaveFile, icon: <Save size={14} /> },
        { label: "", key: "sep1", separator: true },
        { label: "导入数据...", key: "import", action: handleImportFile, icon: <Upload size={14} /> },
        { label: "导出数据...", key: "export", disabled: !hasFile, action: () => handleExportFile('csv'), icon: <Download size={14} /> },
        { label: "", key: "sep2", separator: true },
        { label: "退出", key: "exit", icon: <LogOut size={14} /> },
      ],
    },
    {
      label: "编辑",
      key: "edit",
      icon: <Edit3 size={14} />,
      items: [
        { label: "撤销", key: "undo", shortcut: "Ctrl+Z", disabled: !canUndo(), action: undo, icon: <Undo2 size={14} /> },
        { label: "重做", key: "redo", shortcut: "Ctrl+Y", disabled: !canRedo(), action: redo, icon: <Redo2 size={14} /> },
        { label: "", key: "sep1", separator: true },
        { label: "剪切", key: "cut", shortcut: "Ctrl+X", disabled: !hasFile, icon: <Scissors size={14} /> },
        { label: "复制", key: "copy", shortcut: "Ctrl+C", disabled: !hasFile, icon: <Copy size={14} /> },
        { label: "粘贴", key: "paste", shortcut: "Ctrl+V", disabled: !hasFile, icon: <Clipboard size={14} /> },
        { label: "", key: "sep2", separator: true },
        { label: "查找...", key: "find", shortcut: "Ctrl+F", disabled: !hasFile, icon: <Search size={14} /> },
        { label: "替换...", key: "replace", shortcut: "Ctrl+H", disabled: !hasFile, icon: <Search size={14} /> },
      ],
    },
    {
      label: "数据",
      key: "data",
      icon: <Database size={14} />,
      items: [
        { label: "描述统计", key: "describe", disabled: !hasFile, icon: <BarChart3 size={14} /> },
        { label: "数据清洗", key: "clean", disabled: !hasFile, icon: <Filter size={14} /> },
        { label: "缺失值处理", key: "missing", disabled: !hasFile, icon: <Layers size={14} /> },
        { label: "", key: "sep1", separator: true },
        { label: "排序...", key: "sort", disabled: !hasFile, icon: <SortAsc size={14} /> },
        { label: "筛选...", key: "filter", disabled: !hasFile, icon: <Filter size={14} /> },
        { label: "", key: "sep2", separator: true },
        { label: "生成变量...", key: "generate", disabled: !hasFile, icon: <TrendingUp size={14} /> },
        { label: "重命名变量...", key: "rename", disabled: !hasFile, icon: <Type size={14} /> },
      ],
    },
    {
      label: "图形",
      key: "graph",
      icon: <BarChart3 size={14} />,
      items: [
        { label: "散点图", key: "scatter", disabled: !hasFile, icon: <Image size={14} /> },
        { label: "折线图", key: "line", disabled: !hasFile, icon: <TrendingUp size={14} /> },
        { label: "柱状图", key: "bar", disabled: !hasFile, icon: <BarChart3 size={14} /> },
        { label: "饼图", key: "pie", disabled: !hasFile, icon: <Layers size={14} /> },
        { label: "", key: "sep1", separator: true },
        { label: "直方图", key: "histogram", disabled: !hasFile, icon: <BarChart3 size={14} /> },
        { label: "箱线图", key: "boxplot", disabled: !hasFile, icon: <Image size={14} /> },
        { label: "", key: "sep2", separator: true },
        { label: "图形编辑器", key: "editor", disabled: true, icon: <Image size={14} /> },
      ],
    },
    {
      label: "查看",
      key: "view",
      icon: <Eye size={14} />,
      items: [
        { label: `切换${theme === 'light' ? '深色' : '浅色'}模式`, key: "theme", action: () => setTheme(theme === 'light' ? 'dark' : 'light'), icon: <Eye size={14} /> },
        { label: `切换到${operationMode === 'stata' ? 'Excel' : 'Stata'}模式`, key: "mode", action: () => setOperationMode(operationMode === 'stata' ? 'excel' : 'stata'), icon: <Type size={14} /> },
        { label: "", key: "sep1", separator: true },
        { label: "放大", key: "zoomIn", shortcut: "Ctrl++", icon: <ChevronRight size={14} /> },
        { label: "缩小", key: "zoomOut", shortcut: "Ctrl+-", icon: <ChevronRight size={14} /> },
        { label: "重置缩放", key: "zoomReset", shortcut: "Ctrl+0", icon: <Eye size={14} /> },
        { label: "", key: "sep2", separator: true },
        { label: "全屏", key: "fullscreen", shortcut: "F11", icon: <Maximize2 size={14} /> },
      ],
    },
    {
      label: "导出",
      key: "export",
      icon: <Download size={14} />,
      items: [
        { label: "导出为 CSV", key: "csv", disabled: !hasFile, action: () => handleExportFile('csv'), icon: <File size={14} /> },
        { label: "导出为 Excel", key: "excel", disabled: !hasFile, action: () => handleExportFile('xlsx'), icon: <File size={14} /> },
        { label: "导出为 Stata", key: "stata", disabled: !hasFile, action: () => handleExportFile('dta'), icon: <File size={14} /> },
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
        { label: "描述统计", key: "descriptive", disabled: !hasFile, icon: <BarChart3 size={14} /> },
        { label: "相关性分析", key: "correlation", disabled: !hasFile, icon: <TrendingUp size={14} /> },
        { label: "回归分析", key: "regression", disabled: !hasFile, icon: <TrendingUp size={14} /> },
        { label: "", key: "sep1", separator: true },
        { label: "T 检验", key: "ttest", disabled: !hasFile, icon: <Calculator size={14} /> },
        { label: "方差分析", key: "anova", disabled: !hasFile, icon: <Calculator size={14} /> },
        { label: "卡方检验", key: "chisq", disabled: !hasFile, icon: <Calculator size={14} /> },
      ],
    },
    {
      label: "帮助",
      key: "help",
      icon: <HelpCircle size={14} />,
      items: [
        { label: "使用文档", key: "docs", icon: <File size={14} /> },
        { label: "快捷键参考", key: "shortcuts", icon: <Type size={14} /> },
        { label: "", key: "sep1", separator: true },
        { label: "检查更新", key: "update", icon: <Download size={14} /> },
        { label: "", key: "sep2", separator: true },
        { label: "关于 PocketStata", key: "about", action: () => navigate("/about"), icon: <Info size={14} /> },
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
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleMenuClick = (menuKey: string) => {
    if (activeMenu === menuKey) {
      // 关闭当前菜单，先播放退出动画
      setClosingMenu(menuKey);
      setTimeout(() => {
        setClosingMenu(null);
        setActiveMenu(null);
      }, 100);
    } else if (activeMenu) {
      // 切换到其他菜单，先关闭当前
      setClosingMenu(activeMenu);
      setTimeout(() => {
        setClosingMenu(null);
        setActiveMenu(menuKey);
      }, 100);
    } else {
      setActiveMenu(menuKey);
    }
  };

  const handleItemClick = (item: MenuItem) => {
    if (item.disabled || item.separator) return;
    if (item.action) {
      item.action();
    } else {
      console.log("Menu clicked:", item.key);
    }
    // 关闭菜单，先播放退出动画
    const currentMenu = activeMenu;
    setClosingMenu(currentMenu);
    setTimeout(() => {
      setClosingMenu(null);
      setActiveMenu(null);
    }, 100);
  };

  return (
    <div className={styles.menuBar} ref={menuRef}>
      {menus.map((menu) => (
        <div key={menu.key} className={styles.menuContainer}>
          <button
            className={`${styles.menuButton} ${activeMenu === menu.key ? styles.active : ""}`}
            onClick={() => handleMenuClick(menu.key)}
          >
            {menu.icon && <span className={styles.menuIcon}>{menu.icon}</span>}
            <span className={styles.menuLabel}>{menu.label}</span>
          </button>
          {(activeMenu === menu.key || closingMenu === menu.key) && (
            <div className={`${styles.dropdown} ${closingMenu === menu.key ? styles.dropdownExit : styles.dropdownEnter}`}>
              {menu.items.map((item) =>
                item.separator ? (
                  <div key={item.key} className={styles.separator} />
                ) : (
                  <button
                    key={item.key}
                    className={`${styles.menuItem} ${item.disabled ? styles.disabled : ""}`}
                    onClick={() => handleItemClick(item)}
                    disabled={item.disabled}
                  >
                    {item.icon && <span className={styles.itemIcon}>{item.icon}</span>}
                    <span className={styles.itemLabel}>{item.label}</span>
                    {item.shortcut && (
                      <span className={styles.shortcut}>{item.shortcut}</span>
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
