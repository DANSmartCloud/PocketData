import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  Search, Replace, ChevronDown, ChevronUp, ChevronRight,
  CaseSensitive, WholeWord, Regex, Eraser, Database, Code2, FolderTree
} from "lucide-react";
import { useFileStore } from "@/stores/fileStore";
import { useProjectStore } from "@/stores/projectStore";
import { useUIStore } from "@/stores/uiStore";
import styles from "./GlobalFindPanel.module.css";

type FindScope = "current" | "project";

interface Match {
  fileId: string;
  fileName: string;
  fileType: "data" | "script";
  row?: number;       // data 行
  line?: number;      // 脚本行
  column?: number;    // 脚本列
  context: string;    // 匹配上下文
}

/**
 * 全局查找替换面板 - 左侧边栏常驻。
 * - 当前文件：数据文件（变量名 + 单元格值） / 脚本（Monaco find）
 * - 整个项目：枚举已打开的文件
 */
export function GlobalFindPanel() {
  const activeFile = useFileStore((s) => s.getActiveFile());
  const scripts = useFileStore((s) => s.scripts);
  const files = useFileStore((s) => s.files);
  const setActiveTab = useFileStore((s) => s.setActiveTab);
  const setOperationMode = useUIStore((s) => s.setOperationMode);
  const setSelectedCell = useUIStore((s) => s.setSelectedCell);

  const projectOpen = useProjectStore((s) => s.isOpen);

  const [query, setQuery] = useState("");
  const [replaceText, setReplaceText] = useState("");
  const [useRegex, setUseRegex] = useState(false);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [scope, setScope] = useState<FindScope>(projectOpen ? "project" : "current");
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [includePattern, setIncludePattern] = useState("");
  const [excludePattern, setExcludePattern] = useState("");
  const [matches, setMatches] = useState<Match[]>([]);
  const [activeMatchIdx, setActiveMatchIdx] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);

  // 自动聚焦
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // 切换 scope 时自动重新搜索
  useEffect(() => {
    if (projectOpen) setScope("project");
  }, [projectOpen]);

  // 监听来自 CodeEditor 的搜索请求（Ctrl+F / 工具栏触发）
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.query !== undefined) setQuery(detail.query);
      if (detail?.replaceText !== undefined) setReplaceText(detail.replaceText);
      if (detail?.replace === true) setReplaceOpen(true);
      // 自动聚焦并选中文本
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 60);
    };
    window.addEventListener("pocketdata:focus-find", handler);
    return () => window.removeEventListener("pocketdata:focus-find", handler);
  }, []);

  // 监听"关闭查找"事件
  useEffect(() => {
    const handler = () => {
      setQuery("");
      setReplaceText("");
      setMatches([]);
      setActiveMatchIdx(-1);
    };
    window.addEventListener("pocketdata:close-find", handler);
    return () => window.removeEventListener("pocketdata:close-find", handler);
  }, []);

  /**
   * 在数据文件中搜索：变量名 + 单元格值
   */
  const searchInData = useCallback((file: typeof activeFile, q: string): Match[] => {
    if (!file) return [];
    const results: Match[] = [];
    // 变量名匹配
    for (let c = 0; c < file.variables.length; c++) {
      const v = file.variables[c];
      if (matchText(v.name, q) || (v.label && matchText(v.label, q))) {
        results.push({
          fileId: file.id,
          fileName: file.name,
          fileType: "data",
          row: 0,
          context: `[变量] ${v.name}${v.label ? ' — ' + v.label : ''}`,
        });
      }
    }
    // 单元格值匹配
    for (let r = 0; r < file.data.length; r++) {
      for (let c = 0; c < file.variables.length; c++) {
        const v = file.variables[c].name;
        const cell = file.data[r][v];
        const str = cell === null || cell === undefined ? "" : String(cell);
        if (matchText(str, q)) {
          results.push({
            fileId: file.id,
            fileName: file.name,
            fileType: "data",
            row: r + 1,
            context: `行 ${r + 1} ${file.variables[c].name}: ${str.slice(0, 80)}`,
          });
        }
      }
    }
    return results;
  }, []);

  /**
   * 简单的文本匹配（支持 regex / case / wholeWord）
   */
  const matchText = (text: string, q: string): boolean => {
    if (!q) return false;
    if (useRegex) {
      try {
        const re = new RegExp(q, caseSensitive ? 'g' : 'gi');
        return re.test(text);
      } catch {
        return false;
      }
    }
    if (wholeWord) {
      const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(`\\b${escaped}\\b`, caseSensitive ? '' : 'i');
      return re.test(text);
    }
    return text.toLowerCase().includes(q.toLowerCase());
  };

  // 收集 include/exclude 过滤
  const includeRegex = useMemo(() => {
    if (!includePattern) return null;
    try { return new RegExp(includePattern); } catch { return null; }
  }, [includePattern]);

  const excludeRegex = useMemo(() => {
    if (!excludePattern) return null;
    try { return new RegExp(excludePattern); } catch { return null; }
  }, [excludePattern]);

  const isPathIncluded = (path: string) => {
    if (includeRegex && !includeRegex.test(path)) return false;
    if (excludeRegex && excludeRegex.test(path)) return false;
    return true;
  };

  /**
   * 执行查找
   */
  const runSearch = useCallback(() => {
    if (!query.trim()) {
      setMatches([]);
      setActiveMatchIdx(-1);
      return;
    }
    const results: Match[] = [];

    if (scope === "current") {
      if (activeFile) {
        results.push(...searchInData(activeFile, query));
      }
      // 脚本：通知 Monaco
      window.dispatchEvent(new CustomEvent("pocketdata:script-search", {
        detail: { query, options: { regex: useRegex, caseSensitive, wholeWord } }
      }));
    } else {
      // 项目：枚举所有打开的文件
      for (const f of Object.values(files)) {
        if (f.path && !isPathIncluded(f.path)) continue;
        results.push(...searchInData(f, query));
      }
      for (const s of Object.values(scripts)) {
        if (s.path && !isPathIncluded(s.path)) continue;
        // 脚本逐行匹配
        const lines = s.content.split('\n');
        for (let i = 0; i < lines.length; i++) {
          if (matchText(lines[i], query)) {
            results.push({
              fileId: s.id,
              fileName: s.name,
              fileType: "script",
              line: i + 1,
              context: `${String(i + 1).padStart(4, ' ')}: ${lines[i].slice(0, 100)}`,
            });
            if (results.length > 200) break; // 限制最大结果数
          }
        }
      }
    }
    setMatches(results);
    setActiveMatchIdx(results.length > 0 ? 0 : -1);
  }, [query, scope, activeFile, files, scripts, useRegex, caseSensitive, wholeWord, searchInData]);

  // 查询变化时自动搜索（带 200ms 防抖）
  useEffect(() => {
    const t = setTimeout(runSearch, 200);
    return () => clearTimeout(t);
  }, [runSearch]);

  /**
   * 跳转到指定匹配项
   */
  const gotoMatch = useCallback((idx: number) => {
    if (idx < 0 || idx >= matches.length) return;
    setActiveMatchIdx(idx);
    const m = matches[idx];
    if (m.fileType === 'data' && m.row !== undefined) {
      // 切换到该 tab
      const tab = Object.values(useFileStore.getState().tabs).find(t =>
        t.fileId === m.fileId && t.type === 'data'
      );
      if (tab) setActiveTab(tab.id);
      // 选中对应单元格（Excel 模式 row 0 是表头，从 row 1 开始）
      setOperationMode('stata');
      setSelectedCell({ row: Math.max(0, m.row), col: 0 });
      // 通知数据表滚动到行
      window.dispatchEvent(new CustomEvent("pocketdata:scroll-to-row", { detail: { row: m.row } }));
    } else if (m.fileType === 'script' && m.line !== undefined) {
      const tab = Object.values(useFileStore.getState().tabs).find(t =>
        t.fileId === m.fileId && t.type === 'script'
      );
      if (tab) setActiveTab(tab.id);
      window.dispatchEvent(new CustomEvent("pocketdata:script-goto", {
        detail: { line: m.line, column: m.column || 1, query }
      }));
    }
  }, [matches, query, setActiveTab, setOperationMode, setSelectedCell]);

  const navigate = (delta: number) => {
    if (matches.length === 0) return;
    const next = (activeMatchIdx + delta + matches.length) % matches.length;
    gotoMatch(next);
  };

  return (
    <div className={styles.container}>
      {/* 查找行 */}
      <div className={styles.findRow}>
        <div className={styles.inputWrapper}>
          <Search size={13} className={styles.inputIcon} />
          <input
            ref={inputRef}
            type="text"
            className={styles.input}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                navigate(e.shiftKey ? -1 : 1);
              } else if (e.key === 'Escape') {
                setQuery('');
                setMatches([]);
              }
            }}
            placeholder="查找..."
          />
        </div>
        <span className={styles.matchCount}>
          {matches.length > 0 ? `${activeMatchIdx + 1}/${matches.length}` : (query ? '0' : '')}
        </span>
        <button
          className={styles.iconBtn}
          onClick={() => navigate(-1)}
          disabled={matches.length === 0}
          title="上一个 (Shift+Enter)"
        >
          <ChevronUp size={13} />
        </button>
        <button
          className={styles.iconBtn}
          onClick={() => navigate(1)}
          disabled={matches.length === 0}
          title="下一个 (Enter)"
        >
          <ChevronDown size={13} />
        </button>
        <button
          className={`${styles.iconBtn} ${replaceOpen ? styles.iconBtnActive : ''}`}
          onClick={() => setReplaceOpen(!replaceOpen)}
          title="展开替换与文件过滤"
        >
          <ChevronRight size={13} className={replaceOpen ? styles.expandIconOpen : ''} />
        </button>
      </div>

      {/* 范围选择：始终可见（无需展开） */}
      <div className={styles.optionsRow}>
        <span className={styles.optLabel}>范围：</span>
        <button
          className={`${styles.optBtn} ${scope === 'current' ? styles.optBtnActive : ''}`}
          onClick={() => setScope('current')}
        >
          当前文件
        </button>
        <button
          className={`${styles.optBtn} ${scope === 'project' ? styles.optBtnActive : ''}`}
          onClick={() => setScope('project')}
          disabled={!projectOpen}
        >
          <FolderTree size={11} />整个项目
        </button>
      </div>

      {/* 折叠面板：替换 + 选项 + 文件过滤 */}
      {replaceOpen && (
        <div className={styles.expandPanel}>
          {/* 替换行 */}
          <div className={styles.findRow}>
            <div className={styles.inputWrapper}>
              <Replace size={13} className={styles.inputIcon} />
              <input
                type="text"
                className={styles.input}
                value={replaceText}
                onChange={(e) => setReplaceText(e.target.value)}
                placeholder="替换为..."
              />
            </div>
            <button
              className={styles.iconBtn}
              onClick={() => {/* TODO: 单个替换 */}}
              disabled={matches.length === 0}
              title="替换当前"
            >
              替换
            </button>
            <button
              className={styles.iconBtn}
              onClick={() => {/* TODO: 全部替换 */}}
              disabled={matches.length === 0}
              title="全部替换"
            >
              全部
            </button>
          </div>

          {/* 匹配选项 */}
          <div className={styles.optionsRow}>
            <button
              className={`${styles.optBtn} ${useRegex ? styles.optBtnActive : ''}`}
              onClick={() => setUseRegex(!useRegex)}
              title="正则表达式"
            >
              <Regex size={11} />.*?
            </button>
            <button
              className={`${styles.optBtn} ${caseSensitive ? styles.optBtnActive : ''}`}
              onClick={() => setCaseSensitive(!caseSensitive)}
              title="区分大小写"
            >
              <CaseSensitive size={11} />Aa
            </button>
            <button
              className={`${styles.optBtn} ${wholeWord ? styles.optBtnActive : ''}`}
              onClick={() => setWholeWord(!wholeWord)}
              title="全字匹配"
            >
              <WholeWord size={11} />\b
            </button>
            <button
              className={styles.optBtn}
              onClick={() => { setQuery(''); setReplaceText(''); setMatches([]); setActiveMatchIdx(-1); }}
              title="清除"
            >
              <Eraser size={11} />清除
            </button>
          </div>

          {/* 文件过滤 */}
          {scope === 'project' && (
            <div className={styles.filterBlock}>
              <div className={styles.filterRow}>
                <span className={styles.optLabel}>包含：</span>
                <input
                  className={styles.filterInput}
                  value={includePattern}
                  onChange={(e) => setIncludePattern(e.target.value)}
                  placeholder="文件名匹配 regex (如 \.do$|\.py$)"
                />
              </div>
              <div className={styles.filterRow}>
                <span className={styles.optLabel}>排除：</span>
                <input
                  className={styles.filterInput}
                  value={excludePattern}
                  onChange={(e) => setExcludePattern(e.target.value)}
                  placeholder="文件名匹配 regex (如 node_modules)"
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* 结果列表 */}
      <div className={styles.resultList}>
        {matches.length === 0 && query && (
          <div className={styles.noMatch}>未找到匹配项</div>
        )}
        {matches.length === 0 && !query && (
          <div className={styles.hint}>
            <Search size={20} className={styles.hintIcon} />
            <span>输入关键字开始搜索</span>
            <small>
              {scope === 'current' ? '当前文件' : '整个项目'}
              {activeFile ? ` · ${activeFile.name}` : ''}
            </small>
          </div>
        )}
        {matches.map((m, idx) => (
          <button
            key={idx}
            className={`${styles.matchItem} ${idx === activeMatchIdx ? styles.matchItemActive : ''}`}
            onClick={() => gotoMatch(idx)}
            onDoubleClick={() => gotoMatch(idx)}
          >
            <span className={styles.matchIcon}>
              {m.fileType === 'data' ? <Database size={12} /> : <Code2 size={12} />}
            </span>
            <span className={styles.matchFile}>{m.fileName}</span>
            <span className={styles.matchContext}>{m.context}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
