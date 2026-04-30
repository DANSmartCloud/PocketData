import { useRef, useState, useCallback } from "react";
import { Menu, X } from "lucide-react";
import { useFileStore } from "@/stores/fileStore";
import { Logo } from "@/components/common/Logo";
import styles from "./Header.module.css";

interface HeaderProps {
  onToggleSidebar?: () => void;
  showSidebarButton?: boolean;
  isMobile?: boolean;
}

export function Header({ onToggleSidebar, showSidebarButton = true, isMobile = false }: HeaderProps) {
  const { tabs, setActiveTab, closeTab, reorderTabs } = useFileStore();
  const [draggedTabId, setDraggedTabId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);



  const handleTabClick = useCallback((tabId: string) => {
    setActiveTab(tabId);
  }, [setActiveTab]);

  const handleCloseTab = useCallback((e: React.MouseEvent, tabId: string) => {
    e.stopPropagation();
    closeTab(tabId);
  }, [closeTab]);

  const handleDragStart = useCallback((e: React.DragEvent, tabId: string) => {
    setDraggedTabId(tabId);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", tabId);
  }, []);

  const handleDragEnd = useCallback(() => {
    setDraggedTabId(null);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, targetTabId: string) => {
    e.preventDefault();
    const draggedId = e.dataTransfer.getData("text/plain");

    if (draggedId && draggedId !== targetTabId && containerRef.current) {
      const tabElements = Array.from(containerRef.current.querySelectorAll(`[data-tab-id]`));
      const tabIds = tabElements.map(el => el.getAttribute("data-tab-id") as string);
      const draggedIndex = tabIds.indexOf(draggedId);
      const targetIndex = tabIds.indexOf(targetTabId);

      if (draggedIndex !== -1 && targetIndex !== -1) {
        const newTabIds = [...tabIds];
        newTabIds.splice(draggedIndex, 1);
        newTabIds.splice(targetIndex, 0, draggedId);
        reorderTabs(newTabIds);
      }
    }

    setDraggedTabId(null);
  }, [reorderTabs]);

  return (
    <header className={styles.header}>
      {/* 左侧：Logo 和菜单按钮 */}
      <div className={styles.leftSection}>
        {/* 桌面端侧边栏开关按钮 */}
        {!isMobile && onToggleSidebar && showSidebarButton && (
          <button
            className={styles.menuBtn}
            onClick={onToggleSidebar}
            title="打开侧边栏"
          >
            <Menu size={20} />
          </button>
        )}
        {/* 移动端：点击Logo打开侧边栏 */}
        <div
          className={`${styles.logo} ${isMobile ? styles.logoClickable : ''}`}
          onClick={isMobile && onToggleSidebar ? onToggleSidebar : undefined}
          title={isMobile ? "打开侧边栏" : undefined}
        >
          <Logo size={28} className={styles.logoIcon} />
          <div className={styles.logoTextWrapper}>
            <span className={styles.logoText}>PocketStata</span>
            <span className={styles.versionBadge}>v1.0.0</span>
          </div>
        </div>
      </div>

      {/* 中间：标签页栏 */}
      {tabs.length > 0 && (
        <div className={styles.tabBar} ref={containerRef}>
          <div className={styles.tabList}>
            {tabs.map((tab) => (
              <div
                key={tab.id}
                data-tab-id={tab.id}
                className={`${styles.tab} ${tab.isActive ? styles.active : ""} ${draggedTabId === tab.id ? styles.dragging : ""}`}
                onClick={() => handleTabClick(tab.id)}
                draggable
                onDragStart={(e) => handleDragStart(e, tab.id)}
                onDragEnd={handleDragEnd}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, tab.id)}
              >
                <span className={styles.tabTitle}>{tab.title}</span>
                <button
                  className={styles.closeBtn}
                  onClick={(e) => handleCloseTab(e, tab.id)}
                  title="关闭标签"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </header>
  );
}
