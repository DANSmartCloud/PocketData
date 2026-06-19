import { useState, useRef, useEffect, useCallback, memo, useMemo } from "react";
import {
  User, Code2, Terminal as TerminalIcon, Hash,
  AlertCircle, Image as ImageIcon, X,
  ChevronDown, Bot, SendHorizontal, Wrench, Settings,
  MessageSquarePlus, History,
  Pencil, Undo2, RefreshCw, Copy, Check, ArrowDown,
  Sparkles, BarChart3, Sigma, BookOpen, FolderOpen,
  Database, LineChart, Globe, Link2, CheckCheck,
  Square, Play, ClipboardPaste,
} from "lucide-react";
import {
  useAIStore, type ChatMessage, AGENT_ROLES, SKILLS, AI_MODEL_PRESETS, PROMPT_SUGGESTIONS,
  type AgentRoleIcon, type SkillIcon, setAbortController,
} from "@/stores/aiStore";
import { useUIStore } from "@/stores/uiStore";
import { useShallow } from "zustand/react/shallow";
import { Logo } from "@/components/common/Logo";
import { ModelIcon } from "./ModelIcon";
import { RichMarkdown } from "@/components/common/RichMarkdown";
import { ContextUsageButton } from "./ContextUsageButton";
import { FloatingDropdown } from "@/components/common/FloatingDropdown";
import { copyRichText, copyRenderedContent } from "@/utils/clipboardUtils";
import styles from "./AIAssistant.module.css";

/* ============================================
   角色 / 技能 图标映射（彩色徽标）
   - 颜色取自 Tailwind 调色板，与全站强调色协调
   ============================================ */
const ROLE_ICON_MAP: Record<AgentRoleIcon, { Icon: typeof Sparkles; color: string; bg: string }> = {
  general:       { Icon: Sparkles,   color: "#2563EB", bg: "rgba(37, 99, 235, 0.10)" },
  dataAnalyst:   { Icon: BarChart3,  color: "#0EA5E9", bg: "rgba(14, 165, 233, 0.10)" },
  statistician:  { Icon: Sigma,      color: "#9333EA", bg: "rgba(147, 51, 234, 0.10)" },
  coder:         { Icon: Code2,      color: "#16A34A", bg: "rgba(22, 163, 74, 0.10)" },
  researcher:    { Icon: BookOpen,   color: "#F59E0B", bg: "rgba(245, 158, 11, 0.10)" },
};

const SKILL_ICON_MAP: Record<SkillIcon, { Icon: typeof Sparkles; color: string; bg: string }> = {
  codeRun:    { Icon: TerminalIcon, color: "#16A34A", bg: "rgba(22, 163, 74, 0.10)" },
  fileOps:    { Icon: FolderOpen,   color: "#F59E0B", bg: "rgba(245, 158, 11, 0.10)" },
  sqlQuery:   { Icon: Database,     color: "#2563EB", bg: "rgba(37, 99, 235, 0.10)" },
  chartDraw:  { Icon: LineChart,    color: "#0EA5E9", bg: "rgba(14, 165, 233, 0.10)" },
  webSearch:  { Icon: Globe,        color: "#9333EA", bg: "rgba(147, 51, 234, 0.10)" },
  webBrowse:  { Icon: Link2,        color: "#DC2626", bg: "rgba(220, 38, 38, 0.10)" },
};

function RoleAvatar({ iconKey, size = 28 }: { iconKey: AgentRoleIcon; size?: number }) {
  const entry = ROLE_ICON_MAP[iconKey] ?? ROLE_ICON_MAP.general;
  const { Icon, color, bg } = entry;
  return (
    <span
      className={styles.roleAvatar}
      style={{
        width: size,
        height: size,
        background: bg,
        color,
      }}
    >
      <Icon size={Math.round(size * 0.55)} strokeWidth={2.2} />
    </span>
  );
}

function SkillAvatar({ iconKey, size = 24 }: { iconKey: SkillIcon; size?: number }) {
  const entry = SKILL_ICON_MAP[iconKey] ?? SKILL_ICON_MAP.codeRun;
  const { Icon, color, bg } = entry;
  return (
    <span
      className={styles.skillAvatar}
      style={{
        width: size,
        height: size,
        background: bg,
        color,
      }}
    >
      <Icon size={Math.round(size * 0.55)} strokeWidth={2.2} />
    </span>
  );
}

/**
 * MellowAgent（米洛助手） - AI 对话面板
 *
 * 设计要点：
 * - 顶栏：模型选择、设置、新建会话、清理、历史
 * - 用户消息：头像+名字在上，话泡在下，整块靠右
 * - AI 消息：头像+名字在上，纯文本流式渲染在下，整块靠左
 * - 支持流式输出（SSE 风格的 fetch stream）
 * - 配置走 useAIStore，支持 Deepseek / OpenAI 兼容 / Ollama
 */
export function AIAssistant() {
  const [input, setInput] = useState("");
  const [images, setImages] = useState<{ id: string; name: string; dataUrl: string }[]>([]);
  const [thinking, setThinking] = useState(false);
  const [showNotReadyHint, setShowNotReadyHint] = useState(false);

  /* ============================================
     全链路优化：合并 Zustand 选择器
     - 12 个独立选择器 → 1 个 useShallow 选择器
     - 减少订阅开销，避免 store 更新时级联重渲染
     - 函数引用（addMessage 等）在 store creator 中定义，引用稳定
     ============================================ */
  const {
    messages, addMessage, appendToMessage, setMessagePending, setMessageError,
    updateMessageContent, truncateFromMessage, config, updateConfig, presets, createSession,
    stopGeneration, setMessageInterrupted, flushAppendBuffer,
  } = useAIStore(useShallow((s) => ({
    messages: s.messages,
    addMessage: s.addMessage,
    appendToMessage: s.appendToMessage,
    setMessagePending: s.setMessagePending,
    setMessageError: s.setMessageError,
    updateMessageContent: s.updateMessageContent,
    truncateFromMessage: s.truncateFromMessage,
    config: s.config,
    updateConfig: s.updateConfig,
    presets: s.presets,
    createSession: s.createSession,
    stopGeneration: s.stopGeneration,
    setMessageInterrupted: s.setMessageInterrupted,
    flushAppendBuffer: s.flushAppendBuffer,
  })));

  // 用 useMemo 计算 ready 状态，替代 isReady() 渲染期调用
  // 避免 isReady 函数引用作为 useCallback 依赖导致回调不稳定
  const ready = useMemo(() => {
    if (config.provider === 'ollama') return Boolean(config.baseUrl && config.model);
    return Boolean(config.apiKey && config.baseUrl && config.model);
  }, [config.provider, config.apiKey, config.baseUrl, config.model]);

  const setActiveTab = useUIStore((s) => s.setSidebarActiveTab);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /* ============================================
     下拉菜单：独立简单状态（避免跨实例级联渲染）
     - 三个 dropdown 各自独立 useState
     - 点击外部关闭由单个全局 mousedown + Esc 监听处理
     - 无需 DropdownRegistry，杜绝订阅/通知循环
     ============================================ */
  const [modelPanelOpen, setModelPanelOpen] = useState(false);
  const [rolePanelOpen, setRolePanelOpen] = useState(false);
  const [skillPanelOpen, setSkillPanelOpen] = useState(false);
  const modelBtnRef = useRef<HTMLButtonElement>(null);
  const modelPanelRef = useRef<HTMLDivElement>(null);
  const roleBtnRef = useRef<HTMLButtonElement>(null);
  const rolePanelRef = useRef<HTMLDivElement>(null);
  const skillBtnRef = useRef<HTMLButtonElement>(null);
  const skillPanelRef = useRef<HTMLDivElement>(null);

  // 共享的关闭外部点击 + Esc 处理（避免三个独立 effect 重复注册全局监听）
  useEffect(() => {
    const isAnyOpen = modelPanelOpen || rolePanelOpen || skillPanelOpen;
    if (!isAnyOpen) return;

    const onPointerDown = (e: MouseEvent) => {
      const t = e.target as Node;
      // 检查是否点在任何 trigger 或 panel 内部
      const inside =
        modelBtnRef.current?.parentElement?.contains(t) ||
        modelPanelRef.current?.contains(t) ||
        roleBtnRef.current?.parentElement?.contains(t) ||
        rolePanelRef.current?.contains(t) ||
        skillBtnRef.current?.parentElement?.contains(t) ||
        skillPanelRef.current?.contains(t);
      if (!inside) {
        setModelPanelOpen(false);
        setRolePanelOpen(false);
        setSkillPanelOpen(false);
      }
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setModelPanelOpen(false);
        setRolePanelOpen(false);
        setSkillPanelOpen(false);
        // 把焦点还给最后一个可见的 trigger
        if (modelPanelOpen) modelBtnRef.current?.focus();
        else if (rolePanelOpen) roleBtnRef.current?.focus();
        else if (skillPanelOpen) skillBtnRef.current?.focus();
      }
    };

    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [modelPanelOpen, rolePanelOpen, skillPanelOpen]);

  // 智能滚动跟随：
  // - isFollowing=true  → 新内容到来时自动滚到底部
  // - 用户主动向上滚动超过阈值 → 取消跟随（停止 auto-scroll，显示"跳到最新"按钮）
  // - 用户重新滚到底部 → 恢复跟随
  const [isFollowing, setIsFollowing] = useState(true);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const FOLLOW_THRESHOLD = 64; // 距离底部小于此值视为"已就位"
  const autoScrollingRef = useRef(false); // 标记当前是否为自动滚动（避免 scroll 事件误判）

  // 监听滚动位置，更新 isFollowing / showJumpToLatest
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      // 自动滚动期间忽略 scroll 事件，避免循环
      if (autoScrollingRef.current) return;
      const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
      const atBottom = distance <= FOLLOW_THRESHOLD;
      setIsFollowing(atBottom);
      setShowJumpToLatest(!atBottom);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  // 内容变化时：若处于跟随态则滚到底部
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (isFollowing) {
      // 标记为自动滚动，scroll 事件处理器将忽略
      autoScrollingRef.current = true;
      const id = window.requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight;
        // 滚动完成后延迟重置标记（等待 scroll 事件触发完毕）
        requestAnimationFrame(() => {
          autoScrollingRef.current = false;
        });
      });
      return () => window.cancelAnimationFrame(id);
    }
  }, [messages, isFollowing]);

  // 一键跳到最新并恢复跟随
  const scrollToLatest = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    setIsFollowing(true);
    setShowJumpToLatest(false);
  }, []);

  // 未连接模型时显示黄色提示
  useEffect(() => {
    setShowNotReadyHint(!ready && messages.length > 0);
  }, [ready, messages.length]);

  // 组件挂载时清理残留的 pending / interrupted 消息
  // 场景：应用在 AI 生成中关闭 → 重启后 messages 中有 pending:true 的消息
  // 但实际没有 fetch 在进行，需要清除这些残留状态
  useEffect(() => {
    const state = useAIStore.getState();
    let dirty = false;
    for (const m of state.messages) {
      if (m.pending || m.interrupted) {
        dirty = true;
        break;
      }
    }
    if (dirty) {
      // 中止残留的 AbortController（如果有）
      stopGeneration();
      // 清除所有消息的 pending / interrupted 标志
      useAIStore.setState((s) => ({
        messages: s.messages.map((m) => ({
          ...m,
          pending: false,
          interrupted: false,
        })),
      }));
    }
  }, []); // 仅挂载时执行一次

  // 组件挂载时清理残留的 pending / interrupted 消息
  // 场景：应用在 AI 生成中关闭 → 重启后 messages 中有 pending:true 的消息
  // isContinue=true 时表示从被中断的位置继续生成（保留已有内容，将其作为 assistant 上下文）
  const runAssistantStream = useCallback(
    async (assistantId: string, isContinue: boolean = false) => {
      const cfg = useAIStore.getState().config;
      setThinking(true);
      const controller = new AbortController();
      setAbortController(controller);
      try {
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };
        if (cfg.provider !== "ollama") {
          headers.Authorization = `Bearer ${cfg.apiKey}`;
        }
        // 角色系统提示覆盖默认 systemPrompt
        const role = AGENT_ROLES.find((r) => r.id === cfg.agentRole);
        const finalSystemPrompt = role?.systemPrompt || cfg.systemPrompt || "";

        const allMessages = useAIStore.getState().messages;
        const payloadMessages: { role: "system" | "user" | "assistant"; content: string }[] = [];
        if (finalSystemPrompt) {
          payloadMessages.push({ role: "system", content: finalSystemPrompt });
        }
        for (const m of allMessages) {
          if (m.id === assistantId) {
            // 继续生成时：把已有 assistant 内容作为上下文传入，让 API 从此处续写
            if (isContinue && m.content) {
              payloadMessages.push({ role: "assistant", content: m.content });
            }
            continue;
          }
          if (m.error) continue;
          if (m.role !== "user" && m.role !== "assistant") continue;
          payloadMessages.push({ role: m.role, content: m.content });
        }

        const body: any = {
          model: cfg.model,
          messages: payloadMessages,
          temperature: cfg.temperature,
          max_tokens: cfg.maxTokens,
          stream: Boolean(cfg.stream),
        };

        const url = `${cfg.baseUrl.replace(/\/+$/, "")}/chat/completions`;
        const res = await fetch(url, {
          method: "POST",
          headers,
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        if (!res.ok) {
          const errText = await res.text();
          throw new Error(`HTTP ${res.status}：${errText.slice(0, 500)}`);
        }

        if (!body.stream || !res.body) {
          const data = await res.json();
          const content: string =
            data?.choices?.[0]?.message?.content ?? data?.choices?.[0]?.text ?? "";
          if (content) appendToMessage(assistantId, content);
          flushAppendBuffer();
          setMessagePending(assistantId, false);
        } else {
          const reader = res.body.getReader();
          const decoder = new TextDecoder("utf-8");
          let buffer = "";
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";
            for (const line of lines) {
              const trimmedLine = line.trim();
              if (!trimmedLine || !trimmedLine.startsWith("data:")) continue;
              const dataStr = trimmedLine.slice(5).trim();
              if (dataStr === "[DONE]") continue;
              try {
                const json = JSON.parse(dataStr);
                const delta: string =
                  json?.choices?.[0]?.delta?.content ??
                  json?.choices?.[0]?.message?.content ??
                  "";
                if (delta) appendToMessage(assistantId, delta);
              } catch {
                /* ignore */
              }
            }
          }
          flushAppendBuffer();
          setMessagePending(assistantId, false);
        }
      } catch (err) {
        flushAppendBuffer();
        if (err instanceof DOMException && err.name === "AbortError") {
          // 用户主动中断：标记为 interrupted（显示"继续生成"按钮），不显示错误
          setMessageInterrupted(assistantId, true);
        } else {
          setMessagePending(assistantId, false);
          setMessageError(
            assistantId,
            err instanceof Error ? err.message : String(err)
          );
        }
      } finally {
        setAbortController(null);
        setThinking(false);
      }
    },
    [appendToMessage, setMessagePending, setMessageError, setMessageInterrupted, flushAppendBuffer]
  );

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || thinking) return;

      addMessage({ role: "user", content: trimmed });
      setInput("");
      setImages([]);

      if (!ready) {
        addMessage({
          role: "assistant",
          content:
            "## 未配置 AI 提供商\n\n请在顶栏点击 **设置** 按钮，前往 **设置 → AI 助手** 配置 API。\n\n" +
            "支持 Deepseek、OpenAI 兼容与本地 Ollama。",
        });
        return;
      }

      const assistantId = addMessage({ role: "assistant", content: "", pending: true });
      void runAssistantStream(assistantId);
    },
    [thinking, ready, addMessage, runAssistantStream]
  );

  // 编辑已发送的用户消息：更新内容 → 删除该消息之后的所有内容 → 重新生成助手回复
  const handleEditUserMessage = useCallback(
    (userId: string, newContent: string) => {
      const trimmed = newContent.trim();
      if (!trimmed) return;
      const msg = useAIStore.getState().messages.find((m) => m.id === userId);
      if (!msg || msg.content === trimmed) return;
      updateMessageContent(userId, trimmed);
      // 删除该用户消息之后的所有内容（包括旧的助手回复）
      truncateFromMessage(userId);
      // 复用下一个槽位作为新的助手消息（这样就保持了上下文连续性）
      if (!ready) {
        addMessage({
          role: "assistant",
          content: "## 未配置 AI 提供商\n\n请在顶栏点击 **设置** 按钮，前往 **设置 → AI 助手** 配置 API。",
        });
        return;
      }
      const assistantId = addMessage({ role: "assistant", content: "", pending: true });
      void runAssistantStream(assistantId);
    },
    [ready, addMessage, updateMessageContent, truncateFromMessage, runAssistantStream]
  );

  // 回退到指定消息发出前：删除该消息及其之后所有内容
  const handleTruncateFrom = useCallback(
    (messageId: string) => {
      truncateFromMessage(messageId);
    },
    [truncateFromMessage]
  );

  // 重新生成指定助手消息：找到其前一条用户消息，重新发起一次请求
  const handleRegenerateAssistant = useCallback(
    (assistantId: string) => {
      const all = useAIStore.getState().messages;
      const idx = all.findIndex((m) => m.id === assistantId);
      if (idx < 0) return;
      // 找到该助手消息之前的最近一条 user 消息
      let userIdx = -1;
      for (let i = idx - 1; i >= 0; i--) {
        if (all[i].role === "user") { userIdx = i; break; }
      }
      if (userIdx < 0) return;
      const userId = all[userIdx].id;
      // 删除助手消息及之后内容，保留用户消息
      truncateFromMessage(assistantId);
      if (!ready) {
        addMessage({
          role: "assistant",
          content: "## 未配置 AI 提供商\n\n请在顶栏点击 **设置** 按钮，前往 **设置 → AI 助手** 配置 API。",
        });
        return;
      }
      const newAssistantId = addMessage({ role: "assistant", content: "", pending: true });
      void runAssistantStream(newAssistantId);
      // userId 保留以避免未使用警告
      void userId;
    },
    [ready, addMessage, truncateFromMessage, runAssistantStream]
  );

  // 停止当前 AI 生成（abort fetch）
  const handleStopGeneration = useCallback(() => {
    stopGeneration();
  }, [stopGeneration]);

  // 继续生成被中断的助手消息：保留已有内容，从断点处续写
  const handleContinueGeneration = useCallback(
    (assistantId: string) => {
      if (thinking) return;
      if (!ready) return;
      // setMessagePending(id, true) 会自动清除 interrupted 标志
      setMessagePending(assistantId, true);
      void runAssistantStream(assistantId, true);
    },
    [thinking, ready, setMessagePending, runAssistantStream]
  );

  // 复制输出
  const handleCopyMessage = useCallback(async (text: string) => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement("textarea");
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
    } catch (e) {
      console.error("[AIAssistant] copy failed", e);
    }
  }, []);

  // 带格式复制输出（等效于网页选中复制，粘贴到 Word 保留格式）
  // 使用 copyRenderedContent：自动处理 KaTeX MathML、Mermaid SVG、代码块底色、表格宽度
  const handleRichCopyMessage = useCallback(async (_text: string, element?: HTMLElement | null) => {
    try {
      if (element) {
        await copyRenderedContent(element);
        return;
      }
    } catch (e) {
      console.error("[AIAssistant] rich copy (DOM) failed, falling back", e);
    }
    // fallback: 使用 marked 将 Markdown 转为 HTML
    try {
      const { marked } = await import("marked");
      marked.setOptions({ gfm: true, breaks: true, async: false });
      const html = marked.parse(_text) as string;
      await copyRichText(html, _text);
    } catch (e) {
      console.error("[AIAssistant] rich copy failed, falling back to plain text", e);
      await handleCopyMessage(_text);
    }
  }, [handleCopyMessage]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void sendMessage(input);
    }
  };

  const openConfig = () => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("pocketdata:open-ai-config"));
    }
  };

  const handlePickImages = () => {
    fileInputRef.current?.click();
  };

  const onImageFiles = (files: FileList | null) => {
    if (!files) return;
    Array.from(files).forEach((f) => {
      if (!f.type.startsWith("image/")) return;
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        setImages((arr) => [...arr, { id: `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, name: f.name, dataUrl }]);
      };
      reader.readAsDataURL(f);
    });
  };

  const toggleSkill = (id: string) => {
    const set = new Set(config.skills);
    if (set.has(id as any)) set.delete(id as any);
    else set.add(id as any);
    updateConfig({ skills: Array.from(set) as any });
  };

  return (
    <div className={styles.container} data-pane-id="ai-assistant">
      {/* 顶栏：MellowAgent 标题(由 Sidebar 顶栏统一显示) + 模型选择 + 设置 + 会话管理 */}
      <div className={styles.topBar}>
        <div className={styles.topBarLeft}>
          {/* 模型选择（用 FloatingDropdown 避免被父级 overflow:hidden 裁剪） */}
          <div className={styles.dropdown}>
            <FloatingDropdown
              minWidth={240}
              maxWidth={340}
              maxHeight={360}
              trigger={({ open, onClick, onKeyDown, buttonRef }) => (
                <button
                  ref={buttonRef}
                  className={`${styles.modelBtn} ${ready ? "" : ""}`}
                  onClick={onClick}
                  onKeyDown={onKeyDown}
                  aria-haspopup="listbox"
                  aria-expanded={open}
                  title={ready ? `当前模型：${config.model || "未选择"}` : "未连接模型：点击配置"}
                >
                  <ModelIcon model={config.model} size={12} className={styles.modelBtnIcon} />
                  <span className={styles.modelBtnLabel}>
                    {config.model || "选择模型"}
                  </span>
                  <ChevronDown size={10} className={open ? styles.chevronOpen : ""} />
                </button>
              )}
            >
              {() => (
                <>
                  <div className={styles.dropdownPanelHeader}>
                    <span>选择模型</span>
                    <small>{config.provider}</small>
                  </div>
                  {(() => {
                    // 合并内置预设 + 已保存配置中的模型（去重）
                    const builtin = AI_MODEL_PRESETS[config.provider] || [];
                    const saved = Array.from(
                      new Set(
                        presets
                          .filter((p) => p.config.provider === config.provider && p.config.model)
                          .map((p) => p.config.model)
                      )
                    );
                    const merged = Array.from(new Set([...builtin, ...saved]));
                    return merged.map((m) => (
                      <button
                        key={m}
                        role="option"
                        aria-selected={config.model === m}
                        className={`${styles.dropdownItem} ${config.model === m ? styles.dropdownItemActive : ""}`}
                        onClick={() => {
                          updateConfig({ model: m });
                          setModelPanelOpen(false);
                        }}
                      >
                        <ModelIcon model={m} size={12} className={styles.modelIconInline} />
                        <span className={styles.dropdownItemText}>{m}</span>
                        {config.model === m && <CheckCheck size={12} className={styles.dropdownItemCheck} />}
                      </button>
                    ));
                  })()}
                  <div className={styles.dropdownDivider} />
                  <button
                    className={styles.dropdownCustom}
                    onClick={() => {
                      openConfig();
                      setModelPanelOpen(false);
                    }}
                  >
                    <Settings size={12} />
                    <span>前往设置配置…</span>
                  </button>
                </>
              )}
            </FloatingDropdown>
          </div>
        </div>

        <div className={styles.topBarRight}>
          {/* 新建会话 */}
          <button
            className={styles.topBarIconBtn}
            onClick={() => createSession()}
            title="新建会话"
          >
            <MessageSquarePlus size={14} />
          </button>

          {/* 跳转到历史会话页（独立页面，不再使用弹框） */}
          <button
            className={styles.topBarIconBtn}
            onClick={() => setActiveTab("ai-history")}
            title="查看历史会话"
          >
            <History size={14} />
          </button>

          {/* 设置 */}
          <button
            className={styles.topBarIconBtn}
            onClick={() => {
              window.dispatchEvent(new CustomEvent('pocketdata:open-ai-config'));
            }}
            title="AI 设置"
          >
            <Settings size={14} />
          </button>
        </div>
      </div>

      {/* 未连接模型黄色提示条（悬浮在编辑框上方） */}
      {showNotReadyHint && (
        <div className={styles.noticeFloat}>
          <AlertCircle size={13} />
          <span>未连接模型，仅提供占位回复。</span>
          <button className={styles.noticeLink} onClick={openConfig}>
            前往设置
          </button>
          <button
            className={styles.noticeClose}
            onClick={() => setShowNotReadyHint(false)}
            title="关闭"
            aria-label="关闭提示"
          >
            <X size={11} />
          </button>
        </div>
      )}

      {/* 消息列表 */}
      <div className={styles.messages} ref={scrollRef}>
        {messages.length === 0 && (
          <div className={styles.welcome}>
            <div className={styles.welcomeLogo}>
              <Logo size={48} />
            </div>
            <h3 className={styles.welcomeTitle}>MellowAgent</h3>
            <p className={styles.welcomeDesc}>
              {ready
                ? "已连接。可以开始对话了。"
                : "你尚未配置 API。在顶栏点击设置前往配置。"}
            </p>
            <div className={styles.suggestionGrid}>
              {PROMPT_SUGGESTIONS.map((s, idx) => {
                // 简易图标映射：第 1 条用 Code2，第 2 条用 TerminalIcon，第 3 条用 Hash
                const Icon = idx === 0 ? Code2 : idx === 1 ? TerminalIcon : Hash;
                return (
                  <button
                    key={s.label}
                    className={styles.suggestionCard}
                    onClick={() => setInput(s.text)}
                    title={s.text}
                  >
                    <Icon size={14} />
                    <span>{s.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {messages.map((m) => (
          <MessageRow
            key={m.id}
            message={m}
            onEditUser={handleEditUserMessage}
            onTruncateFrom={handleTruncateFrom}
            onRegenerate={handleRegenerateAssistant}
            onCopy={handleCopyMessage}
            onRichCopy={handleRichCopyMessage}
            onContinue={handleContinueGeneration}
            disabled={thinking}
          />
        ))}

        {thinking && messages[messages.length - 1]?.pending && (
          <div className={styles.typingIndicator}>
            <span className={styles.typingDot} />
            <span className={styles.typingDot} />
            <span className={styles.typingDot} />
          </div>
        )}

        {showJumpToLatest && (
          <button
            className={styles.jumpToLatestBtn}
            onClick={scrollToLatest}
            title="跳到最新位置并恢复跟随"
            aria-label="跳到最新位置并恢复跟随"
          >
            <ArrowDown size={12} />
            <span>跳到最新</span>
          </button>
        )}
      </div>

      {/* 输入区 */}
      <div className={styles.inputArea}>
        {/* 已选图片预览 */}
        {images.length > 0 && (
          <div className={styles.imageBar}>
            {images.map((img) => (
              <div key={img.id} className={styles.imageChip}>
                <img src={img.dataUrl} alt={img.name} />
                <button onClick={() => setImages((arr) => arr.filter((x) => x.id !== img.id))}>
                  <X size={10} />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className={styles.inputWrap}>
          <textarea
            ref={inputRef}
            className={styles.input}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              ready
                ? "向 MellowAgent 提问…（Enter 发送，Shift+Enter 换行）"
                : "请先在 设置 → AI 助手 中配置 API"
            }
            rows={2}
            disabled={thinking}
          />
          <div className={styles.inputToolbar}>
            <div className={styles.inputToolbarLeft}>
              {/* 角色选择 */}
              <div className={styles.dropdown}>
                <button
                  ref={roleBtnRef}
                  className={styles.toolBtn}
                  onClick={() => setRolePanelOpen((v) => !v)}
                  title="Agent 角色"
                >
                  <Bot size={11} />
                  <span className={styles.toolBtnLabel}>
                    {AGENT_ROLES.find((r) => r.id === config.agentRole)?.label || "角色"}
                  </span>
                </button>
                {rolePanelOpen && (
                  <div
                    ref={rolePanelRef}
                    className={`${styles.dropdownPanel} ${styles.dropdownPanelTop}`}
                    role="listbox"
                    aria-label="选择 Agent 角色"
                  >
                    <div className={styles.dropdownPanelHeader}>
                      <span>选择 Agent 角色</span>
                      <small>系统提示词</small>
                    </div>
                    {AGENT_ROLES.map((r) => {
                      const active = config.agentRole === r.id;
                      return (
                        <button
                          key={r.id}
                          role="option"
                          aria-selected={active}
                          className={`${styles.roleItem} ${active ? styles.dropdownItemActive : ""}`}
                          onClick={() => {
                            updateConfig({ agentRole: r.id });
                            setRolePanelOpen(false);
                          }}
                          title={r.desc}
                        >
                          <RoleAvatar iconKey={r.icon} size={28} />
                          <span className={styles.roleItemBody}>
                            <strong className={styles.roleItemTitle}>{r.label}</strong>
                            <small className={styles.roleItemDesc}>{r.desc}</small>
                          </span>
                          {active && <CheckCheck size={12} className={styles.dropdownItemCheck} />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Skill 多选 */}
              <div className={styles.dropdown}>
                <button
                  ref={skillBtnRef}
                  className={styles.toolBtn}
                  onClick={() => setSkillPanelOpen((v) => !v)}
                  title="技能"
                >
                  <Wrench size={11} />
                  <span className={styles.toolBtnLabel}>
                    技能{config.skills.length > 0 ? ` (${config.skills.length})` : ""}
                  </span>
                </button>
                {skillPanelOpen && (
                  <div
                    ref={skillPanelRef}
                    className={`${styles.dropdownPanel} ${styles.dropdownPanelTop}`}
                    role="listbox"
                    aria-label="选择技能"
                  >
                    <div className={styles.dropdownPanelHeader}>
                      <span>选择技能</span>
                      <small>{config.skills.length}/{SKILLS.length} 启用</small>
                    </div>
                    {SKILLS.map((s) => {
                      const on = config.skills.includes(s.id as any);
                      return (
                        <button
                          key={s.id}
                          role="option"
                          aria-selected={on}
                          className={`${styles.skillItem} ${on ? styles.dropdownItemActive : ""}`}
                          onClick={() => toggleSkill(s.id)}
                          title={s.desc}
                        >
                          <SkillAvatar iconKey={s.icon} size={24} />
                          <span className={styles.roleItemBody}>
                            <strong className={styles.roleItemTitle}>{s.label}</strong>
                            <small className={styles.roleItemDesc}>{s.desc}</small>
                          </span>
                          <span className={`${styles.skillToggle} ${on ? styles.skillToggleOn : ""}`}>
                            {on ? <Check size={10} /> : null}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* 图片上传 */}
              <button
                className={styles.toolBtn}
                onClick={handlePickImages}
                title="上传图片"
                disabled={!config.enableImages}
              >
                <ImageIcon size={11} />
                <span className={styles.toolBtnLabel}>图片</span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                style={{ display: "none" }}
                onChange={(e) => onImageFiles(e.target.files)}
              />

              {/* 上下文使用率按钮（点击查看详情） */}
              <ContextUsageButton config={config} messages={messages} />
            </div>
            <div className={styles.inputToolbarRight}>
              {thinking ? (
                <button
                  className={styles.stopBtn}
                  onClick={handleStopGeneration}
                  title="停止生成"
                >
                  <Square size={11} fill="currentColor" />
                </button>
              ) : (
                <button
                  className={styles.sendBtn}
                  onClick={() => void sendMessage(input)}
                  disabled={!input.trim()}
                  title="发送（Enter）"
                >
                  <SendHorizontal size={13} />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

interface MessageRowProps {
  message: ChatMessage;
  onEditUser: (id: string, content: string) => void;
  onTruncateFrom: (id: string) => void;
  onRegenerate: (id: string) => void;
  onCopy: (text: string) => void;
  onRichCopy: (text: string, element?: HTMLElement | null) => void;
  onContinue: (id: string) => void;
  disabled?: boolean;
}

function MessageRowRaw({
  message,
  onEditUser,
  onTruncateFrom,
  onRegenerate,
  onCopy,
  onRichCopy,
  onContinue,
  disabled,
}: MessageRowProps) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(message.content);
  const [copied, setCopied] = useState(false);
  const [richCopied, setRichCopied] = useState(false);
  const assistantContentRef = useRef<HTMLDivElement>(null);

  // 同步外部内容到本地编辑缓冲（流式输出时）
  useEffect(() => {
    if (!editing) setEditValue(message.content);
  }, [message.content, editing]);

  const onCopyClick = async () => {
    await onCopy(message.content);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };

  const onRichCopyClick = async () => {
    await onRichCopy(message.content, assistantContentRef.current);
    setRichCopied(true);
    window.setTimeout(() => setRichCopied(false), 1200);
  };

  if (message.role === "user") {
    return (
      <div className={styles.userRow}>
        <div className={styles.userMeta}>
          <div className={styles.userName}>我</div>
          <div className={styles.userAvatar}>
            <User size={12} />
          </div>
        </div>
        {editing ? (
          <div className={styles.userEditWrap}>
            <textarea
              className={styles.userEditInput}
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  onEditUser(message.id, editValue);
                  setEditing(false);
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  setEditing(false);
                  setEditValue(message.content);
                }
              }}
            />
            <div className={styles.userEditActions}>
              <button
                className={styles.userEditSave}
                onClick={() => {
                  onEditUser(message.id, editValue);
                  setEditing(false);
                }}
                disabled={disabled || !editValue.trim()}
              >
                保存并重新生成
              </button>
              <button
                className={styles.userEditCancel}
                onClick={() => {
                  setEditing(false);
                  setEditValue(message.content);
                }}
              >
                取消
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className={styles.userBubble}>
              <div className={styles.userBubbleText}>{message.content}</div>
            </div>
            <div className={styles.messageActions}>
              <button
                className={styles.actionBtn}
                onClick={() => setEditing(true)}
                title="修改已发送的消息"
              >
                <Pencil size={11} />
                <span>修改</span>
              </button>
              <button
                className={styles.actionBtn}
                onClick={() => onTruncateFrom(message.id)}
                title="回退到这条消息发出前（删除该消息及之后所有内容）"
              >
                <Undo2 size={11} />
                <span>回退</span>
              </button>
              <button
                className={styles.actionBtn}
                onClick={onCopyClick}
                title="复制这条消息"
              >
                {copied ? <Check size={11} /> : <Copy size={11} />}
                <span>{copied ? "已复制" : "复制"}</span>
              </button>
            </div>
          </>
        )}
      </div>
    );
  }
  // 助手消息
  return (
    <div className={styles.assistantRow}>
      <div className={styles.assistantMeta}>
        <div className={styles.assistantAvatar}>
          <Logo size={16} />
        </div>
        <div className={styles.assistantName}>MellowAgent</div>
      </div>
      <div className={styles.assistantContent} ref={assistantContentRef}>
        {message.error ? (
          <div className={styles.assistantError}>
            <AlertCircle size={12} /> {message.error}
          </div>
        ) : (
          <RichMarkdown text={message.content} streaming={message.pending} />
        )}
        {message.pending && <span className={styles.cursor} />}
      </div>
      {/* 被用户中断时：显示"继续生成"按钮 */}
      {message.interrupted && !message.pending && (
        <div className={styles.messageActions}>
          <button
            className={styles.continueBtn}
            onClick={() => onContinue(message.id)}
            disabled={disabled}
            title="从中断处继续生成"
          >
            <Play size={11} />
            <span>继续生成</span>
          </button>
        </div>
      )}
      {/* 正常完成时：显示复制 + 带格式复制 + 重新生成 */}
      {!message.pending && !message.error && !message.interrupted && message.content && (
        <div className={styles.messageActions}>
          <button
            className={styles.actionBtn}
            onClick={onCopyClick}
            title="复制输出"
          >
            {copied ? <Check size={11} /> : <Copy size={11} />}
            <span>{copied ? "已复制" : "复制"}</span>
          </button>
          <button
            className={styles.actionBtn}
            onClick={onRichCopyClick}
            title="带格式复制（粘贴到 Word 保留格式）"
          >
            {richCopied ? <Check size={11} /> : <ClipboardPaste size={11} />}
            <span>{richCopied ? "已复制" : "带格式复制"}</span>
          </button>
          <button
            className={styles.actionBtn}
            onClick={() => onRegenerate(message.id)}
            disabled={disabled}
            title="基于相同用户输入重新生成"
          >
            <RefreshCw size={11} />
            <span>重新生成</span>
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * MessageRow 的 React.memo 包装
 *
 * 设计要点（解决"切换历史会话卡死"）：
 *  - 默认浅比较：message 对象引用变了才重渲
 *  - 父组件传入的 onEditUser / onTruncateFrom / onRegenerate / onCopy 用 useCallback
 *  - 关键：message.content 变化（流式输出）也要重渲，所以自定义比较函数
 *    仅在 content / pending / error / id 变化时放行
 *  - 这避免了"切换会话时所有 MessageRow 全部重渲"（包括 Mermaid 重新渲染）
 */
const MessageRow = memo(MessageRowRaw, (prev, next) => {
  return (
    prev.message.id === next.message.id &&
    prev.message.content === next.message.content &&
    prev.message.pending === next.message.pending &&
    prev.message.error === next.message.error &&
    prev.message.interrupted === next.message.interrupted &&
    prev.disabled === next.disabled &&
    prev.onEditUser === next.onEditUser &&
    prev.onTruncateFrom === next.onTruncateFrom &&
    prev.onRegenerate === next.onRegenerate &&
    prev.onCopy === next.onCopy &&
    prev.onRichCopy === next.onRichCopy &&
    prev.onContinue === next.onContinue
  );
});

/**
 * 历史：早期版本内嵌过自定义 MarkdownLite 渲染（不支持 Mermaid/LaTeX）。
 * 现已统一迁移到共享组件 `RichMarkdown`，点击图表/公式即可放大。
 */
