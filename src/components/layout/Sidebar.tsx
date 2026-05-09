import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useFileStore } from "@/stores/fileStore";
import { useUIStore } from "@/stores/uiStore";
import { Logo } from "@/components/common/Logo";
import {
  FileText,
  Edit3,
  Database,
  BarChart2,
  Eye,
  Download,
  PieChart,
  HelpCircle,
  X,
  ChevronRight,
  FolderOpen,
  Save,
  SaveAll,
  FileUp,
  FileDown,
  Undo,
  Redo,
  Scissors,
  Copy,
  ClipboardPaste,
  Search,
  Replace,
  Calculator,
  Sparkles,
  Filter,
  ArrowUpDown,
  Plus,
  Type,
  ScatterChart,
  LineChart,
  BarChart,
  PieChartIcon,
  SquareStack,
  BoxSelect,
  Moon,
  ZoomIn,
  ZoomOut,
  Maximize,
  FileSpreadsheet,
  Table2,
  Sigma,
  GitBranch,
  TrendingUp,
  TestTube,
  LayoutGrid,
  BookOpen,
  Keyboard,
  RefreshCw,
  Info,
} from "lucide-react";
import styles from "./Sidebar.module.css";

interface SidebarProps {
  onClose?: () => void;
}

interface SubMenuItem {
  label: string;
  key: string;
  icon: React.ElementType;
  shortcut?: string;
}

interface MenuItem {
  icon: React.ElementType;
  label: string;
  key: string;
  children: SubMenuItem[];
}

const menuItems: MenuItem[] = [
  {
    icon: FileText,
    label: "文件",
    key: "file",
    children: [
      { icon: FolderOpen, label: "打开...", key: "open", shortcut: "Ctrl+O" },
      { icon: Save, label: "保存", key: "save", shortcut: "Ctrl+S" },
      { icon: SaveAll, label: "另存为...", key: "saveAs" },
      { icon: FileUp, label: "导入数据...", key: "import" },
      { icon: FileDown, label: "导出数据...", key: "export" },
    ],
  },
  {
    icon: Edit3,
    label: "编辑",
    key: "edit",
    children: [
      { icon: Undo, label: "撤销", key: "undo", shortcut: "Ctrl+Z" },
      { icon: Redo, label: "重做", key: "redo", shortcut: "Ctrl+Y" },
      { icon: Scissors, label: "剪切", key: "cut", shortcut: "Ctrl+X" },
      { icon: Copy, label: "复制", key: "copy", shortcut: "Ctrl+C" },
      { icon: ClipboardPaste, label: "粘贴", key: "paste", shortcut: "Ctrl+V" },
      { icon: Search, label: "查找...", key: "find", shortcut: "Ctrl+F" },
      { icon: Replace, label: "替换...", key: "replace", shortcut: "Ctrl+H" },
    ],
  },
  {
    icon: Database,
    label: "数据",
    key: "data",
    children: [
      { icon: Calculator, label: "描述统计", key: "describe" },
      { icon: Sparkles, label: "数据清洗", key: "clean" },
      { icon: Filter, label: "缺失值处理", key: "missing" },
      { icon: ArrowUpDown, label: "排序...", key: "sort" },
      { icon: Search, label: "筛选...", key: "filter" },
      { icon: Plus, label: "生成变量...", key: "generate" },
      { icon: Type, label: "重命名变量...", key: "rename" },
    ],
  },
  {
    icon: BarChart2,
    label: "图形",
    key: "graph",
    children: [
      { icon: ScatterChart, label: "散点图", key: "scatter" },
      { icon: LineChart, label: "折线图", key: "line" },
      { icon: BarChart, label: "柱状图", key: "bar" },
      { icon: PieChartIcon, label: "饼图", key: "pie" },
      { icon: SquareStack, label: "直方图", key: "histogram" },
      { icon: BoxSelect, label: "箱线图", key: "boxplot" },
    ],
  },
  {
    icon: Eye,
    label: "查看",
    key: "view",
    children: [
      { icon: Moon, label: "切换深色/浅色模式", key: "theme" },
      { icon: Table2, label: "切换 Stata/Excel 模式", key: "mode" },
      { icon: ZoomIn, label: "放大", key: "zoomIn", shortcut: "Ctrl++" },
      { icon: ZoomOut, label: "缩小", key: "zoomOut", shortcut: "Ctrl+-" },
      { icon: Maximize, label: "重置缩放", key: "zoomReset", shortcut: "Ctrl+0" },
    ],
  },
  {
    icon: Download,
    label: "导出",
    key: "export",
    children: [
      { icon: FileDown, label: "导出为 CSV", key: "csv" },
      { icon: FileSpreadsheet, label: "导出为 Excel", key: "excel" },
      { icon: Database, label: "导出为 Stata", key: "stata" },
      { icon: BarChart2, label: "导出图形...", key: "exportGraph" },
      { icon: FileText, label: "导出报告...", key: "report" },
    ],
  },
  {
    icon: PieChart,
    label: "统计",
    key: "stats",
    children: [
      { icon: Calculator, label: "描述统计", key: "descriptive" },
      { icon: GitBranch, label: "相关性分析", key: "correlation" },
      { icon: TrendingUp, label: "回归分析", key: "regression" },
      { icon: TestTube, label: "T 检验", key: "ttest" },
      { icon: LayoutGrid, label: "方差分析", key: "anova" },
      { icon: Sigma, label: "卡方检验", key: "chisq" },
    ],
  },
  {
    icon: HelpCircle,
    label: "帮助",
    key: "help",
    children: [
      { icon: BookOpen, label: "使用文档", key: "docs" },
      { icon: Keyboard, label: "快捷键参考", key: "shortcuts" },
      { icon: RefreshCw, label: "检查更新", key: "update" },
      { icon: Info, label: "关于 PocketStata", key: "about" },
    ],
  },
];

export function Sidebar({ onClose }: SidebarProps) {
  const navigate = useNavigate();
  const { getActiveFile } = useFileStore();
  const { operationMode, setOperationMode, theme, setTheme, selectColumn } = useUIStore();
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [isExiting, setIsExiting] = useState(false);
  const [exitingMenuKey, setExitingMenuKey] = useState<string | null>(null);
  const menuSectionRef = useRef<HTMLDivElement>(null);

  const activeFile = getActiveFile();

  // 处理菜单切换，带退出动画
  const handleMenuTransition = (newMenu: string | null) => {
    if (activeMenu && newMenu !== activeMenu) {
      // 保存当前正在退出的菜单key，用于在动画期间显示内容
      setExitingMenuKey(activeMenu);
      // 先播放退出动画
      setIsExiting(true);
      setTimeout(() => {
        setIsExiting(false);
        setExitingMenuKey(null);
        setActiveMenu(newMenu);
      }, 200);
    } else {
      setActiveMenu(newMenu);
    }
  };

  const getTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      byte: '数值',
      int: '数值',
      long: '数值',
      float: '浮点',
      double: '双精度',
      string: '字符'
    };
    return labels[type] || type;
  };

  const handleMenuClick = (key: string) => {
    const menu = menuItems.find(m => m.key === key);
    if (menu?.children) {
      handleMenuTransition(key);
    }
  };

  const handleSubMenuClick = (parentKey: string, childKey: string) => {
    console.log('Menu clicked:', parentKey, childKey);

    // 处理特殊功能
    if (parentKey === 'view') {
      if (childKey === 'theme') {
        setTheme(theme === 'light' ? 'dark' : 'light');
      } else if (childKey === 'mode') {
        setOperationMode(operationMode === 'stata' ? 'excel' : 'stata');
      }
    }

    // 处理关于页面
    if (parentKey === 'help' && childKey === 'about') {
      navigate('/about');
    }

    handleMenuTransition(null);
  };

  const handleBack = () => {
    handleMenuTransition(null);
  };

  // 使用正在退出的菜单key或当前活动菜单key来获取菜单项
  const currentMenuKey = isExiting ? exitingMenuKey : activeMenu;
  const activeMenuItem = currentMenuKey ? menuItems.find(m => m.key === currentMenuKey) : null;

  return (
    <aside className={styles.sidebar}>
      {/* Logo 区域 */}
      <div className={styles.logoSection}>
        <div className={styles.logo}>
          <Logo size={28} className={styles.logoIcon} />
          <div className={styles.logoTextWrapper}>
            <span className={styles.logoText}>PocketStata</span>
            <span className={styles.versionBadge}>v1.0.0</span>
          </div>
        </div>
        {onClose && (
          <button className={styles.closeBtn} onClick={onClose} title="关闭侧边栏">
            <X size={20} />
          </button>
        )}
      </div>

      {/* 菜单区域 - 仅在移动端显示 */}
      <div className={styles.menuSection} ref={menuSectionRef}>
        {/* 主菜单网格 - 当有活动菜单或正在退出时隐藏 */}
        <div className={`${styles.menuGrid} ${(activeMenu || isExiting) ? styles.menuGridExit : styles.menuGridEnter}`}>
          {menuItems.map((item) => (
            <button
              key={item.key}
              className={styles.menuItem}
              onClick={() => handleMenuClick(item.key)}
            >
              <item.icon size={20} />
              <span>{item.label}</span>
              {item.children && <ChevronRight size={14} className={styles.menuArrow} />}
            </button>
          ))}
        </div>
        {/* 子菜单 - 当有活动菜单或正在退出时显示 */}
        <div className={`${styles.subMenu} ${(activeMenu || isExiting) ? (isExiting ? styles.subMenuExit : styles.subMenuEnter) : styles.subMenuHidden}`}>
          <div className={styles.subMenuHeader}>
            <button className={styles.backArrow} onClick={handleBack}>
              <ChevronRight size={20} style={{ transform: 'rotate(180deg)' }} />
            </button>
            <div className={styles.subMenuTitle}>
              {activeMenuItem && <activeMenuItem.icon size={18} />}
              <span>{activeMenuItem?.label}</span>
            </div>
          </div>
          <div className={styles.subMenuGrid}>
            {activeMenuItem?.children?.map((child) => (
              <button
                key={child.key}
                className={styles.subMenuItem}
                onClick={() => handleSubMenuClick(currentMenuKey!, child.key)}
              >
                <child.icon size={20} />
                <span>{child.label}</span>
                {child.shortcut && (
                  <span className={styles.shortcut}>{child.shortcut}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>文件信息</h3>
        <div className={styles.infoList}>
          <div className={styles.infoItem}>
            <span className={styles.label}>路径</span>
            <span className={styles.value} title={activeFile?.path}>
              {activeFile?.name}
            </span>
          </div>
          <div className={styles.infoItem}>
            <span className={styles.label}>版本</span>
            <span className={styles.value}>Stata {activeFile?.version}</span>
          </div>
          <div className={styles.infoItem}>
            <span className={styles.label}>观测值</span>
            <span className={styles.value}>{activeFile?.nobs.toLocaleString()}</span>
          </div>
          <div className={styles.infoItem}>
            <span className={styles.label}>变量数</span>
            <span className={styles.value}>{activeFile?.nvar}</span>
          </div>
          {/* 移动端显示编码信息 */}
          <div className={`${styles.infoItem} ${styles.mobileOnly}`}>
            <span className={styles.label}>编码</span>
            <span className={styles.value}>UTF-8</span>
          </div>
        </div>
      </div>

      <div className={styles.section}>
        <h3 className={styles.sectionTitle}>变量列表</h3>
        <div className={styles.variableList}>
          {activeFile?.variables.map((variable, index) => (
            <div 
              key={variable.name} 
              className={styles.variableItem}
              onClick={() => {
                selectColumn(index, activeFile.nobs);
                // 移动端点击后关闭侧边栏
                if (onClose) onClose();
              }}
              title={`点击选中 ${variable.name} 列`}
            >
              <span className={styles.varIndex}>{index + 1}</span>
              <span className={styles.varName} title={variable.name}>
                {variable.name}
              </span>
              <span className={`${styles.varType} ${styles[variable.type]}`}>
                {getTypeLabel(variable.type)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}
