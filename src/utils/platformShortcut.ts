/**
 * 跨平台快捷键显示工具
 *
 * 设计目标：
 * - Windows / Linux：使用 Ctrl + 字母（行业标准）
 * - macOS：使用 ⌘ 符号（行业惯例，避免误导用户使用 Ctrl）
 * - Alt 键在 macOS 上是 ⌥
 * - Shift 键在 macOS 上是 ⇧
 *
 * 检测逻辑：
 * - 优先用 Tauri 注入的 navigator.platform（桌面应用环境更稳定）
 * - 浏览器环境用 navigator.userAgent 兜底
 */

let cachedIsMac: boolean | null = null;

/** 是否为 macOS（结果会缓存） */
export function isMacPlatform(): boolean {
  if (cachedIsMac !== null) return cachedIsMac;

  if (typeof navigator === 'undefined') {
    cachedIsMac = false;
    return false;
  }

  const platform = (navigator.platform || '').toLowerCase();
  const userAgent = (navigator.userAgent || '').toLowerCase();
  // Mac 用 Intel Mac / Apple Silicon 都是 "MacIntel" / "MacARM" / "MacPPC"
  cachedIsMac =
    platform.includes('mac') ||
    userAgent.includes('mac os x') ||
    userAgent.includes('macintosh');
  return cachedIsMac;
}

/**
 * 平台修饰键符号
 * - Windows/Linux: 'Ctrl'
 * - macOS: '⌘'
 */
export function getMetaSymbol(): string {
  return isMacPlatform() ? '⌘' : 'Ctrl';
}

/**
 * 将快捷键字符串转换为当前平台友好的显示形式
 *
 * 支持的写法：
 * - "Ctrl+O"       → macOS: "⌘O" / 其他: "Ctrl+O"
 * - "Ctrl+Shift+O" → macOS: "⇧⌘O" / 其他: "Ctrl+Shift+O"
 * - "Ctrl+Alt+Z"   → macOS: "⌥⌘Z" / 其他: "Ctrl+Alt+Z"
 * - "Alt+Tab"      → macOS: "⌥Tab" / 其他: "Alt+Tab"
 * - "F11"          → 保持不变
 *
 * 输出顺序（macOS 惯例）：⌃ ⌥ ⇧ ⌘ + 主键
 * 输出顺序（其他平台）：Ctrl+Shift+Alt+主键
 */
export function formatShortcut(input: string): string {
  if (!input) return '';
  const mac = isMacPlatform();

  // 拆分主键
  const parts = input.split('+').map((s) => s.trim());
  const mainKey = parts[parts.length - 1] || '';
  const mods = parts.slice(0, -1).map((m) => m.toLowerCase());

  const hasCtrl = mods.includes('ctrl') || mods.includes('control');
  const hasShift = mods.includes('shift');
  const hasAlt = mods.includes('alt') || mods.includes('option');

  if (mac) {
    const out: string[] = [];
    if (hasCtrl) out.push('⌃');
    if (hasAlt) out.push('⌥');
    if (hasShift) out.push('⇧');
    if (hasCtrl) out.push('⌘');
    out.push(mainKey);
    return out.join('');
  }

  // Windows / Linux: "Ctrl+Shift+Alt+主键" 顺序
  const out: string[] = [];
  if (hasCtrl) out.push('Ctrl');
  if (hasShift) out.push('Shift');
  if (hasAlt) out.push('Alt');
  out.push(mainKey);
  return out.join('+');
}
