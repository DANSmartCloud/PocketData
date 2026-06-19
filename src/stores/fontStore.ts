import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * 字体设置 Store
 *
 * - `globalFont`  全局正文字体（覆盖 --app-font）
 * - `monoFont`    全局等宽字体（覆盖 --app-mono-font），适用于终端、代码、数据表
 * - `paneFonts`   各个窗格的自定义字体（paneId -> font family 字符串）
 *
 * 字体值应为 CSS font-family 字符串，例如：
 *   '"Maple Mono", "JetBrains Mono"'
 *   '"Microsoft YaHei", sans-serif'
 *   'system-ui'
 *
 * 字体来源（systemFonts）通过 invoke('list_system_fonts') 异步获取，
 * 启动时由 App.tsx 调用，失败时回退到 hardcoded 列表。
 */

export interface FontSettings {
  globalFont: string;
  monoFont: string;
  paneFonts: Record<string, string>;
}

interface FontStore extends FontSettings {
  setGlobalFont: (font: string) => void;
  setMonoFont: (font: string) => void;
  setPaneFont: (paneId: string, font: string | null) => void;
  resetAll: () => void;
  /** 序列化为 CSS 变量值（去除首尾空白、保留引号） */
  buildCssValue: (font: string) => string;
  /** 应用所有字体设置到 document.documentElement */
  applyFonts: () => void;
}

// 全局 UI 字体默认走 Maple Mono（NF CN 版本带 CJK / 编程连字 / Nerd Font 图标）
// 一套字体同时覆盖中英文 UI + 代码 + 终端
const DEFAULT_GLOBAL = '"Maple Mono", "Maple Mono NF CN", "JetBrains Mono", "Cascadia Code", "Consolas", monospace';
const DEFAULT_MONO = '"Maple Mono", "Maple Mono NF CN", "JetBrains Mono", "Cascadia Code", "Consolas", monospace';

const FALLBACK_FONTS = [
  // 内置（应用自带）
  'Maple Mono',
  // 中文字体
  'Microsoft YaHei',
  'PingFang SC',
  'Source Han Sans CN',
  'Noto Sans CJK SC',
  'HarmonyOS Sans SC',
  // 英文 / 等宽
  'Inter',
  'Segoe UI',
  'Helvetica Neue',
  'Arial',
  'JetBrains Mono',
  'Cascadia Code',
  'Fira Code',
  'Source Code Pro',
  'Consolas',
  'Menlo',
  'SF Mono',
  'Monaco',
  // Mac
  'San Francisco',
  'Avenir Next',
  // Linux
  'Ubuntu',
  'DejaVu Sans',
  'Liberation Sans',
];

export const useFontStore = create<FontStore>()(
  persist(
    (set, get) => ({
      globalFont: DEFAULT_GLOBAL,
      monoFont: DEFAULT_MONO,
      paneFonts: {},

      setGlobalFont: (font) => {
        set({ globalFont: font });
        // 实时套用
        get().applyFonts();
      },

      setMonoFont: (font) => {
        set({ monoFont: font });
        get().applyFonts();
      },

      setPaneFont: (paneId, font) => {
        set((state) => {
          const next = { ...state.paneFonts };
          if (font === null || !font) {
            delete next[paneId];
          } else {
            next[paneId] = font;
          }
          return { paneFonts: next };
        });
        get().applyFonts();
      },

      resetAll: () => {
        set({ globalFont: DEFAULT_GLOBAL, monoFont: DEFAULT_MONO, paneFonts: {} });
        get().applyFonts();
      },

      buildCssValue: (font: string) => font.trim() || DEFAULT_GLOBAL,

      applyFonts: () => {
        if (typeof document === 'undefined') return;
        const { globalFont, monoFont, paneFonts, buildCssValue } = get();
        const root = document.documentElement;
        root.style.setProperty('--app-font', buildCssValue(globalFont));
        root.style.setProperty('--app-mono-font', buildCssValue(monoFont));
        // 同步持久化变量
        root.style.setProperty('--font-sans', buildCssValue(globalFont));
        root.style.setProperty('--font-mono', buildCssValue(monoFont));
        // 套用窗格字体：在 paneFonts 容器中查找 [data-pane-id] 元素
        Object.entries(paneFonts).forEach(([paneId, font]) => {
          document
            .querySelectorAll<HTMLElement>(`[data-pane-id="${paneId}"]`)
            .forEach((el) => {
              el.style.setProperty('--pane-font', buildCssValue(font));
            });
        });
      },
    }),
    {
      name: 'pocketdata-fonts',
      version: 3,
      partialize: (state) => ({
        globalFont: state.globalFont,
        monoFont: state.monoFont,
        paneFonts: state.paneFonts,
      }),
      // 版本迁移：
      //   v1 → v2：把 globalFont 强制回退到默认 UI 字体（之前可能被误设为 Maple Mono）
      //   v2 → v3：切换默认字体为 Maple Mono NF CN（含 CJK 字形 + 编程连字 + Nerd Font 图标）
      //           持久化数据被覆写为新的默认 globalFont / monoFont；
      //           保留 paneFonts（用户的窗格覆盖可能有用）
      migrate: (persisted: any, version) => {
        if (!persisted) return persisted as FontSettings;
        if (version < 3) {
          return {
            globalFont: DEFAULT_GLOBAL,
            monoFont: DEFAULT_MONO,
            paneFonts: persisted.paneFonts ?? {},
          } as FontSettings;
        }
        return persisted as FontSettings;
      },
    }
  )
);

/** 字体回退列表（系统字体加载失败时使用） */
export const FALLBACK_FONT_LIST: string[] = FALLBACK_FONTS;

/** 异步获取系统已安装的字体列表（通过 Tauri 命令 list_system_fonts） */
export async function listSystemFonts(): Promise<string[]> {
  try {
    const { invoke } = await import('@tauri-apps/api/core');
    const fonts = await invoke<string[]>('list_system_fonts');
    if (Array.isArray(fonts) && fonts.length > 0) {
      return fonts;
    }
  } catch {
    /* 在 web 模式下 invoke 不存在，使用回退 */
  }
  return FALLBACK_FONT_LIST;
}
