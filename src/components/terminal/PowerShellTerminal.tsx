import { useState, useRef, useEffect, useCallback, useLayoutEffect, useMemo, forwardRef, useImperativeHandle } from "react";
import {
  Plus,
  X,
  Terminal as TerminalIcon,
  Trash2,
  Loader2,
  ChevronDown,
  Search,
  Copy,
  ClipboardPaste,
  ClipboardCopy,
  Square,
} from "lucide-react";
import { isTauri, invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "@xterm/xterm/css/xterm.css";
import { useUIStore } from "@/stores/uiStore";
import { formatShortcut } from "@/utils/platformShortcut";
import styles from "./PowerShellTerminal.module.css";

/* =====================================================================
 * 终端 session 状态（仅前端元数据；真正的进程在 Rust PTY registry 中）
 * ===================================================================== */
interface TerminalSession {
  id: string;
  name: string;
  alive: boolean;
  /** 后端是否已收到 exit 事件 */
  exited: boolean;
  exitCode: number | null;
  /** 是否正在启动 PTY（避免重复 spawn） */
  starting: boolean;
  /** 起始 cwd */
  cwd: string;
  /** shell 路径（powershell.exe / bash …） */
  shell: string;
}

interface TerminalContext {
  home_dir: string;
  cwd: string;
  username: string;
  is_windows: boolean;
  powershell_path: string;
}

let sessionCounter = 0;

function makeSessionId(): string {
  sessionCounter++;
  return `pty-${Date.now()}-${sessionCounter}`;
}

/* =====================================================================
 * 主题：根据应用 data-theme 给 xterm 提供对应配色
 * ===================================================================== */
function readTheme(): "light" | "dark" {
  if (typeof document === "undefined") return "light";
  // 多重兜底：data-theme 可能在 <html> 或 .app 上
  const root = document.documentElement;
  const app = document.querySelector(".app");
  const v =
    root.getAttribute("data-theme") ??
    app?.getAttribute("data-theme") ??
    root.dataset.theme ??
    "";
  if (v === "dark" || v === "light") return v;
  // 兜底：从 body 计算样式读取真实背景色判断
  try {
    const bg = getComputedStyle(document.body).backgroundColor;
    // #0F172A / rgb(15, 23, 42) → dark；其它（白/浅）→ light
    if (/rgb\(15,\s*23,\s*42\)|rgb\(2,\s*6,\s*23\)|#0[Ff][1-7][7-9A-Fa-f]?[A-Fa-f0-9]?|#020617|#0F172A/i.test(bg)) {
      return "dark";
    }
  } catch { /* noop */ }
  return "light";
}

/**
 * PocketData 专属终端调色板 — 与本软件 UI 风格严格对齐
 *  - 浅色：以 #FFFFFF 为底，#020617 为前景（slate-950，几乎纯黑，对比度 20.6:1）
 *  - 深色：以 #0F172A 为底（与全站 bg-dark 一致），#E2E8F0 为前景，主色 #60A5FA
 *  - 16 色 ANSI 全部取自 Tailwind 调色板，与本软件错误 / 成功 / 警告等
 *    状态色（red-500/600、green-500/600、amber-500/600、purple-500/600 …）保持一致
 *  - 浅色模式所有彩色都偏深（600 级）以确保在白底上的对比度（≥ 4.5:1，WCAG AA）
 */
const POCKET_TERM_DARK: Record<string, string> = {
  background: "#0F172A",
  foreground: "#E2E8F0",
  cursor: "#60A5FA",
  cursorAccent: "#0F172A",
  selectionBackground: "rgba(96, 165, 250, 0.30)",
  // 标准 ANSI
  black: "#0F172A",
  red: "#F87171",
  green: "#4ADE80",
  yellow: "#FBBF24",
  blue: "#60A5FA",
  magenta: "#C084FC",
  cyan: "#22D3EE",
  white: "#E2E8F0",
  // 亮色 ANSI
  brightBlack: "#64748B",
  brightRed: "#FCA5A5",
  brightGreen: "#86EFAC",
  brightYellow: "#FDE68A",
  brightBlue: "#93C5FD",
  brightMagenta: "#D8B4FE",
  brightCyan: "#67E8F9",
  brightWhite: "#F8FAFC",
};

const POCKET_TERM_LIGHT: Record<string, string> = {
  background: "#FFFFFF",
  foreground: "#020617",
  cursor: "#2563EB",
  cursorAccent: "#FFFFFF",
  selectionBackground: "rgba(37, 99, 235, 0.22)",
  // 标准 ANSI（深色 600/700 级，确保对比度）
  black: "#020617",
  red: "#B91C1C",
  green: "#15803D",
  yellow: "#B45309",
  blue: "#1D4ED8",
  magenta: "#7E22CE",
  cyan: "#0E7490",
  white: "#475569",
  // 亮色 ANSI（500 级，颜色更鲜但仍满足 4.5:1 对比度）
  brightBlack: "#334155",
  brightRed: "#DC2626",
  brightGreen: "#16A34A",
  brightYellow: "#CA8A04",
  brightBlue: "#2563EB",
  brightMagenta: "#9333EA",
  brightCyan: "#0891B2",
  brightWhite: "#0F172A",
};

/* 旧名称：保留以防外部 import，值已是 PocketData 色系 */
const XTERM_DARK = POCKET_TERM_DARK;
const XTERM_LIGHT = POCKET_TERM_LIGHT;

/* =====================================================================
 * 暴露给父组件的命令式接口（用于标签页分离/合并时转移终端）
 * ===================================================================== */
export interface TerminalSessionInfo {
  cwd: string;
  shell: string;
}

export interface PowerShellTerminalRef {
  /** 获取当前激活终端的工作目录 */
  getActiveSessionCwd: () => string | null;
  /** 获取所有终端会话信息 */
  getAllSessionInfos: () => TerminalSessionInfo[];
  /** 关闭所有终端会话 */
  closeAllSessions: () => void;
  /** 创建终端会话（用于接收从其他窗口转移过来的终端） */
  createSessionsFromInfos: (infos: TerminalSessionInfo[]) => void;
}

/* =====================================================================
 * 主组件
 * ===================================================================== */
export interface PowerShellTerminalProps {
  defaultHeight?: number;
  minHeight?: number;
  onClose?: () => void;
}

export const PowerShellTerminal = forwardRef<PowerShellTerminalRef, PowerShellTerminalProps>(
function PowerShellTerminal({
  defaultHeight,
  minHeight = 160,
  onClose,
}: PowerShellTerminalProps, ref) {
  const terminalVisible = useUIStore((s) => s.terminalVisible);
  const terminalHeight = useUIStore((s) => s.terminalHeight);
  const setTerminalVisible = useUIStore((s) => s.setTerminalVisible);
  const setTerminalHeight = useUIStore((s) => s.setTerminalHeight);

  const [sessions, setSessions] = useState<TerminalSession[]>([]);
  // sessions 的 ref 镜像，用于在 useCallback（依赖已收敛）内部读取最新值
  // 避免把 sessions 加入依赖 → setSessions 重建回调 → effect 重跑 的循环
  const sessionsRef = useRef<TerminalSession[]>(sessions);
  useEffect(() => { sessionsRef.current = sessions; }, [sessions]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [height, setHeight] = useState(defaultHeight ?? terminalHeight);
  const [isDragging, setIsDragging] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">(readTheme);
  const [termCtx, setTermCtx] = useState<TerminalContext | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; hasSelection: boolean } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const tabsScrollRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef({ y: 0, height: 0 });
  /** xterm 实例：sessionId -> {term, fit, unlistenOut, unlistenExit, el} */
  const termMap = useRef<Map<string, {
    term: XTerm;
    fit: FitAddon;
    el: HTMLDivElement;
    unlistenOut?: UnlistenFn;
    unlistenExit?: UnlistenFn;
  }>>(new Map());

  const visible = terminalVisible;
  const activeSession = useMemo(
    () => sessions.find((s) => s.id === activeSessionId) ?? null,
    [sessions, activeSessionId]
  );

  /* ---------------- 高度同步 ---------------- */
  useEffect(() => {
    if (!defaultHeight) setHeight(terminalHeight);
  }, [terminalHeight, defaultHeight]);

  /* ---------------- 主题同步（多目标监听 + 兜底轮询） ---------------- */
  useEffect(() => {
    // 1. 初次读取
    setTheme(readTheme());

    // 2. MutationObserver 监听多个目标（<html> 与 .app）
    const targets: Element[] = [document.documentElement];
    const app = document.querySelector(".app");
    if (app) targets.push(app);

    const obs = new MutationObserver(() => {
      const next = readTheme();
      setTheme((prev) => (prev === next ? prev : next));
    });
    for (const t of targets) {
      obs.observe(t, { attributes: true, attributeFilter: ["data-theme", "class", "style"] });
    }

    // 3. 兜底轮询（每 800ms 一次）：应对有些场景 data-theme 变化没触发 mutation
    //    （例如某些 Tauri 主题 / 第三方切换器直接操作 CSS 变量）
    const interval = window.setInterval(() => {
      const next = readTheme();
      setTheme((prev) => (prev === next ? prev : next));
    }, 800);

    // 4. 监听 storage 事件（多窗口 / 多 Tab 同步主题）
    const onStorage = (e: StorageEvent) => {
      if (e.key === "pocketdata-theme") {
        const next = readTheme();
        setTheme((prev) => (prev === next ? prev : next));
      }
    };
    window.addEventListener("storage", onStorage);

    // 5. 自定义事件（应用内主题切换广播）
    const onCustom = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail === "light" || detail === "dark") {
        setTheme(detail);
      } else {
        setTheme(readTheme());
      }
    };
    window.addEventListener("pocketdata:theme-change", onCustom as EventListener);

    return () => {
      obs.disconnect();
      window.clearInterval(interval);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("pocketdata:theme-change", onCustom as EventListener);
    };
  }, []);

  /* ---------------- 拉取终端上下文 + 建首个 session ---------------- */
  useEffect(() => {
    let mounted = true;
    let createdInThisEffect = false; // StrictMode 防护：本次 effect 实例是否已创建过
    (async () => {
      let ctx: TerminalContext;
      if (await isTauri()) {
        try {
          ctx = await invoke<TerminalContext>("get_terminal_context");
        } catch {
          ctx = { home_dir: "", cwd: "", username: "user", is_windows: true, powershell_path: "powershell.exe" };
        }
      } else {
        ctx = { home_dir: "", cwd: "", username: "user", is_windows: false, powershell_path: "bash" };
      }
      if (!mounted) return;
      setTermCtx(ctx);
      // 用 sessionsRef 读取最新 sessions，避开闭包陷阱 + StrictMode 双重 effect 导致创建两个
      if (sessionsRef.current.length === 0 && !createdInThisEffect) {
        createdInThisEffect = true;
        const s = createSession(ctx);
        // 首次创建用 index=1（sessions 必为空）
        s.name = `powershell-${nextDisplayIndex(sessionsRef.current)}`;
        sessionsRef.current = [s];
        setSessions([s]);
        setActiveSessionId(s.id);
      }
    })();
    return () => { mounted = false; };
  }, []);

  /* ---------------- 为当前 active session 挂载/卸载 xterm ---------------- */
  // 容器 DOM 元素：当前 active session 对应一个 <div class="xterm-host" />。
  // session 切换时，把不活跃的 term 临时 detach（保持 buffer），活跃的 attach。
  // 用 mountLockRef 防止快速连续切换时竞态：避免旧 session 的 mount 把新 session 覆盖
  const mountLockRef = useRef<string | null>(null);
  useEffect(() => {
    if (!visible || !activeSessionId) return;
    const sid = activeSessionId;
    mountLockRef.current = sid;
    const host = ensureHostElement(sid);
    if (!host) return;
    // ensureXterm 是异步的：创建 xterm + 订阅后端事件 + 启动 PTY
    // 用 rAF 包一层，避免连续 setState 期间重复触发
    const handle = window.requestAnimationFrame(() => {
      if (mountLockRef.current !== sid) return; // 已被新切换抢占，直接放弃
      void ensureXterm(sid, host, termCtx).then((entry) => {
        if (mountLockRef.current !== sid) return;
        if (!entry) return;
        try { entry.fit.fit(); } catch { /* noop */ }
        entry.term.focus();
      });
    });
    return () => {
      window.cancelAnimationFrame(handle);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSessionId, visible]);

  /* ---------------- 确保容器里有对应 session 的 host 元素 ----------------
   * 关键设计：每个 session 对应一个**持久化**的 host div，由 data-pty-host 标识。
   * 切换 tab 时只切换 display，不创建/销毁 host，避免 xterm DOM 错乱。
   * 关闭 session 时由 closeSession 主动 removeChild 清理。
   */
  const ensureHostElement = useCallback((sessionId: string): HTMLDivElement | null => {
    const root = containerRef.current;
    if (!root) return null;
    let host = root.querySelector<HTMLDivElement>(`[data-pty-host="${sessionId}"]`);
    if (!host) {
      host = document.createElement("div");
      host.dataset.ptyHost = sessionId;
      host.className = styles.xtermHost || "";
      host.style.width = "100%";
      host.style.height = "100%";
      root.appendChild(host);
    }
    // 切换显示：只显示当前 active 的 host，隐藏其它
    const all = root.querySelectorAll<HTMLDivElement>("[data-pty-host]");
    all.forEach((el) => {
      el.style.display = (el === host) ? "block" : "none";
    });
    return host;
  }, []);

  /* ---------------- 标签页过多时：把垂直滚轮转为水平滚动 ---------------- */
  // React 的 onWheel 是 passive listener，无法 preventDefault。
  // 这里用 native listener（非 passive）来真正拦截默认行为。
  useEffect(() => {
    const el = tabsScrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      // 仅当水平溢出时拦截，避免普通情况被阻断
      const hasOverflow = el.scrollWidth > el.clientWidth + 1;
      if (!hasOverflow) return;
      // 主滚轮：deltaY；触摸板横向：deltaX；Shift+滚轮：deltaX
      const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (delta === 0) return;
      e.preventDefault();
      // 用 scrollBy 平滑过渡；带 modifier 时加快速度
      const speed = e.shiftKey ? 2.5 : 1;
      el.scrollBy({ left: delta * speed, behavior: "auto" });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel as EventListener);
  }, []);

  /* ---------------- 主题变化时：xterm 重新加载配色 ---------------- */
  useEffect(() => {
    const palette = theme === "dark" ? XTERM_DARK : XTERM_LIGHT;
    for (const { term } of termMap.current.values()) {
      term.options = { theme: palette };
      // 强制刷新整个屏幕（清屏 + 重绘），确保 ANSI 颜色与背景立即生效
      try {
        term.refresh(0, term.buffer.active.length);
      } catch { /* noop */ }
    }
  }, [theme]);

  /* ---------------- 容器尺寸变化：fit 所有 xterm ---------------- */
  useLayoutEffect(() => {
    if (!visible) return;
    let raf = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        for (const { fit } of termMap.current.values()) {
          try { fit.fit(); } catch { /* noop */ }
        }
      });
    });
    if (containerRef.current) ro.observe(containerRef.current);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [visible, activeSessionId]);

  /* ---------------- 拖拽调整高度 ---------------- */
  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    dragStartRef.current = { y: e.clientY, height };
  }, [height]);

  useEffect(() => {
    if (!isDragging) return;
    const handleMouseMove = (e: MouseEvent) => {
      const delta = dragStartRef.current.y - e.clientY;
      const newHeight = Math.max(minHeight, dragStartRef.current.height + delta);
      setHeight(newHeight);
      setTerminalHeight(newHeight);
    };
    const handleMouseUp = () => setIsDragging(false);
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, minHeight, setTerminalHeight]);

  /* ---------------- 关闭/退出 session ---------------- */
  // closingRef 防止快速点击关闭按钮导致多个 closeSession 并发执行
  // （并发执行时 setSessions + setActiveSessionId 可能形成短暂不一致状态）
  const closingRef = useRef<Set<string>>(new Set());
  const closeSession = useCallback(async (id: string) => {
    if (closingRef.current.has(id)) return;
    closingRef.current.add(id);
    // 计算后续状态：当前关闭的是不是 active？sessions 里还有谁？
    // 这里在闭包内同步读取，避免 setSessions 回调里的 setState 形成环
    const wasActive = activeSessionId === id;
    const remainingIds = sessionsRef.current.filter((s) => s.id !== id).map((s) => s.id);
    try {
      // 关 PTY（带超时，避免 Tauri 端 hang 死）
      const entry = termMap.current.get(id);
      if (entry) {
        try { entry.unlistenOut?.(); } catch { /* noop */ }
        try { entry.unlistenExit?.(); } catch { /* noop */ }
        // 先 dispose xterm（同步、立即释放 DOM）
        try { entry.term.dispose(); } catch { /* noop */ }
        termMap.current.delete(id);
      }
      // 清理对应的 xterm-host DOM 元素（之前 ensureHostElement 是 append-only）
      // 否则关闭后 host 残留，切换 activeSessionId 时会把已关闭的 host 又显示出来
      const root = containerRef.current;
      if (root) {
        const dead = root.querySelector(`[data-pty-host="${id}"]`);
        if (dead && dead.parentNode) {
          dead.parentNode.removeChild(dead);
        }
      }
      // 关 PTY 通道 — 不 await 主流程，fire-and-forget + 3s 超时保险
      void Promise.race([
        invoke("pty_close", { id }).catch(() => undefined),
        new Promise<void>((r) => setTimeout(r, 3000)),
      ]);

      // 同步更新 sessions 状态 + 激活下一个
      if (remainingIds.length === 0) {
        // 全部关闭：清空 + 隐藏
        sessionsRef.current = [];
        setSessions([]);
        setActiveSessionId(null);
        setTerminalVisible(false);
      } else {
        sessionsRef.current = sessionsRef.current.filter((s) => s.id !== id);
        setSessions((prev) => prev.filter((s) => s.id !== id));
        if (wasActive) {
          // 切换到剩下的最后一个（与原行为一致：切到尾部）
          const fallbackId = remainingIds[remainingIds.length - 1];
          setActiveSessionId(fallbackId);
        }
      }
    } finally {
      closingRef.current.delete(id);
    }
  }, [activeSessionId, setTerminalVisible]);

  /* ---------------- 新建 session ---------------- */
  const addSession = useCallback(() => {
    if (!termCtx) return;
    const s = createSession(termCtx);
    // 用 nextDisplayIndex 重写 name，确保关闭后不会跳号
    s.name = `powershell-${nextDisplayIndex(sessionsRef.current)}`;
    sessionsRef.current = [...sessionsRef.current, s];
    setSessions((prev) => [...prev, s]);
    setActiveSessionId(s.id);
    // 新建后确保 terminal 可见（用户从外部点 + 时也可能没显示）
    if (!visible) setTerminalVisible(true);
  }, [termCtx, visible, setTerminalVisible]);

  /* ---------------- 暴露命令式接口给父组件 ---------------- */
  useImperativeHandle(ref, () => ({
    getActiveSessionCwd: () => {
      const session = sessionsRef.current.find((s) => s.id === activeSessionId);
      return session?.cwd ?? null;
    },
    getAllSessionInfos: () => {
      return sessionsRef.current.map((s) => ({ cwd: s.cwd, shell: s.shell }));
    },
    closeAllSessions: () => {
      const ids = sessionsRef.current.map((s) => s.id);
      for (const id of ids) {
        void closeSession(id);
      }
    },
    createSessionsFromInfos: (infos: TerminalSessionInfo[]) => {
      if (!termCtx) return;
      for (const info of infos) {
        const s = createSession(termCtx);
        s.cwd = info.cwd || termCtx.cwd;
        s.shell = info.shell || termCtx.powershell_path;
        s.name = `powershell-${nextDisplayIndex(sessionsRef.current)}`;
        sessionsRef.current = [...sessionsRef.current, s];
        setSessions((prev) => [...prev, s]);
        // 最后一个设为 active
        setActiveSessionId(s.id);
      }
      if (infos.length > 0 && !visible) {
        setTerminalVisible(true);
      }
    },
  }), [activeSessionId, closeSession, termCtx, visible, setTerminalVisible]);

  /* ---------------- 启动 PTY 并绑定 xterm ---------------- */
  const ensureXterm = useCallback(async (
    sessionId: string,
    host: HTMLDivElement,
    ctx: TerminalContext | null
  ) => {
    // 已存在 → 直接返回（host 是持久化的，不需要移动 DOM）
    const existing = termMap.current.get(sessionId);
    if (existing) {
      return existing;
    }
    // 第一次创建
    const term = new XTerm({
      fontFamily: '"Maple Mono", "JetBrains Mono", "Cascadia Mono", Consolas, "Courier New", monospace',
      fontSize: 13,
      lineHeight: 1.35,
      cursorBlink: true,
      cursorStyle: "bar",
      allowProposedApi: true,
      scrollback: 5000,
      convertEol: false,
      // 主题由 theme effect 设置
      theme: theme === "dark" ? XTERM_DARK : XTERM_LIGHT,
    });
    const fit = new FitAddon();
    const links = new WebLinksAddon();
    term.loadAddon(fit);
    term.loadAddon(links);
    term.open(host);
    try { fit.fit(); } catch { /* noop */ }
    // 监听 onData：把键盘输入转成 PTY 数据
    const dataDisp = term.onData((d) => {
      // d 可能是 "\r"、"\u0003"、粘贴文本、方向键转义序列…
      invoke("pty_write", { id: sessionId, data: d }).catch(() => undefined);
    });
    // 监听 onResize：把 cols/rows 同步给 PTY
    const resDisp = term.onResize(({ cols, rows }) => {
      invoke("pty_resize", { id: sessionId, cols, rows }).catch(() => undefined);
    });
    // 订阅后端 pty:<id>:out
    let unlistenOut: UnlistenFn | undefined;
    let unlistenExit: UnlistenFn | undefined;
    try {
      unlistenOut = await listen<string>(`pty:${sessionId}:out`, (e) => {
        term.write(e.payload);
      });
      unlistenExit = await listen<number | null>(`pty:${sessionId}:exit`, (e) => {
        // 幂等
        const code = typeof e.payload === "number" ? e.payload : null;
        setSessions((prev) =>
          prev.map((s) => (s.id === sessionId ? { ...s, alive: false, exited: true, exitCode: code } : s))
        );
        if (code !== null) {
          term.writeln(`\r\n\x1b[90m[Process exited with code ${code}]\x1b[0m`);
        } else {
          term.writeln(`\r\n\x1b[90m[Process exited]\x1b[0m`);
        }
      });
    } catch (e) {
      // 非 Tauri 环境（开发预览）
      term.writeln("Tauri PTY 不可用（仅在 Tauri 桌面环境中可用）");
    }
    // 启动 PTY
    const session = sessionsRef.current.find((s) => s.id === sessionId);
    if (session && ctx) {
      try {
        await invoke("pty_spawn", {
          id: sessionId,
          shell: session.shell,
          args: ptyArgsFor(session.shell),
          cwd: session.cwd || null,
        });
        // 启动成功
        setSessions((prev) =>
          prev.map((s) => (s.id === sessionId ? { ...s, starting: false, alive: true } : s))
        );
        // 把当前 cols/rows 同步给 PTY
        try {
          await invoke("pty_resize", {
            id: sessionId,
            cols: term.cols,
            rows: term.rows,
          });
        } catch { /* noop */ }
      } catch (err) {
        term.writeln(`\r\n\x1b[31m无法启动 shell: ${String(err)}\x1b[0m`);
        setSessions((prev) =>
          prev.map((s) => (s.id === sessionId ? { ...s, starting: false, alive: false, exited: true } : s))
        );
      }
    }
    const entry = { term, fit, el: host, unlistenOut, unlistenExit };
    termMap.current.set(sessionId, entry);
    // xterm 的 onData / onResize 返回 IDisposable
    void dataDisp;
    void resDisp;
    return entry;
    // 注意：依赖项刻意只保留 theme。sessions 通过 useRef 读取最新值，
    // 避免 setSessions → 新 array → 重建 ensureXterm → effect 重跑 的循环
  }, [theme]);

  /* ---------------- 关闭时整体清理 ---------------- */
  useEffect(() => {
    if (visible) return;
    // 终端不可见时不动 xterm（DOM 仍在）；卸载时再统一销毁
    return undefined;
  }, [visible]);

  useEffect(() => {
    return () => {
      // 组件卸载：销毁所有 xterm + 关 PTY
      for (const [id, entry] of termMap.current.entries()) {
        try { invoke("pty_close", { id }).catch(() => undefined); } catch { /* noop */ }
        try { entry.unlistenOut?.(); } catch { /* noop */ }
        try { entry.unlistenExit?.(); } catch { /* noop */ }
        try { entry.term.dispose(); } catch { /* noop */ }
      }
      termMap.current.clear();
    };
  }, []);

  /* ---------------- 全局事件：show / new / close / run ---------------- */
  useEffect(() => {
    const handleShow = () => setTerminalVisible(true);
    const handleNew = () => {
      if (!termCtx) return;
      setTerminalVisible(true);
      const s = createSession(termCtx);
      s.name = `powershell-${nextDisplayIndex(sessionsRef.current)}`;
      sessionsRef.current = [...sessionsRef.current, s];
      setSessions((prev) => [...prev, s]);
      setActiveSessionId(s.id);
    };
    const handleClose = () => setTerminalVisible(false);
    const handleRun = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      const cmd: string = detail?.command ?? "";
      if (!cmd || !activeSessionId) return;
      // 写到 PTY（PTY 自带回显 + 提示符）
      invoke("pty_write", { id: activeSessionId, data: cmd + "\r" }).catch(() => undefined);
    };
    window.addEventListener("pocketdata:terminal-show", handleShow);
    window.addEventListener("pocketdata:terminal-new", handleNew);
    window.addEventListener("pocketdata:terminal-close", handleClose);
    window.addEventListener("pocketdata:terminal-run", handleRun as EventListener);
    return () => {
      window.removeEventListener("pocketdata:terminal-show", handleShow);
      window.removeEventListener("pocketdata:terminal-new", handleNew);
      window.removeEventListener("pocketdata:terminal-close", handleClose);
      window.removeEventListener("pocketdata:terminal-run", handleRun as EventListener);
    };
  }, [activeSessionId, termCtx, setTerminalVisible]);

  /* ---------------- 重启已退出的 session ---------------- */
  const restartSession = useCallback(async (id: string) => {
    const entry = termMap.current.get(id);
    if (!entry) return;
    entry.term.clear();
    entry.term.writeln("\x1b[90m[Restarting shell…]\x1b[0m");
    try {
      await invoke("pty_close", { id });
    } catch { /* noop */ }
    // 用 sessionsRef 读取最新值，避免把 sessions 加进依赖项导致循环
    const session = sessionsRef.current.find((s) => s.id === id);
    if (!session || !termCtx) return;
    try {
      await invoke("pty_spawn", {
        id,
        shell: session.shell,
        args: ptyArgsFor(session.shell),
        cwd: session.cwd || null,
      });
      setSessions((prev) =>
        prev.map((s) => (s.id === id ? { ...s, starting: false, alive: true, exited: false, exitCode: null } : s))
      );
      await invoke("pty_resize", { id, cols: entry.term.cols, rows: entry.term.rows });
    } catch (err) {
      entry.term.writeln(`\r\n\x1b[31m重启失败: ${String(err)}\x1b[0m`);
    }
  }, [termCtx]);

  /* ---------------- 清屏 ---------------- */
  const clearActive = useCallback(() => {
    if (!activeSessionId) return;
    termMap.current.get(activeSessionId)?.term.clear();
  }, [activeSessionId]);

  /* ---------------- 滚动到最新输出 ---------------- */
  const scrollToBottom = useCallback(() => {
    if (!activeSessionId) return;
    const entry = termMap.current.get(activeSessionId);
    if (!entry) return;
    entry.term.scrollToBottom();
  }, [activeSessionId]);

  /* ---------------- 右键菜单：复制/粘贴/全选/复制整段 ---------------- */
  useEffect(() => {
    if (!contextMenu) return;
    const handler = () => setContextMenu(null);
    document.addEventListener("click", handler);
    document.addEventListener("scroll", handler, true);
    return () => {
      document.removeEventListener("click", handler);
      document.removeEventListener("scroll", handler, true);
    };
  }, [contextMenu]);

  const handleHostContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const sel = window.getSelection();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      hasSelection: Boolean(sel && sel.toString().length > 0),
    });
  }, []);

  const copySelection = useCallback(async () => {
    if (!activeSessionId) return;
    const term = termMap.current.get(activeSessionId)?.term;
    const sel = term?.getSelection() ?? "";
    if (!sel) return;
    try {
      await navigator.clipboard.writeText(sel);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = sel;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); } catch { /* noop */ }
      document.body.removeChild(ta);
    }
  }, [activeSessionId]);

  const pasteFromClipboard = useCallback(async () => {
    if (!activeSessionId) return;
    let text = "";
    try {
      text = await navigator.clipboard.readText();
    } catch {
      text = window.getSelection()?.toString() ?? "";
    }
    if (text) {
      invoke("pty_write", { id: activeSessionId, data: text }).catch(() => undefined);
    }
  }, [activeSessionId]);

  const copyAllOutput = useCallback(async () => {
    if (!activeSessionId) return;
    const term = termMap.current.get(activeSessionId)?.term;
    if (!term) return;
    // IBuffer 是可迭代的，但没有 .map —— 手工转数组
    const lines: string[] = [];
    const buf = term.buffer.active;
    for (let i = 0; i < buf.length; i++) {
      const line = buf.getLine(i);
      if (line) lines.push(line.translateToString(true));
    }
    const text = lines.join("\n");
    try {
      await navigator.clipboard.writeText(text);
    } catch { /* noop */ }
  }, [activeSessionId]);

  const selectAllOutput = useCallback(() => {
    if (!activeSessionId) return;
    const term = termMap.current.get(activeSessionId)?.term;
    if (!term) return;
    term.selectAll();
  }, [activeSessionId]);

  /* ---------------- 关闭按钮 ---------------- */
  const toggleVisible = useCallback(() => {
    setTerminalVisible(!terminalVisible);
    if (terminalVisible && onClose) onClose();
  }, [terminalVisible, onClose, setTerminalVisible]);

  if (!visible) {
    return <div className={styles.hidden} aria-hidden="true" />;
  }

  return (
    <div className={styles.container} style={{ height }} data-pane-id="terminal">
      <div
        className={`${styles.resizeHandle} ${isDragging ? styles.resizeHandleActive : ""}`}
        onMouseDown={handleDragStart}
        title="拖拽以调整高度"
      >
        <div className={styles.resizeHandleBar} />
      </div>

      <div className={styles.header}>
        <div
          className={styles.tabs}
          ref={tabsScrollRef}
        >
          {sessions.map((s) => (
            <div
              key={s.id}
              className={`${styles.tab} ${s.id === activeSessionId ? styles.tabActive : ""}`}
              onClick={() => setActiveSessionId(s.id)}
              title={s.name + (s.exited ? "（已退出）" : "")}
            >
              <TerminalIcon size={13} />
              <span className={styles.tabName}>{s.name}</span>
              {s.starting && <Loader2 size={11} className={styles.tabSpinner} />}
              {s.exited && <span className={styles.exitedDot} title="已退出" />}
              <button
                className={styles.tabClose}
                onClick={(e) => {
                  e.stopPropagation();
                  void closeSession(s.id);
                }}
                title="关闭终端"
              >
                <X size={12} />
              </button>
            </div>
          ))}
          <button
            className={styles.addTabBtn}
            onClick={addSession}
            title="新建终端"
            aria-label="新建终端"
          >
            <Plus size={14} />
          </button>
        </div>
        <div className={styles.headerActions}>
          {activeSession?.exited && (
            <button
              className={styles.headerBtn}
              onClick={() => activeSession && void restartSession(activeSession.id)}
              title="重启 shell"
              aria-label="重启 shell"
            >
              <Square size={12} />
            </button>
          )}
          <button
            className={styles.headerBtn}
            onClick={clearActive}
            title={`清屏 (${formatShortcut("Ctrl+L")})`}
            aria-label="清屏"
          >
            <Trash2 size={13} />
          </button>
          <button
            className={styles.headerBtn}
            onClick={scrollToBottom}
            title="滚动到底部"
            aria-label="滚动到底部"
          >
            <ChevronDown size={14} />
          </button>
          <button
            className={styles.headerBtn}
            onClick={toggleVisible}
            title="关闭终端"
            aria-label="关闭终端"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      <div
        className={styles.body}
        ref={containerRef}
        onContextMenu={handleHostContextMenu}
      />

      {contextMenu && (
        <div
          className={styles.contextMenu}
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className={styles.contextItem}
            onClick={() => { void copySelection(); setContextMenu(null); }}
            disabled={!contextMenu.hasSelection}
          >
            <span className={styles.contextIcon}><Copy size={13} /></span>
            <span className={styles.contextLabel}>复制</span>
            <span className={styles.contextShortcut}>{formatShortcut("Ctrl+Shift+C")}</span>
          </button>
          <button
            className={styles.contextItem}
            onClick={() => { void pasteFromClipboard(); setContextMenu(null); }}
          >
            <span className={styles.contextIcon}><ClipboardPaste size={13} /></span>
            <span className={styles.contextLabel}>粘贴</span>
            <span className={styles.contextShortcut}>{formatShortcut("Ctrl+Shift+V")}</span>
          </button>
          <div className={styles.contextDivider} />
          <button
            className={styles.contextItem}
            onClick={() => { selectAllOutput(); setContextMenu(null); }}
          >
            <span className={styles.contextIcon}><Search size={13} /></span>
            <span className={styles.contextLabel}>全选</span>
            <span className={styles.contextShortcut}>{formatShortcut("Ctrl+Shift+A")}</span>
          </button>
          <button
            className={styles.contextItem}
            onClick={() => { clearActive(); setContextMenu(null); }}
          >
            <span className={styles.contextIcon}><Trash2 size={13} /></span>
            <span className={styles.contextLabel}>清屏</span>
            <span className={styles.contextShortcut}>{formatShortcut("Ctrl+L")}</span>
          </button>
          <div className={styles.contextDivider} />
          <button
            className={styles.contextItem}
            onClick={() => { void copyAllOutput(); setContextMenu(null); }}
          >
            <span className={styles.contextIcon}><ClipboardCopy size={13} /></span>
            <span className={styles.contextLabel}>复制整个输出</span>
          </button>
        </div>
      )}
    </div>
  );
});

/* =====================================================================
 * 工具
 * ===================================================================== */

function createSession(ctx: TerminalContext): TerminalSession {
  // 内部 sessionCounter 仍然递增（用于 PTY id 唯一性）
  sessionCounter++;
  const id = makeSessionId();
  const isWin = ctx.is_windows;
  const shell = isWin
    ? (ctx.powershell_path || "powershell.exe")
    : (navigator.platform.toLowerCase().includes("mac")
        ? "/bin/zsh"
        : "bash");
  return {
    id,
    // 用户可见的名字：默认 powershell-N
    // （N 由显示层根据"当前已存在的 max"动态计算，避免关闭后编号跳号）
    name: `powershell-${sessionCounter}`,
    alive: false,
    exited: false,
    exitCode: null,
    starting: true,
    cwd: ctx.cwd || ctx.home_dir || "",
    shell,
  };
}

/**
 * 重新计算显示编号：取当前 sessions 中所有 powershell-N 数字的 max + 1。
 * 若没有则从 1 开始。这样关闭中间某个后，新建不会"跳号"，
 * 且不会与现有 N 冲突。
 */
function nextDisplayIndex(sessions: TerminalSession[]): number {
  let max = 0;
  for (const s of sessions) {
    const m = /^powershell-(\d+)$/.exec(s.name);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > max) max = n;
    }
  }
  return max + 1;
}

function ptyArgsFor(shell: string): string[] {
  const s = shell.toLowerCase();
  if (s.includes("powershell") || s.includes("pwsh")) {
    return ["-NoLogo", "-NoExit", "-Command", "$Host.UI.RawUI.WindowTitle = 'PocketData' ; chcp 65001 > $null ; [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 ; Clear-Host"];
  }
  if (s.includes("cmd")) {
    return ["/Q", "/K", "prompt $G"];
  }
  if (s.endsWith("bash") || s.endsWith("/bash") || s.endsWith("zsh") || s.endsWith("/zsh")) {
    return ["-l", "-i"];
  }
  return [];
}
