import { useEffect, useMemo, useRef, useState } from "react";
import { X, Download, Copy, ZoomIn, ZoomOut, Maximize2, RotateCcw, ClipboardPaste } from "lucide-react";
import { copyPlainText, copySvgAsRichImage, copyElementAsRichText, copyRichText } from "@/utils/clipboardUtils";
import styles from "./ZoomModal.module.css";

/**
 * 通用"点击查看大图/大公式"放大弹窗。
 *
 * 设计要点：
 *  - 半透明遮罩，点击遮罩或按 Esc/关闭按钮可关闭
 *  - 内容区支持 HTML 字符串（KaTeX 输出 / Mermaid SVG）与纯文本
 *  - 自动识别 SVG 字符串并以 <img src="data:..."> 渲染，确保浏览器按位图规则缩放
 *  - SVG 内容支持：滚轮缩放（Ctrl+滚轮 0.1×~8×）、拖拽平移、点击重置、双击放大
 *  - 提供"复制"与"下载"两个二级操作（按需使用）
 *  - 不抢焦点，键盘事件挂到 window
 */
export interface ZoomModalProps {
  open: boolean;
  onClose: () => void;
  /** 标题（可选，显示在头部）。为空时不显示头部 */
  title?: string;
  /** 内容类型：'html' 直接 innerHTML 渲染；'text' 显示等宽文本；'svg' 用 <img> 渲染（推荐） */
  kind?: "html" | "text" | "svg";
  /** 内容：HTML 字符串或纯文本 */
  content: string;
  /** 源码内容（可选）：如果提供，"复制源码"按钮复制此内容而非 content。
   *  例如 LaTeX 放大时 content 是 KaTeX HTML，sourceContent 是原始 LaTeX 表达式 */
  sourceContent?: string;
  /** 是否允许下载（默认 true）。注意：Mermaid 已是 SVG 字符串，下载即 .svg */
  allowDownload?: boolean;
  /** 下载时的文件名（含扩展名） */
  downloadName?: string;
  /** 是否允许复制（默认 true） */
  allowCopy?: boolean;
}

export function ZoomModal({
  open,
  onClose,
  title,
  kind = "html",
  content,
  sourceContent,
  allowDownload = true,
  downloadName = "pocketdata-zoom.svg",
  allowCopy = true,
}: ZoomModalProps) {
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
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // 将 SVG 字符串编码为 data URL，供 <img> 使用
  const svgDataUrl = useMemo(() => {
    if (kind !== "svg") return "";
    // 用 encodeURIComponent 比 btoa 更安全（支持中文字符）
    try {
      // 保留 <?xml ...?> 声明、去掉可能的多余空白
      const src = content.trim();
      return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(src)}`;
    } catch {
      return "";
    }
  }, [kind, content]);

  // 缩放/平移状态
  const [scale, setScale] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{ startX: number; startY: number; ox: number; oy: number }>({
    startX: 0, startY: 0, ox: 0, oy: 0,
  });
  const containerRef = useRef<HTMLDivElement>(null);

  // 打开/内容变化时重置变换
  useEffect(() => {
    if (open) {
      setScale(1);
      setTx(0);
      setTy(0);
    }
  }, [open, content]);

  const resetTransform = () => {
    setScale(1);
    setTx(0);
    setTy(0);
  };

  // 滚轮缩放（仅 SVG 模式）
  useEffect(() => {
    if (!open || kind !== "svg") return;
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = -e.deltaY * 0.0015;
      setScale((s) => Math.max(0.1, Math.min(8, s + delta * s)));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [open, kind]);

  // 拖拽：mousedown 在容器上，mousemove/mouseup 挂到 window（确保鼠标移出容器也能正常拖拽/释放）
  useEffect(() => {
    if (!open || kind !== "svg") return;
    const el = containerRef.current;
    if (!el) return;

    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      // 忽略在按钮等交互元素上的点击
      if ((e.target as HTMLElement).closest("button")) return;
      e.preventDefault();
      dragRef.current = { startX: e.clientX, startY: e.clientY, ox: tx, oy: ty };
      setDragging(true);
    };

    el.addEventListener("mousedown", onMouseDown);
    return () => el.removeEventListener("mousedown", onMouseDown);
  }, [open, kind, tx, ty]);

  // 拖拽中：window 级别的 mousemove/mouseup
  useEffect(() => {
    if (!dragging) return;

    const onMouseMove = (e: MouseEvent) => {
      const { startX, startY, ox, oy } = dragRef.current;
      setTx(ox + (e.clientX - startX));
      setTy(oy + (e.clientY - startY));
    };

    const onMouseUp = () => {
      setDragging(false);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [dragging]);

  const onDoubleClick = () => {
    if (scale > 1.01) resetTransform();
    else setScale(2);
  };

  if (!open) return null;

  const handleDownload = () => {
    try {
      let mime: string;
      let name = downloadName;
      if (kind === "svg") {
        mime = "image/svg+xml";
      } else if (kind === "html") {
        mime = "text/html";
        if (!name.endsWith(".html")) name = "pocketdata-zoom.html";
      } else {
        mime = "text/plain;charset=utf-8";
      }
      const blob = new Blob([content], { type: mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("[ZoomModal] download failed", e);
    }
  };

  // 复制原始源码（如果有 sourceContent 则复制源码，否则复制 content）
  const handleCopy = async () => {
    try {
      await copyPlainText(sourceContent ?? content);
    } catch (e) {
      console.error("[ZoomModal] copy failed", e);
    }
  };

  // 带格式复制：SVG → 矢量图；HTML（LaTeX）→ MathML 矢量公式
  const contentRef = useRef<HTMLDivElement>(null);
  const handleRichCopy = async () => {
    try {
      if (kind === "svg") {
        await copySvgAsRichImage(content);
      } else if (kind === "html" && sourceContent) {
        // LaTeX 公式：用 MathML 输出复制（Word 可解析为原生公式）
        const katex = (await import("katex")).default;
        const mathml = katex.renderToString(sourceContent, {
          output: "mathml",
          displayMode: true,
          throwOnError: false,
        });
        await copyRichText(mathml, sourceContent);
      } else if (kind === "html" && contentRef.current) {
        await copyElementAsRichText(contentRef.current);
      } else {
        await copyPlainText(content);
      }
    } catch (e) {
      console.error("[ZoomModal] rich copy failed", e);
    }
  };

  const isSvg = kind === "svg";
  const transform = `translate(${tx}px, ${ty}px) scale(${scale})`;

  return (
    <div className={styles.overlay} onClick={onClose} role="presentation">
      <div
        className={styles.dialog}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title || "放大查看"}
      >
        <div className={styles.header}>
          <div className={styles.title}>{title || ""}</div>
          <div className={styles.actions}>
            {isSvg && (
              <>
                <button
                  className={styles.actionBtn}
                  onClick={() => setScale((s) => Math.min(8, s * 1.25))}
                  title="放大"
                  aria-label="放大"
                >
                  <ZoomIn size={14} />
                </button>
                <button
                  className={styles.actionBtn}
                  onClick={() => setScale((s) => Math.max(0.1, s / 1.25))}
                  title="缩小"
                  aria-label="缩小"
                >
                  <ZoomOut size={14} />
                </button>
                <button
                  className={styles.actionBtn}
                  onClick={() => {
                    if (containerRef.current) {
                      const rect = containerRef.current.getBoundingClientRect();
                      setScale(Math.min(rect.width, rect.height) / 800);
                      setTx(0);
                      setTy(0);
                    }
                  }}
                  title="适合屏幕"
                  aria-label="适合屏幕"
                >
                  <Maximize2 size={14} />
                </button>
                <button
                  className={styles.actionBtn}
                  onClick={resetTransform}
                  title="重置缩放"
                  aria-label="重置缩放"
                >
                  <RotateCcw size={14} />
                </button>
                <span className={styles.zoomBadge}>{Math.round(scale * 100)}%</span>
              </>
            )}
            {allowCopy && (
              <button
                className={styles.actionBtn}
                onClick={handleCopy}
                title="复制源码"
                aria-label="复制源码"
              >
                <Copy size={14} />
              </button>
            )}
            {allowCopy && (kind === "svg" || kind === "html") && (
              <button
                className={styles.actionBtn}
                onClick={handleRichCopy}
                title={kind === "svg" ? "复制为图片" : "带格式复制"}
                aria-label={kind === "svg" ? "复制为图片" : "带格式复制"}
              >
                <ClipboardPaste size={14} />
              </button>
            )}
            {allowDownload && (
              <button
                className={styles.actionBtn}
                onClick={handleDownload}
                title="下载为文件"
                aria-label="下载"
              >
                <Download size={14} />
              </button>
            )}
            <button
              className={styles.closeBtn}
              onClick={onClose}
              title="关闭 (Esc)"
              aria-label="关闭"
            >
              <X size={15} />
            </button>
          </div>
        </div>
        <div
          className={styles.body}
          ref={containerRef}
          onDoubleClick={onDoubleClick}
          style={{ cursor: isSvg ? (dragging ? "grabbing" : "grab") : "default", userSelect: dragging ? "none" : "auto" }}
        >
          {isSvg ? (
            <div className={styles.svgStage}>
              <img
                src={svgDataUrl}
                alt="放大图表"
                className={styles.svgImg}
                draggable={false}
                style={{ transform }}
              />
            </div>
          ) : kind === "html" ? (
            <div
              ref={contentRef}
              className={styles.content}
              // KaTeX 输出 SVG
              dangerouslySetInnerHTML={{ __html: content }}
            />
          ) : (
            <pre className={styles.pre}>{content}</pre>
          )}
        </div>
        {isSvg && (
          <div className={styles.hint}>
            滚轮缩放 · 拖拽平移 · 双击切换 1×/2× · Esc 关闭
          </div>
        )}
      </div>
    </div>
  );
}
