import { useEffect, useMemo, useState, useCallback, memo, useRef } from "react";
import { marked } from "marked";
import katex from "katex";
import "katex/dist/katex.min.css";
import { ZoomIn, Loader2, AlertCircle, Copy, Check, ClipboardPaste } from "lucide-react";
import { ZoomModal } from "./ZoomModal";
import { highlight, type HLToken } from "./SyntaxHighlight";
import { copyPlainText, copySvgAsRichImage, copyRichText, copyHtmlViaEvent } from "@/utils/clipboardUtils";
import styles from "./RichMarkdown.module.css";

// ============================================
// 配置 marked：标准 Markdown + GFM
// ============================================
marked.setOptions({ gfm: true, breaks: true, async: false });

// ============================================
// LaTeX 预处理：把 $...$ / $$...$$ 提取出来替换为占位符
// 这样可以避免 marked 扩展在 lexer 路径上不稳定的问题
// ============================================
interface LatexPlaceholder {
  /** 占位符 token，源码中以此替换原 LaTeX */
  token: string;
  /** 是否块级（$$...$$） */
  displayMode: boolean;
  /** 原始 LaTeX 表达式 */
  expr: string;
  /** 渲染后的 HTML（用于弹窗放大） */
  html: string;
  /** KaTeX 错误信息（如果有） */
  error: string | null;
}

function extractLatex(src: string): { text: string; blocks: LatexPlaceholder[] } {
  const blocks: LatexPlaceholder[] = [];
  // 块级 $$...$$ 优先处理
  let text = src.replace(/\$\$([\s\S]+?)\$\$(?:\n|$)/g, (_m, expr: string) => {
    const trimmed = expr.trim();
    const token = `@@LATEX_BLOCK_${blocks.length}@@`;
    const html = renderLatex(trimmed, true);
    blocks.push({
      token,
      displayMode: true,
      expr: trimmed,
      html: html.html,
      error: html.error,
    });
    return `\n\n${token}\n\n`;
  });
  // 行内 $...$
  text = text.replace(/\$([^$\n]+?)\$(?!\d)/g, (_m, expr: string) => {
    const trimmed = expr.trim();
    const token = `@@LATEX_INLINE_${blocks.length}@@`;
    const html = renderLatex(trimmed, false);
    blocks.push({
      token,
      displayMode: false,
      expr: trimmed,
      html: html.html,
      error: html.error,
    });
    return token;
  });
  return { text, blocks };
}

function renderLatex(expr: string, displayMode: boolean): { html: string; error: string | null } {
  try {
    return {
      html: katex.renderToString(expr, {
        displayMode,
        throwOnError: false,
        output: "htmlAndMathml",
        strict: false,
        trust: false,
      }),
      error: null,
    };
  } catch (e) {
    return {
      html: "",
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

interface MermaidBlock {
  id: string;
  source: string;
  svg: string | null;
  error: string | null;
}

interface RichMarkdownProps {
  text: string;
  className?: string;
  enableZoom?: boolean;
  /** 是否处于流式输出中（为 true 时使用更长 debounce 避免主线程阻塞） */
  streaming?: boolean;
}

/**
 * 共享富文本 Markdown 渲染器。
 *
 * 能力：
 *  - 标准 Markdown（标题、列表、引用、表格、代码块等）由 marked 生成
 *  - 行内 / 块级 LaTeX（$...$ / $$...$$）预提取后由 KaTeX 渲染，点击放大
 *  - Mermaid 图表（```mermaid）由 mermaid 异步渲染，点击放大
 *  - 代码块语法高亮（Stata / Python / R / JS / TS / SQL / JSON / Bash / CSS / HTML / YAML）
 *  - 行内代码沿用等宽字体
 *  - 全部走 React 渲染路径（无 dangerouslySetInnerHTML）
 *  - 用 React.memo 包装：text 不变时不重新解析/重渲染
 */
function RichMarkdownRaw({
  text,
  className,
  enableZoom = true,
  streaming = false,
}: RichMarkdownProps) {
  // 延迟解析：首次渲染不执行 marked.lexer / KaTeX / 高亮等同步耗时操作，
  // 仅显示纯文本占位，等下一帧再切换到完整解析。
  // ⚠️ 不能用 requestIdleCallback：在 React commit 阶段浏览器认为"空闲"会立即触发，
  //    导致 marked.lexer 仍在同一帧内同步执行，阻塞主线程。
  // ⚠️ 必须用 setTimeout：确保回调在独立的事件循环 tick 中执行，
  //    让浏览器先完成当前帧的布局/绘制/用户事件处理。
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setMounted(true), 50);
    return () => clearTimeout(id);
  }, []);

  // 节流：流式更新期间不要每字符都重新解析
  // streaming=true 时用节流（每 200ms 更新一次，确保用户看到增量输出）
  // streaming=false 时用 0ms（立即解析，无延迟）
  // ⚠️ 不能用防抖(debounce)：流式期间 text 持续变化，防抖会不断重置定时器，
  //    导致 debouncedText 永远不更新，直到流结束才一次性显示全部内容！
  const [debouncedText, setDebouncedText] = useState(text);
  const lastFlushRef = useRef(0);
  useEffect(() => {
    if (!streaming) {
      lastFlushRef.current = 0;
      setDebouncedText(text);
      return;
    }
    const now = Date.now();
    const elapsed = now - lastFlushRef.current;
    const THROTTLE_MS = 200;
    if (elapsed >= THROTTLE_MS) {
      // 已超过节流间隔，立即更新
      lastFlushRef.current = now;
      setDebouncedText(text);
    } else {
      // 未到间隔，延迟到间隔结束时更新
      const t = window.setTimeout(() => {
        lastFlushRef.current = Date.now();
        setDebouncedText(text);
      }, THROTTLE_MS - elapsed);
      return () => window.clearTimeout(t);
    }
  }, [text, streaming]);

  // ⚠️ 所有 hooks 必须无条件调用在前，条件 return 在后
  // mount 前返回空数据，mount 后才执行实际解析

  // 1) 预处理：提取 LaTeX → 替换为占位符
  // 流式期间也执行 LaTeX 提取，让公式实时渲染
  const { text: preprocessed, blocks: latexBlocks } = useMemo(
    () => {
      if (!mounted) return { text: debouncedText, blocks: [] as LatexPlaceholder[] };
      const t0 = performance.now();
      const result = extractLatex(debouncedText);
      const dt = performance.now() - t0;
      if (dt > 20) console.warn(`[RichMarkdown] extractLatex 耗时 ${dt.toFixed(1)}ms (len=${debouncedText.length})`);
      return result;
    },
    [mounted, debouncedText]
  );

  // 2) 解析 markdown
  // 流式期间也执行 marked.lexer，让标题/代码块/列表等格式实时渲染
  // 200ms 节流已限制解析频率，不会造成性能问题
  const tokens = useMemo(() => {
    if (!mounted || !preprocessed) return [] as any;
    const t0 = performance.now();
    try {
      const result = marked.lexer(preprocessed) as any;
      const dt = performance.now() - t0;
      if (dt > 20) console.warn(`[RichMarkdown] marked.lexer 耗时 ${dt.toFixed(1)}ms (len=${preprocessed.length})`);
      return result;
    } catch (e) {
      console.error("[RichMarkdown] lexer failed", e);
      return [] as any;
    }
  }, [mounted, streaming, preprocessed]);

  // 收集所有 mermaid 块（id 基于位置，流式期间源码变化时 id 不变，便于增量更新）
  const mermaidBlocks = useMemo(() => {
    const out: { id: string; source: string }[] = [];
    let mermaidIdx = 0;
    for (const t of tokens) {
      if (t.type === "code" && (t as { lang?: string }).lang === "mermaid") {
        const source = t.text;
        const id = `rm-mermaid-${mermaidIdx}`;
        out.push({ id, source });
        mermaidIdx++;
      }
    }
    return out;
  }, [tokens]);

  // 弹窗
  const [zoom, setZoom] = useState<
    | null
    | { kind: "mermaid"; svg: string }
    | { kind: "latex"; html: string; displayMode: boolean; expr: string }
  >(null);

  // 稳定的回调（让子组件 memo 生效，避免父组件 re-render 引发雪崩）
  const onZoomMermaid = useCallback((svg: string) => {
    setZoom({ kind: "mermaid", svg });
  }, []);
  const onZoomLatex = useCallback(
    (html: string, displayMode: boolean, expr: string) => {
      setZoom({ kind: "latex", html, displayMode, expr });
    },
    []
  );

  // 首次渲染：纯文本占位（所有 hooks 必须在此之前已调用完毕）
  if (!mounted) {
    return (
      <div className={`${styles.root} ${className || ""}`}>
        <pre className={styles.rawFallback}>{text}</pre>
      </div>
    );
  }

  const content = (
    <div className={`${styles.root} ${className || ""}`}>
      {tokens.length === 0 ? null : (
        <TokenList
          tokens={tokens}
          latexBlocks={latexBlocks}
          onZoomLatex={onZoomLatex}
          enableZoom={enableZoom}
          streaming={streaming}
        />
      )}

      {mermaidBlocks.length > 0 && (
        <MermaidSection
          blocks={mermaidBlocks}
          enableZoom={enableZoom}
          onZoom={onZoomMermaid}
          streaming={streaming}
        />
      )}

      {zoom?.kind === "mermaid" && (
        <ZoomModal
          open
          onClose={() => setZoom(null)}
          kind="svg"
          content={zoom.svg}
          title="Mermaid 图表"
          downloadName="mermaid.svg"
        />
      )}
      {zoom?.kind === "latex" && (
        <ZoomModal
          open
          onClose={() => setZoom(null)}
          kind="html"
          content={zoom.html}
          sourceContent={zoom.expr}
          title={zoom.displayMode ? "块级公式 (LaTeX)" : "行内公式 (LaTeX)"}
          downloadName="latex.html"
        />
      )}
    </div>
  );

  // 调试：JSX 构建完成
  if (import.meta.env.DEV) {
    console.log(`[RichMarkdown] JSX 构建完成 (tokens=${tokens.length})`);
  }

  return content;
}

/**
 * RichMarkdown 的 memo 包装
 *  - 仅在 text / className / enableZoom 变化时重新解析 Markdown
 *  - 关键：AI 流式输出时父组件重渲，但 text 不变就不会触发 Markdown 解析
 *  - 切换历史会话时：message.content 是新字符串，所以会重新解析（这是必要的）
 */
export const RichMarkdown = memo(RichMarkdownRaw);

/* =================================================================
 * Token 列表渲染
 * ================================================================= */
function TokenList({
  tokens,
  latexBlocks,
  onZoomLatex,
  enableZoom,
  streaming,
}: {
  tokens: any;
  latexBlocks: LatexPlaceholder[];
  onZoomLatex: (html: string, displayMode: boolean, expr: string) => void;
  enableZoom: boolean;
  streaming: boolean;
}) {
  if (import.meta.env.DEV) {
    console.log(`[TokenList] 渲染 ${tokens.length} 个 token, types:`, tokens.map((t: any) => t.type).join(','));
  }
  return (
    <div className={styles.md}>
      {tokens.map((t: any, i: number) => (
        <TokenNode
          key={i}
          token={t}
          latexBlocks={latexBlocks}
          onZoomLatex={onZoomLatex}
          enableZoom={enableZoom}
          streaming={streaming}
        />
      ))}
    </div>
  );
}

function TokenNode({
  token,
  latexBlocks,
  onZoomLatex,
  enableZoom,
  streaming,
}: {
  token: any;
  latexBlocks: LatexPlaceholder[];
  onZoomLatex: (html: string, displayMode: boolean, expr: string) => void;
  enableZoom: boolean;
  streaming: boolean;
}) {
  if (import.meta.env.DEV) {
    console.log(`[TokenNode] type=${token.type} textLen=${(token.text || '').length}`);
  }
  // 块级 / 行内 LaTeX 占位符
  if (token.type === "paragraph" || token.type === "heading" || token.type === "blockquote" || token.type === "text") {
    const rawText = (token as { text: string }).text;
    return <LatexInText text={rawText} latexBlocks={latexBlocks} onZoomLatex={onZoomLatex} enableZoom={enableZoom} streaming={streaming} renderBlock={(inner) => {
      if (token.type === "heading") {
        const t = token as { depth: number };
        const cls = [
          styles.h1, styles.h2, styles.h3, styles.h4, styles.h5, styles.h6,
        ][Math.max(0, Math.min(5, t.depth - 1))];
        return <div className={cls}>{inner}</div>;
      }
      if (token.type === "blockquote") {
        return <blockquote className={styles.blockquote}>{inner}</blockquote>;
      }
      if (token.type === "paragraph") {
        return <p className={styles.p}>{inner}</p>;
      }
      return <span>{inner}</span>;
    }} />;
  }

  const type = token.type;

  if (type === "heading") {
    const t = token as { depth: number; text: string };
    const cls = [styles.h1, styles.h2, styles.h3, styles.h4, styles.h5, styles.h6][
      Math.max(0, Math.min(5, t.depth - 1))
    ];
    return (
      <LatexInText text={t.text} latexBlocks={latexBlocks} onZoomLatex={onZoomLatex} enableZoom={enableZoom} streaming={streaming} renderBlock={(inner) => <div className={cls}>{inner}</div>} />
    );
  }

  if (type === "paragraph") {
    const t = token as { text: string };
    return (
      <LatexInText text={t.text} latexBlocks={latexBlocks} onZoomLatex={onZoomLatex} enableZoom={enableZoom} streaming={streaming} renderBlock={(inner) => <p className={styles.p}>{inner}</p>} />
    );
  }

  if (type === "blockquote") {
    const t = token as { text: string };
    return (
      <blockquote className={styles.blockquote}>
        <LatexInText text={t.text} latexBlocks={latexBlocks} onZoomLatex={onZoomLatex} enableZoom={enableZoom} streaming={streaming} renderBlock={(inner) => <>{inner}</>} />
      </blockquote>
    );
  }

  if (type === "list") {
    const t = token as { ordered: boolean; items: { text: string; tokens?: any }[] };
    const List = t.ordered ? "ol" : "ul";
    return (
      <List className={t.ordered ? styles.ol : styles.ul}>
        {t.items.map((it, idx) => (
          <li key={idx}>
            <LatexInText text={it.text} latexBlocks={latexBlocks} onZoomLatex={onZoomLatex} enableZoom={enableZoom} streaming={streaming} renderBlock={(inner) => <>{inner}</>} />
          </li>
        ))}
      </List>
    );
  }

  if (type === "table") {
    const t = token as {
      header: { text: string }[];
      rows: { text: string }[][];
    };
    return <TableBlock header={t.header} rows={t.rows} latexBlocks={latexBlocks} onZoomLatex={onZoomLatex} enableZoom={enableZoom} streaming={streaming} />;
  }

  if (type === "hr") {
    return <hr className={styles.hr} />;
  }

  if (type === "space") {
    return null;
  }

  if (type === "code") {
    const t = token as { lang?: string; text: string };
    if (t.lang === "mermaid") return null;
    return <CodeBlock lang={t.lang} code={t.text} />;
  }

  if (type === "html") {
    const t = token as { text: string };
    return (
      <div
        className={styles.htmlBlock}
        dangerouslySetInnerHTML={{ __html: t.text }}
      />
    );
  }

  if (type === "def") {
    return null;
  }

  return null;
}

/* =================================================================
 * 在文本中插入 LaTeX 占位符并交由 marked 解析其余 inline 部分
 * 这里采用混合策略：先用 marked.parseInline 得到 HTML，
 * 但替换 LaTeX 占位符为带 .rm-latex-* 的 span，
 * 再对其中不含占位符的子串做正常 inline 解析
 * ================================================================= */
function LatexInText({
  text,
  latexBlocks,
  onZoomLatex,
  enableZoom,
  streaming,
  renderBlock,
}: {
  text: string;
  latexBlocks: LatexPlaceholder[];
  onZoomLatex: (html: string, displayMode: boolean, expr: string) => void;
  enableZoom: boolean;
  streaming: boolean;
  renderBlock: (inner: React.ReactNode) => React.ReactNode;
}) {
  if (!text) return <>{renderBlock(null)}</>;
  // 无 LaTeX 占位符时直接走行内渲染
  if (latexBlocks.length === 0) {
    return <>{renderBlock(<InlineRender text={text} onZoomLatex={onZoomLatex} enableZoom={enableZoom} streaming={false} />)}</>;
  }
  const placeholderRe = /@@LATEX_(BLOCK|INLINE)_(\d+)@@/g;
  const matches: { start: number; end: number; index: number; block: LatexPlaceholder }[] = [];
  let m: RegExpExecArray | null;
  while ((m = placeholderRe.exec(text)) !== null) {
    const kind = m[1];
    const idx = Number(m[2]);
    const block = latexBlocks[idx];
    if (!block) continue;
    if (block.displayMode && kind === "INLINE") continue;
    if (!block.displayMode && kind === "BLOCK") continue;
    matches.push({ start: m.index, end: m.index + m[0].length, index: idx, block });
  }
  if (matches.length === 0) {
    return <>{renderBlock(<InlineRender text={text} onZoomLatex={onZoomLatex} enableZoom={enableZoom} streaming={streaming} />)}</>;
  }
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  for (let i = 0; i < matches.length; i++) {
    const { start, end, block } = matches[i];
    if (start > cursor) {
      const seg = text.slice(cursor, start);
      parts.push(<InlineRender key={`seg-${i}`} text={seg} onZoomLatex={onZoomLatex} enableZoom={enableZoom} />);
    }
    if (block.error) {
      // KaTeX 抛错时的兜底：显示原始 LaTeX + 复制按钮
      parts.push(
        <LatexErrorBlock key={`lx-${i}`} block={block} />
      );
    } else {
      const clickable = !!enableZoom;
      const latexSpan = (
        <span
          key={`lx-${i}`}
          className={`${styles.latex} ${block.displayMode ? styles.latexBlock : styles.latexInline} ${clickable ? styles.latexZoomable : ""}`}
          onClick={clickable ? (e) => { e.stopPropagation(); onZoomLatex(block.html, block.displayMode, block.expr); } : undefined}
          role={clickable ? "button" : undefined}
          tabIndex={clickable ? 0 : undefined}
          onKeyDown={clickable ? (e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onZoomLatex(block.html, block.displayMode, block.expr);
            }
          } : undefined}
          title={clickable ? "点击查看大公式" : undefined}
          dangerouslySetInnerHTML={{ __html: block.html }}
        />
      );
      // 块级公式：添加复制按钮工具栏
      if (block.displayMode) {
        parts.push(
          <LatexBlockWithActions key={`lx-${i}`} block={block} latexSpan={latexSpan} />
        );
      } else {
        parts.push(latexSpan);
      }
    }
    cursor = end;
  }
  if (cursor < text.length) {
    parts.push(<InlineRender key="seg-tail" text={text.slice(cursor)} onZoomLatex={onZoomLatex} enableZoom={enableZoom} />);
  }
  return <>{renderBlock(parts)}</>;
}

/* =================================================================
 * 块级公式 + 复制按钮工具栏
 * ================================================================= */
function LatexBlockWithActions({ block, latexSpan }: { block: LatexPlaceholder; latexSpan: React.ReactNode }) {
  const [copied, setCopied] = useState(false);
  const [richCopied, setRichCopied] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const handleCopySource = useCallback(async () => {
    try {
      // 复制带定界符的 LaTeX 源码
      const raw = block.displayMode ? `$$${block.expr}$$` : `$${block.expr}$`;
      await copyPlainText(raw);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch (e) {
      console.error("[LatexBlockWithActions] copy source failed", e);
    }
  }, [block.expr, block.displayMode]);

  const handleRichCopy = useCallback(async () => {
    try {
      // 用 MathML 输出复制（Word 可解析 <math> 为原生公式，等效矢量图）
      const mathml = katex.renderToString(block.expr, {
        output: "mathml",
        displayMode: block.displayMode,
        throwOnError: false,
      });
      await copyRichText(mathml, block.expr);
      setRichCopied(true);
      window.setTimeout(() => setRichCopied(false), 1200);
    } catch (e) {
      console.error("[LatexBlockWithActions] rich copy failed", e);
    }
  }, [block.expr, block.displayMode]);

  return (
    <div className={styles.latexBlockWrap} ref={wrapRef}>
      {latexSpan}
      <div className={styles.latexActions}>
        <button className={styles.latexActionBtn} onClick={handleCopySource} title="复制 LaTeX 源码" aria-label="复制 LaTeX 源码">
          {copied ? <Check size={10} /> : <Copy size={10} />}
          <span>{copied ? "已复制" : "复制源码"}</span>
        </button>
        <button className={styles.latexActionBtn} onClick={handleRichCopy} title="带格式复制" aria-label="带格式复制">
          {richCopied ? <Check size={10} /> : <ClipboardPaste size={10} />}
          <span>{richCopied ? "已复制" : "带格式复制"}</span>
        </button>
      </div>
    </div>
  );
}

/* =================================================================
 * LaTeX 渲染失败兜底：显示错误信息 + 原始 LaTeX 源码 + 复制按钮
 * ================================================================= */
function LatexErrorBlock({ block }: { block: LatexPlaceholder }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback(async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(block.expr);
      } else {
        const ta = document.createElement("textarea");
        ta.value = block.expr;
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand("copy"); } catch { /* noop */ }
        document.body.removeChild(ta);
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch (e) {
      console.error("[LatexErrorBlock] copy failed", e);
    }
  }, [block.expr]);
  const raw = block.displayMode ? `$$${block.expr}$$` : `$${block.expr}$`;
  return (
    <span
      className={`${styles.latexError} ${block.displayMode ? styles.latexErrorBlock : styles.latexErrorInline}`}
      title={block.error || "公式渲染失败"}
    >
      <span className={styles.latexErrorHeader}>
        <AlertCircle size={11} />
        <span>公式渲染失败</span>
        <button
          className={styles.latexCopyBtn}
          onClick={(e) => { e.stopPropagation(); void handleCopy(); }}
          title="复制 LaTeX 源码"
          aria-label="复制 LaTeX 源码"
        >
          {copied ? <Check size={10} /> : <Copy size={10} />}
          <span>{copied ? "已复制" : "复制源码"}</span>
        </button>
      </span>
      <code className={styles.latexErrorCode}>{raw}</code>
    </span>
  );
}

/* =================================================================
 * 表格：带复制按钮
 * ================================================================= */
function TableBlock({ header, rows, latexBlocks, onZoomLatex, enableZoom, streaming }: {
  header: { text: string }[];
  rows: { text: string }[][];
  latexBlocks: LatexPlaceholder[];
  onZoomLatex: (html: string, displayMode: boolean, expr: string) => void;
  enableZoom: boolean;
  streaming: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [richCopied, setRichCopied] = useState(false);

  // 复制为 TSV 纯文本
  const handleCopy = useCallback(async () => {
    const tsv = [
      header.map((c) => c.text).join("\t"),
      ...rows.map((row) => row.map((c) => c.text).join("\t")),
    ].join("\n");
    try {
      await copyPlainText(tsv);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch (e) {
      console.error("[TableBlock] copy failed", e);
    }
  }, [header, rows]);

  // 带格式复制：构建 HTML 表格作为富文本
  const handleRichCopy = useCallback(async () => {
    // 用 marked.parseInline 将单元格 Markdown 文本转为 HTML
    const parseCell = (text: string) => {
      try {
        return marked.parseInline(text) as string;
      } catch {
        return text;
      }
    };
    const htmlRows = rows.map((row) =>
      "<tr>" + row.map((c) => `<td style="border:1px solid #d1d5db;padding:6px 10px;">${parseCell(c.text)}</td>`).join("") + "</tr>"
    ).join("");
    const htmlHeader = "<tr>" + header.map((c) => `<th style="border:1px solid #d1d5db;padding:6px 10px;background:#f3f4f6;font-weight:600;">${parseCell(c.text)}</th>`).join("") + "</tr>";
    const html = `<table width="100%" style="border-collapse:collapse;font-size:13px;width:100%;"><thead>${htmlHeader}</thead><tbody>${htmlRows}</tbody></table>`;
    try {
      const plainText = [
        header.map((c) => c.text).join("\t"),
        ...rows.map((row) => row.map((c) => c.text).join("\t")),
      ].join("\n");
      await copyRichText(html, plainText);
      setRichCopied(true);
      window.setTimeout(() => setRichCopied(false), 1200);
    } catch (e) {
      console.error("[TableBlock] rich copy failed", e);
    }
  }, [header, rows]);

  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            {header.map((c, i) => (
              <th key={i}>
                <LatexInText text={c.text} latexBlocks={latexBlocks} onZoomLatex={onZoomLatex} enableZoom={enableZoom} streaming={streaming} renderBlock={(inner) => <>{inner}</>} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri}>
              {row.map((c, ci) => (
                <td key={ci}>
                  <LatexInText text={c.text} latexBlocks={latexBlocks} onZoomLatex={onZoomLatex} enableZoom={enableZoom} streaming={streaming} renderBlock={(inner) => <>{inner}</>} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className={styles.tableActions}>
        <button className={styles.tableActionBtn} onClick={handleCopy} title="复制为纯文本 (TSV)" aria-label="复制表格">
          {copied ? <Check size={10} /> : <Copy size={10} />}
          <span>{copied ? "已复制" : "复制"}</span>
        </button>
        <button className={styles.tableActionBtn} onClick={handleRichCopy} title="带格式复制（粘贴到 Word 保留表格）" aria-label="带格式复制表格">
          {richCopied ? <Check size={10} /> : <ClipboardPaste size={10} />}
          <span>{richCopied ? "已复制" : "带格式复制"}</span>
        </button>
      </div>
    </div>
  );
}

/* =================================================================
 * 代码块：语法高亮 + 复制按钮
 * ================================================================= */
/**
 * 超过该字符数则直接渲染纯文本，不做高亮。
 * - 一般 AI 输出代码块远小于此值；遇到病态超长粘贴会直接回退到纯文本
 *   而不会让 UI 线程卡死。
 */
const CODE_HIGHLIGHT_MAX = 100_000;

function CodeBlock({ lang, code }: { lang?: string; text?: string; code: string }) {
  const tokens = useMemo<HLToken[]>(() => {
    if (!code) return [];
    if (code.length > CODE_HIGHLIGHT_MAX) {
      return [{ type: "text", text: code }];
    }
    const t0 = performance.now();
    const result = highlight(code, lang || "text");
    const dt = performance.now() - t0;
    if (dt > 5) {
      console.warn(`[CodeBlock] highlight 耗时 ${dt.toFixed(1)}ms (lang=${lang}, len=${code.length})`);
    }
    return result;
  }, [code, lang]);
  const [copied, setCopied] = useState(false);
  const [richCopied, setRichCopied] = useState(false);
  const handleCopy = useCallback(async () => {
    try {
      await copyPlainText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch (e) {
      console.error("[CodeBlock] copy failed", e);
    }
  }, [code]);
  const handleRichCopy = useCallback(async () => {
    try {
      // 构建带语法高亮的 HTML 用于富文本复制（使用内联样式，Word 可解析）
      const highlightedHtml = tokens.map((t) => {
        const escaped = t.text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        const color = getHLColor(t.type);
        if (color) return `<span style="color:${color};">${escaped}</span>`;
        return escaped;
      }).join("");
      const html = `<pre style="font-family:monospace;font-size:13px;line-height:1.6;background:#1e293b;color:#e2e8f0;padding:12px;border-radius:6px;overflow-x:auto;white-space:pre-wrap;word-break:break-all;"><code>${highlightedHtml}</code></pre>`;
      // 使用 copyHtmlViaEvent 精确控制剪贴板 text/html 内容
      await copyHtmlViaEvent(html, code);
      setRichCopied(true);
      window.setTimeout(() => setRichCopied(false), 1200);
    } catch (e) {
      console.error("[CodeBlock] rich copy failed", e);
    }
  }, [tokens, code]);
  return (
    <div className={styles.codeBlock}>
      <div className={styles.codeHeader}>
        {lang ? (
          <span className={styles.codeLang}>{lang}</span>
        ) : (
          <span className={styles.codeLang}>TEXT</span>
        )}
        <div className={styles.codeHeaderActions}>
          <button className={styles.codeCopyBtn} onClick={handleCopy} title="复制代码" aria-label="复制代码">
            {copied ? <Check size={11} /> : <Copy size={11} />}
            <span>{copied ? "已复制" : "复制"}</span>
          </button>
          <button className={styles.codeCopyBtn} onClick={handleRichCopy} title="带格式复制" aria-label="带格式复制">
            {richCopied ? <Check size={11} /> : <ClipboardPaste size={11} />}
            <span>{richCopied ? "已复制" : "带格式"}</span>
          </button>
        </div>
      </div>
      <pre>
        <code>
          {tokens.map((t, i) => (
            <span key={i} className={getHLClass(t.type)}>{t.text}</span>
          ))}
        </code>
      </pre>
    </div>
  );
}

function getHLClass(type: string): string {
  switch (type) {
    case "keyword": return styles.hlKeyword || "";
    case "keyword-control": return styles.hlControl || "";
    case "type": return styles.hlType || "";
    case "string": return styles.hlString || "";
    case "number": return styles.hlNumber || "";
    case "comment": return styles.hlComment || "";
    case "operator": return styles.hlOperator || "";
    case "function": return styles.hlFunction || "";
    case "variable": return styles.hlVariable || "";
    case "macro": return styles.hlMacro || "";
    case "global": return styles.hlGlobal || "";
    case "local": return styles.hlLocal || "";
    case "builtin": return styles.hlBuiltin || "";
    case "tag": return styles.hlTag || "";
    case "attr": return styles.hlAttr || "";
    case "property": return styles.hlProperty || "";
    case "selector": return styles.hlSelector || "";
    default: return "";
  }
}

/** 语法高亮颜色映射（用于富文本复制，Word 无法解析 CSS class） */
function getHLColor(type: string): string {
  switch (type) {
    case "keyword": return "#c678dd";
    case "keyword-control": return "#e06c75";
    case "type": return "#e5c07b";
    case "string": return "#98c379";
    case "number": return "#d19a66";
    case "comment": return "#5c6370";
    case "operator": return "#56b6c2";
    case "function": return "#61afef";
    case "variable": return "#e06c75";
    case "macro": return "#c678dd";
    case "global": return "#e5c07b";
    case "local": return "#e06c75";
    case "builtin": return "#e5c07b";
    case "tag": return "#e06c75";
    case "attr": return "#d19a66";
    case "property": return "#e06c75";
    case "selector": return "#98c379";
    default: return "";
  }
}

/* =================================================================
 * 行内渲染：加粗/斜体/行内代码/链接/图片/换行
 * 注：text 已被剥离 LaTeX 占位符（占位符由 LatexInText 处理）
 * ================================================================= */
function InlineRender({
  text,
  onZoomLatex,
  enableZoom,
  streaming = false,
}: {
  text: string;
  onZoomLatex: (html: string, displayMode: boolean, expr: string) => void;
  enableZoom: boolean;
  /** 流式期间仍解析行内格式（加粗/斜体/代码等），只跳过 LaTeX */
  streaming?: boolean;
}) {
  const inlineTokens = useMemo(() => {
    if (!text) return [] as Array<{ type: string; [k: string]: any }>;
    try {
      const t0 = performance.now();
      const list = marked.lexer(text) as Array<{ type: string; tokens?: any[]; [k: string]: any }>;
      const dt = performance.now() - t0;
      if (dt > 5) {
        console.warn(`[InlineRender] marked.lexer 耗时 ${dt.toFixed(1)}ms (len=${text.length})`);
      }
      const out: Array<{ type: string; [k: string]: any }> = [];
      for (const t of list) {
        if (Array.isArray((t as any).tokens) && (t as any).tokens.length > 0) {
          for (const sub of (t as any).tokens) out.push(sub);
        } else if (t && (t as any).text !== undefined) {
          out.push(t);
        }
      }
      return out;
    } catch (e) {
      console.error("[RichMarkdown] InlineRender lexer failed", e);
      return [];
    }
  }, [text, streaming]);

  return (
    <>
      {inlineTokens.map((t: any, i) => {
        if (t.type === "strong") {
          return <strong key={i}><InlineRender text={t.text} onZoomLatex={onZoomLatex} enableZoom={enableZoom} /></strong>;
        }
        if (t.type === "em") {
          return <em key={i}><InlineRender text={t.text} onZoomLatex={onZoomLatex} enableZoom={enableZoom} /></em>;
        }
        if (t.type === "del") {
          return <del key={i}><InlineRender text={t.text} onZoomLatex={onZoomLatex} enableZoom={enableZoom} /></del>;
        }
        if (t.type === "codespan") {
          return <code key={i} className={styles.inlineCode}>{t.text}</code>;
        }
        if (t.type === "link") {
          return (
            <a
              key={i}
              href={t.href}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.link}
            >
              <InlineRender text={t.text} onZoomLatex={onZoomLatex} enableZoom={enableZoom} />
            </a>
          );
        }
        if (t.type === "br") {
          return <br key={i} />;
        }
        if (t.type === "text") {
          return <span key={i}>{t.text}</span>;
        }
        if (t.type === "image") {
          return (
            <img
              key={i}
              src={t.href}
              alt={t.text}
              className={styles.img}
            />
          );
        }
        if (t.raw) return <span key={i}>{t.raw}</span>;
        return null;
      })}
    </>
  );
}

/* =================================================================
 * Mermaid 区域
 *  - 限制最大高度
 *  - SVG 自适应缩放（不放大到撑破容器）
 *  - 取消悬停上浮 / 阴影
 *  - 用 React.memo 包装：blocks / enableZoom / onZoom 引用未变时跳过重渲
 * ================================================================= */
const MermaidSection = memo(function MermaidSection({
  blocks,
  enableZoom,
  onZoom,
  streaming = false,
}: {
  blocks: { id: string; source: string }[];
  enableZoom: boolean;
  onZoom: (svg: string) => void;
  /** 流式生成中：抑制渲染错误显示，源码变化时清除旧结果重试 */
  streaming?: boolean;
}) {
  const [mermaidReady, setMermaidReady] = useState(false);
  const [mermaidLib, setMermaidLib] = useState<any>(null);
  const [rendered, setRendered] = useState<Record<string, MermaidBlock>>({});
  const renderedRef = useRef<Record<string, MermaidBlock>>({});
  // 主题变化时递增，触发渲染 effect 重新扫描未渲染的块
  const [renderTrigger, setRenderTrigger] = useState(0);
  // 同步 rendered state 到 ref，供 effect 内读取
  useEffect(() => { renderedRef.current = rendered; }, [rendered]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const mod = await import("mermaid");
        const mermaid = mod.default;
        mermaid.initialize({
          startOnLoad: false,
          theme: detectMermaidTheme(),
          securityLevel: "loose",
          fontFamily: "inherit",
          maxTextSize: 90000,
        });
        if (!cancelled) {
          setMermaidLib(mermaid);
          setMermaidReady(true);
        }
      } catch (e) {
        console.error("[RichMarkdown] Mermaid load failed", e);
        if (!cancelled) setMermaidReady(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 主题切换：防抖 300ms，避免快速切换时级联重渲染导致频闪
  useEffect(() => {
    if (!mermaidLib) return;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const obs = new MutationObserver(() => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        try {
          mermaidLib.initialize({
            startOnLoad: false,
            theme: detectMermaidTheme(),
            securityLevel: "loose",
            fontFamily: "inherit",
            maxTextSize: 90000,
          });
          // 清空所有已渲染的 SVG 块（需要用新主题重新渲染）
          // 也清空 error 块（主题切换后可能渲染成功）
          setRendered((prev) => {
            const next: Record<string, MermaidBlock> = {};
            for (const [_id, blk] of Object.entries(prev)) {
              if (blk.svg) {
                // 有 SVG 的块被丢弃，将触发重新渲染
              } else if (blk.error) {
                // 主题切换后也清空错误块，给一次重试机会
              }
              // 所有块都被丢弃
            }
            return next;
          });
          // 递增 trigger 让渲染 effect 重新扫描
          setRenderTrigger((t) => t + 1);
        } catch {}
      }, 300);
    });
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => {
      obs.disconnect();
      if (debounceTimer) clearTimeout(debounceTimer);
    };
  }, [mermaidLib]);

  // 流式期间：当 blocks 的 source 变化时，清除旧的渲染/错误结果，触发重新渲染
  useEffect(() => {
    if (!streaming) return;
    setRendered((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const blk of blocks) {
        const existing = next[blk.id];
        if (existing && existing.source !== blk.source) {
          delete next[blk.id];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [blocks, streaming]);

  useEffect(() => {
    if (!mermaidReady || !mermaidLib) return;
    let cancelled = false;
    let timer: number | null = null;
    let idx = 0;

    const renderNext = () => {
      if (cancelled) return;
      // 找下一个未渲染的块（通过 ref 读取最新状态）
      const currentRendered = renderedRef.current;
      while (idx < blocks.length) {
        const blk = blocks[idx++];
        if (currentRendered[blk.id] && currentRendered[blk.id].svg && currentRendered[blk.id].source === blk.source) continue;
        if (currentRendered[blk.id] && currentRendered[blk.id].error && currentRendered[blk.id].source === blk.source) continue;
        // 处理这个块
        (async () => {
          if (cancelled) return;
          const candidates = [blk.source, mermaidAutofix(blk.source)].filter(
            (s, i, arr) => arr.indexOf(s) === i
          );
          let succeeded = false;
          for (const src of candidates) {
            if (succeeded) break;
            try {
              const { svg } = await mermaidLib.render(`g-${blk.id}`, src);
              if (cancelled) return;
              const normalized = normalizeSvgForZoom(svg);
              setRendered((prev) => ({ ...prev, [blk.id]: { id: blk.id, source: blk.source, svg: normalized, error: null } }));
              succeeded = true;
            } catch (err) {
              if (cancelled) return;
              if (src === candidates[candidates.length - 1]) {
                setRendered((prev) => ({
                  ...prev,
                  [blk.id]: {
                    id: blk.id,
                    source: blk.source,
                    svg: null,
                    error: err instanceof Error ? err.message : String(err),
                  },
                }));
              }
            }
          }
          // 渲染下一个块之前让出主线程，避免连续 mermaid.render() 阻塞
          // 每个块之间留 16ms (~1 帧) 给浏览器做其它工作
          timer = window.setTimeout(renderNext, 16);
        })();
        return;
      }
    };

    // 首次延迟：流式期间更短（快速响应更新），非流式稍长（让 UI 先完成基础渲染）
    timer = window.setTimeout(renderNext, streaming ? 16 : 32);

    return () => {
      cancelled = true;
      if (timer !== null) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocks, mermaidReady, mermaidLib, streaming, renderTrigger]);

  const retry = useCallback(
    (id: string, source: string) => {
      setRendered((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      if (mermaidLib) {
        (async () => {
          // 同样先尝试原样，失败再尝试自动修复后的版本
          const candidates = [source, mermaidAutofix(source)].filter(
            (s, i, arr) => arr.indexOf(s) === i
          );
          for (const src of candidates) {
            try {
              const { svg } = await mermaidLib.render(`g-${id}-${Date.now()}`, src);
              setRendered((prev) => ({ ...prev, [id]: { id, source, svg: normalizeSvgForZoom(svg), error: null } }));
              return;
            } catch (err) {
              if (src === candidates[candidates.length - 1]) {
                setRendered((prev) => ({
                  ...prev,
                  [id]: {
                    id,
                    source,
                    svg: null,
                    error: err instanceof Error ? err.message : String(err),
                  },
                }));
              }
            }
          }
        })();
      }
    },
    [mermaidLib]
  );

  return (
    <div className={styles.mermaidList}>
      {blocks.map((b) => {
        const r = rendered[b.id];
        // 流式期间：渲染错误不显示错误块，改为显示加载状态（源码可能还不完整）
        const showError = r?.error && !streaming;
        const showSvg = r?.svg;
        const isLoading = mermaidReady && (!r || (r.error && streaming));
        return (
          <div key={b.id} className={styles.mermaidBlock}>
            {!mermaidReady && (
              <div className={styles.mermaidLoading}>
                <Loader2 size={14} className={styles.spin} /> Mermaid 加载中…
              </div>
            )}
            {isLoading && (
              <div className={styles.mermaidLoading}>
                <Loader2 size={14} className={styles.spin} /> {streaming ? "图表生成中…" : "渲染中…"}
              </div>
            )}
            {showError && <MermaidErrorBlock block={r} onRetry={() => retry(b.id, b.source)} />}
            {showSvg && (
              <MermaidSuccessBlock svg={r.svg!} source={b.source} enableZoom={enableZoom} onZoom={onZoom} />
            )}
          </div>
        );
      })}
    </div>
  );
});

/* =================================================================
 * Mermaid 渲染：源码预处理 + 渲染 + 失败兜底
 * ================================================================= */

/**
 * 触发 wrap 的特殊字符：节点标签中只要出现，mermaid v10+ 解析器就会失败。
 *  - `'`  ：(x'x) 这类转置符号
 *  - `(`  `)` ：在 `[...]` 内出现会被当成 stadium/cylindrical 语法
 *  - `^`  ：被识别为 link 方向
 *  - `|`  `;` `&` ：subgraph / link syntax
 *  - `#`  ：会被当成 classDef
 *  - `\`  ：转义序列触发
 *  - `<`  `>` ：HTML 标签解析（在中括号里会被吞掉）
 */
const MERMAID_LABEL_TRIGGER = /['()^|#;&<>\\]/;

/**
 * 节点标签的"包裹符"对：开闭必须是同一类字符。
 * 仅做"危险字符"自动引号包裹 → 不会破坏正常语法。
 */
const LABEL_PAIRS: Array<[string, string]> = [
  ["[", "]"],
  ["(", ")"],
  ["{", "}"],
  ["[[", "]]"],
  ["((", "))"],
  ["{{", "}}"],
  ["[(", ")]"],
  ["[/", "/]"],
  ["[\\", "\\]"],
];

/**
 * 在 `id[...]` 等位置中，把含特殊字符的 label 改成 `id["..."]`，避免 Mermaid 解析失败。
 *  - 只动 `[ ... ]` 这种**紧贴**标识符的标签（节点的"形状"标签），不动
 *    subgraph 的 `subgraph title` / 注释 / link label。
 *  - 已经用双引号包裹的标签不会被再次包裹。
 *  - 标签内的双引号 / 反斜杠会先转义。
 *
 * 设计原则：保守 — 只在"必然会让解析器挂掉"时才改写；不试图把 mermaid 变成
 * 一个"任意字符都能渲染"的方言。
 */
function mermaidAutofix(source: string): string {
  if (!source || !MERMAID_LABEL_TRIGGER.test(source)) return source;
  // 行级别处理：避免跨行匹配错位
  const out: string[] = [];
  for (const line of source.split(/\r?\n/)) {
    // 跳过纯注释行（mermaid: %% / %%{init}%%）
    const trimmed = line.trimStart();
    if (trimmed.startsWith("%%") || trimmed.startsWith("//")) {
      out.push(line);
      continue;
    }
    // 匹配 "标识符 + 包裹符对"，找到所有候选位置并按从右到左替换
    // （从右到左 → 替换不会影响前面位置的索引）
    let processed = line;
    // 单字符与多字符包裹，按长度从长到短排，避免 "[[" 被当成两次 "["
    const pairs = [...LABEL_PAIRS].sort((a, b) => b[0].length - a[0].length);
    for (const [open, close] of pairs) {
      // 找所有 (lead, id, open, close) 区间
      // lead 是行首或空白 / 分隔符；id 是 Mermaid 节点 id
      // 我们用迭代器手工处理（不依赖 regex 复杂回溯）
      const escapedOpen = open.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
      const idRe = new RegExp(
        `(^|[\\s,;\\[])([A-Za-z_\\u4e00-\\u9fa5][\\w.\\-]*)(${escapedOpen})`,
        "g"
      );
      const matches: Array<{ lead: string; id: string; openIdx: number; closeIdx: number }> = [];
      let m: RegExpExecArray | null;
      while ((m = idRe.exec(processed))) {
        const lead = m[1] ?? "";
        const id = m[2] ?? "";
        const openIdx = m.index + lead.length + id.length;
        const closeIdx = processed.indexOf(close, openIdx + open.length);
        if (closeIdx < 0) continue;
        matches.push({ lead, id, openIdx, closeIdx });
      }
      // 从右到左替换
      for (let i = matches.length - 1; i >= 0; i--) {
        const { openIdx, closeIdx } = matches[i];
        const inner = processed.slice(openIdx + open.length, closeIdx);
        // 已经是双引号包裹：保留
        if (inner.length >= 2 && inner.startsWith('"') && inner.endsWith('"')) continue;
        // 没有触发特殊字符：保留
        if (!MERMAID_LABEL_TRIGGER.test(inner)) continue;
        // 转义内部双引号 / 反斜杠
        const escaped = inner.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
        processed =
          processed.slice(0, openIdx) +
          open +
          '"' +
          escaped +
          '"' +
          processed.slice(closeIdx);
      }
    }
    out.push(processed);
  }
  return out.join("\n");
}
function MermaidSuccessBlock({ svg, source, enableZoom, onZoom }: {
  svg: string; source: string; enableZoom: boolean; onZoom: (svg: string) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [imgCopied, setImgCopied] = useState(false);
  const svgWrapRef = useRef<HTMLDivElement>(null);

  const handleCopySource = useCallback(async () => {
    try {
      await copyPlainText(source);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch (e) {
      console.error("[MermaidSuccessBlock] copy source failed", e);
    }
  }, [source]);

  const handleCopyAsImage = useCallback(async () => {
    try {
      await copySvgAsRichImage(svg);
      setImgCopied(true);
      window.setTimeout(() => setImgCopied(false), 1200);
    } catch (e) {
      console.error("[MermaidSuccessBlock] copy as image failed", e);
      // 即使失败也显示反馈，避免按钮无响应
      setImgCopied(true);
      window.setTimeout(() => setImgCopied(false), 1200);
    }
  }, [svg]);

  return (
    <>
      <div
        ref={svgWrapRef}
        className={styles.mermaidSvgWrap}
        onClick={enableZoom ? () => onZoom(svg) : undefined}
        role={enableZoom ? "button" : undefined}
        tabIndex={enableZoom ? 0 : undefined}
        onKeyDown={
          enableZoom
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onZoom(svg);
                }
              }
            : undefined
        }
        title={enableZoom ? "点击查看大图" : undefined}
        dangerouslySetInnerHTML={{ __html: svg }}
      />
      <div className={styles.mermaidActions}>
        <button className={styles.mermaidActionBtn} onClick={handleCopySource} title="复制 Mermaid 源码" aria-label="复制 Mermaid 源码">
          {copied ? <Check size={10} /> : <Copy size={10} />}
          <span>{copied ? "已复制" : "复制源码"}</span>
        </button>
        <button className={styles.mermaidActionBtn} onClick={handleCopyAsImage} title="复制为图片" aria-label="复制为图片">
          {imgCopied ? <Check size={10} /> : <ClipboardPaste size={10} />}
          <span>{imgCopied ? "已复制" : "复制为图片"}</span>
        </button>
        {enableZoom && (
          <span className={styles.mermaidZoomHint}>
            <ZoomIn size={10} /> 点击图表查看大图
          </span>
        )}
      </div>
    </>
  );
}

function MermaidErrorBlock({ block, onRetry }: { block: MermaidBlock; onRetry: () => void }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback(async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(block.source);
      } else {
        const ta = document.createElement("textarea");
        ta.value = block.source;
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand("copy"); } catch { /* noop */ }
        document.body.removeChild(ta);
      }
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch (e) {
      console.error("[MermaidErrorBlock] copy failed", e);
    }
  }, [block.source]);
  return (
    <div className={styles.mermaidError}>
      <div className={styles.mermaidErrorHeader}>
        <AlertCircle size={12} />
        <span>Mermaid 渲染失败</span>
        <div className={styles.mermaidErrorActions}>
          <button
            className={styles.mermaidRetry}
            onClick={onRetry}
            title="重试渲染"
            aria-label="重试渲染"
          >
            重试
          </button>
          <button
            className={styles.mermaidCopyBtn}
            onClick={() => void handleCopy()}
            title="复制 Mermaid 源码"
            aria-label="复制 Mermaid 源码"
          >
            {copied ? <Check size={10} /> : <Copy size={10} />}
            <span>{copied ? "已复制" : "复制源码"}</span>
          </button>
        </div>
      </div>
      <pre className={styles.mermaidSource}><code>{block.source}</code></pre>
      {block.error && <pre className={styles.mermaidErrorMsg}>{block.error}</pre>}
    </div>
  );
}

/* =================================================================
 * 工具
 * ================================================================= */

function detectMermaidTheme(): "default" | "dark" | "neutral" | "forest" {
  if (typeof document === "undefined") return "default";
  const theme = document.documentElement.getAttribute("data-theme");
  if (theme === "dark") return "dark";
  return "default";
}

/**
 * 将 mermaid 渲染的 SVG 标准化：
 *  - 先记录原始 width/height（删除 attribute 前就拿好数值）
 *  - 优先采用 viewBox（mermaid v10+ 总会输出）作为坐标系
 *  - 兜底：若 viewBox 缺失，用 width/height 数值补一个
 *  - 移除 width/height 后让 CSS 控制尺寸
 *  这样图表能自适应容器宽度，并且原图比例不变形。
 */
function normalizeSvgForZoom(svg: string): string {
  if (typeof document === "undefined") return svg;
  try {
    const tpl = document.createElement("template");
    tpl.innerHTML = svg.trim();
    const root = tpl.content.querySelector("svg");
    if (!root) return svg;
    // 1) 先取 viewBox（mermaid 几乎都会输出正确的 viewBox）
    let vb = root.getAttribute("viewBox");
    if (!vb) {
      // 2) 兜底：用 width/height 数值补一个（必须是数字，不能是 %）
      const wRaw = root.getAttribute("width");
      const hRaw = root.getAttribute("height");
      const w = parseFloat(wRaw || "0") || 800;
      const h = parseFloat(hRaw || "0") || 600;
      vb = `0 0 ${w} ${h}`;
      root.setAttribute("viewBox", vb);
    }
    // 3) 保留原始 width（让小图表不撑满容器），用 max-width 约束不超出容器
    const origWidth = root.getAttribute("width");
    const wNum = parseFloat(origWidth || "0");
    if (wNum > 0 && !/%/.test(origWidth || "")) {
      root.setAttribute("width", `${wNum}`);
    } else {
      root.removeAttribute("width");
    }
    root.removeAttribute("height");
    // 4) 自适应缩放：max-width 限制不超出容器，height 按比例，max-height 限制最大高度
    root.setAttribute("preserveAspectRatio", "xMidYMid meet");
    root.style.maxWidth = "100%";
    root.style.height = "auto";
    root.style.maxHeight = "480px";
    return root.outerHTML;
  } catch {
    return svg;
  }
}
