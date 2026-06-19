import { useState, useEffect, useCallback, useRef, forwardRef, useImperativeHandle, useMemo } from "react";
import Editor, { type OnMount, type Monaco } from "@monaco-editor/react";
import type { editor } from "monaco-editor";
import { useUIStore } from "@/stores/uiStore";
import { useFileStore } from "@/stores/fileStore";
import { useScriptExecutor } from "@/hooks/useScriptExecutor";
import { useNotify } from "@/hooks/useNotify";
import { formatShortcut } from "@/utils/platformShortcut";
import {
  Code, FileCode, AlertCircle,
  Hash, X,
  Eraser,
} from "lucide-react";
import styles from "./CodeEditor.module.css";
import { Breadcrumb } from "./Breadcrumb";

interface StataCommandInfo {
  name: string;
  description: string;
  syntax: string;
  category: string;
}

export interface CodeEditorProps {
  value?: string;
  onChange?: (value: string) => void;
  language?: "stata" | "python";
  onRun?: () => void;
  theme?: "light" | "dark";
  editorRef?: React.MutableRefObject<editor.IStandaloneCodeEditor | null>;
  /** 指定要编辑的脚本 ID；不传则回退到当前活跃脚本 */
  scriptId?: string;
}

export interface CodeEditorRef {
  getEditor: () => editor.IStandaloneCodeEditor | null;
  getMonaco: () => Monaco | null;
  setValue: (value: string) => void;
  getValue: () => string;
  focus: () => void;
}

interface EditorSettings {
  fontSize: number;
  fontFamily: string;
  fontLigatures: boolean;
  tabSize: number;
  wordWrap: boolean;
  minimap: boolean;
  lineNumbers: boolean;
}

type TerminalTab = "all" | "stdout" | "stderr";
type SidePanelTab = "commands" | "templates";

const DEFAULT_SETTINGS: EditorSettings = {
  fontSize: 14,
  fontFamily: '"Maple Mono", "Maple Mono NF CN", "JetBrains Mono", "Cascadia Code", "Consolas", "Courier New", monospace',
  fontLigatures: true,
  tabSize: 2,
  wordWrap: true,
  minimap: false,
  lineNumbers: true,
};

const STATA_TEMPLATES = [
  { label: "数据加载", snippet: 'use "data.dta", clear\nimport excel "data.xlsx", firstrow clear' },
  { label: "描述统计", snippet: "summarize\ntabulate var1" },
  { label: "回归分析", snippet: "regress y x1 x2 x3" },
  { label: "生成变量", snippet: "gen newvar = oldvar * 2" },
  { label: "循环与条件", snippet: "foreach var of varlist * {\n  replace `var' = . if `var' < 0\n}" },
  { label: "数据合并", snippet: "merge 1:1 id using \"other.dta\"" },
  { label: "图表绘制", snippet: "twoway (scatter y x) (lfit y x)" },
  { label: "保存数据", snippet: 'save "output.dta", replace' },
];

// 自定义 Monaco 主题 - 浅色（基础，强调色会动态注入）
const POCKETDATA_LIGHT_THEME_BASE: editor.IStandaloneThemeData = {
  base: 'vs',
  inherit: true,
  rules: [
    { token: 'comment', foreground: '6a737d', fontStyle: 'italic' },
    { token: 'keyword', foreground: 'd73a49', fontStyle: 'bold' },
    { token: 'keyword.control', foreground: '6f42c1', fontStyle: 'bold' },
    { token: 'string', foreground: '032f62' },
    { token: 'string.escape', foreground: '22863a' },
    { token: 'number', foreground: '005cc5' },
    { token: 'operator', foreground: 'd73a49' },
    { token: 'variable', foreground: 'e36209' },
    { token: 'variable.predefined', foreground: 'b08400', fontStyle: 'bold' },
    { token: 'identifier', foreground: '24292e' },
  ],
  colors: {
    'editor.background': '#FFFFFF',
    'editor.foreground': '#1E293B',
    'editorLineNumber.foreground': '#94A3B8',
    'editorLineNumber.activeForeground': '#1E293B',
    'editor.lineHighlightBackground': '#F1F5F9',
    'editorCursor.foreground': '#2563EB',
    'editor.selectionBackground': '#BFDBFE',
    'editor.inactiveSelectionBackground': '#DBEAFE',
    'editorWidget.background': '#FFFFFF',
    'editorWidget.border': '#E2E8F0',
    'editorSuggestWidget.background': '#FFFFFF',
    'editorSuggestWidget.border': '#E2E8F0',
    'editorSuggestWidget.selectedBackground': '#EFF6FF',
    'editor.findMatchBackground': '#FEF3C7',
    'editor.findMatchHighlightBackground': '#FDE68A',
  },
};

// 自定义 Monaco 主题 - 深色（基础，强调色会动态注入）
const POCKETDATA_DARK_THEME_BASE: editor.IStandaloneThemeData = {
  base: 'vs-dark',
  inherit: true,
  rules: [
    { token: 'comment', foreground: '94A3B8', fontStyle: 'italic' },
    { token: 'keyword', foreground: 'F472B6', fontStyle: 'bold' },
    { token: 'keyword.control', foreground: 'C084FC', fontStyle: 'bold' },
    { token: 'string', foreground: '7DD3FC' },
    { token: 'string.escape', foreground: '86EFAC' },
    { token: 'number', foreground: '93C5FD' },
    { token: 'operator', foreground: 'FCA5A5' },
    { token: 'variable', foreground: 'FCD34D' },
    { token: 'variable.predefined', foreground: 'FDE047', fontStyle: 'bold' },
    { token: 'identifier', foreground: 'E2E8F0' },
  ],
  colors: {
    'editor.background': '#0F172A',
    'editor.foreground': '#E2E8F0',
    'editorLineNumber.foreground': '#475569',
    'editorLineNumber.activeForeground': '#E2E8F0',
    'editor.lineHighlightBackground': '#1E293B',
    'editorCursor.foreground': '#60A5FA',
    'editor.selectionBackground': '#1E40AF55',
    'editor.inactiveSelectionBackground': '#1E3A8A33',
    'editorWidget.background': '#1E293B',
    'editorWidget.border': '#334155',
    'editorSuggestWidget.background': '#1E293B',
    'editorSuggestWidget.border': '#334155',
    'editorSuggestWidget.selectedBackground': '#2563EB33',
    'editor.findMatchBackground': '#F59E0B66',
    'editor.findMatchHighlightBackground': '#F59E0B33',
    'editorBracketMatch.background': '#2563EB33',
    'editorBracketMatch.border': '#60A5FA',
    'editorGutter.background': '#0F172A',
  },
};

function definePocketDataTheme(monaco: Monaco) {
  try {
    // 从 CSS 变量读取当前强调色
    const root = document.documentElement;
    const style = getComputedStyle(root);
    const primary = style.getPropertyValue('--color-primary').trim() || '#2563EB';
    const primaryLight = style.getPropertyValue('--color-primary-light').trim() || '#BFDBFE';

    const lightTheme: editor.IStandaloneThemeData = {
      ...POCKETDATA_LIGHT_THEME_BASE,
      colors: {
        ...POCKETDATA_LIGHT_THEME_BASE.colors,
        'editorCursor.foreground': primary,
        'editor.selectionBackground': primaryLight,
      },
    };

    const darkTheme: editor.IStandaloneThemeData = {
      ...POCKETDATA_DARK_THEME_BASE,
      colors: {
        ...POCKETDATA_DARK_THEME_BASE.colors,
        'editorCursor.foreground': primary,
        'editorSuggestWidget.selectedBackground': `${primary}33`,
        'editorBracketMatch.background': `${primary}33`,
        'editorBracketMatch.border': primary,
      },
    };

    monaco.editor.defineTheme('pocketdata-light', lightTheme);
    monaco.editor.defineTheme('pocketdata-dark', darkTheme);
  } catch (e) {
    // 主题可能已经定义，忽略错误
  }
}

function loadSettings(): EditorSettings {
  try {
    const saved = localStorage.getItem("pocketdata-editor-settings");
    if (saved) return { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
  } catch {}
  return DEFAULT_SETTINGS;
}

function saveSettings(settings: EditorSettings) {
  try {
    localStorage.setItem("pocketdata-editor-settings", JSON.stringify(settings));
  } catch {}
}

function registerStataLanguage(monaco: Monaco) {
  if (monaco.languages.getLanguages().some((l: { id: string }) => l.id === "stata")) return;

  monaco.languages.register({ id: "stata", extensions: [".do", ".ado", ".mata", ".sthlp"] });
  monaco.languages.setMonarchTokensProvider("stata", {
    defaultToken: '',
    tokenPostfix: '.stata',
    // 完整 .do 文件语法高亮
    tokenizer: {
      root: [
        // 行注释：以 * 开头的行（Stata 行注释；包括 *! 用于版本说明）
        [/^\s*\*.*$/, "comment"],
        // 单行 // 注释
        [/\/\/.*$/, "comment"],
        // 块注释 /* ... */
        [/\/\*/, "comment", "@comment"],

        // 字符串
        [/"/, "string", "@string"],

        // 全局宏 $name 或 ${name}
        [/\$\{?[a-zA-Z_][\w]*\}?/, "variable.predefined"],
        // 局部宏 `name'
        [/`[^'`\n]+'/, "variable"],

        // Stata 关键字（命令）：按类别分组
        [/\b(?:\bversion|set\s+more|set\s+linesize|set\s+pagesize|set\s+scheme|set\s+seed|set\s+obs|set\s+type)\b/, "keyword.control"],
        [
          /\b(?:do|doedit|run|include|dofilename|doexit|exit|exit\(|clear|cls|capture|assert|quietly|qui|noisily|noi|preserve|restore|nopreserve|norestore|version|about|set|macro|include|do\s|run\s|doedit\s|adopath|sysdir|findfile|which|mosss|capture\s|preserve\s|restore\s|set\s+more|set\s+linesize|set\s+scheme|set\s+seed|set\s+obs|set\s+type)\b/,
          "keyword.control"
        ],

        // 数据读写
        [
          /\b(?:use|save|import|export|import\s+excel|import\s+delimited|import\s+sasxport|import\s+stata|export\s+excel|export\s+delimited|outsheet|insheet|sysuse|webuse|use\s+https?|use\s+http|use\s+clear|use\s+replace|save\s+replace|save\s+old|append|merge|joinby|cross|append\s+using|merge\s+1:1|merge\s+1:m|merge\s+m:1|sample|expand|contract|sort|gsort|order|aorder|sort|gsort|sort\s+stable|by|bysort|by\s+|bysort\s+|joinit)\b/,
          "keyword"
        ],

        // 数据操作
        [
          /\b(?:generate|replace|gen|g|egen|drop|keep|recode|rename|encode|decode|destring|tostring|split|strgroup|strsubstr|subinstr|strpos|strtrim|substr|length|indexnot|index|upper|lower|proper|trim|real|string|itrim|soundex|regexm|regexs|regexr|char|dofc|doym|dow|doy|week|quarter|month|year|day|hours|minutes|seconds|clock|mdyhms|mdy|ymd|hms|dhms|yh|ym|yq|md|hm|ms|hh|mm|ss|ww|missing|missing|cond|inrange|inlist|wordcount|word|substr|subinstr)\b/,
          "keyword"
        ],

        // 形状/结构
        [
          /\b(?:reshape|collapse|stack|unstack|stack|wide|long|xpose|reshape\s+wide|reshape\s+long|sort|cross|joinby|merge|sample|expand|contract|split)\b/,
          "keyword"
        ],

        // 描述/汇总
        [
          /\b(?:describe|codebook|summarize|sum|inspect|list|browse|edit|count|tabulate|tab1|tab2|tabi|tab|table|tabdisp|table|means|proportions|proportion|ratios|ratio|ci|centile|detail|summarize\s+,detail|summarize|tab\s+sum|tab\s+mean)\b/,
          "keyword"
        ],

        // 统计估计
        [
          /\b(?:regress|reg|logit|probit|logistic|probit|predict|mfx|margins|test|testparm|lrtest|hausman|estat|estimates|esttab|estout|eststo|estadd|estpost|estwrite|estread|estfor|estadd|estout|esttab|stereotype|stepwise|nestreg|sw|compare|regress\s+|logit\s+|probit\s+|ologit|oprobit|omlogit|mlogit|mprobit|ologit|oprobit|ologit,|oprobit,|clogit|cloglog|ologit|oprobit|ologit,group|ologit,|oprobit,|clogit,group|clogit,|regress,\s+|logit,\s+|probit,\s+|predict,\s+|prais|newey|arima|arch|arfima|var|svy|svyset|svymean|svytotal|svyregress|svyproportion|svyratio|svytab|svy:)\b/,
          "keyword"
        ],

        // 相关/检验
        [
          /\b(?:ttest|ttesti|ttest\s+|ttesti|sdtest|prtest|corrtest|ranksum|signrank|ksmirnov|chi2|chi2test|spearman|kwallis|oneway|anova|manova|anova\s+|oneway\s+|mannwhitney|wilcoxon|signrank|ranksum|kwallis|median|skewness|kurtosis|sktest|sfrancia|swilk|swilk\s+|swilk,|sfrancia,|sktest,|lvtest)\b/,
          "keyword"
        ],

        // 相关
        [
          /\b(?:correlate|corr|pwcorr|pcorr|spearman|kendall|alpha|teffects|psmatch|pscore|nnmatch|mahalanobis|pstest|teffects\s+|teffects\s+psmatch|teffects\s+nnmatch|teffects\s+ipw|teffects\s+ra|teffects\s+aipw|teffects\s+nnmatch,|teffects\s+ipw,|teffects\s+ra,|teffects\s+aipw,|teffects\s+pstest|teffects\s+pscore)\b/,
          "keyword"
        ],

        // 编程
        [
          /\b(?:program|program\s+define|end|capt|args|args\s+|syntax|return|ereturn|sreturn|creturn|local\s+|global\s+|local\s|global\s|tempvar|tempname|tempfile|tempname\s+|tempfile\s+|scalar|matrix|mata|mata:|mata\s+|mata\s+clear|mata\s+set|mata\s+mosaic|mata\s+describe|mata\s+which|mata\s+drop|mata\s+rename|mata\s+use|mata\s+save|mata\s+export|mata\s+import)\b/,
          "keyword"
        ],

        // 流程控制
        [
          /\b(?:if|else|else\s+|foreach|forvalues|forv|while|continue|break|exit|return\s+|return\s+local|return\s+scalar|return\s+matrix|return\s+add|return\s+clear)\b/,
          "keyword.control"
        ],

        // 绘图
        [
          /\b(?:graph|twoway|scatter|line|connected|histogram|hist|bar|bar\(|hbar|hbar,|box|boxplot|pie|density|kdensity|lfit|lfitci|qfit|qfitci|lowess|fpfit|mband|mspline|tsline|tsrline|ac|mcap|spike|dropline|dot|cap|medianband|scatter\(|line\(|bar\(|histogram\(|box\(|pie\(|graph\s+|graph\s+twoway|graph\s+bar|graph\s+pie|graph\s+box|graph\s+dot|graph\s+histogram|graph\s+matrix|graph\s+box,\s+|graph\s+bar,\s+|graph\s+pie,\s+|graph\s+dot,\s+|graph\s+histogram,\s+)\b/,
          "keyword"
        ],

        // 时间序列
        [
          /\b(?:tsset|tsfill|tsreport|tsrevar|tsline|tsrline|tssmooth|rolling|rolling\s+|rolling\s+\w+|arima|arch|arfima|var|vec|irf|irf\s+create|irf\s+graph|irf\s+table|irf\s+ograph|irf\s+stable|irf\s+order|fcast|fcast\s+compute|fcast\s+graph|dfgls|dfuller|pperron|psdensity|bdsqrt|wntestq|ac|ac\(|pac|pac\(|corrgram|corrgram\s+|xcorr|crosscorr)\b/,
          "keyword"
        ],

        // 面板
        [
          /\b(?:xtset|xtset\s+|xtsum|xtsum\s+|xttab|xttab\s+|xtline|xtline\s+|xtreg|xtreg\s+|xtlogit|xtprobit|xtpoisson|xtnbreg|xtgee|xtmixed|xtmelogit|xtmepoisson|xtsum\s+|xttab\s+|xtline\s+|xtdescribe|xtdata|xtpattern|xtset\s+|xtreg,\s+|xtlogit,\s+|xtprobit,\s+|xtpoisson,\s+|xtnbreg,\s+|xtgee,\s+|xtmixed,\s+|xtmelogit,\s+|xtmepoisson,\s+)\b/,
          "keyword"
        ],

        // 缺失/缺失值函数
        [
          /\b(?:missing|missing\(|mi|misstable|misschk|mvdecode|mvencode|ice|micombine|mim|mi\s+|mi\s+set|mi\s+register|mi\s+impute|mi\s+estimate|mi\s+describe|mi\s+st|mi\s+xeq|mi\s+export|mi\s+import|mi\s+varying)\b/,
          "keyword"
        ],

        // 系统函数
        [
          /\b(?:display|di|list|note|notes|note\s+:|note\s+drop|note\s+list|note\s+replace|note\s+renumber|note\s+clear|notes\s+|labelbook|label\s+list|label\s+define|label\s+values|label\s+value|label\s+variable|label\s+dir|label\s+drop|label\s+save|label\s+using|label\s+language)\b/,
          "keyword"
        ],

        // 数字（含科学计数法）
        [/\b\d+\.?\d*(?:[eE][+-]?\d+)?\b/, "number"],

        // 运算符
        [/<=|>=|==|!=|<>|~=|\|\||&&|->/, "operator"],
        [/[+\-*/^&|<>=!~]/, "operator"],

        // 字符串（单引号包裹的）
        [/'/, "string", "@sqstring"],

        // 标识符
        [/[a-zA-Z_][\w]*/, "identifier"],
      ],
      comment: [
        [/[^/*]+/, "comment"],
        [/\*\//, "comment", "@pop"],
        [/[/*]/, "comment"],
      ],
      string: [
        [/[^\\"]+/, "string"],
        [/\\./, "string.escape"],
        [/"/, "string", "@pop"],
      ],
      sqstring: [
        [/[^']+/, "string"],
        [/'/, "string", "@pop"],
      ],
    },
  });
}

export const CodeEditor = forwardRef<CodeEditorRef, CodeEditorProps>(function CodeEditor(props, ref) {
  const { value: propsValue, onChange: propsOnChange, language: propsLanguage, onRun: propsOnRun, editorRef: propsEditorRef, scriptId: propsScriptId } = props;

  const { updateScriptContent, tabs, activeTabId, scripts } = useFileStore();
  const notify = useNotify();

  const activeScriptId = useMemo(() => {
    if (propsScriptId) return propsScriptId;
    const tab = tabs.find(t => t.id === activeTabId && t.type === 'script');
    return tab?.fileId ?? null;
  }, [propsScriptId, tabs, activeTabId]);

  const activeScript = activeScriptId ? scripts[activeScriptId] : null;

  const [code, setCode] = useState("");
  const [stataCommands, setStataCommands] = useState<StataCommandInfo[]>([]);
  const [showTerminal, setShowTerminal] = useState(false);
  const [settings, setSettings] = useState<EditorSettings>(loadSettings);
  const [terminalTab, setTerminalTab] = useState<TerminalTab>("all");
  const [sidePanelTab, setSidePanelTab] = useState<SidePanelTab | null>(null);
  const [sidePanelWidth, setSidePanelWidth] = useState(220);

  // Breadcrumb state
  const [cursorPosition, setCursorPosition] = useState<{ line: number; column: number }>({ line: 1, column: 1 });

  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const terminalRef = useRef<HTMLDivElement>(null);
  const outputRef = useRef<ReturnType<typeof useScriptExecutor>['output']>([]);
  const sidePanelTabRef = useRef<SidePanelTab | null>(null);

  // Side panel resize refs
  const isResizing = useRef(false);
  const resizeStartX = useRef(0);
  const resizeStartWidth = useRef(220);

  const storeTheme = useUIStore((s) => s.theme);
  // 将 "system" 解析为实际的 "light" | "dark"
  const effectiveTheme = storeTheme === 'system'
    ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : storeTheme;
  const resolvedTheme = props?.theme ?? effectiveTheme;
  const monacoTheme = resolvedTheme === "dark" ? "pocketdata-dark" : "pocketdata-light";

  const language = propsLanguage ?? (activeScript?.language === 'python' ? 'python' : 'stata');
  const isControlled = propsValue !== undefined;

  useEffect(() => {
    if (!isControlled) {
      if (activeScript) {
        setCode(activeScript.content);
      } else {
        setCode("");
      }
    }
  }, [activeScript?.id, isControlled]);

  const currentValue = isControlled ? (propsValue ?? "") : code;

  const executor = useScriptExecutor(language);
  const { isExecuting, execute, cancel, output, clear: clearOutput } = executor;

  useEffect(() => {
    outputRef.current = output;
  }, [output]);

  useEffect(() => {
    if (!isControlled && activeScript && code !== activeScript.content) {
      const timer = setTimeout(() => updateScriptContent(activeScript.id, code), 300);
      return () => clearTimeout(timer);
    }
  }, [code, activeScript, updateScriptContent, isControlled]);

  useEffect(() => {
    if (language === 'stata') {
      loadStataCommands();
    }
  }, [language]);

  // Sync sidePanelTab to ref for use in closures (e.g., editor actions)
  useEffect(() => {
    sidePanelTabRef.current = sidePanelTab;
  }, [sidePanelTab]);

  // 监听主题变化并应用
  useEffect(() => {
    if (monacoRef.current) {
      try {
        definePocketDataTheme(monacoRef.current);
        monacoRef.current.editor.setTheme(monacoTheme);
      } catch {}
    }
  }, [monacoTheme]);

  // --- Event-based communication ---
  const lineCount = currentValue ? currentValue.split('\n').length : 0;
  const charCount = currentValue.length;
  const errorCount = output.filter((l) => l.stream === 'stderr').length;
  const stdoutCount = output.filter((l) => l.stream === 'stdout').length;

  // Dispatch editor state to App StatusBar
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('pocketdata:editor-state', {
      detail: {
        language: language === 'python' ? 'Python' : 'Stata',
        lineCount,
        charCount,
        isDirty: activeScript?.isDirty ?? false,
        tabSize: settings.tabSize,
      }
    }));
  }, [language, lineCount, charCount, activeScript?.isDirty, settings.tabSize]);

  // Dispatch script execution state to Toolbar
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('pocketdata:script-state-change', {
      detail: { isExecuting, outputCount: output.length, errorCount }
    }));
  }, [isExecuting, output.length, errorCount]);

  // Listen for Toolbar script action events
  useEffect(() => {
    const handleRun = () => {
      if (isExecuting) {
        cancel();
      } else {
        handleExecute();
      }
    };
    const handleSave = () => handleSaveFn();
    const handleToggleFind = () => {
      // 查找替换已迁移到左侧边栏的 GlobalFindPanel
      // 触发事件打开左侧"查找"tab
      window.dispatchEvent(new CustomEvent("pocketdata:focus-find"));
    };
    const handleToggleReplace = () => {
      // 替换模式：在打开查找后展开 replaceOpen
      window.dispatchEvent(new CustomEvent("pocketdata:focus-find", { detail: { replace: true } }));
    };
    const handleToggleTerminal = () => setShowTerminal(prev => !prev);
    const handleToggleSettings = () => {
      // 设置已迁移到左侧边栏的设置 tab（"代码编辑"子页）
      window.dispatchEvent(new CustomEvent("pocketdata:open-code-settings"));
    };
    const handleToggleSidePanel = () => {
      // 循环：null -> templates -> commands -> null
      const order: (SidePanelTab | null)[] = ['templates', 'commands', null];
      const currentIdx = sidePanelTabRef.current ? order.indexOf(sidePanelTabRef.current) : order.length - 1;
      const nextIdx = (currentIdx + 1) % order.length;
      const next = order[nextIdx];
      if (next === null) {
        // 关闭时同时关闭终端
        setShowTerminal(false);
      }
      setSidePanelTab(next);
    };

    window.addEventListener('pocketdata:script-run', handleRun);
    window.addEventListener('pocketdata:script-save', handleSave);
    window.addEventListener('pocketdata:script-find', handleToggleFind);
    window.addEventListener('pocketdata:script-replace', handleToggleReplace);
    window.addEventListener('pocketdata:script-toggle-terminal', handleToggleTerminal);
    window.addEventListener('pocketdata:script-toggle-settings', handleToggleSettings);
    window.addEventListener('pocketdata:script-toggle-side-panel', handleToggleSidePanel);

    return () => {
      window.removeEventListener('pocketdata:script-run', handleRun);
      window.removeEventListener('pocketdata:script-save', handleSave);
      window.removeEventListener('pocketdata:script-find', handleToggleFind);
      window.removeEventListener('pocketdata:script-replace', handleToggleReplace);
      window.removeEventListener('pocketdata:script-toggle-terminal', handleToggleTerminal);
      window.removeEventListener('pocketdata:script-toggle-settings', handleToggleSettings);
      window.removeEventListener('pocketdata:script-toggle-side-panel', handleToggleSidePanel);
    };
  }, [isExecuting, cancel]);

  // Listen for search queries from Toolbar
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.query) {
        // 通过事件转发到 GlobalFindPanel
        window.dispatchEvent(new CustomEvent("pocketdata:focus-find", { detail: { query: detail.query } }));
      }
    };
    window.addEventListener('pocketdata:search-script', handler);
    return () => window.removeEventListener('pocketdata:search-script', handler);
  }, []);

  // 监听来自 CodeSettingsPanel 的设置变更
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail) return;
      setSettings((prev) => ({ ...prev, ...detail }));
    };
    window.addEventListener("pocketdata:editor-settings-changed", handler);
    return () => window.removeEventListener("pocketdata:editor-settings-changed", handler);
  }, []);

  // --- Side panel resize ---
  const handleResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isResizing.current = true;
    resizeStartX.current = e.clientX;
    resizeStartWidth.current = sidePanelWidth;

    const handleMouseMove = (ev: MouseEvent) => {
      if (!isResizing.current) return;
      const delta = resizeStartX.current - ev.clientX;
      const newWidth = Math.min(500, Math.max(120, resizeStartWidth.current + delta));
      setSidePanelWidth(newWidth);
    };

    const handleMouseUp = () => {
      isResizing.current = false;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [sidePanelWidth]);

  // --- Editor commands ---
  const loadStataCommands = async () => {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const commands = await invoke<StataCommandInfo[]>("get_stata_commands");
      setStataCommands(commands);
    } catch {}
  };

  const handleValueChange = useCallback((v: string) => {
    if (isControlled) propsOnChange?.(v);
    else setCode(v);
  }, [isControlled, propsOnChange]);

  const handleExecute = useCallback(async () => {
    if (propsOnRun) { propsOnRun(); return; }
    if (!currentValue.trim()) {
      notify('warning', '请输入代码');
      return;
    }
    setShowTerminal(true);
    setTerminalTab("all");
    clearOutput();
    try {
      await execute(currentValue, language);
    } catch (err) {
      notify('error', `执行失败: ${err}`);
    }
  }, [currentValue, language, execute, clearOutput, propsOnRun, notify]);

  const handleSaveFn = useCallback(() => {
    if (activeScript) {
      updateScriptContent(activeScript.id, currentValue);
      notify('success', '已保存', 1500);
    }
  }, [activeScript, currentValue, updateScriptContent, notify]);

  const handleEditorDidMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    if (propsEditorRef) propsEditorRef.current = editor;
    registerStataLanguage(monaco);
    definePocketDataTheme(monaco);
    monaco.editor.setTheme(monacoTheme);

    const model = editor.getModel();
    if (model && language === "stata") monaco.editor.setModelLanguage(model, "stata");

    // 注册 .do / .ado / .mata 扩展名映射到 stata
    try {
      // Monaco 不直接支持动态修改扩展名；通常由语言注册时设置。
      // 这里尝试对 .do .ado .mata 进行 setModelLanguage 的统一处理。
    } catch {}

    // Track cursor position for breadcrumb
    editor.onDidChangeCursorPosition((e) => {
      setCursorPosition({ line: e.position.lineNumber, column: e.position.column });
    });

    // Ctrl + 滚轮：缩放字体大小（VSCode 风格）
    const editorDom = editor.getDomNode();
    if (editorDom) {
      editorDom.addEventListener(
        "wheel",
        (e: WheelEvent) => {
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            const delta = e.deltaY < 0 ? 1 : -1;
            const next = Math.max(10, Math.min(32, settings.fontSize + delta));
            if (next !== settings.fontSize) {
              updateSetting("fontSize", next);
            }
          }
        },
        { passive: false }
      );
    }

    // Ctrl+Enter / Ctrl+S: execute
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, handleExecute);
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, handleExecute);

    // F5: prevent default and execute
    editor.addAction({
      id: "pocketdata-f5-execute",
      label: "Execute (F5)",
      keybindings: [monaco.KeyCode.F5],
      run: () => {
        handleExecute();
      },
    });

    // Ctrl+F: find - 打开左侧"查找"tab
    editor.addAction({
      id: "pocketdata-find",
      label: "Find",
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyF],
      run: () => {
        window.dispatchEvent(new CustomEvent("pocketdata:focus-find"));
      },
    });

    // Ctrl+H: replace - 打开左侧"查找"tab 并展开替换
    editor.addAction({
      id: "pocketdata-replace",
      label: "Replace",
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyH],
      run: () => {
        window.dispatchEvent(new CustomEvent("pocketdata:focus-find", { detail: { replace: true } }));
      },
    });

    // Esc: 关闭侧边栏/查找面板
    editor.addAction({
      id: "pocketdata-close-sidepanel",
      label: "Close Side Panel",
      keybindings: [monaco.KeyCode.Escape],
      run: () => {
        if (sidePanelTabRef.current !== null) {
          setSidePanelTab(null);
          editor.focus();
        } else {
          // 通知左侧"查找"面板清空并关闭
          window.dispatchEvent(new CustomEvent("pocketdata:close-find"));
          editor.focus();
        }
      },
    });
  };

  useImperativeHandle(ref, () => ({
    getEditor: () => editorRef.current,
    getMonaco: () => monacoRef.current,
    setValue: (v: string) => { handleValueChange(v); editorRef.current?.setValue(v); },
    getValue: () => editorRef.current?.getValue() ?? currentValue,
    focus: () => editorRef.current?.focus(),
  }), [handleValueChange, currentValue]);

  const updateSetting = <K extends keyof EditorSettings>(key: K, value: EditorSettings[K]) => {
    const next = { ...settings, [key]: value };
    setSettings(next);
    saveSettings(next);
  };

  const insertTemplate = (snippet: string) => {
    if (editorRef.current) {
      const position = editorRef.current.getPosition();
      if (position) {
        editorRef.current.executeEdits("template", [{
          range: { startLineNumber: position.lineNumber, startColumn: position.column, endLineNumber: position.lineNumber, endColumn: position.column },
          text: snippet + "\n",
        }]);
      }
      editorRef.current.focus();
    }
  };

  const insertCommand = (syntax: string) => {
    if (editorRef.current) {
      const position = editorRef.current.getPosition();
      if (position) {
        editorRef.current.executeEdits("command", [{
          range: { startLineNumber: position.lineNumber, startColumn: position.column, endLineNumber: position.lineNumber, endColumn: position.column },
          text: syntax + "\n",
        }]);
      }
      editorRef.current.focus();
    }
  };

  const closeSidePanel = useCallback(() => {
    setSidePanelTab(null);
    setShowTerminal(false);
  }, []);

  const filteredOutput = useMemo(() => {
    if (terminalTab === "all") return output;
    return output.filter(l => l.stream === terminalTab);
  }, [terminalTab, output]);

  // 欢迎页（仅在非 per-tab 模式下显示）
  if (!activeScript && !isControlled && !propsScriptId) {
    return (
      <div className={styles.container}>
        <div className={styles.welcome}>
          <FileCode size={48} className={styles.welcomeIcon} />
          <h2>代码编辑器</h2>
          <p>编写 Stata / Python 脚本并执行</p>
          <div className={styles.welcomeActions}>
            {STATA_TEMPLATES.map(t => (
              <button key={t.label} className={styles.welcomeBtn} onClick={() => {
                const newScript = {
                  id: `script_${Date.now()}`,
                  path: `${t.label}.do`,
                  name: `${t.label}.do`,
                  content: t.snippet,
                  language: 'stata' as const,
                  isDirty: false,
                };
                useFileStore.getState().openScript(newScript);
              }}>
                <Code size={14} />
                {t.label}
              </button>
            ))}
          </div>
          <div className={styles.welcomeShortcuts}>
            <span><kbd>Ctrl</kbd>+<kbd>Enter</kbd> 执行</span>
            <span><kbd>F5</kbd> 执行</span>
            <span><kbd>Ctrl</kbd>+<kbd>F</kbd> 查找</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {/* 面包屑导航：从项目根到当前文件 */}
      <Breadcrumb
        activeScriptPath={activeScript?.path}
        activeScriptName={activeScript?.name}
        cursorPosition={cursorPosition}
        isDirty={activeScript?.isDirty}
        onOpenFile={(p) => {
          window.dispatchEvent(new CustomEvent('pocketdata:open-file', { detail: { path: p } }));
        }}
      />

      {/* 主内容区 */}
      <div className={styles.main}>
        <div className={styles.editorWrapper}>
          <div className={styles.editor}>
            <Editor
              height="100%"
              defaultLanguage={language}
              language={language}
              value={currentValue}
              onChange={(v) => handleValueChange(v ?? "")}
              theme={monacoTheme}
              onMount={handleEditorDidMount}
              options={{
                fontSize: settings.fontSize,
                fontFamily: settings.fontFamily,
                fontLigatures: settings.fontLigatures,
                tabSize: settings.tabSize,
                wordWrap: settings.wordWrap ? "on" : "off",
                minimap: { enabled: settings.minimap },
                lineNumbers: settings.lineNumbers ? "on" : "off",
                renderLineHighlight: "line",
                scrollBeyondLastLine: false,
                automaticLayout: true,
                smoothScrolling: true,
                cursorBlinking: "smooth",
                bracketPairColorization: { enabled: true },
                guides: { bracketPairs: true },
                folding: true,
                matchBrackets: "always",
                autoClosingBrackets: "always",
                suggestOnTriggerCharacters: true,
                quickSuggestions: { other: "on", comments: "off", strings: "off" },
                padding: { top: 8, bottom: 8 },
                scrollbar: { verticalScrollbarSize: 6, horizontalScrollbarSize: 6 },
              }}
            />
          </div>

          {/* 终端 */}
          {showTerminal && (
            <div className={styles.terminal} ref={terminalRef}>
              <div className={styles.terminalHeader}>
                <div className={styles.terminalTabs}>
                  <button
                    className={`${styles.terminalTab} ${terminalTab === 'all' ? styles.terminalTabActive : ''}`}
                    onClick={() => setTerminalTab('all')}
                  >
                    终端
                    {output.length > 0 && <span className={styles.terminalTabBadge}>{output.length}</span>}
                  </button>
                  <button
                    className={`${styles.terminalTab} ${terminalTab === 'stdout' ? styles.terminalTabActive : ''}`}
                    onClick={() => setTerminalTab('stdout')}
                  >
                    输出
                    {stdoutCount > 0 && <span className={styles.terminalTabBadge}>{stdoutCount}</span>}
                  </button>
                  <button
                    className={`${styles.terminalTab} ${terminalTab === 'stderr' ? styles.terminalTabActive : ''}`}
                    onClick={() => setTerminalTab('stderr')}
                  >
                    问题
                    {errorCount > 0 && <span className={`${styles.terminalTabBadge} ${styles.terminalTabBadgeError}`}>{errorCount}</span>}
                  </button>
                </div>
                <div className={styles.terminalActions}>
                  {isExecuting && <span className={styles.runningDot} />}
                  <button className={styles.terminalBtn} onClick={clearOutput} title="清除输出">
                    <Eraser size={12} />
                  </button>
                  <button className={styles.terminalBtn} onClick={() => setShowTerminal(false)} title="关闭终端">
                    <X size={12} />
                  </button>
                </div>
              </div>
              <div className={styles.terminalContent}>
                {filteredOutput.length === 0 ? (
                  <div className={styles.terminalEmpty}>
                    <span>按 F5 或 {formatShortcut("Ctrl+Enter")} 执行代码</span>
                  </div>
                ) : (
                  filteredOutput.map((line, i) => (
                    <div key={i} className={`${styles.terminalLine} ${styles[line.stream]}`}>
                      {line.stream === 'stderr' && <AlertCircle size={10} className={styles.lineIcon} />}
                      {line.stream === 'stdout' && <span className={styles.linePrefix}>›</span>}
                      {line.stream === 'system' && <span className={styles.linePrefix}>»</span>}
                      {line.text}
                    </div>
                  ))
                )}
                {isExecuting && <div className={styles.terminalCursor}><span /></div>}
              </div>
            </div>
          )}
        </div>

        {/* 右侧边栏 (可拖拽调整宽度) */}
        {sidePanelTab !== null && (
          <>
            {/* 拖拽手柄 */}
            <div
              className={styles.resizeHandle}
              onMouseDown={handleResizeMouseDown}
            />
            <div className={styles.sidePanel} style={{ width: sidePanelWidth }}>
              <div className={styles.sidePanelHeader}>
                <div className={styles.sidePanelTabs}>
                  {language === 'stata' && (
                    <button
                      className={`${styles.sidePanelTab} ${sidePanelTab === 'commands' ? styles.sidePanelTabActive : ''}`}
                      onClick={() => setSidePanelTab('commands')}
                      title="Stata命令"
                      aria-label="Stata命令"
                    >
                      <Hash size={15} />
                    </button>
                  )}
                  <button
                    className={`${styles.sidePanelTab} ${sidePanelTab === 'templates' ? styles.sidePanelTabActive : ''}`}
                    onClick={() => setSidePanelTab('templates')}
                    title="模板"
                    aria-label="模板"
                  >
                    <Code size={15} />
                  </button>
                </div>
                <button className={styles.closeBtn} onClick={closeSidePanel} title="关闭" aria-label="关闭面板">
                  <X size={14} />
                </button>
              </div>

              <div className={styles.panelContent}>
                {/* Stata 命令面板 */}
                {sidePanelTab === 'commands' && (
                  <div className={styles.commandsPanel}>
                    {stataCommands.slice(0, 50).map(cmd => (
                      <button key={cmd.name} className={styles.panelItem} onClick={() => insertCommand(cmd.syntax)} title={cmd.description}>
                        <Hash size={12} />
                        <div className={styles.panelItemText}>
                          <span className={styles.cmdName}>{cmd.name}</span>
                          <span className={styles.cmdDesc}>{cmd.description}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {/* 模板面板 */}
                {sidePanelTab === 'templates' && (
                  <div className={styles.commandsPanel}>
                    {STATA_TEMPLATES.map(t => (
                      <button key={t.label} className={styles.panelItem} onClick={() => insertTemplate(t.snippet)} title={t.snippet}>
                        <Code size={12} />
                        <div className={styles.panelItemText}>
                          <span className={styles.cmdName}>{t.label}</span>
                          <span className={styles.cmdDesc}>{t.snippet}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
                {/* 设置面板已迁移至左侧"设置 → 代码编辑" */}
              </div>
            </div>
          </>
        )}
      </div>

      {/* 状态栏已移除 — 信息通过 App StatusBar 显示 */}
    </div>
  );
});