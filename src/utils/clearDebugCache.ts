/**
 * Debug 模式下清除缓存的用户数据
 *
 * 用途：
 * - 开发模式下（Vite dev server）启动时清除 PocketData 相关的 localStorage / sessionStorage
 * - 解决开发过程中因 schema 变更导致的旧数据兼容问题
 * - 仅在 ?cleardebug=1 或 import.meta.env.DEV 为 true 且首次启动时执行
 *
 * 注意：
 * - 不会清除 production 模式下的数据
 * - 不会清除用户的核心数据（如 AI 会话、最近项目等），仅清除"可能因 schema 变更失效"的缓存
 * - 通过 URL 参数 ?cleardebug=1 可在任意模式下强制清除
 */

const DEBUG_CACHE_KEYS = [
  // 旧 key（兼容清理）
  'pocket-stata-theme',
  'pocket-stata-mode',
  // 转移 buffer（一次性的）
  'pocketdata-tab-transfer-buffer',
  // 备份
  'pocketdata-header-backup',
];

const DEBUG_STORAGE_PATTERNS = [
  /^pocketdata-debug-/,
  /^pocket-stata-/,
  /^pocketdata-tab-drag-/,
  /^pocketdata-zoom-modal-/,
];

let clearedThisSession = false;

export function clearDebugCache(opts: { force?: boolean } = {}): { cleared: string[] } {
  if (clearedThisSession && !opts.force) {
    return { cleared: [] };
  }

  const cleared: string[] = [];
  const isDebug = (() => {
    try {
      if (typeof window === 'undefined') return false;
      // URL 参数 ?cleardebug=1 强制清除
      const params = new URLSearchParams(window.location.search);
      if (params.get('cleardebug') === '1') return true;
      // Vite 开发模式
      // import.meta.env.DEV 在构建时被替换
      // @ts-ignore
      if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.DEV) return true;
      return false;
    } catch {
      return false;
    }
  })();

  if (!isDebug) {
    return { cleared };
  }

  try {
    // 1) 精确删除白名单 key
    for (const key of DEBUG_CACHE_KEYS) {
      try {
        if (window.localStorage.getItem(key) !== null) {
          window.localStorage.removeItem(key);
          cleared.push(key);
        }
      } catch {}
    }

    // 2) 按模式删除其他 pocketdata 临时键（保留 AI 会话、字体、项目数据）
    const keepPrefixes = [
      'pocketdata-ai',        // AI 会话与配置
      'pocketdata-fonts',     // 字体缓存
      'pocketdata-project',   // 最近项目
      'pocketdata-presets',   // 用户预设
    ];
    try {
      const toRemove: string[] = [];
      for (let i = 0; i < window.localStorage.length; i++) {
        const k = window.localStorage.key(i);
        if (!k) continue;
        // 跳过保留项
        if (keepPrefixes.some((p) => k.startsWith(p))) continue;
        // 命中模式
        if (DEBUG_STORAGE_PATTERNS.some((re) => re.test(k))) {
          toRemove.push(k);
        }
      }
      for (const k of toRemove) {
        try {
          window.localStorage.removeItem(k);
          cleared.push(k);
        } catch {}
      }
    } catch {}

    // 3) sessionStorage：直接清空（临时数据）
    try {
      window.sessionStorage.clear();
      cleared.push('__sessionStorage__');
    } catch {}
  } catch (e) {
    console.warn('[clearDebugCache] failed:', e);
  }

  clearedThisSession = true;
  if (cleared.length > 0) {
    console.info(`[clearDebugCache] cleared ${cleared.length} keys in debug mode:`, cleared);
  }
  return { cleared };
}
