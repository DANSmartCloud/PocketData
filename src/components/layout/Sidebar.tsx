import { useState, useEffect, useRef, startTransition } from "react";
import { useNavigate } from "react-router-dom";
import { useFileStore } from "@/stores/fileStore";
import type { DTAFile } from "@/stores/fileStore";
import { useUIStore } from "@/stores/uiStore";
import { useProjectStore } from "@/stores/projectStore";
import { useMenuActions } from "@/hooks/useMenuActions";
import { useFileOperations } from "@/hooks/useFileOperations";
import { ProjectExplorer } from "@/components/project/ProjectExplorer";
import { AIAssistant } from "@/components/sidebar/AIAssistant";
import { AIHistoryPanel } from "@/components/sidebar/AIHistoryPanel";
import { Logo } from "@/components/common/Logo";
import { SettingsPanel } from "@/components/layout/panels/SettingsPanel";
import {
  FileText,
  Edit3,
  Database,
  BarChart2,
  Eye,
  Download,
  HelpCircle,
  X,
  FolderOpen,
  FolderX,
  FolderTree,
  Sparkles,
  LayoutGrid,
  ListTree,
  Info,
  ListChecks,
  Sun,
  Globe,
  Bot,
  Search,
  Settings,
  Type,
  Code,
} from "lucide-react";
import { GlobalFindPanel } from "@/components/sidebar/GlobalFindPanel";
import { AIConfigPanel } from "@/components/layout/panels/AIConfigPanel";
import { ThemeSettingsPanel } from "@/components/layout/panels/ThemeSettingsPanel";
import { CodeSettingsPanel } from "@/components/layout/panels/CodeSettingsPanel";
import styles from "./Sidebar.module.css";

interface SidebarProps {
  onClose?: () => void;
  width?: number;
  onResizeStart?: (e: React.MouseEvent) => void;
}

export function Sidebar({ onClose, width, onResizeStart }: SidebarProps) {
  const navigate = useNavigate();
  const getActiveFile = useFileStore((s) => s.getActiveFile);
  const selectColumn = useUIStore((s) => s.selectColumn);
  const isProjectOpen = useProjectStore((s) => s.isOpen);
  const a = useMenuActions();
  const { handleOpenProject } = useFileOperations();
  // 活动标签改由 uiStore 持有：避免事件已发后组件未挂载导致丢消息
  const activeTab = useUIStore((s) => s.sidebarActiveTab);
  const setActiveTab = useUIStore((s) => s.setSidebarActiveTab);
  const setSettingsIntent = useUIStore((s) => s.setSettingsIntent);

  // 监听来自 AIAssistant / Toolbar 的 "pocketdata:open-ai-config" 事件
  useEffect(() => {
    const handler = () => {
      // 同时设置父级 tab 与子级 intent，确保即使 SettingsTabPanel 后挂载也能命中
      setSettingsIntent("ai");
      setActiveTab("settings");
    };
    window.addEventListener("pocketdata:open-ai-config", handler);
    return () => window.removeEventListener("pocketdata:open-ai-config", handler);
  }, [setActiveTab, setSettingsIntent]);

  // 监听来自 CodeEditor / Toolbar 的 "pocketdata:focus-find" 事件
  useEffect(() => {
    const handler = () => setActiveTab("find");
    window.addEventListener("pocketdata:focus-find", handler);
    return () => window.removeEventListener("pocketdata:focus-find", handler);
  }, [setActiveTab]);

  // 监听 "pocketdata:open-code-settings" 事件 - 打开设置 → 代码编辑
  useEffect(() => {
    const handler = () => {
      setSettingsIntent("code");
      setActiveTab("settings");
    };
    window.addEventListener("pocketdata:open-code-settings", handler);
    return () => window.removeEventListener("pocketdata:open-code-settings", handler);
  }, [setActiveTab, setSettingsIntent]);

  // 检测移动端（用于 PC 端隐藏功能 tab）
  const [isDesktop, setIsDesktop] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    return window.matchMedia("(min-width: 1024px)").matches;
  });
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(min-width: 1024px)");
    const onChange = () => setIsDesktop(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const activeFile = getActiveFile();
  const hasFile = !!activeFile;

  // 检测是否为脚本编辑模式
  const isScriptMode = useFileStore((s) => {
    const tab = s.tabs.find(t => t.id === s.activeTabId);
    return tab?.type === 'script';
  });

  // 打开项目后自动跳转到项目/资源管理器 tab
  const wasProjectOpen = useRef(isProjectOpen);
  useEffect(() => {
    // 仅在项目从"关闭"切换为"打开"时自动跳转（避免干扰用户手动选择）
    if (!wasProjectOpen.current && isProjectOpen) {
      setActiveTab('explorer');
    }
    wasProjectOpen.current = isProjectOpen;
  }, [isProjectOpen]);

  // 切换不同类型标签页时，若当前 tab 已不可用则跳转到第一个可用 tab
  useEffect(() => {
    const isAvailable = (() => {
      switch (activeTab) {
        case 'explorer': return true;
        case 'fileInfo': return hasFile;
        case 'variables': return hasFile;
        case 'outline': return isScriptMode;
        case 'ai': return true;
        case 'ai-history': return true;
        case 'find': return true;
        case 'features': return true;
        default: return true;
      }
    })();
    if (!isAvailable) {
      // 优先级：explorer > ai > ai-history > find > features
      setActiveTab('explorer');
    }
  }, [hasFile, isScriptMode, activeTab, setActiveTab]);

  const handleMenuClick = (key: string) => {
    const map: Record<string, (() => void) | undefined> = {
      open: a.open,
      openProject: a.openProject,
      closeProject: a.closeProject,
      save: a.save,
      saveAs: a.saveAs,
      importData: a.importData,
      exportCSV: a.exportCSV,
      exportExcel: a.exportExcel,
      exportDta: a.exportDta,
      undo: a.undo,
      redo: a.redo,
      cut: a.cut,
      copy: a.copy,
      paste: a.paste,
      find: a.find,
      replace: a.replace,
      describe: a.describe,
      clean: a.clean,
      sort: a.sort,
      filter: a.filter,
      generate: a.generate,
      rename: a.rename,
      scatter: a.scatter,
      line: a.line,
      bar: a.bar,
      pie: a.pie,
      histogram: a.histogram,
      boxplot: a.boxplot,
      graphEditor: a.graphEditor,
      toggleTheme: a.toggleTheme,
      toggleMode: a.toggleMode,
      zoomIn: a.zoomIn,
      zoomOut: a.zoomOut,
      resetZoom: a.resetZoom,
      fullscreen: a.fullscreen,
      correlation: a.correlation,
      regression: a.regression,
      ttest: a.ttest,
      anova: a.anova,
      chisq: a.chisq,
      toggleSidebar: () => useUIStore.getState().toggleSidebar(),
      toggleTerminal: () => useUIStore.getState().toggleTerminal(),
      toggleFormulaBar: () => useUIStore.getState().toggleFormulaBar(),
      toggleStatusBar: () => useUIStore.getState().toggleStatusBar(),
      toggleOutline: () => useUIStore.getState().toggleOutline(),
      docs: a.docs,
      shortcuts: a.shortcuts,
      checkUpdate: a.checkUpdate,
      about: () => navigate("/about"),
    };
    try {
      map[key]?.();
    } catch (err) {
      console.error("[Sidebar] action error:", key, err);
    }
  };

  const handleVariableSelect = (index: number) => {
    if (activeFile) {
      selectColumn(index, activeFile.nobs);
      if (onClose) onClose();
    }
  };

  // 移动端功能区（与 PC 菜单栏 1:1 同步）
  const renderFeaturesMobile = () => {
    const groups: { label: string; icon: any; actions: { icon: any; label: string; key: string }[] }[] = [
      { label: '文件', icon: FileText, actions: [
        { icon: FolderOpen, label: '打开文件', key: 'open' },
        { icon: FolderTree, label: '打开项目', key: 'openProject' },
        { icon: FolderX, label: '关闭项目', key: 'closeProject' },
        { icon: FileText, label: '保存', key: 'save' },
        { icon: FileText, label: '另存为', key: 'saveAs' },
        { icon: FileText, label: '导入', key: 'importData' },
      ]},
      { label: '编辑', icon: Edit3, actions: [
        { icon: Edit3, label: '撤销', key: 'undo' },
        { icon: Edit3, label: '重做', key: 'redo' },
        { icon: Edit3, label: '剪切', key: 'cut' },
        { icon: Edit3, label: '复制', key: 'copy' },
        { icon: Edit3, label: '粘贴', key: 'paste' },
        { icon: Edit3, label: '查找', key: 'find' },
        { icon: Edit3, label: '替换', key: 'replace' },
      ]},
      { label: '数据', icon: Database, actions: [
        { icon: BarChart2, label: '描述统计', key: 'describe' },
        { icon: Database, label: '缺失值处理', key: 'clean' },
        { icon: Database, label: '排序', key: 'sort' },
        { icon: Database, label: '筛选', key: 'filter' },
        { icon: Database, label: '生成变量', key: 'generate' },
        { icon: Database, label: '重命名变量', key: 'rename' },
      ]},
      { label: '图形', icon: BarChart2, actions: [
        { icon: BarChart2, label: '散点图', key: 'scatter' },
        { icon: BarChart2, label: '折线图', key: 'line' },
        { icon: BarChart2, label: '柱状图', key: 'bar' },
        { icon: BarChart2, label: '饼图', key: 'pie' },
        { icon: BarChart2, label: '直方图', key: 'histogram' },
        { icon: BarChart2, label: '箱线图', key: 'boxplot' },
        { icon: BarChart2, label: '图形编辑器', key: 'graphEditor' },
      ]},
      { label: '统计', icon: BarChart2, actions: [
        { icon: BarChart2, label: '描述统计', key: 'describe' },
        { icon: BarChart2, label: '相关性分析', key: 'correlation' },
        { icon: BarChart2, label: '回归分析', key: 'regression' },
        { icon: BarChart2, label: 'T 检验', key: 'ttest' },
        { icon: BarChart2, label: '方差分析', key: 'anova' },
        { icon: BarChart2, label: '卡方检验', key: 'chisq' },
      ]},
      { label: '视图', icon: Eye, actions: [
        { icon: Sun, label: '主题切换', key: 'toggleTheme' },
        { icon: Globe, label: '模式切换', key: 'toggleMode' },
        { icon: Eye, label: '放大', key: 'zoomIn' },
        { icon: Eye, label: '缩小', key: 'zoomOut' },
        { icon: Eye, label: '重置缩放', key: 'resetZoom' },
        { icon: Eye, label: '全屏', key: 'fullscreen' },
      ]},
      { label: '导出', icon: Download, actions: [
        { icon: Download, label: 'CSV', key: 'exportCSV' },
        { icon: Download, label: 'Excel', key: 'exportExcel' },
        { icon: Download, label: 'Stata', key: 'exportDta' },
      ]},
      { label: '窗格', icon: LayoutGrid, actions: [
        { icon: LayoutGrid, label: '左侧边栏', key: 'toggleSidebar' },
        { icon: LayoutGrid, label: '终端抽屉', key: 'toggleTerminal' },
        { icon: LayoutGrid, label: '公式栏', key: 'toggleFormulaBar' },
        { icon: LayoutGrid, label: '状态栏', key: 'toggleStatusBar' },
        { icon: LayoutGrid, label: '大纲面板', key: 'toggleOutline' },
      ]},
      { label: '帮助', icon: HelpCircle, actions: [
        { icon: HelpCircle, label: '使用文档', key: 'docs' },
        { icon: HelpCircle, label: '快捷键参考', key: 'shortcuts' },
        { icon: HelpCircle, label: '检查更新', key: 'checkUpdate' },
        { icon: HelpCircle, label: '关于', key: 'about' },
      ]},
    ];
    return (
      <div className={styles.featuresMobile}>
        {groups.map(g => (
          <div key={g.label} className={styles.featureGroup}>
            <div className={styles.featureGroupLabel}>
              <g.icon size={14} />
              <span>{g.label}</span>
            </div>
            <div className={styles.featureActions}>
              {g.actions.map(act => (
                <button key={act.key} className={styles.featureBtn} onClick={() => handleMenuClick(act.key)}>
                  <act.icon size={14} />
                  <span>{act.label}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <aside
      className={styles.sidebar}
      style={width ? { width: `${width}px`, minWidth: `${width}px` } : undefined}
    >
      {/* 图标标签栏（左侧） */}
      <div className={styles.iconTabBar}>
        <div className={styles.brand} title="PocketData">
          <Logo size={22} className={styles.brandIcon} />
        </div>
        <button
          className={`${styles.iconTab} ${activeTab === 'explorer' ? styles.iconTabActive : ''}`}
          onClick={() => setActiveTab('explorer')}
          title="资源管理器"
        >
          <ListTree size={20} />
        </button>
        {hasFile && (
          <button
            className={`${styles.iconTab} ${activeTab === 'fileInfo' ? styles.iconTabActive : ''}`}
            onClick={() => setActiveTab('fileInfo')}
            title="文件信息"
          >
            <Info size={20} />
          </button>
        )}
        {hasFile && (
          <button
            className={`${styles.iconTab} ${activeTab === 'variables' ? styles.iconTabActive : ''}`}
            onClick={() => setActiveTab('variables')}
            title="变量"
          >
            <ListChecks size={20} />
          </button>
        )}
        {isScriptMode && (
          <button
            className={`${styles.iconTab} ${activeTab === 'outline' ? styles.iconTabActive : ''}`}
            onClick={() => setActiveTab('outline')}
            title="大纲"
          >
            <LayoutGrid size={20} />
          </button>
        )}
        <button
          className={`${styles.iconTab} ${activeTab === 'find' ? styles.iconTabActive : ''}`}
          onClick={() => setActiveTab('find')}
          title="查找替换"
        >
          <Search size={20} />
        </button>
        {/* 功能 tab 仅在移动端可见（PC 端由菜单栏承载） */}
        {!isDesktop && (
          <button
            className={`${styles.iconTab} ${activeTab === 'features' ? styles.iconTabActive : ''}`}
            onClick={() => setActiveTab('features')}
            title="功能（合并：主题 / 模式 / 文档 等）"
          >
            <Sparkles size={20} />
          </button>
        )}
        <button
          className={`${styles.iconTab} ${activeTab === 'settings' ? styles.iconTabActive : ''}`}
          onClick={() => setActiveTab('settings')}
          title="设置（字体 / AI 配置 / 主题）"
        >
          <Settings size={20} />
        </button>
        {/* 末尾固定间距，确保 AI 助手图标是最后一项（不贴底） */}
        <div className={styles.iconTabSpacer} />
        <button
          className={`${styles.iconTab} ${activeTab === 'ai' ? styles.iconTabActive : ''} ${styles.iconTabAi}`}
          onClick={() => startTransition(() => setActiveTab('ai'))}
          title="MellowAgent（AI 助手）"
        >
          <Bot size={20} />
        </button>
        {onClose && (
          <button className={styles.iconTab} onClick={onClose} title="关闭侧边栏">
            <X size={18} />
          </button>
        )}
      </div>

      {/* 内容区 */}
      <div className={styles.contentArea}>
        {/* 顶部 header 区：标签切换标题（顶部按钮已删除：操作改由 ProjectExplorer 底部三按钮工具栏承担） */}
        <div className={styles.topBar}>
          {activeTab === 'explorer' && (
            <span className={styles.topBarTitle}>项目资源</span>
          )}
          {activeTab === 'fileInfo' && <span className={styles.topBarTitle}>文件信息</span>}
          {activeTab === 'variables' && <span className={styles.topBarTitle}>变量</span>}
          {activeTab === 'outline' && <span className={styles.topBarTitle}>大纲</span>}
          {/* AI 标签：使用 AIAssistant 内的统一标题 */}
          {activeTab === 'ai' && <span className={styles.topBarTitle}>MellowAgent</span>}
          {activeTab === 'ai-history' && <span className={styles.topBarTitle}>MellowAgent · 历史会话</span>}
          {activeTab === 'find' && <span className={styles.topBarTitle}>查找替换</span>}
          {activeTab === 'features' && <span className={styles.topBarTitle}>功能</span>}
          {activeTab === 'settings' && <span className={styles.topBarTitle}>设置</span>}
        </div>

        <div className={styles.tabContent}>
          <div style={{ display: activeTab === 'explorer' ? 'flex' : 'none', flex: 1, minHeight: 0, flexDirection: 'column', overflow: 'hidden' }}>
            {isProjectOpen ? (
              <ProjectExplorer onClose={onClose} />
            ) : (
              <div className={styles.explorerEmpty}>
                <FolderOpen size={36} className={styles.explorerEmptyIcon} />
                <div className={styles.explorerEmptyText}>未打开项目</div>
                <button
                  className={styles.explorerEmptyBtn}
                  onClick={() => void handleOpenProject()}
                >
                  <FolderTree size={14} />
                  打开项目
                </button>
              </div>
            )}
          </div>

          <div style={{ display: activeTab === 'fileInfo' && hasFile && activeFile ? 'flex' : 'none', flex: 1, minHeight: 0, flexDirection: 'column', overflow: 'hidden' }}>
            {activeFile && <FileInfoPanel activeFile={activeFile} />}
          </div>

          <div style={{ display: activeTab === 'variables' && hasFile && activeFile ? 'flex' : 'none', flex: 1, minHeight: 0, flexDirection: 'column', overflow: 'hidden' }}>
            {activeFile && <VariableListPanel activeFile={activeFile} onSelect={handleVariableSelect} />}
          </div>

          <div style={{ display: activeTab === 'outline' ? 'flex' : 'none', flex: 1, minHeight: 0, flexDirection: 'column', overflow: 'hidden' }}>
            <div className={styles.section}>
              <div className={styles.outlinePlaceholder}>
                <span className={styles.outlineHint}>打开 Stata/Python 脚本后，此处将显示函数和变量大纲</span>
              </div>
            </div>
          </div>

          <div style={{ display: activeTab === 'ai' ? 'flex' : 'none', flex: 1, minHeight: 0, flexDirection: 'column', overflow: 'hidden' }}>
            <AIAssistant />
          </div>

          <div style={{ display: activeTab === 'ai-history' ? 'flex' : 'none', flex: 1, minHeight: 0, flexDirection: 'column', overflow: 'hidden' }}>
            <AIHistoryPanel />
          </div>

          <div style={{ display: activeTab === 'find' ? 'flex' : 'none', flex: 1, minHeight: 0, flexDirection: 'column', overflow: 'hidden' }}>
            <GlobalFindPanel />
          </div>

          <div style={{ display: activeTab === 'settings' ? 'flex' : 'none', flex: 1, minHeight: 0, flexDirection: 'column', overflow: 'hidden' }}>
            <SettingsTabPanel />
          </div>

          <div style={{ display: activeTab === 'features' ? 'flex' : 'none', flex: 1, minHeight: 0, flexDirection: 'column', overflow: 'hidden' }}>
            {renderFeaturesMobile()}
          </div>
        </div>
      </div>

      {/* 拖拽手柄（侧边栏右边缘） */}
      {onResizeStart && (
        <div
          className={styles.sidebarResizeHandle}
          onMouseDown={onResizeStart}
          title="拖动调整侧边栏宽度"
        />
      )}
    </aside>
  );
}

/** 设置面板（合并自右侧栏）：含导航栏，可切换字体 / 代码编辑 / AI / 主题等子页面 */
function SettingsTabPanel() {
  // 默认 'font'；当 uiStore 携带 settingsIntent 时（如从 AI 助手跳过来），消费一次后切到对应子 tab
  const [active, setActive] = useState<SettingsTabId>("font");
  const intent = useUIStore((s) => s.settingsIntent);
  const consume = useUIStore((s) => s.consumeSettingsIntent);
  useEffect(() => {
    if (intent && (intent === "ai" || intent === "code" || intent === "theme" || intent === "font")) {
      setActive(intent as SettingsTabId);
      consume();
    }
  }, [intent, consume]);
  return (
    <div className={styles.settingsTabPanel} data-pane-id="settings">
      {/* 顶部水平导航栏 */}
      <nav className={styles.settingsNav}>
        {SETTINGS_TABS.map((t) => {
          const Icon = t.Icon;
          return (
            <button
              key={t.id}
              className={`${styles.settingsNavBtn} ${active === t.id ? styles.settingsNavBtnActive : ""}`}
              onClick={() => setActive(t.id)}
              title={t.label}
            >
              <Icon size={13} />
              <span>{t.label}</span>
            </button>
          );
        })}
      </nav>
      <div className={styles.settingsNavContent}>
        <div style={{ display: active === "font" ? 'flex' : 'none', flex: 1, minHeight: 0, flexDirection: 'column', overflow: 'hidden' }}>
          <SettingsPanel />
        </div>
        <div style={{ display: active === "code" ? 'flex' : 'none', flex: 1, minHeight: 0, flexDirection: 'column', overflow: 'hidden' }}>
          <CodeSettingsPanel />
        </div>
        <div style={{ display: active === "ai" ? 'flex' : 'none', flex: 1, minHeight: 0, flexDirection: 'column', overflow: 'hidden' }}>
          <AIConfigPanel />
        </div>
        <div style={{ display: active === "theme" ? 'flex' : 'none', flex: 1, minHeight: 0, flexDirection: 'column', overflow: 'hidden' }}>
          <ThemeSettingsPanel />
        </div>
      </div>
    </div>
  );
}

type SettingsTabId = "font" | "code" | "ai" | "theme";
const SETTINGS_TABS: { id: SettingsTabId; label: string; Icon: React.ComponentType<{ size?: number | string }> }[] = [
  { id: "font", label: "字体", Icon: Type },
  { id: "code", label: "代码编辑", Icon: Code },
  { id: "ai", label: "AI 助手", Icon: Sparkles },
  { id: "theme", label: "主题", Icon: Sun },
];

/** 文件信息面板 */
function FileInfoPanel({ activeFile }: { activeFile: DTAFile }) {
  return (
    <div className={styles.section}>
      <div className={styles.infoList}>
        <div className={styles.infoItem}>
          <span className={styles.label}>名称</span>
          <span className={styles.value} title={activeFile?.path}>
            {activeFile?.name}
          </span>
        </div>
        <div className={styles.infoItem}>
          <span className={styles.label}>路径</span>
          <span className={styles.value} title={activeFile?.path}>
            {activeFile?.path || '无'}
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
        <div className={styles.infoItem}>
          <span className={styles.label}>数据集标签</span>
          <span className={styles.value} title={activeFile?.label || ''}>
            {activeFile?.label || '无'}
          </span>
        </div>
        <div className={styles.infoItem}>
          <span className={styles.label}>编码</span>
          <span className={styles.value}>UTF-8</span>
        </div>
        <div className={styles.infoItem}>
          <span className={styles.label}>修改时间</span>
          <span className={styles.value}>
            {activeFile?.modifiedAt
              ? new Date(activeFile.modifiedAt).toLocaleString('zh-CN', { hour12: false })
              : '—'}
          </span>
        </div>
      </div>
    </div>
  );
}

/** 变量列表面板 */
function VariableListPanel({
  activeFile,
  onSelect,
}: {
  activeFile: DTAFile;
  onSelect: (index: number) => void;
}) {
  const getTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      byte: "数值",
      int: "数值",
      long: "数值",
      float: "浮点",
      double: "双精度",
      string: "字符",
    };
    return labels[type] || type;
  };

  return (
    <div className={`${styles.section} ${styles.variableSection}`}>
      <div className={styles.variableList}>
        {activeFile?.variables.map((variable, index) => (
          <div
            key={variable.name}
            className={styles.variableItem}
            onClick={() => onSelect(index)}
            title={`点击选中 ${variable.name} 列`}
          >
            <span className={styles.varIndex}>{index + 1}</span>
            <div className={styles.varInfo}>
              <span className={styles.varName} title={variable.name}>
                {variable.name}
              </span>
              {variable.label && (
                <span className={styles.varLabel}>{variable.label}</span>
              )}
            </div>
            <span className={`${styles.varType} ${styles[variable.type]}`}>
              {getTypeLabel(variable.type)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
