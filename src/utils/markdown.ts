/**
 * 轻量级 Markdown 渲染器（仅支持基础语法）
 * 不引入第三方依赖，避免包体积膨胀
 *
 * 支持：标题、粗体、斜体、行内代码、代码块（外层处理）、列表、引用、链接
 * 公式：$...$ 和 $$...$$ 占位支持（用 katex 渲染需额外依赖）
 */

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;')
   .replace(/</g, '&lt;')
   .replace(/>/g, '&gt;')
   .replace(/"/g, '&quot;')
   .replace(/'/g, '&#39;');

function renderInline(text: string): string {
  // 转义
  let s = escapeHtml(text);

  // 行内代码 `code`
  s = s.replace(/`([^`\n]+)`/g, '<code class="ai-inline-code">$1</code>');

  // 粗体 **text**
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

  // 斜体 *text*
  s = s.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');

  // 链接 [text](url)
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

  // 简单 $math$ 标记
  s = s.replace(/\$([^$]+)\$/g, '<code class="ai-inline-code">$1</code>');

  return s;
}

export function renderInlineMarkdown(text: string): string {
  return renderInline(text);
}

export function renderMarkdown(md: string): string {
  const lines = md.split('\n');
  const out: string[] = [];
  let inList: 'ul' | 'ol' | null = null;
  let inQuote = false;
  let inPara: string[] = [];

  const closeList = () => {
    if (inList) { out.push(`</${inList}>`); inList = null; }
  };
  const closeQuote = () => {
    if (inQuote) { out.push('</blockquote>'); inQuote = false; }
  };
  const closePara = () => {
    if (inPara.length) {
      out.push(`<p>${renderInline(inPara.join(' '))}</p>`);
      inPara = [];
    }
  };
  const closeAll = () => { closePara(); closeList(); closeQuote(); };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // 标题
    const h = line.match(/^(#{1,6})\s+(.+)$/);
    if (h) {
      closeAll();
      const level = h[1].length;
      out.push(`<h${level}>${renderInline(h[2])}</h${level}>`);
      continue;
    }

    // 引用
    if (/^>\s+/.test(line)) {
      closePara();
      closeList();
      if (!inQuote) { out.push('<blockquote>'); inQuote = true; }
      out.push(`<p>${renderInline(line.replace(/^>\s+/, ''))}</p>`);
      continue;
    } else {
      closeQuote();
    }

    // 无序列表
    if (/^[-*]\s+/.test(line)) {
      closePara();
      if (inList !== 'ul') { closeList(); out.push('<ul>'); inList = 'ul'; }
      out.push(`<li>${renderInline(line.replace(/^[-*]\s+/, ''))}</li>`);
      continue;
    }

    // 有序列表
    if (/^\d+\.\s+/.test(line)) {
      closePara();
      if (inList !== 'ol') { closeList(); out.push('<ol>'); inList = 'ol'; }
      out.push(`<li>${renderInline(line.replace(/^\d+\.\s+/, ''))}</li>`);
      continue;
    } else {
      closeList();
    }

    // 空行 = 段落结束
    if (!line.trim()) {
      closePara();
      continue;
    }

    // 段落累积
    inPara.push(line);
  }

  closeAll();
  return out.join('\n');
}
