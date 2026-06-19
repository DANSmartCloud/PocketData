/**
 * 剪贴板工具：纯文本复制、富文本（HTML）复制、图片复制
 *
 * 策略优先级：
 * 1. Tauri 原生剪贴板插件（最可靠，直接调用系统 API，不受浏览器安全限制）
 * 2. 浏览器 Clipboard API（navigator.clipboard.write / writeText）
 * 3. document.execCommand("copy") + copy 事件（兼容性 fallback）
 */

/**
 * 检测是否在 Tauri 环境中运行（同步检测，不依赖 async isTauri）
 */
function isTauriEnv(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/**
 * 获取 Tauri 剪贴板插件（懒加载，返回模块的各个函数）
 */
let _clipboardModule: any = null;
async function getTauriClipboard() {
  if (_clipboardModule) return _clipboardModule;
  try {
    const mod = await import("@tauri-apps/plugin-clipboard-manager");
    _clipboardModule = mod;
    return mod;
  } catch {
    return null;
  }
}

/**
 * 复制纯文本到剪贴板
 */
export async function copyPlainText(text: string): Promise<void> {
  // 策略1：Tauri 原生剪贴板
  if (isTauriEnv()) {
    try {
      const clip = await getTauriClipboard();
      if (clip) {
        await clip.writeText(text);
        return;
      }
    } catch { /* fallback */ }
  }

  // 策略2：浏览器 Clipboard API
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }
  } catch { /* fallback */ }

  // 策略3：execCommand fallback
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.left = "-9999px";
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand("copy"); } catch { /* noop */ }
  document.body.removeChild(ta);
}

/**
 * 复制富文本 HTML 到剪贴板（粘贴到 Word 等应用时保留格式）
 * 同时写入 text/plain 和 text/html
 */
export async function copyRichText(html: string, plainText?: string): Promise<void> {
  // 策略1：Tauri 原生剪贴板 writeHtml（最可靠，直接调用系统 API）
  if (isTauriEnv()) {
    try {
      const clip = await getTauriClipboard();
      if (clip?.writeHtml) {
        await clip.writeHtml(html, plainText ?? html.replace(/<[^>]*>/g, ""));
        return;
      }
    } catch { /* fallback */ }
  }

  // 策略2：浏览器 Clipboard API
  try {
    if (navigator.clipboard?.write) {
      const textBlob = new Blob([plainText ?? html.replace(/<[^>]*>/g, "")], { type: "text/plain" });
      const htmlBlob = new Blob([html], { type: "text/html" });
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/plain": textBlob,
          "text/html": htmlBlob,
        }),
      ]);
      return;
    }
  } catch { /* fallback */ }

  // 策略3：copy 事件
  await copyHtmlViaEvent(html, plainText);
}

/**
 * 通过 copy 事件自定义剪贴板数据
 * 核心优势：可以精确控制 text/html 内容，不受浏览器默认行为影响
 */
export function copyHtmlViaEvent(html: string, plainText?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    let resolved = false;
    const cleanup = () => {
      document.removeEventListener("copy", handler);
    };
    const handler = (e: ClipboardEvent) => {
      e.preventDefault();
      e.clipboardData?.setData("text/html", html);
      e.clipboardData?.setData("text/plain", plainText ?? html.replace(/<[^>]*>/g, ""));
      cleanup();
      resolved = true;
      resolve();
    };
    document.addEventListener("copy", handler);

    const temp = document.createElement("div");
    temp.textContent = "\u200B";
    temp.style.position = "fixed";
    temp.style.left = "-9999px";
    document.body.appendChild(temp);

    const range = document.createRange();
    range.selectNodeContents(temp);
    const sel = window.getSelection();
    if (sel) {
      sel.removeAllRanges();
      sel.addRange(range);
    }

    try {
      const ok = document.execCommand("copy");
      if (!ok) {
        cleanup();
        reject(new Error("execCommand('copy') returned false"));
      }
    } catch (err) {
      cleanup();
      reject(err);
    } finally {
      document.body.removeChild(temp);
    }

    setTimeout(() => {
      if (!resolved) {
        cleanup();
        reject(new Error("copyHtmlViaEvent timeout: copy event never fired"));
      }
    }, 2000);
  });
}

/**
 * 将 SVG 字符串转换为 PNG Blob
 * 处理 Mermaid SVG 可能使用 width="100%" 或无固定像素尺寸的情况
 */
async function svgToPngBlob(svgString: string, scale = 2): Promise<Blob> {
  const fixedSvg = ensureSvgPixelSize(svgString);

  return new Promise((resolve, reject) => {
    const img = new Image();
    const svgBlob = new Blob([fixedSvg], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(svgBlob);

    let settled = false;
    const TIMEOUT_MS = 5000;

    const cleanup = () => {
      URL.revokeObjectURL(url);
    };

    img.onload = () => {
      if (settled) return;
      settled = true;
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      if (w === 0 || h === 0) {
        cleanup();
        reject(new Error(`SVG has zero dimensions: ${w}x${h}`));
        return;
      }
      const canvas = document.createElement("canvas");
      canvas.width = w * scale;
      canvas.height = h * scale;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        cleanup();
        reject(new Error("Canvas context not available"));
        return;
      }
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0);
      canvas.toBlob((blob) => {
        cleanup();
        if (blob) resolve(blob);
        else reject(new Error("Canvas toBlob failed"));
      }, "image/png");
    };

    img.onerror = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error("SVG image load failed"));
    };

    setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error("svgToPngBlob timeout: image load did not complete"));
    }, TIMEOUT_MS);

    img.src = url;
  });
}

/**
 * 将 PNG Blob 转换为 Uint8Array（供 Tauri 剪贴板插件 writeImage 使用）
 */
async function blobToUint8Array(blob: Blob): Promise<Uint8Array> {
  const arrayBuffer = await blob.arrayBuffer();
  return new Uint8Array(arrayBuffer);
}

/**
 * 确保 SVG 有固定像素尺寸（而非百分比或 auto）
 */
function ensureSvgPixelSize(svgString: string): string {
  if (typeof document === "undefined") return svgString;
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgString.trim(), "image/svg+xml");
    const root = doc.querySelector("svg");
    if (!root) return svgString;

    const vb = root.getAttribute("viewBox");
    let w = 0, h = 0;
    if (vb) {
      const parts = vb.split(/[\s,]+/);
      if (parts.length >= 4) {
        w = parseFloat(parts[2]) || 0;
        h = parseFloat(parts[3]) || 0;
      }
    }

    if (w === 0 || h === 0) {
      const wAttr = root.getAttribute("width");
      const hAttr = root.getAttribute("height");
      const wParsed = parseFloat(wAttr || "0");
      const hParsed = parseFloat(hAttr || "0");
      if (wParsed > 0 && !/%/.test(wAttr || "")) w = wParsed;
      if (hParsed > 0 && !/%/.test(hAttr || "")) h = hParsed;
    }

    if (w === 0) w = 800;
    if (h === 0) h = 600;

    root.setAttribute("width", `${w}`);
    root.setAttribute("height", `${h}`);

    if (!root.getAttribute("viewBox")) {
      root.setAttribute("viewBox", `0 0 ${w} ${h}`);
    }

    // 移除可能干扰 <img> 加载的内联样式
    const style = root.getAttribute("style");
    if (style) {
      const cleaned = style
        .replace(/max-width\s*:\s*[^;]+;?/gi, "")
        .replace(/max-height\s*:\s*[^;]+;?/gi, "")
        .replace(/height\s*:\s*auto;?/gi, "");
      if (cleaned.trim()) {
        root.setAttribute("style", cleaned.trim());
      } else {
        root.removeAttribute("style");
      }
    }

    const serializer = new XMLSerializer();
    return serializer.serializeToString(root);
  } catch {
    return svgString;
  }
}

/**
 * 复制 SVG 为图片到剪贴板（粘贴到 Word/PPT 时为图片）
 *
 * 策略优先级：
 * 1. Tauri 原生剪贴板写入图片（最可靠，直接调用系统 API）
 * 2. navigator.clipboard.write() + image/png
 * 3. copy 事件写入 image/svg+xml + text/html + text/plain
 * 4. copyHtmlViaEvent 写入 text/html（内联 SVG）
 * 5. 纯文本 fallback
 */
export async function copySvgAsRichImage(svgString: string): Promise<void> {
  let svg = svgString.trim();
  if (!svg.includes("xmlns")) {
    svg = svg.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');
  }

  // 先尝试 SVG→PNG 转换（所有策略都需要）
  let pngBlob: Blob | null = null;
  try {
    pngBlob = await svgToPngBlob(svg);
  } catch (e) {
    console.warn("[clipboard] svgToPngBlob failed, will try fallback strategies", e);
  }

  // 策略1：Tauri 原生剪贴板写入图片（最可靠）
  if (isTauriEnv() && pngBlob) {
    try {
      const clip = await getTauriClipboard();
      if (clip) {
        const imageData = await blobToUint8Array(pngBlob);
        await clip.writeImage(imageData);
        return;
      }
    } catch (e) {
      console.warn("[clipboard] Tauri writeImage failed, trying browser fallback", e);
    }
  }

  // 策略2：navigator.clipboard.write() + image/png
  if (pngBlob) {
    try {
      if (navigator.clipboard?.write) {
        try {
          const htmlBlob = new Blob([svg], { type: "text/html" });
          await navigator.clipboard.write([
            new ClipboardItem({
              "image/png": pngBlob,
              "text/html": htmlBlob,
            }),
          ]);
          return;
        } catch {
          try {
            await navigator.clipboard.write([
              new ClipboardItem({ "image/png": pngBlob }),
            ]);
            return;
          } catch { /* fallback */ }
        }
      }
    } catch (e) {
      console.warn("[clipboard] navigator.clipboard.write PNG failed", e);
    }
  }

  // 策略3：copy 事件写入 image/svg+xml + text/html + text/plain
  try {
    await copySvgViaEvent(svg);
    return;
  } catch (e) {
    console.warn("[clipboard] copySvgViaEvent failed, trying HTML fallback", e);
  }

  // 策略4：copyHtmlViaEvent 写入 text/html（内联 SVG）
  try {
    await copyHtmlViaEvent(svg, "[SVG Image]");
    return;
  } catch (e) {
    console.warn("[clipboard] copyHtmlViaEvent failed", e);
  }

  // 策略5：纯文本 fallback
  await copyPlainText(svgString);
}

/**
 * 通过 copy 事件写入 SVG 数据
 */
function copySvgViaEvent(svgString: string): Promise<void> {
  return new Promise((resolve, reject) => {
    let resolved = false;
    const cleanup = () => {
      document.removeEventListener("copy", handler);
    };
    const handler = (e: ClipboardEvent) => {
      e.preventDefault();
      try {
        e.clipboardData?.setData("image/svg+xml", svgString);
      } catch { /* 某些浏览器不支持此 MIME type */ }
      e.clipboardData?.setData("text/html", svgString);
      e.clipboardData?.setData("text/plain", "[SVG Image]");
      cleanup();
      resolved = true;
      resolve();
    };
    document.addEventListener("copy", handler);

    const temp = document.createElement("div");
    temp.textContent = "\u200B";
    temp.style.position = "fixed";
    temp.style.left = "-9999px";
    document.body.appendChild(temp);

    const range = document.createRange();
    range.selectNodeContents(temp);
    const sel = window.getSelection();
    if (sel) {
      sel.removeAllRanges();
      sel.addRange(range);
    }

    try {
      const ok = document.execCommand("copy");
      if (!ok) {
        cleanup();
        reject(new Error("execCommand('copy') returned false"));
      }
    } catch (err) {
      cleanup();
      reject(err);
    } finally {
      document.body.removeChild(temp);
    }

    setTimeout(() => {
      if (!resolved) {
        cleanup();
        reject(new Error("copySvgViaEvent timeout"));
      }
    }, 2000);
  });
}

/**
 * 复制 SVG 为 PNG 图片到剪贴板（粘贴到 Word/PPT 时为位图）
 */
export async function copySvgAsImage(svgString: string): Promise<void> {
  let svg = svgString.trim();
  if (!svg.includes("xmlns")) {
    svg = svg.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');
  }

  try {
    const pngBlob = await svgToPngBlob(svg);

    // Tauri 原生
    if (isTauriEnv()) {
      try {
        const clip = await getTauriClipboard();
        if (clip) {
          const imageData = await blobToUint8Array(pngBlob);
          await clip.writeImage(imageData);
          return;
        }
      } catch { /* fallback */ }
    }

    // 浏览器
    if (navigator.clipboard?.write) {
      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": pngBlob }),
      ]);
      return;
    }
  } catch (e) {
    console.warn("[clipboard] copySvgAsImage failed, falling back to SVG text", e);
  }

  await copyPlainText(svgString);
}

/**
 * 复制 HTML 元素渲染结果为富文本
 */
export async function copyElementAsRichText(element: HTMLElement): Promise<void> {
  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.left = "-9999px";
  container.style.top = "0";
  container.appendChild(element.cloneNode(true));
  document.body.appendChild(container);

  const range = document.createRange();
  range.selectNodeContents(container);
  const selection = window.getSelection();
  if (selection) {
    selection.removeAllRanges();
    selection.addRange(range);
    try { document.execCommand("copy"); } catch { /* noop */ }
    selection.removeAllRanges();
  }
  document.body.removeChild(container);
}

/**
 * 将 HTML 字符串作为富文本复制
 */
export async function copyHtmlAsRichText(html: string): Promise<void> {
  await copyHtmlViaEvent(html);
}

/**
 * 复制渲染后的 DOM 元素为富文本（用于复合消息复制）
 */
export async function copyRenderedContent(element: HTMLElement): Promise<void> {
  const clone = element.cloneNode(true) as HTMLElement;

  // 1. KaTeX 公式：提取 MathML 替换整个 .katex 元素
  clone.querySelectorAll(".katex").forEach((el) => {
    const mathml = el.querySelector(".katex-mathml");
    if (mathml) {
      const math = mathml.querySelector("math");
      if (math) {
        const wrapper = document.createElement("div");
        wrapper.style.textAlign = "center";
        wrapper.style.margin = "8px 0";
        wrapper.appendChild(math.cloneNode(true));
        el.parentNode?.replaceChild(wrapper, el);
      }
    }
  });

  // 2. 代码块：添加内联背景色和样式
  clone.querySelectorAll("pre").forEach((el) => {
    const pre = el as HTMLElement;
    pre.style.backgroundColor = "#1e293b";
    pre.style.color = "#e2e8f0";
    pre.style.padding = "12px";
    pre.style.borderRadius = "6px";
    pre.style.fontFamily = "monospace";
    pre.style.fontSize = "13px";
    pre.style.lineHeight = "1.6";
    pre.style.overflowX = "auto";
    pre.style.whiteSpace = "pre-wrap";
    pre.style.wordBreak = "break-all";
  });
  clone.querySelectorAll("code").forEach((el) => {
    const code = el as HTMLElement;
    if (code.parentElement?.tagName !== "PRE") {
      code.style.backgroundColor = "#1e293b";
      code.style.color = "#e2e8f0";
      code.style.padding = "2px 6px";
      code.style.borderRadius = "3px";
      code.style.fontFamily = "monospace";
      code.style.fontSize = "0.9em";
    }
  });

  // 3. 表格
  clone.querySelectorAll("table").forEach((el) => {
    const table = el as HTMLElement;
    table.setAttribute("width", "100%");
    table.style.width = "100%";
    table.style.borderCollapse = "collapse";
    table.style.fontSize = "13px";
  });
  clone.querySelectorAll("td, th").forEach((el) => {
    const cell = el as HTMLElement;
    cell.style.border = "1px solid #d1d5db";
    cell.style.padding = "6px 10px";
  });
  clone.querySelectorAll("th").forEach((el) => {
    const th = el as HTMLElement;
    th.style.backgroundColor = "#f3f4f6";
    th.style.fontWeight = "600";
  });

  // 4. SVG（Mermaid）：确保有 xmlns 属性
  clone.querySelectorAll("svg").forEach((el) => {
    if (!el.getAttribute("xmlns")) {
      el.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    }
  });

  const html = clone.innerHTML;
  const plainText = clone.textContent ?? "";
  await copyHtmlViaEvent(html, plainText);
}
