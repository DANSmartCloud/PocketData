import { useEffect, useMemo, useRef, useState } from "react";
import { Type, RotateCcw, RefreshCw, ChevronDown, Edit3, Search } from "lucide-react";
import { useFontStore, listSystemFonts, FALLBACK_FONT_LIST } from "@/stores/fontStore";
import styles from "./SettingsPanel.module.css";

/**
 * 设置面板：全局字体、窗格字体覆盖
 *
 * 主题相关配置（强调色、主题模式）已迁移到独立的"主题"标签页，
 * 此处仅保留字体设置，避免与"主题"重复。
 */

const PANE_OPTIONS = [
  { id: "sidebar", label: "侧边栏" },
  { id: "code-editor", label: "代码编辑器" },
  { id: "data-table", label: "数据表" },
  { id: "terminal", label: "终端" },
  { id: "right-panel", label: "右侧面板" },
];

export function SettingsPanel() {
  const {
    globalFont,
    monoFont,
    paneFonts,
    setGlobalFont,
    setMonoFont,
    setPaneFont,
    resetAll,
  } = useFontStore();

  const [systemFonts, setSystemFonts] = useState<string[]>(FALLBACK_FONT_LIST);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");

  // 异步加载系统字体
  useEffect(() => {
    let mounted = true;
    setLoading(true);
    listSystemFonts()
      .then((fonts) => {
        if (mounted) setSystemFonts(fonts);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const filteredFonts = useMemo(() => {
    if (!search.trim()) return systemFonts;
    const q = search.toLowerCase();
    return systemFonts.filter((f) => f.toLowerCase().includes(q));
  }, [systemFonts, search]);

  return (
    <div className={styles.panel} data-pane-id="settings">
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>
          <Type size={14} />
          字体
        </h3>
        <p className={styles.sectionDesc}>
          选择系统已安装的任意字体。默认推荐
          <strong> Maple Mono NF CN</strong>（已随应用内置）。
        </p>

        {/* 全局正文字体 */}
        <div className={styles.field}>
          <label className={styles.label}>全局正文字体</label>
          <FontPicker
            value={globalFont}
            onChange={setGlobalFont}
            fonts={filteredFonts}
            search={search}
            onSearchChange={setSearch}
            loading={loading}
            placeholder='例如："Microsoft YaHei", sans-serif'
          />
        </div>

        {/* 全局等宽字体 */}
        <div className={styles.field}>
          <label className={styles.label}>全局等宽字体（终端/代码/数据）</label>
          <FontPicker
            value={monoFont}
            onChange={setMonoFont}
            fonts={filteredFonts}
            search={search}
            onSearchChange={setSearch}
            loading={loading}
            placeholder='例如："Maple Mono", "Cascadia Code"'
          />
        </div>

        <button
          className={styles.resetBtn}
          onClick={() => {
            resetAll();
            setSearch("");
          }}
        >
          <RotateCcw size={12} />
          恢复默认（Maple Mono NF CN）
        </button>
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>窗格字体覆盖</h3>
        <p className={styles.sectionDesc}>
          为指定窗格设置独立字体，留空表示继承全局正文字体。
        </p>
        <div className={styles.paneList}>
          {PANE_OPTIONS.map((opt) => {
            const current = paneFonts[opt.id] || "";
            return (
              <div key={opt.id} className={styles.paneRow}>
                <div className={styles.paneLabel}>{opt.label}</div>
                <div className={styles.paneControl}>
                  <FontPicker
                    value={current}
                    onChange={(v) => setPaneFont(opt.id, v)}
                    fonts={systemFonts}
                    search={search}
                    onSearchChange={setSearch}
                    loading={loading}
                    placeholder="继承全局"
                  />
                </div>
              </div>
            );
          })}
        </div>
        <p className={styles.sectionDesc} style={{ marginTop: 6, opacity: 0.7 }}>
          💡 主题模式与强调色已移至「主题」标签页。
        </p>
      </section>
    </div>
  );
}

interface FontPickerProps {
  value: string;
  onChange: (v: string) => void;
  fonts: string[];
  search: string;
  onSearchChange: (s: string) => void;
  loading: boolean;
  placeholder?: string;
}

function FontPicker({
  value,
  onChange,
  fonts,
  search,
  onSearchChange,
  loading,
  placeholder,
}: FontPickerProps) {
  // 下拉菜单式字体选择
  const [open, setOpen] = useState(false);
  const [editingRaw, setEditingRaw] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // 提取已选字体名（取 font-family 第一个片段）
  const selectedName = useMemo(() => {
    const m = value.match(/^\s*"?([^",]+)"?/);
    return m ? m[1].trim() : "";
  }, [value]);

  // 动态注入 @font-face 规则，让字体在 picker 中"自呈现"
  useEffect(() => {
    if (!fonts || fonts.length === 0) return;

    // 清理旧规则
    const existing = document.querySelectorAll("style[data-picker-font]");
    existing.forEach((el) => el.remove());

    const style = document.createElement("style");
    style.dataset.pickerFont = "true";
    let css = "";
    for (const f of fonts) {
      css += `@font-face { font-family: "picker-${CSS.escape(f)}"; src: local("${f}"); font-display: block; }\n`;
    }
    style.textContent = css;
    document.head.appendChild(style);

    return () => {
      document.querySelectorAll("style[data-picker-font]").forEach((el) => el.remove());
    };
  }, [fonts]);

  // 点击外部关闭
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div className={styles.picker} ref={wrapperRef}>
      {editingRaw ? (
        <input
          className={styles.pickerInput}
          autoFocus
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => setEditingRaw(false)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === "Escape") setEditingRaw(false);
          }}
        />
      ) : (
        <button
          className={styles.pickerTrigger}
          onClick={() => setOpen((v) => !v)}
          title="点击选择字体（搜索 / 预览）"
          style={{
            fontFamily: selectedName
              ? buildFontFamily(selectedName, "self")
              : "system-ui, sans-serif",
          }}
        >
          <span>{selectedName || placeholder || "选择字体"}</span>
          <ChevronDown size={11} className={open ? styles.pickerChevronOpen : styles.pickerChevron} />
        </button>
      )}
      <button
        className={`${styles.pickerRawBtn} ${editingRaw ? styles.pickerRawBtnActive : ""}`}
        onClick={() => setEditingRaw((v) => !v)}
        title="直接编辑 font-family 字符串（自定义回退链）"
      >
        <Edit3 size={10} />
        <span>编辑</span>
      </button>

      {open && (
        <div className={styles.pickerPopover}>
          <div className={styles.pickerSearchRow}>
            <Search size={11} className={styles.pickerSearchIcon} />
            <input
              className={styles.pickerSearch}
              autoFocus
              placeholder="搜索字体…"
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
            />
          </div>
          {loading && <div className={styles.pickerHint}>正在枚举系统字体…</div>}
          <ul className={styles.pickerOptions}>
            {filteredList(fonts, search).map((f) => (
              <li
                key={f}
                className={`${styles.pickerOption} ${
                  selectedName === f ? styles.pickerOptionActive : ""
                }`}
                onClick={() => {
                  onChange(buildFontFamily(f, "ui"));
                  setOpen(false);
                }}
                style={{ fontFamily: buildFontFamily(f, "self") }}
              >
                <span className={styles.pickerOptionName}>{f}</span>
                <span
                  className={styles.pickerOptionPreview}
                  style={{ fontFamily: buildFontFamily(f, "self") }}
                >
                  AaBbCc 中文 123
                </span>
              </li>
            ))}
            {filteredList(fonts, search).length === 0 && (
              <li className={styles.pickerEmpty}>无匹配字体</li>
            )}
          </ul>
          <button
            className={styles.refreshBtn}
            onClick={async () => {
              await listSystemFonts();
              onSearchChange("");
            }}
          >
            <RefreshCw size={11} /> 重新枚举系统字体
          </button>
        </div>
      )}
    </div>
  );
}

function filteredList(fonts: string[], search: string): string[] {
  if (!search.trim()) return fonts;
  const q = search.toLowerCase();
  return fonts.filter((f) => f.toLowerCase().includes(q));
}

function buildFontFamily(name: string, mode: "ui" | "preview" | "self" = "ui"): string {
  // 关键：字体名回退链必须含中文字体，避免字体名本身是中文（CJK）时显示成豆腐方块。
  if (mode === "self" || mode === "preview") {
    // 自呈现：优先使用注入的 picker- 前缀（local() 解析），然后回退到原名 + CJK 链
    const escaped = CSS.escape(name);
    return `"picker-${escaped}", "${name}", "Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", system-ui, sans-serif`;
  }
  // ui 模式：UI 字体回退链——优先 Maple Mono（含 NF CN CJK）+ 系统等宽
  return `"${name}", "Maple Mono", "Maple Mono NF CN", "JetBrains Mono", "Cascadia Code", "Consolas", "Microsoft YaHei", monospace`;
}
