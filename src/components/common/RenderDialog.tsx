import { useState, useEffect, useRef, useCallback } from "react";
import { X, Play, Copy, Check, ClipboardPaste, Loader2, AlertCircle } from "lucide-react";
import { copyPlainText, copySvgAsRichImage, copyRichText } from "@/utils/clipboardUtils";
import styles from "./RenderDialog.module.css";

export interface RenderDialogProps {
  open: boolean;
  onClose: () => void;
  /** 渲染模式：mermaid 或 latex */
  mode: "mermaid" | "latex";
}

/**
 * 通用渲染对话框：允许用户粘贴代码并实时预览渲染结果。
 * - Mermaid 模式：粘贴 Mermaid 代码，渲染为 SVG
 * - LaTeX 模式：粘贴 LaTeX 公式，渲染为 KaTeX HTML
 */
export function RenderDialog({ open, onClose, mode }: RenderDialogProps) {
  const [code, setCode] = useState("");
  const [rendered, setRendered] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rendering, setRendering] = useState(false);
  const [copied, setCopied] = useState(false);
  const [richCopied, setRichCopied] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 打开时聚焦输入框
  useEffect(() => {
    if (open) {
      setCode("");
      setRendered(null);
      setError(null);
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
  }, [open]);

  // Esc 关闭
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onClose]);

  // 锁定 body 滚动
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  const handleRender = useCallback(async () => {
    if (!code.trim()) return;
    setRendering(true);
    setError(null);
    setRendered(null);

    try {
      if (mode === "mermaid") {
        const mod = await import("mermaid");
        const mermaid = mod.default;
        mermaid.initialize({
          startOnLoad: false,
          theme: document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "default",
          securityLevel: "loose",
          fontFamily: "inherit",
          maxTextSize: 90000,
        });
        const id = `render-dialog-${Date.now()}`;
        const { svg } = await mermaid.render(id, code.trim());
        setRendered(svg);
      } else {
        const katex = (await import("katex")).default;
        const html = katex.renderToString(code.trim(), {
          displayMode: true,
          throwOnError: false,
          output: "html",
          strict: false,
          trust: false,
        });
        setRendered(html);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRendering(false);
    }
  }, [code, mode]);

  // 自动渲染（防抖 600ms）
  useEffect(() => {
    if (!open || !code.trim()) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void handleRender();
    }, 600);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [code, open, handleRender]);

  const handleCopySource = useCallback(async () => {
    try {
      await copyPlainText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch (e) {
      console.error("[RenderDialog] copy source failed", e);
    }
  }, [code]);

  const handleRichCopy = useCallback(async () => {
    if (!rendered) return;
    try {
      if (mode === "mermaid") {
        // Mermaid：SVG 矢量图复制
        await copySvgAsRichImage(rendered);
      } else {
        // LaTeX：用 MathML 输出复制（Word 可解析为原生公式）
        const katex = (await import("katex")).default;
        const mathml = katex.renderToString(code.trim(), {
          output: "mathml",
          displayMode: true,
          throwOnError: false,
        });
        await copyRichText(mathml, code.trim());
      }
      setRichCopied(true);
      setTimeout(() => setRichCopied(false), 1200);
    } catch (e) {
      console.error("[RenderDialog] rich copy failed", e);
    }
  }, [rendered, mode, code]);

  if (!open) return null;

  const title = mode === "mermaid" ? "Mermaid 渲染" : "公式渲染";
  const placeholder = mode === "mermaid"
    ? "在此粘贴 Mermaid 代码，例如：\ngraph TD\n  A[开始] --> B[结束]"
    : "在此粘贴 LaTeX 公式，例如：\n\\int_0^\\infty e^{-x^2} dx = \\frac{\\sqrt{\\pi}}{2}";

  return (
    <div className={styles.overlay} onClick={onClose} role="presentation">
      <div className={styles.dialog} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={title}>
        <div className={styles.header}>
          <div className={styles.title}>{title}</div>
          <div className={styles.actions}>
            {rendered && (
              <>
                <button className={styles.actionBtn} onClick={handleCopySource} title="复制源码" aria-label="复制源码">
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                </button>
                <button className={styles.actionBtn} onClick={handleRichCopy} title={mode === "mermaid" ? "复制为图片" : "带格式复制"} aria-label={mode === "mermaid" ? "复制为图片" : "带格式复制"}>
                  {richCopied ? <Check size={14} /> : <ClipboardPaste size={14} />}
                </button>
              </>
            )}
            <button className={styles.closeBtn} onClick={onClose} title="关闭 (Esc)" aria-label="关闭">
              <X size={15} />
            </button>
          </div>
        </div>
        <div className={styles.body}>
          <div className={styles.editor}>
            <textarea
              ref={textareaRef}
              className={styles.textarea}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder={placeholder}
              spellCheck={false}
            />
            <button
              className={styles.renderBtn}
              onClick={handleRender}
              disabled={!code.trim() || rendering}
              title="渲染"
            >
              {rendering ? <Loader2 size={14} className={styles.spin} /> : <Play size={14} />}
              <span>{rendering ? "渲染中…" : "渲染"}</span>
            </button>
          </div>
          <div className={styles.preview} ref={previewRef}>
            {rendering && (
              <div className={styles.previewLoading}>
                <Loader2 size={16} className={styles.spin} /> 渲染中…
              </div>
            )}
            {error && (
              <div className={styles.previewError}>
                <AlertCircle size={14} />
                <span>渲染失败：{error}</span>
              </div>
            )}
            {rendered && !rendering && (
              <div
                className={styles.previewContent}
                dangerouslySetInnerHTML={{ __html: rendered }}
              />
            )}
            {!rendered && !rendering && !error && (
              <div className={styles.previewEmpty}>
                输入代码后将自动渲染预览
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
