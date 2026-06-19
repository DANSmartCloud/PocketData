import { useState, useRef, useMemo, useEffect } from "react";
import {
  Search,
  Trash2,
  Download,
  MessageSquare,
  Plus,
  X,
  CheckCircle2,
  Edit3,
  Check,
  FileDown,
  FileUp,
  Calendar,
  Hash,
  RefreshCw,
  ChevronLeft,
} from "lucide-react";
import { useAIStore } from "@/stores/aiStore";
import { useUIStore } from "@/stores/uiStore";
import { useNotify } from "@/hooks/useNotify";
import styles from "./AIHistoryPanel.module.css";

/**
 * AI 历史会话独立页面（替代 AIAssistant 内嵌的弹框）。
 *
 * 设计：
 *  - 顶部：标题、搜索、新建、清空
 *  - 工具栏：导出选中 / 导出全部 / 导入 / 清空
 *  - 列表：每个会话一行，显示标题/预览/时间/消息数；hover/选中显示操作按钮（重命名、导出、删除）
 *  - 选中状态：复选框，支持批量导出
 *  - 列表为空：友好提示
 */
export function AIHistoryPanel() {
  const sessions = useAIStore((s) => s.sessions);
  const activeSessionId = useAIStore((s) => s.activeSessionId);
  const switchSession = useAIStore((s) => s.switchSession);
  const deleteSession = useAIStore((s) => s.deleteSession);
  const renameSession = useAIStore((s) => s.renameSession);
  const createSession = useAIStore((s) => s.createSession);
  const exportSessions = useAIStore((s) => s.exportSessions);
  const importSessions = useAIStore((s) => s.importSessions);
  const clearAllSessions = useAIStore((s) => s.clearAllSessions);
  const setActiveTab = useUIStore((s) => s.setSidebarActiveTab);
  const notify = useNotify();

  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const importInputRef = useRef<HTMLInputElement>(null);

  // 列表按 updatedAt 倒序
  const sorted = useMemo(
    () => sessions.slice().sort((a, b) => b.updatedAt - a.updatedAt),
    [sessions]
  );

  // 搜索过滤（标题或首条用户消息）
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter((s) => {
      if (s.title.toLowerCase().includes(q)) return true;
      const firstUser = s.messages.find((m) => m.role === "user")?.content || "";
      return firstUser.toLowerCase().includes(q);
    });
  }, [sorted, search]);

  // 切换选中
  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // 切换到会话：先回到 AI tab
  const openSession = (id: string) => {
    switchSession(id);
    setActiveTab("ai");
    notify("success", "已切换到该会话", 1500);
  };

  // 导出
  const handleExport = (ids?: string[]) => {
    if (ids && ids.length === 0) {
      notify("warning", "未选择任何会话");
      return;
    }
    const json = exportSessions(ids);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const name = ids && ids.length > 0 && ids.length < sessions.length
      ? `mellowagent-sessions-selected-${stamp}.json`
      : `mellowagent-sessions-all-${stamp}.json`;
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    notify(
      "success",
      `已导出 ${ids && ids.length > 0 ? ids.length : sessions.length} 个会话`,
      2000
    );
  };

  // 导入
  const handleImport = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || "");
      const res = importSessions(text);
      if (res.ok) {
        notify("success", `已导入 ${res.added} 个会话`, 2000);
      } else {
        notify("error", `导入失败：${res.error}`);
      }
    };
    reader.readAsText(file);
  };

  // 重命名提交
  const commitRename = (id: string) => {
    const v = renameValue.trim();
    if (v) renameSession(id, v);
    setRenamingId(null);
    setRenameValue("");
  };

  // 清空全部（带二次确认 + 强制输入"确认清空"以防误操作）
  const handleClearAll = () => {
    if (sessions.length === 0) return;
    const ok = window.confirm(
      `⚠️ 危险操作警告\n\n` +
      `您即将清空全部 ${sessions.length} 个历史会话（含所有对话记录、配置、文件等）。\n\n` +
      `此操作不可撤销！删除后所有数据将无法找回，请谨慎操作。\n\n` +
      `点击"确定"继续，点击"取消"放弃。`
    );
    if (!ok) return;
    // 二次确认：必须输入"确认清空"才能继续
    const input = window.prompt(
      `为防止误操作，请输入"确认清空"以继续：\n\n（取消或输入错误将放弃此操作）`
    );
    if (input !== "确认清空") {
      if (input !== null) notify("warning", "已取消清空操作", 1500);
      return;
    }
    clearAllSessions();
    setSelected(new Set());
    notify("success", "已清空全部会话");
  };

  // 单独删除
  const handleDelete = (id: string) => {
    const s = sessions.find((x) => x.id === id);
    if (!s) return;
    const ok = window.confirm(`确定删除会话"${s.title}"？`);
    if (!ok) return;
    deleteSession(id);
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    notify("success", "已删除会话", 1500);
  };

  // 同步：当 sessions 全空时，selection 同步
  useEffect(() => {
    if (sessions.length === 0 && selected.size > 0) setSelected(new Set());
  }, [sessions.length, selected.size]);

  return (
    <div className={styles.container} data-pane-id="ai-history">
      {/* 顶部：返回按钮 + 工具栏（顶栏已经在 sidebar 显示 MellowAgent · 历史会话，此处不重复） */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <button
            className={styles.backBtn}
            onClick={() => setActiveTab("ai")}
            title="返回 AI 助手"
            aria-label="返回 AI 助手"
          >
            <ChevronLeft size={14} />
            <span className={styles.backBtnText}>返回</span>
          </button>
          <button
            className={styles.newBtn}
            onClick={() => {
              createSession();
              setActiveTab("ai");
            }}
            title="新建会话并切换到 AI 助手页"
          >
            <Plus size={13} />
            <span className={styles.newBtnText}>新建</span>
          </button>
        </div>

        <div className={styles.headerRight}>
          <div className={styles.searchBox}>
            <Search size={12} className={styles.searchIcon} />
            <input
              className={styles.searchInput}
              placeholder="搜索…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button
                className={styles.searchClear}
                onClick={() => setSearch("")}
                title="清空搜索"
              >
                <X size={11} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 工具栏 */}
      <div className={styles.toolbar}>
        <div className={styles.toolbarGroup}>
          <button
            className={styles.toolbarBtn}
            onClick={() => handleExport(undefined)}
            disabled={sessions.length === 0}
            title="导出全部会话为 JSON"
          >
            <FileDown size={12} /> 导出全部
          </button>
          <button
            className={styles.toolbarBtn}
            onClick={() => handleExport(Array.from(selected))}
            disabled={selected.size === 0}
            title={`导出选中的 ${selected.size} 个会话`}
          >
            <Download size={12} /> 导出选中
            {selected.size > 0 && <span className={styles.toolbarBadge}>{selected.size}</span>}
          </button>
          <button
            className={styles.toolbarBtn}
            onClick={() => importInputRef.current?.click()}
            title="从 JSON 文件导入会话"
          >
            <FileUp size={12} /> 导入
          </button>
          <input
            ref={importInputRef}
            type="file"
            accept="application/json,.json"
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleImport(f);
              e.target.value = "";
            }}
          />
        </div>

        <div className={styles.toolbarGroup}>
          {selected.size > 0 && (
            <button
              className={styles.toolbarBtn}
              onClick={() => setSelected(new Set())}
              title="取消选择"
            >
              <X size={12} /> 取消选择
            </button>
          )}
          <button
            className={`${styles.toolbarBtn} ${styles.toolbarBtnDanger}`}
            onClick={handleClearAll}
            disabled={sessions.length === 0}
            title="清空全部历史会话"
          >
            <Trash2 size={12} /> 清空全部
          </button>
        </div>
      </div>

      {/* 列表 */}
      <div className={styles.list}>
        {filtered.length === 0 && sessions.length === 0 && (
          <div className={styles.empty}>
            <MessageSquare size={32} className={styles.emptyIcon} />
            <div className={styles.emptyTitle}>暂无历史会话</div>
            <div className={styles.emptyDesc}>
              在 AI 助手页开启一段对话后，会话会自动保存到此处。
            </div>
            <button
              className={styles.emptyBtn}
              onClick={() => {
                createSession();
                setActiveTab("ai");
              }}
            >
              <Plus size={13} /> 开始新会话
            </button>
          </div>
        )}

        {filtered.length === 0 && sessions.length > 0 && (
          <div className={styles.empty}>
            <Search size={28} className={styles.emptyIcon} />
            <div className={styles.emptyTitle}>无匹配会话</div>
            <div className={styles.emptyDesc}>试试更短的关键词或清空搜索。</div>
            <button className={styles.emptyBtn} onClick={() => setSearch("")}>
              <RefreshCw size={12} /> 清空搜索
            </button>
          </div>
        )}

        {filtered.map((s) => {
          const isActive = s.id === activeSessionId;
          const isSelected = selected.has(s.id);
          const preview = (s.messages.find((m) => m.role === "user")?.content || "").slice(0, 80);
          const lastTime = new Date(s.updatedAt);
          return (
            <div
              key={s.id}
              className={`${styles.item} ${isActive ? styles.itemActive : ""} ${isSelected ? styles.itemSelected : ""}`}
            >
              <label className={styles.itemCheck}>
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggleSelect(s.id)}
                  title="选择"
                />
              </label>

              <div className={styles.itemMain} onClick={() => openSession(s.id)}>
                {renamingId === s.id ? (
                  <div className={styles.itemRenameRow}>
                    <input
                      autoFocus
                      className={styles.itemRenameInput}
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitRename(s.id);
                        else if (e.key === "Escape") {
                          setRenamingId(null);
                          setRenameValue("");
                        }
                      }}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <button
                      className={styles.itemRenameOk}
                      onClick={(e) => {
                        e.stopPropagation();
                        commitRename(s.id);
                      }}
                      title="确定"
                    >
                      <Check size={12} />
                    </button>
                  </div>
                ) : (
                  <div className={styles.itemTitleRow}>
                    <span className={styles.itemTitle} title={s.title}>
                      {s.title}
                    </span>
                    {isActive && (
                      <span className={styles.itemActiveBadge}>
                        <CheckCircle2 size={10} /> 当前
                      </span>
                    )}
                  </div>
                )}

                {preview && (
                  <div className={styles.itemPreview} title={preview}>
                    {preview}
                  </div>
                )}

                <div className={styles.itemMeta}>
                  <span className={styles.metaItem} title={lastTime.toLocaleString("zh-CN", { hour12: false })}>
                    <Calendar size={10} />
                    {lastTime.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false })}
                  </span>
                  <span className={styles.metaItem}>
                    <Hash size={10} />
                    {s.messages.length} 条
                  </span>
                </div>
              </div>

              <div className={styles.itemActions}>
                <button
                  className={styles.itemActionBtn}
                  onClick={(e) => {
                    e.stopPropagation();
                    setRenamingId(s.id);
                    setRenameValue(s.title);
                  }}
                  title="重命名"
                >
                  <Edit3 size={12} />
                </button>
                <button
                  className={styles.itemActionBtn}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleExport([s.id]);
                  }}
                  title="导出会话"
                >
                  <Download size={12} />
                </button>
                <button
                  className={`${styles.itemActionBtn} ${styles.itemActionBtnDanger}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(s.id);
                  }}
                  title="删除会话"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
