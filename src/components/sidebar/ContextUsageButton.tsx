import { useMemo, useState, useRef, useEffect } from "react";
import {
  getContextWindow, getModelPricing, estimateTokens, USD_TO_CNY,
  type AIConfig, type ChatMessage,
} from "@/stores/aiStore";
import { Zap, Coins, Calculator, ChevronRight } from "lucide-react";
import styles from "./ContextUsageButton.module.css";

/**
 * 上下文使用率按钮
 *
 * 设计要点：
 *  - 紧凑显示：24px 圆形按钮，环形进度条直观展示使用率
 *  - 颜色梯度：< 60% 绿、60-85% 琥珀、> 85% 红（可点击压缩）
 *  - 悬停 tooltip：显示具体数值（如 "12,345 / 128,000 tokens · 9.6%"）
 *  - 点击展开 popover：完整 token 统计 + 计费估算
 *  - 数字使用 useMemo 缓存，避免每次重渲都重算
 *  - 关键：props 由父组件传入，避免独立订阅 store 导致双重重渲染
 */

interface ContextUsageButtonProps {
  config: AIConfig;
  messages: ChatMessage[];
}

export function ContextUsageButton({ config, messages }: ContextUsageButtonProps) {
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; bottom: number } | null>(null);

  // 估算当前上下文 token 用量（含 system prompt + 所有历史消息）
  const stats = useMemo(() => {
    const role = config.systemPrompt || "";
    const sysTokens = estimateTokens(role);
    let userTokens = 0;
    let assistantTokens = 0;
    let userCount = 0;
    let assistantCount = 0;
    for (const m of messages) {
      const t = estimateTokens(m.content);
      if (m.role === "user") {
        userTokens += t;
        userCount++;
      } else if (m.role === "assistant") {
        assistantTokens += t;
        assistantCount++;
      }
    }
    const total = sysTokens + userTokens + assistantTokens;
    const window = getContextWindow(config.model, config.provider);
    const pct = Math.min(100, (total / window) * 100);
    return {
      systemTokens: sysTokens,
      userTokens,
      assistantTokens,
      userCount,
      assistantCount,
      total,
      window,
      pct,
    };
  }, [messages, config.model, config.provider, config.systemPrompt]);

  // 计费估算（input=系统+用户，output=助手，按 USD→CNY 汇率换算为 RMB）
  const pricing = useMemo(() => getModelPricing(config.model), [config.model]);
  const cost = useMemo(() => {
    if (!pricing) return null;
    const inputTokens = stats.systemTokens + stats.userTokens;
    const outputTokens = stats.assistantTokens;
    const inputCNY = ((inputTokens / 1_000_000) * pricing.input) * USD_TO_CNY;
    const outputCNY = ((outputTokens / 1_000_000) * pricing.output) * USD_TO_CNY;
    return {
      input: inputCNY,
      output: outputCNY,
      total: inputCNY + outputCNY,
    };
  }, [pricing, stats]);

  // 颜色档位
  const colorTier = useMemo(() => {
    if (stats.pct >= 85) return "danger";
    if (stats.pct >= 60) return "warn";
    return "ok";
  }, [stats.pct]);

  // 计算 popover 位置
  useEffect(() => {
    if (!open || !triggerRef.current) {
      setPos(null);
      return;
    }
    const rect = triggerRef.current.getBoundingClientRect();
    setPos({
      left: rect.left + rect.width / 2,
      bottom: window.innerHeight - rect.top + 8,
    });
  }, [open]);

  // 点击外部关闭
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t)) return;
      if (popoverRef.current?.contains(t)) return;
      setOpen(false);
    };
    window.addEventListener("mousedown", onDown, true);
    return () => window.removeEventListener("mousedown", onDown, true);
  }, [open]);

  // Esc 关闭
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open]);

  // 环形进度条 SVG 参数
  // 缩小为原本的 1/2（22 → 11），更紧凑不抢眼
  const SIZE = 11;
  const STROKE = 1.6;
  const R = (SIZE - STROKE) / 2;
  const C = 2 * Math.PI * R;
  const dash = (stats.pct / 100) * C;

  const fmt = (n: number) =>
    n >= 10000 ? `${(n / 1000).toFixed(1)}k` : n.toLocaleString();

  // 把"按钮（纯圆形）+ 数字浮标"包在一个 inline-flex 容器里，
  // 这样整个组件可以像原子单位一样放在父级 flex 布局中
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 0 }}>
      <button
        ref={triggerRef}
        type="button"
        className={`${styles.trigger} ${styles[colorTier]}`}
        onClick={() => setOpen((v) => !v)}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        title={`${fmt(stats.total)} / ${fmt(stats.window)} tokens · ${stats.pct.toFixed(1)}%`}
        aria-label="查看上下文使用详情"
        aria-expanded={open}
      >
        <svg
          className={styles.ring}
          width={SIZE}
          height={SIZE}
          viewBox={`0 0 ${SIZE} ${SIZE}`}
        >
          {/* 背景圈 */}
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={R}
            fill="none"
            stroke="currentColor"
            strokeWidth={STROKE}
            className={styles.ringBg}
          />
          {/* 进度圈 */}
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={R}
            fill="none"
            stroke="currentColor"
            strokeWidth={STROKE}
            className={styles.ringFg}
            strokeDasharray={`${dash} ${C}`}
            strokeDashoffset="0"
            strokeLinecap="round"
            transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
          />
        </svg>
        {hovered && !open && (
          <span className={styles.tooltip}>
            {fmt(stats.total)} / {fmt(stats.window)} tokens · {stats.pct.toFixed(1)}%
          </span>
        )}
      </button>
      <span
        className={`${styles.pctBadge} ${styles[colorTier]}`}
        onClick={() => setOpen((v) => !v)}
        style={{ cursor: "pointer" }}
        title="点击查看详情"
      >
        {Math.round(stats.pct)}%
      </span>

      {open && pos && (
        <div
          ref={popoverRef}
          className={styles.popover}
          role="dialog"
          aria-label="上下文使用详情"
          style={{ left: pos.left, bottom: pos.bottom }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className={styles.popoverArrow} />
          <div className={styles.popoverHeader}>
            <Zap size={13} className={styles.popoverHeaderIcon} />
            <span>上下文使用详情</span>
            <span className={`${styles.tierBadge} ${styles[`badge_${colorTier}`]}`}>
              {colorTier === "danger" ? "拥挤" : colorTier === "warn" ? "偏多" : "健康"}
            </span>
          </div>

          <div className={styles.popoverBody}>
            {/* 主进度 */}
            <div className={styles.mainRow}>
              <div className={styles.mainProgress}>
                <div
                  className={`${styles.mainBar} ${styles[`bar_${colorTier}`]}`}
                  style={{ width: `${Math.min(100, stats.pct)}%` }}
                />
              </div>
              <div className={styles.mainNumbers}>
                <strong>{fmt(stats.total)}</strong>
                <span> / {fmt(stats.window)}</span>
              </div>
            </div>

            {/* 详细分项 */}
            <div className={styles.breakdown}>
              <div className={styles.breakdownRow}>
                <span className={styles.breakdownLabel}>
                  <span className={`${styles.breakdownDot} ${styles.dotSystem}`} />
                  系统提示
                </span>
                <span className={styles.breakdownValue}>
                  {fmt(stats.systemTokens)} <small>tokens</small>
                </span>
              </div>
              <div className={styles.breakdownRow}>
                <span className={styles.breakdownLabel}>
                  <span className={`${styles.breakdownDot} ${styles.dotUser}`} />
                  用户消息 ({stats.userCount})
                </span>
                <span className={styles.breakdownValue}>
                  {fmt(stats.userTokens)} <small>tokens</small>
                </span>
              </div>
              <div className={styles.breakdownRow}>
                <span className={styles.breakdownLabel}>
                  <span className={`${styles.breakdownDot} ${styles.dotAssistant}`} />
                  助手回复 ({stats.assistantCount})
                </span>
                <span className={styles.breakdownValue}>
                  {fmt(stats.assistantTokens)} <small>tokens</small>
                </span>
              </div>
            </div>

            {/* 计费 */}
            <div className={styles.billingSection}>
              <div className={styles.billingTitle}>
                <Coins size={11} /> 计费估算
                {!pricing && <span className={styles.billingNote}>（该模型未列出定价）</span>}
              </div>
              {cost ? (
                <div className={styles.billingGrid}>
                  <div className={styles.billingItem}>
                    <span className={styles.billingLabel}>输入</span>
                    <span className={styles.billingValue}>
                      ¥{cost.input.toFixed(6)}
                    </span>
                  </div>
                  <div className={styles.billingItem}>
                    <span className={styles.billingLabel}>输出</span>
                    <span className={styles.billingValue}>
                      ¥{cost.output.toFixed(6)}
                    </span>
                  </div>
                  <div className={`${styles.billingItem} ${styles.billingItemTotal}`}>
                    <span className={styles.billingLabel}>累计</span>
                    <span className={styles.billingValue}>
                      <strong>¥{cost.total.toFixed(6)}</strong>
                    </span>
                  </div>
                </div>
              ) : (
                <div className={styles.billingFree}>
                  <Calculator size={11} /> 本地模型 / 未列价模型：免费
                </div>
              )}
            </div>

            {/* 提示 */}
            {colorTier !== "ok" && (
              <div className={`${styles.warning} ${styles[`warn_${colorTier}`]}`}>
                {colorTier === "warn"
                  ? "上下文偏长，建议适时开启新会话以保持响应质量。"
                  : "上下文接近上限，新会话可避免超限截断。"}
                <ChevronRight size={11} />
              </div>
            )}
          </div>
        </div>
      )}
    </span>
  );
}
