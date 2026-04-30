import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useFileStore } from "@/stores/fileStore";
import { useUIStore } from "@/stores/uiStore";
import { useFileOperations } from "@/hooks/useFileOperations";
import styles from "./MenuBar.module.css";

interface MenuItem {
  label: string;
  key: string;
  shortcut?: string;
  disabled?: boolean;
  separator?: boolean;
  action?: () => void;
}

interface Menu {
  label: string;
  key: string;
  items: MenuItem[];
}

export function MenuBar() {
  const { getActiveFile, tabs, undo, redo, canUndo, canRedo } = useFileStore();
  const { theme, setTheme, operationMode, setOperationMode } = useUIStore();
  const { handleOpenFile, handleExportFile, handleImportFile } = useFileOperations();
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
      items: [
        { label: "打开...", key: "open", shortcut: "Ctrl+O", action: handleOpenFile },
        { label: "保存", key: "save", shortcut: "Ctrl+S", disabled: !hasFile },
        { label: "另存为...", key: "saveAs", disabled: !hasFile },
        { label: "", key: "sep1", separator: true },
        { label: "导入数据...", key: "import", action: handleImportFile },
        { label: "导出数据...", key: "export", disabled: !hasFile, action: () => handleExportFile('csv') },
        { label: "", key: "sep2", separator: true },
        { label: "退出", key: "exit" },
      ],
    },
    {
      label: "编辑",
      key: "edit",
      items: [
        { label: "撤销", key: "undo", shortcut: "Ctrl+Z", disabled: !canUndo(), action: undo },
        { label: "重做", key: "redo", shortcut: "Ctrl+Y", disabled: !canRedo(), action: redo },
        { label: "", key: "sep1", separator: true },
        { label: "剪切", key: "cut", shortcut: "Ctrl+X", disabled: !hasFile },
        { label: "复制", key: "copy", shortcut: "Ctrl+C", disabled: !hasFile },
        { label: "粘贴", key: "paste", shortcut: "Ctrl+V", disabled: !hasFile },
        { label: "", key: "sep2", separator: true },
        { label: "查找...", key: "find", shortcut: "Ctrl+F", disabled: !hasFile },
        { label: "替换...", key: "replace", shortcut: "Ctrl+H", disabled: !hasFile },
      ],
    },
    {
      label: "数据",
      key: "data",
      items: [
        { label: "描述统计", key: "describe", disabled: !hasFile },
        { label: "数据清洗", key: "clean", disabled: !hasFile },
        { label: "缺失值处理", key: "missing", disabled: !hasFile },
        { label: "", key: "sep1", separator: true },
        { label: "排序...", key: "sort", disabled: !hasFile },
        { label: "筛选...", key: "filter", disabled: !hasFile },
        { label: "", key: "sep2", separator: true },
        { label: "生成变量...", key: "generate", disabled: !hasFile },
        { label: "重命名变量...", key: "rename", disabled: !hasFile },
      ],
    },
    {
      label: "图形",
      key: "graph",
      items: [
        { label: "散点图", key: "scatter", disabled: !hasFile },
        { label: "折线图", key: "line", disabled: !hasFile },
        { label: "柱状图", key: "bar", disabled: !hasFile },
        { label: "饼图", key: "pie", disabled: !hasFile },
        { label: "", key: "sep1", separator: true },
        { label: "直方图", key: "histogram", disabled: !hasFile },
        { label: "箱线图", key: "boxplot", disabled: !hasFile },
        { label: "", key: "sep2", separator: true },
        { label: "图形编辑器", key: "editor", disabled: true },
      ],
    },
    {
      label: "查看",
      key: "view",
      items: [
        { label: `切换${theme === 'light' ? '深色' : '浅色'}模式`, key: "theme", action: () => setTheme(theme === 'light' ? 'dark' : 'light') },
        { label: `切换到${operationMode === 'stata' ? 'Excel' : 'Stata'}模式`, key: "mode", action: () => setOperationMode(operationMode === 'stata' ? 'excel' : 'stata') },
        { label: "", key: "sep1", separator: true },
        { label: "放大", key: "zoomIn", shortcut: "Ctrl++" },
        { label: "缩小", key: "zoomOut", shortcut: "Ctrl+-" },
        { label: "重置缩放", key: "zoomReset", shortcut: "Ctrl+0" },
        { label: "", key: "sep2", separator: true },
        { label: "全屏", key: "fullscreen", shortcut: "F11" },
      ],
    },
    {
      label: "导出",
      key: "export",
      items: [
        { label: "导出为 CSV", key: "csv", disabled: !hasFile, action: () => handleExportFile('csv') },
        { label: "导出为 Excel", key: "excel", disabled: !hasFile, action: () => handleExportFile('xlsx') },
        { label: "导出为 Stata", key: "stata", disabled: !hasFile, action: () => handleExportFile('dta') },
        { label: "", key: "sep1", separator: true },
        { label: "导出图形...", key: "exportGraph", disabled: true },
        { label: "导出报告...", key: "report", disabled: true },
      ],
    },
    {
      label: "统计",
      key: "stats",
      items: [
        { label: "描述统计", key: "descriptive", disabled: !hasFile },
        { label: "相关性分析", key: "correlation", disabled: !hasFile },
        { label: "回归分析", key: "regression", disabled: !hasFile },
        { label: "", key: "sep1", separator: true },
        { label: "T 检验", key: "ttest", disabled: !hasFile },
        { label: "方差分析", key: "anova", disabled: !hasFile },
        { label: "卡方检验", key: "chisq", disabled: !hasFile },
      ],
    },
    {
      label: "帮助",
      key: "help",
      items: [
        { label: "使用文档", key: "docs" },
        { label: "快捷键参考", key: "shortcuts" },
        { label: "", key: "sep1", separator: true },
        { label: "检查更新", key: "update" },
        { label: "", key: "sep2", separator: true },
        { label: "关于 PocketStata", key: "about", action: () => navigate("/about") },
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
            {menu.label}
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
