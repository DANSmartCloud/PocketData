import { useEffect, useState } from "react";
import { Code, RotateCcw } from "lucide-react";
import { useNotify } from "@/hooks/useNotify";
import { formatShortcut } from "@/utils/platformShortcut";
import styles from "./SettingsPanel.module.css";

/**
 * 代码编辑器设置面板（从 CodeEditor 右侧边栏迁移过来）
 * - 字号 / 字体 / 连字 / Tab 大小
 * - 自动换行 / 行号 / 小地图
 * - 持久化到 localStorage: pocketdata-editor-settings
 */
const DEFAULT_SETTINGS = {
  fontSize: 14,
  fontFamily: '"Maple Mono", "Maple Mono NF CN", "JetBrains Mono", "Cascadia Code", "Consolas", "Courier New", monospace',
  fontLigatures: true,
  tabSize: 2,
  wordWrap: true,
  minimap: false,
  lineNumbers: true,
};

const FONT_OPTIONS = [
  { value: '"Maple Mono", "Maple Mono NF CN", "JetBrains Mono", "Cascadia Code", "Consolas", "Courier New", monospace', label: "Maple Mono NF CN（默认）" },
  { value: '"JetBrains Mono", "Fira Code", "Cascadia Code", "Consolas", "Courier New", monospace', label: "JetBrains Mono" },
  { value: '"Fira Code", "JetBrains Mono", "Cascadia Code", "Consolas", monospace', label: "Fira Code" },
  { value: '"Cascadia Code", "JetBrains Mono", "Fira Code", Consolas, monospace', label: "Cascadia Code" },
  { value: '"Source Code Pro", "Consolas", "Courier New", monospace', label: "Source Code Pro" },
  { value: '"IBM Plex Mono", "JetBrains Mono", Consolas, monospace', label: "IBM Plex Mono" },
  { value: '"Consolas", "Cascadia Code", "Courier New", monospace', label: "Consolas" },
  { value: '"Menlo", "Consolas", "Courier New", monospace', label: "Menlo" },
  { value: '"Courier New", Consolas, monospace', label: "Courier New" },
];

function loadSettings() {
  try {
    const saved = localStorage.getItem("pocketdata-editor-settings");
    if (saved) return { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
  } catch {}
  return DEFAULT_SETTINGS;
}

function saveSettings(settings: typeof DEFAULT_SETTINGS) {
  try {
    localStorage.setItem("pocketdata-editor-settings", JSON.stringify(settings));
  } catch {}
}

export function CodeSettingsPanel() {
  const [settings, setSettings] = useState(loadSettings);
  const notify = useNotify();

  // 监听 localStorage 变化以支持其他位置修改设置
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === "pocketdata-editor-settings" && e.newValue) {
        try {
          setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(e.newValue) });
        } catch {}
      }
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  const update = <K extends keyof typeof settings>(key: K, value: typeof settings[K]) => {
    const next = { ...settings, [key]: value };
    setSettings(next);
    saveSettings(next);
    // 通知 CodeEditor 立即同步
    window.dispatchEvent(new CustomEvent("pocketdata:editor-settings-changed", { detail: next }));
  };

  const reset = () => {
    setSettings(DEFAULT_SETTINGS);
    saveSettings(DEFAULT_SETTINGS);
    window.dispatchEvent(new CustomEvent("pocketdata:editor-settings-changed", { detail: DEFAULT_SETTINGS }));
    notify("success", "代码编辑器设置已重置", 1500);
  };

  return (
    <div className={styles.panel} data-pane-id="code-settings">
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>
          <Code size={14} />
          代码编辑
        </h3>
        <p className={styles.sectionDesc}>
          自定义 Monaco 代码编辑器的字号、字体、连字、Tab 大小、显示行为等。
          设置实时同步到编辑器。
        </p>

        <div className={styles.field}>
          <label className={styles.label}>字号</label>
          <div className={styles.settingControlRow}>
            <button
              className={styles.smallBtn}
              onClick={() => update("fontSize", Math.max(10, settings.fontSize - 1))}
              aria-label="减小字号"
              title={`减小字号（${formatShortcut("Ctrl+滚轮")})`}
            >−</button>
            <span className={styles.settingValueBadge}>{settings.fontSize}</span>
            <button
              className={styles.smallBtn}
              onClick={() => update("fontSize", Math.min(24, settings.fontSize + 1))}
              aria-label="增大字号"
              title={`增大字号（${formatShortcut("Ctrl+滚轮")})`}
            >+</button>
          </div>
        </div>

        <div className={styles.field}>
          <label className={styles.label}>字体</label>
          <select
            className={styles.select}
            value={settings.fontFamily}
            onChange={(e) => update("fontFamily", e.target.value)}
            title="编辑器字体"
          >
            {FONT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.field}>
          <label className={styles.label}>Tab 大小</label>
          <div className={styles.settingControlRow}>
            {[2, 4, 8].map((n) => (
              <button
                key={n}
                className={`${styles.smallBtn} ${settings.tabSize === n ? styles.smallBtnActive : ""}`}
                onClick={() => update("tabSize", n)}
              >
                {n} 空格
              </button>
            ))}
          </div>
        </div>

        <div className={styles.field}>
          <label className={styles.label}>编程连字（-&gt; != &gt;= 等）</label>
          <button
            className={`${styles.toggle} ${settings.fontLigatures ? styles.toggleOn : styles.toggleOff}`}
            onClick={() => update("fontLigatures", !settings.fontLigatures)}
            role="switch"
            aria-checked={settings.fontLigatures}
            title="启用/禁用字体编程连字"
          >
            <span className={styles.toggleThumb} />
          </button>
        </div>
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>显示</h3>
        <p className={styles.sectionDesc}>编辑器视图相关的开关选项。</p>

        <div className={styles.field}>
          <label className={styles.label}>自动换行</label>
          <button
            className={`${styles.toggle} ${settings.wordWrap ? styles.toggleOn : styles.toggleOff}`}
            onClick={() => update("wordWrap", !settings.wordWrap)}
            role="switch"
            aria-checked={settings.wordWrap}
            title="启用后超出视图宽度的行将自动换行"
          >
            <span className={styles.toggleThumb} />
          </button>
        </div>

        <div className={styles.field}>
          <label className={styles.label}>行号</label>
          <button
            className={`${styles.toggle} ${settings.lineNumbers ? styles.toggleOn : styles.toggleOff}`}
            onClick={() => update("lineNumbers", !settings.lineNumbers)}
            role="switch"
            aria-checked={settings.lineNumbers}
            title="在编辑器左侧显示行号"
          >
            <span className={styles.toggleThumb} />
          </button>
        </div>

        <div className={styles.field}>
          <label className={styles.label}>小地图</label>
          <button
            className={`${styles.toggle} ${settings.minimap ? styles.toggleOn : styles.toggleOff}`}
            onClick={() => update("minimap", !settings.minimap)}
            role="switch"
            aria-checked={settings.minimap}
            title="显示代码缩略图"
          >
            <span className={styles.toggleThumb} />
          </button>
        </div>

        <button className={styles.resetBtn} onClick={reset}>
          <RotateCcw size={12} />
          恢复默认设置
        </button>
      </section>
    </div>
  );
}
