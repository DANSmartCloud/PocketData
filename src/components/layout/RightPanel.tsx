import { useState, useEffect } from "react";
import { Sparkles, X } from "lucide-react";
import { useUIStore } from "@/stores/uiStore";
import { AIConfigPanel } from "./panels/AIConfigPanel";
import styles from "./RightPanel.module.css";

export type RightPanelTabId = "ai";

const TABS: { id: RightPanelTabId; label: string; Icon: React.ComponentType<{ size?: number | string }> }[] = [
  { id: "ai", label: "AI 配置", Icon: Sparkles as React.ComponentType<{ size?: number | string }> },
];

/**
 * 全局右侧面板
 * - 设置已合并到左侧边栏常驻
 * - 仅保留 AI 配置标签（Deepseek / OpenAI 兼容）
 * - 通过工具栏的"AI"按钮可打开/聚焦
 * - 终端抽屉与右侧面板在 data-area 的同一行 flex 布局里，终端在 contentArea 内，不覆盖右侧面板
 */
export function RightPanel() {
  const rightPanelTab = useUIStore((s) => s.rightPanelTab);
  const setRightPanelTab = useUIStore((s) => s.setRightPanelTab);
  const toggleRightPanel = useUIStore((s) => s.toggleRightPanel);
  const [activeTab, setActiveTab] = useState<RightPanelTabId>(
    (rightPanelTab as RightPanelTabId) || "ai"
  );

  useEffect(() => {
    if (rightPanelTab === "ai") {
      setActiveTab(rightPanelTab as RightPanelTabId);
    }
  }, [rightPanelTab]);

  // 监听"聚焦右侧面板"事件
  useEffect(() => {
    const handler = () => setActiveTab("ai");
    window.addEventListener("pocketdata:focus-right-panel", handler);
    return () => window.removeEventListener("pocketdata:focus-right-panel", handler);
  }, []);

  return (
    <aside className={styles.rightPanel} data-pane-id="right-panel">
      <div className={styles.tabBar}>
        {TABS.map((tab) => {
          const Icon = tab.Icon;
          return (
            <button
              key={tab.id}
              className={`${styles.tab} ${activeTab === tab.id ? styles.tabActive : ""}`}
              onClick={() => {
                setActiveTab(tab.id);
                setRightPanelTab(tab.id);
              }}
              title={tab.label}
            >
              <Icon size={14} />
              <span>{tab.label}</span>
            </button>
          );
        })}
        <button
          className={styles.closeBtn}
          onClick={() => toggleRightPanel()}
          title="关闭右侧面板"
        >
          <X size={14} />
        </button>
      </div>
      <div className={styles.tabContent}>
        {activeTab === "ai" ? <AIConfigPanel /> : null}
      </div>
    </aside>
  );
}
