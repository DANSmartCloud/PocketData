import { Palette, Monitor, Sun, Moon, Sparkles, RotateCcw } from "lucide-react";
import { useUIStore, ACCENT_COLORS, type AccentColorId } from "@/stores/uiStore";
import styles from "./ThemeSettingsPanel.module.css";

/**
 * 主题设置面板
 *
 * 包含：
 * 1. 主题模式（浅色 / 深色 / 跟随系统）
 * 2. 8 种预设强调色，默认天空蓝（blue），全局应用到 --color-primary 系列
 * 3. 一键重置主题
 */
export function ThemeSettingsPanel() {
  const theme = useUIStore((s) => s.theme);
  const setTheme = useUIStore((s) => s.setTheme);
  const accentColor = useUIStore((s) => s.accentColor);
  const setAccentColor = useUIStore((s) => s.setAccentColor);

  return (
    <div className={styles.panel} data-pane-id="theme">
      {/* 主题模式 */}
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>
          <Monitor size={14} />
          主题模式
        </h3>
        <p className={styles.sectionDesc}>
          选择浅色 / 深色 / 跟随系统（随操作系统的明暗设置自动切换）。
        </p>
        <div className={styles.themeGroup}>
          <button
            className={`${styles.themeBtn} ${theme === 'light' ? styles.themeBtnActive : ''}`}
            onClick={() => setTheme('light')}
          >
            <Sun size={14} />
            <span>浅色</span>
          </button>
          <button
            className={`${styles.themeBtn} ${theme === 'dark' ? styles.themeBtnActive : ''}`}
            onClick={() => setTheme('dark')}
          >
            <Moon size={14} />
            <span>深色</span>
          </button>
          <button
            className={`${styles.themeBtn} ${theme === 'system' ? styles.themeBtnActive : ''}`}
            onClick={() => setTheme('system')}
          >
            <Monitor size={14} />
            <span>跟随系统</span>
          </button>
        </div>
      </section>

      {/* 强调色：8 种预设 */}
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>
          <Palette size={14} />
          强调色
        </h3>
        <p className={styles.sectionDesc}>
          全局应用于按钮、链接、激活态、标签指示器等。
          当前为 <strong>{
            ACCENT_COLORS.find((a) => a.id === accentColor)?.label || '默认'
          }</strong>。
        </p>
        <div className={styles.accentGrid}>
          {ACCENT_COLORS.map((a) => {
            const active = accentColor === a.id;
            return (
              <button
                key={a.id}
                type="button"
                className={`${styles.accentBtn} ${active ? styles.accentBtnActive : ''}`}
                onClick={() => setAccentColor(a.id)}
                title={a.label}
                aria-label={`强调色：${a.label}`}
              >
                <span
                  className={styles.accentSwatch}
                  style={{
                    background: a.base,
                    boxShadow: active
                      ? `0 0 0 2px var(--color-bg-light), 0 0 0 4px ${a.base}`
                      : `0 0 0 1px rgba(0, 0, 0, 0.08)`,
                  }}
                />
                <span className={styles.accentLabel}>{a.label}</span>
                {active && (
                  <span className={styles.accentCheck}>
                    <Sparkles size={9} />
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <button
          className={styles.resetBtn}
          onClick={() => setAccentColor('blue' as AccentColorId)}
          title="恢复默认强调色（天空蓝）"
        >
          <RotateCcw size={12} />
          恢复默认（天空蓝）
        </button>
      </section>

      {/* 预览 */}
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>
          <Sparkles size={14} />
          预览
        </h3>
        <p className={styles.sectionDesc}>
          下面按钮、链接、徽章等都将跟随当前强调色变化。
        </p>
        <div className={styles.preview}>
          <button className={styles.previewPrimaryBtn}>主按钮</button>
          <button className={styles.previewSecondaryBtn}>次要按钮</button>
          <span className={styles.previewLink}>链接示例</span>
          <span className={styles.previewBadge}>激活态</span>
        </div>
      </section>
    </div>
  );
}
