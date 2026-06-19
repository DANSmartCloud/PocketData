import { useState, useEffect, useRef, useCallback } from "react";
import { marked } from "marked";
import {
  Edit3,
  Eye,
  Save,
  FileText,
  ChevronDown,
  Type,
  Heading1,
  Heading2,
  Heading3,
  Bold,
  Italic,
  List,
  ListOrdered,
  Code as CodeIcon,
  Quote,
  Link as LinkIcon,
  Image as ImageIcon,
  Table as TableIcon,
  Sigma,
  GitBranch,
  Columns,
} from "lucide-react";
import { RichMarkdown } from "@/components/common/RichMarkdown";
import { formatShortcut } from "@/utils/platformShortcut";
import styles from "./MarkdownViewer.module.css";

interface MarkdownViewerProps {
  filePath?: string;
  fileName: string;
  initialContent?: string;
  onSave?: (content: string) => void;
  onClose?: () => void;
}

export function MarkdownViewer({
  fileName,
  filePath,
  initialContent = "",
  onSave,
}: MarkdownViewerProps) {
  const [content, setContent] = useState(initialContent);
  const [view, setView] = useState<"edit" | "preview" | "split">("split");
  const [showToolbar, setShowToolbar] = useState(true);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const editorPaneRef = useRef<HTMLDivElement>(null);
  const lastFilePathRef = useRef<string | undefined>(filePath);

  /**
   * 修复 MD 编辑器不响应文件切换：
   * 当 filePath 变化（用户切换/打开另一个 md 文件）时，强制重置 content。
   * 否则会停留在上一个文件的内容上。
   */
  useEffect(() => {
    if (filePath !== lastFilePathRef.current) {
      lastFilePathRef.current = filePath;
      setContent(initialContent);
    }
  }, [filePath, initialContent]);

  // 工具栏：插入文本到光标位置
  const insertText = useCallback(
    (before: string, after: string = "", placeholder: string = "") => {
      const ta = textareaRef.current;
      if (!ta) return;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const selected = ta.value.substring(start, end) || placeholder;
      const newText = ta.value.substring(0, start) + before + selected + after + ta.value.substring(end);
      setContent(newText);
      setTimeout(() => {
        ta.focus();
        const newCursorPos = start + before.length + selected.length;
        ta.setSelectionRange(newCursorPos, newCursorPos);
      }, 0);
    },
    []
  );

  // 分屏模式：编辑器 → 预览 同步滚动
  const handleEditorScroll = useCallback(
    (previewEl: HTMLDivElement | null) => {
      if (view !== "split" || !previewEl) return;
      const ta = textareaRef.current;
      if (!ta) return;
      const maxTa = ta.scrollHeight - ta.clientHeight;
      const maxPrev = previewEl.scrollHeight - previewEl.clientHeight;
      if (maxTa <= 0) return;
      const ratio = ta.scrollTop / maxTa;
      previewEl.scrollTop = Math.max(0, ratio * maxPrev);
    },
    [view]
  );

  const handlePreviewScroll = useCallback(
    (previewEl: HTMLDivElement | null) => {
      if (view !== "split" || !previewEl) return;
      const ta = textareaRef.current;
      if (!ta) return;
      const maxTa = ta.scrollHeight - ta.clientHeight;
      const maxPrev = previewEl.scrollHeight - previewEl.clientHeight;
      if (maxPrev <= 0) return;
      const ratio = previewEl.scrollTop / maxPrev;
      ta.scrollTop = Math.max(0, ratio * maxTa);
    },
    [view]
  );

  const handleSave = () => {
    onSave?.(content);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "s") {
      e.preventDefault();
      handleSave();
    }
  };

  // 监听来自 Toolbar 的保存事件
  useEffect(() => {
    const handler = () => handleSave();
    window.addEventListener("pocketdata:markdown-save", handler);
    return () => window.removeEventListener("pocketdata:markdown-save", handler);
  }, [content]);

  return (
    <div className={styles.container} onKeyDown={handleKeyDown}>
      {/* 顶部工具栏 */}
      <div className={styles.topBar}>
        <div className={styles.fileInfo}>
          <FileText size={14} className={styles.fileIcon} />
          <span className={styles.fileName}>{fileName}</span>
          {content !== initialContent && <span className={styles.dirtyMark}>●</span>}
        </div>

        <div className={styles.viewSwitcher}>
          <button
            className={`${styles.viewBtn} ${view === "edit" ? styles.viewBtnActive : ""}`}
            onClick={() => setView("edit")}
            title="仅编辑"
          >
            <Edit3 size={13} /> 编辑
          </button>
          <button
            className={`${styles.viewBtn} ${view === "split" ? styles.viewBtnActive : ""}`}
            onClick={() => setView("split")}
            title="分屏：编辑+预览（同步滚动）"
          >
            <Columns size={13} /> 分屏
          </button>
          <button
            className={`${styles.viewBtn} ${view === "preview" ? styles.viewBtnActive : ""}`}
            onClick={() => setView("preview")}
            title="仅预览（所见即所得）"
          >
            <Eye size={13} /> 预览
          </button>
        </div>

        <div className={styles.topActions}>
          <button
            className={styles.toolbarToggleBtn}
            onClick={() => setShowToolbar((s) => !s)}
            title="工具栏"
          >
            <Type size={13} />
            <ChevronDown size={11} style={{ transform: showToolbar ? "rotate(180deg)" : "none" }} />
          </button>
          <button className={styles.saveBtn} onClick={handleSave} title={`保存 (${formatShortcut("Ctrl+S")})`}>
            <Save size={13} /> 保存
          </button>
        </div>
      </div>

      {/* 格式化工具栏 */}
      {showToolbar && (
        <div className={styles.formatToolbar}>
          <ToolbarButton icon={<Heading1 size={14} />} title="一级标题" onClick={() => insertText("\n# ", "", "标题")} />
          <ToolbarButton icon={<Heading2 size={14} />} title="二级标题" onClick={() => insertText("\n## ", "", "标题")} />
          <ToolbarButton icon={<Heading3 size={14} />} title="三级标题" onClick={() => insertText("\n### ", "", "标题")} />
          <div className={styles.toolbarDivider} />
          <ToolbarButton icon={<Bold size={14} />} title="加粗" onClick={() => insertText("**", "**", "加粗文本")} />
          <ToolbarButton icon={<Italic size={14} />} title="斜体" onClick={() => insertText("*", "*", "斜体文本")} />
          <ToolbarButton icon={<CodeIcon size={14} />} title="行内代码" onClick={() => insertText("`", "`", "code")} />
          <div className={styles.toolbarDivider} />
          <ToolbarButton icon={<List size={14} />} title="无序列表" onClick={() => insertText("\n- ", "", "列表项")} />
          <ToolbarButton icon={<ListOrdered size={14} />} title="有序列表" onClick={() => insertText("\n1. ", "", "列表项")} />
          <ToolbarButton icon={<Quote size={14} />} title="引用" onClick={() => insertText("\n> ", "", "引用内容")} />
          <div className={styles.toolbarDivider} />
          <ToolbarButton icon={<LinkIcon size={14} />} title="链接" onClick={() => insertText("[", "](https://)", "链接文本")} />
          <ToolbarButton icon={<ImageIcon size={14} />} title="图片" onClick={() => insertText("![", "](https://)", "图片描述")} />
          <ToolbarButton icon={<TableIcon size={14} />} title="表格" onClick={() => insertText("\n| 列1 | 列2 | 列3 |\n| --- | --- | --- |\n| A | B | C |\n", "", "")} />
          <div className={styles.toolbarDivider} />
          <ToolbarButton
            icon={<Sigma size={14} />}
            title="行内公式 (LaTeX)"
            onClick={() => insertText("$", "$", "a^2 + b^2 = c^2")}
          />
          <ToolbarButton
            icon={<span style={{ fontSize: 12, fontWeight: 700 }}>$$</span>}
            title="块级公式 (LaTeX)"
            onClick={() => insertText("\n\n$$\n", "\n$$\n", "\\sum_{i=1}^{n} i")}
          />
          <ToolbarButton
            icon={<GitBranch size={14} />}
            title="Mermaid 图表"
            onClick={() => insertText("\n```mermaid\n", "\n```\n", "graph TD\n  A[开始] --> B[结束]")}
          />
        </div>
      )}

      {/* 主内容区 */}
      <div className={`${styles.main} ${styles[`view-${view}`]}`}>
        {(view === "edit" || view === "split") && (
          <div className={styles.editorPane} ref={editorPaneRef}>
            <textarea
              ref={textareaRef}
              className={styles.editor}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onScroll={() => {
                // 仅在 split 模式同步
                if (view !== "split") return;
                const previewPane = editorPaneRef.current?.parentElement?.querySelector(
                  `.${styles.previewPane} .${styles.preview}`
                ) as HTMLDivElement | null;
                handleEditorScroll(previewPane);
              }}
              spellCheck={false}
              placeholder="在此输入 Markdown 内容..."
            />
          </div>
        )}
        {(view === "preview" || view === "split") && (
          <div className={styles.previewPane}>
            <PreviewPane
              content={content}
              onScroll={(el) => handlePreviewScroll(el)}
            />
          </div>
        )}
      </div>
    </div>
  );
}

/* =================================================================
 * 预览区：包装 RichMarkdown + 暴露 scroll 同步
 * ================================================================= */
function PreviewPane({
  content,
  onScroll,
}: {
  content: string;
  onScroll: (el: HTMLDivElement | null) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div
      ref={ref}
      className={styles.preview}
      onScroll={() => onScroll(ref.current)}
    >
      <RichMarkdown text={content} />
    </div>
  );
}

function ToolbarButton({ icon, title, onClick }: { icon: React.ReactNode; title: string; onClick: () => void }) {
  return (
    <button className={styles.formatBtn} onClick={onClick} title={title} type="button">
      {icon}
    </button>
  );
}

// 防止 marked 单例被任何地方 mutate 后影响其他组件
void marked;
