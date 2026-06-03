import { useState, useEffect, useCallback, useRef } from "react";
import Editor, { type OnMount } from "@monaco-editor/react";
import { useUIStore } from "@/stores/uiStore";
import { useFileStore } from "@/stores/fileStore";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  Terminal, PanelRightClose, PanelRightOpen, ZoomIn, ZoomOut,
  FileType, Code, Settings, X, Trash2,
  Play, Minimize2,
} from "lucide-react";
import styles from "./CodeEditor.module.css";

interface StataCommandInfo {
  name: string;
  description: string;
  syntax: string;
  category: string;
}

interface EditorSettings {
  fontSize: number;
  fontFamily: string;
  tabSize: number;
  wordWrap: boolean;
  minimap: boolean;
  lineNumbers: boolean;
  bracketPairColorization: boolean;
  cursorBlinking: "smooth" | "blink" | "smooth" | "phase" | "expand" | "solid";
  renderWhitespace: "none" | "boundary" | "selection" | "trailing" | "all";
}

type TerminalTab = "terminal" | "output" | "problems";

const DEFAULT_SETTINGS: EditorSettings = {
  fontSize: 14,
  fontFamily: "'Cascadia Code', 'Fira Code', 'JetBrains Mono', Consolas, 'Courier New', monospace",
  tabSize: 4,
  wordWrap: true,
  minimap: false,
  lineNumbers: true,
  bracketPairColorization: true,
  cursorBlinking: "smooth",
  renderWhitespace: "selection",
};

const FONT_OPTIONS = [
  "'Cascadia Code', Consolas, monospace",
  "'Fira Code', Consolas, monospace",
  "'JetBrains Mono', Consolas, monospace",
  "Consolas, 'Courier New', monospace",
  "'Source Code Pro', Consolas, monospace",
  "Menlo, Monaco, monospace",
];

function loadSettings(): EditorSettings {
  try {
    const saved = localStorage.getItem("pocket-stata-editor-settings");
    if (saved) return { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
  } catch {}
  return DEFAULT_SETTINGS;
}

function saveSettings(settings: EditorSettings) {
  try {
    localStorage.setItem("pocket-stata-editor-settings", JSON.stringify(settings));
  } catch {}
}

function registerStataLanguage(monaco: any) {
  monaco.languages.register({ id: "stata" });

  monaco.languages.setMonarchTokensProvider("stata", {
    keywords: [
      "if", "else", "for", "foreach", "forvalues", "while", "do", "exit",
      "break", "continue", "return", "capture", "quietly", "noisily",
      "program", "end", "args", "syntax", "confirm", "preserve", "restore",
      "tempvar", "tempfile", "tempname", "local", "global", "scalar",
      "matrix", "macro", "estimates", "estat", "predict", "margins",
      "test", "testparm", "lincom", "nlcom", "suest", "bootstrap",
    ],
    commands: [
      "use", "sysuse", "save", "describe", "summarize", "tabulate",
      "generate", "replace", "drop", "keep", "rename", "label",
      "merge", "append", "sort", "gsort", "by", "bysort",
      "regress", "logit", "probit", "ologit", "mlogit", "poisson",
      "nbreg", "xtreg", "xtlogit", "xtset", "tsset", "areg",
      "ivregress", "heckman", "tobit", "stcox", "streg", "stset",
      "anova", "manova", "factor", "pca", "cluster", "corr",
      "pwcorr", "spearman", "kappa", "alpha", "cronbach",
      "graph", "twoway", "scatter", "line", "bar", "histogram",
      "kdensity", "box", "pie", "area", "rarea", "rbar",
      "rcap", "rspike", "rline", "mband", "mspline", "lowess",
      "lpoly", "qfit", "fpfit", "function", "contour", "heat",
      "display", "di", "list", "browse", "edit", "count",
      "codebook", "inspect", "misstable", "missing", "recode",
      "destring", "tostring", "encode", "decode", "egen",
      "reshape", "collapse", "contract", "fillin", "stack",
      "statsby", "rolling", "bootstrap", "jackknife", "simulate",
      "postfile", "post", "postclose", "file", "infile", "insheet",
      "outsheet", "export", "import", "odbc", "xmlsave",
      "log", "cmdlog", "translate", "view", "help", "search",
      "update", "adoupdate", "ssc", "net", "which", "version",
      "set", "query", "about", "clear", "memory", "discard",
      "window", "menu", "dialog", "db",
    ],
    operators: [
      "==", "!=", "~=", ">=", "<=", ">", "<", "&", "|", "~", "!",
      "+", "-", "*", "/", "^", "=", ":", "::",
    ],
    symbols: /[=><!~&|+\-*/^:]+/,
    tokenizer: {
      root: [
        [/[a-zA-Z_]\w*/, {
          cases: {
            "@keywords": "keyword",
            "@commands": "keyword",
            "@default": "identifier",
          },
        }],
        { include: "@whitespace" },
        [/\d*\.\d+([eE][\-+]?\d+)?/, "number.float"],
        [/\d+/, "number"],
        [/[{}()\[\]]/, "@brackets"],
        [/@symbols/, {
          cases: {
            "@operators": "operator",
            "@default": "",
          },
        }],
        [/"/, "string", "@string_double"],
        [/`/, "string", "@string_backtick"],
        [/%[a-zA-Z_]\w*/, "variable.predefined"],
        [/\$[a-zA-Z_]\w*/, "variable.global"],
      ],
      whitespace: [
        [/[ \t\r\n]+/, "white"],
        [/\/\/.*$/, "comment"],
        [/\*.*$/, "comment"],
        [/\/\*/, "comment", "@comment"],
      ],
      comment: [
        [/[^/*]+/, "comment"],
        [/\*\//, "comment", "@pop"],
        [/[/*]/, "comment"],
      ],
      string_double: [
        [/[^\\"]+/, "string"],
        [/\\./, "string.escape"],
        [/"/, "string", "@pop"],
      ],
      string_backtick: [
        [/[^\\`]+/, "string"],
        [/\\./, "string.escape"],
        [/'/, "string", "@pop"],
      ],
    },
  });

  monaco.languages.setLanguageConfiguration("stata", {
    comments: {
      lineComment: "//",
      blockComment: ["/*", "*/"],
    },
    brackets: [
      ["{", "}"],
      ["(", ")"],
      ["[", "]"],
    ],
    autoClosingPairs: [
      { open: "{", close: "}" },
      { open: "(", close: ")" },
      { open: "[", close: "]" },
      { open: '"', close: '"', notIn: ["string"] },
      { open: "`", close: "'" },
    ],
    surroundingPairs: [
      { open: "{", close: "}" },
      { open: "(", close: ")" },
      { open: "[", close: "]" },
      { open: '"', close: '"' },
    ],
    folding: {
      markers: {
        start: /^\s*\/\*/,
        end: /^\s*\*\//,
      },
    },
  });
}

export function CodeEditor() {
  const { updateScriptContent, tabs, activeTabId, scripts } = useFileStore();
  const isInitialized = useRef(false);
  const terminalRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<any>(null);
  const monacoRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const activeScript = tabs.find(t => t.id === activeTabId && t.type === 'script')
    ? scripts[tabs.find(t => t.id === activeTabId && t.type === 'script')!.fileId]
    : null;

  const [code, setCode] = useState("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [stataCommands, setStataCommands] = useState<StataCommandInfo[]>([]);

  const [terminalOutput, setTerminalOutput] = useState<string[]>([]);
  const [terminalError, setTerminalError] = useState<string[]>([]);
  const [isTerminalExecuting, setIsTerminalExecuting] = useState(false);

  const [showTerminal, setShowTerminal] = useState(false);
  const [showCommandsDrawer, setShowCommandsDrawer] = useState(false);
  const [activeTerminalTab, setActiveTerminalTab] = useState<TerminalTab>("terminal");

  const [editorSettings, setEditorSettings] = useState<EditorSettings>(loadSettings);
  const [showSettingsPanel, setShowSettingsPanel] = useState(false);

  const [terminalHeight, setTerminalHeight] = useState(220);
  const isResizingTerminal = useRef(false);

  const { theme } = useUIStore();

  const language = activeScript?.language === 'python' ? 'python' : 'stata';

  useEffect(() => {
    if (activeScript && !isInitialized.current) {
      setCode(activeScript.content);
      isInitialized.current = true;
    } else if (activeScript) {
      setCode(activeScript.content);
    }
  }, [activeScript?.id]);

  useEffect(() => {
    if (activeScript && code !== activeScript.content) {
      const timer = setTimeout(() => {
        updateScriptContent(activeScript.id, code);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [code, activeScript, updateScriptContent]);

  useEffect(() => {
    let unlistenOutput: (() => void) | null = null;
    let unlistenError: (() => void) | null = null;
    let unlistenDone: (() => void) | null = null;

    const setupListeners = async () => {
      try {
        unlistenOutput = await listen<string>('powershell:output', (event) => {
          setTerminalOutput(prev => [...prev, event.payload]);
          setActiveTerminalTab("terminal");
          setShowTerminal(true);
          setTimeout(() => {
            if (terminalRef.current) {
              terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
            }
          }, 10);
        });

        unlistenError = await listen<string>('powershell:error', (event) => {
          setTerminalError(prev => [...prev, event.payload]);
          setActiveTerminalTab("terminal");
          setShowTerminal(true);
          setTimeout(() => {
            if (terminalRef.current) {
              terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
            }
          }, 10);
        });

        unlistenDone = await listen<number>('powershell:done', () => {
          setIsTerminalExecuting(false);
          setIsExecuting(false);
        });
      } catch (error) {
        console.error('Failed to setup PowerShell listeners:', error);
      }
    };

    setupListeners();

    return () => {
      if (unlistenOutput) unlistenOutput();
      if (unlistenError) unlistenError();
      if (unlistenDone) unlistenDone();
    };
  }, []);

  useEffect(() => {
    initializeSession();
    loadStataCommands();
  }, []);

  useEffect(() => {
    saveSettings(editorSettings);
  }, [editorSettings]);

  const initializeSession = async () => {
    try {
      const id = await invoke<string>("create_script_session", {
        scriptType: language,
      });
      setSessionId(id);
    } catch (error) {
      console.error("Failed to create session:", error);
    }
  };

  const loadStataCommands = async () => {
    try {
      const commands = await invoke<StataCommandInfo[]>("get_stata_commands");
      setStataCommands(commands);
    } catch (error) {
      console.error("Failed to load Stata commands:", error);
    }
  };

  const handleExecute = useCallback(async () => {
    if (!sessionId) {
      await initializeSession();
      return;
    }

    setIsExecuting(true);
    setShowTerminal(true);
    setActiveTerminalTab("terminal");
    setTerminalOutput([]);
    setTerminalError([]);
    setIsTerminalExecuting(true);

    try {
      await invoke("execute_powershell_command", {
        code: code
      });
    } catch (error) {
      setTerminalError(prev => [...prev, `执行错误: ${error}`]);
      setIsExecuting(false);
      setIsTerminalExecuting(false);
    }
  }, [sessionId, code, language]);

  const handleCommandInsert = useCallback((syntax: string) => {
    if (editorRef.current) {
      const editor = editorRef.current;
      const position = editor.getPosition();
      editor.executeEdits("stata-command", [{
        range: {
          startLineNumber: position.lineNumber,
          startColumn: position.column,
          endLineNumber: position.lineNumber,
          endColumn: position.column,
        },
        text: syntax + "\n",
      }]);
      editor.focus();
    } else {
      setCode(prev => prev + syntax + "\n");
    }
  }, []);

  const handleClearOutput = () => {
    setTerminalOutput([]);
    setTerminalError([]);
  };

  const handleZoomIn = () => {
    setEditorSettings(prev => ({
      ...prev,
      fontSize: Math.min(prev.fontSize + 1, 32)
    }));
  };

  const handleZoomOut = () => {
    setEditorSettings(prev => ({
      ...prev,
      fontSize: Math.max(prev.fontSize - 1, 8)
    }));
  };

  const handleEditorDidMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    registerStataLanguage(monaco);

    const model = editor.getModel();
    if (model && language === "stata") {
      monaco.editor.setModelLanguage(model, "stata");
    }

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
      handleExecute();
    });
  };

  useEffect(() => {
    if (editorRef.current && monacoRef.current) {
      const model = editorRef.current.getModel();
      if (model) {
        monacoRef.current.editor.setModelLanguage(model, language);
      }
    }
  }, [language]);

  const lineCount = code.split('\n').length;
  const charCount = code.length;

  const handleTerminalResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isResizingTerminal.current = true;
    const startY = e.clientY;
    const startHeight = terminalHeight;

    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizingTerminal.current) return;
      const delta = startY - e.clientY;
      setTerminalHeight(Math.max(80, Math.min(500, startHeight + delta)));
    };

    const handleMouseUp = () => {
      isResizingTerminal.current = false;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [terminalHeight]);

  const getFileIcon = () => {
    if (activeScript) {
      if (activeScript.language === 'stata') return <Code size={14} color="#2196f3" />;
      if (activeScript.language === 'python') return <Code size={14} color="#f59e0b" />;
    }
    return <FileType size={14} color="#9ca3af" />;
  };

  const getLanguageLabel = () => {
    return language === 'python' ? 'Python' : 'Stata';
  };

  const updateSetting = <K extends keyof EditorSettings>(key: K, value: EditorSettings[K]) => {
    setEditorSettings(prev => ({ ...prev, [key]: value }));
  };

  return (
    <div className={styles.container} ref={containerRef}>
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          {getFileIcon()}
          <span className={styles.toolbarTitle}>{activeScript?.name || '代码编辑器'}</span>
        </div>
        <div className={styles.toolbarCenter}>
          <button
            className={styles.executeButton}
            onClick={handleExecute}
            disabled={isExecuting}
            title="执行 (Ctrl+Enter)"
          >
            <Play size={14} />
            {isExecuting ? "执行中..." : "执行"}
          </button>
        </div>
        <div className={styles.toolbarRight}>
          <button
            className={styles.drawerButton}
            onClick={() => setShowTerminal(!showTerminal)}
            title={showTerminal ? "隐藏终端" : "显示终端"}
          >
            <Terminal size={16} />
          </button>
          {language === "stata" && (
            <button
              className={styles.drawerButton}
              onClick={() => setShowCommandsDrawer(!showCommandsDrawer)}
              title="Stata 命令参考"
            >
              {showCommandsDrawer ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}
            </button>
          )}
          <button
            className={styles.drawerButton}
            onClick={() => setShowSettingsPanel(!showSettingsPanel)}
            title="编辑器设置"
          >
            <Settings size={16} />
          </button>
        </div>
      </div>

      <div className={styles.mainContent}>
        <div className={styles.editorArea}>
          <div className={styles.editorContainer}>
            <Editor
              height="100%"
              language={language}
              value={code}
              onChange={(value) => value && setCode(value)}
              theme={theme === "dark" ? "vs-dark" : "vs-light"}
              onMount={handleEditorDidMount}
              options={{
                fontSize: editorSettings.fontSize,
                fontFamily: editorSettings.fontFamily,
                tabSize: editorSettings.tabSize,
                wordWrap: editorSettings.wordWrap ? "on" : "off",
                minimap: { enabled: editorSettings.minimap },
                lineNumbers: editorSettings.lineNumbers ? "on" : "off",
                renderLineHighlight: "all",
                scrollBeyondLastLine: false,
                smoothScrolling: true,
                cursorBlinking: editorSettings.cursorBlinking,
                cursorSmoothCaretAnimation: "on",
                bracketPairColorization: { enabled: editorSettings.bracketPairColorization },
                guides: {
                  bracketPairs: true,
                  indentation: true,
                },
                folding: true,
                showFoldingControls: "always",
                matchBrackets: "always",
                autoClosingBrackets: "always",
                autoClosingQuotes: "always",
                suggestOnTriggerCharacters: true,
                quickSuggestions: { other: "on", comments: "off", strings: "off" },
                acceptSuggestionOnCommitCharacter: true,
                acceptSuggestionOnEnter: "on",
                snippetSuggestions: "inline",
                formatOnPaste: true,
                formatOnType: true,
                padding: { top: 8, bottom: 8 },
                stickyScroll: { enabled: true },
                renderWhitespace: editorSettings.renderWhitespace,
              }}
              onValidate={() => {
                // Could update problems tab
              }}
            />
          </div>

          {showTerminal && (
            <div className={styles.terminalPanel} style={{ height: terminalHeight }}>
              <div
                className={styles.terminalResizeHandle}
                onMouseDown={handleTerminalResizeMouseDown}
              />
              <div className={styles.terminalHeader}>
                <div className={styles.terminalTabs}>
                  <button
                    className={`${styles.terminalTab} ${activeTerminalTab === "terminal" ? styles.terminalTabActive : ""}`}
                    onClick={() => setActiveTerminalTab("terminal")}
                  >
                    <Terminal size={12} />
                    终端
                  </button>
                  <button
                    className={`${styles.terminalTab} ${activeTerminalTab === "output" ? styles.terminalTabActive : ""}`}
                    onClick={() => setActiveTerminalTab("output")}
                  >
                    输出
                  </button>
                  <button
                    className={`${styles.terminalTab} ${activeTerminalTab === "problems" ? styles.terminalTabActive : ""}`}
                    onClick={() => setActiveTerminalTab("problems")}
                  >
                    问题
                  </button>
                </div>
                <div className={styles.terminalActions}>
                  <button
                    className={styles.terminalActionBtn}
                    onClick={handleClearOutput}
                    title="清除"
                  >
                    <Trash2 size={13} />
                  </button>
                  <button
                    className={styles.terminalActionBtn}
                    onClick={() => setShowTerminal(false)}
                    title="关闭面板"
                  >
                    <Minimize2 size={13} />
                  </button>
                </div>
              </div>
              <div className={styles.terminalContent} ref={terminalRef}>
                {activeTerminalTab === "terminal" && (
                  <>
                    {(terminalOutput.length > 0 || terminalError.length > 0 || isTerminalExecuting) ? (
                      <>
                        {terminalOutput.map((line, idx) => (
                          <div key={`out-${idx}`} className={styles.terminalLine}>
                            {line}
                          </div>
                        ))}
                        {terminalError.map((line, idx) => (
                          <div key={`err-${idx}`} className={styles.terminalLineError}>
                            {line}
                          </div>
                        ))}
                        {isTerminalExecuting && (
                          <div className={styles.terminalLineExecuting}>
                            ● 正在执行...
                          </div>
                        )}
                      </>
                    ) : (
                      <div className={styles.terminalPlaceholder}>
                        终端就绪 — 按 Ctrl+Enter 执行代码
                      </div>
                    )}
                  </>
                )}
                {activeTerminalTab === "output" && (
                  <div className={styles.terminalPlaceholder}>
                    暂无输出
                  </div>
                )}
                {activeTerminalTab === "problems" && (
                  <div className={styles.terminalPlaceholder}>
                    暂无问题
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {showCommandsDrawer && language === "stata" && (
          <div className={styles.commandsDrawer}>
            <div className={styles.drawerHeader}>
              <span>Stata 命令参考</span>
              <button
                className={styles.drawerCloseBtn}
                onClick={() => setShowCommandsDrawer(false)}
              >
                <X size={14} />
              </button>
            </div>
            <div className={styles.drawerContent}>
              {stataCommands.map((cmd) => (
                <div
                  key={cmd.name}
                  className={styles.commandItem}
                  onClick={() => handleCommandInsert(cmd.syntax)}
                  title={`点击插入: ${cmd.syntax}`}
                >
                  <span className={styles.commandName}>{cmd.name}</span>
                  <span className={styles.commandDesc}>{cmd.description}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {showSettingsPanel && (
          <div className={styles.commandsDrawer}>
            <div className={styles.drawerHeader}>
              <span>编辑器设置</span>
              <button
                className={styles.drawerCloseBtn}
                onClick={() => setShowSettingsPanel(false)}
              >
                <X size={14} />
              </button>
            </div>
            <div className={styles.drawerContent}>
              <div className={styles.settingGroup}>
                <label className={styles.settingLabel}>字体</label>
                <select
                  className={styles.settingSelect}
                  value={editorSettings.fontFamily}
                  onChange={(e) => updateSetting('fontFamily', e.target.value)}
                >
                  {FONT_OPTIONS.map(f => (
                    <option key={f} value={f}>{f.split(',')[0].replace(/'/g, '')}</option>
                  ))}
                </select>
              </div>
              <div className={styles.settingGroup}>
                <label className={styles.settingLabel}>字号</label>
                <div className={styles.settingRow}>
                  <button className={styles.settingBtn} onClick={handleZoomOut}>-</button>
                  <span className={styles.settingValue}>{editorSettings.fontSize}px</span>
                  <button className={styles.settingBtn} onClick={handleZoomIn}>+</button>
                </div>
              </div>
              <div className={styles.settingGroup}>
                <label className={styles.settingLabel}>Tab 大小</label>
                <select
                  className={styles.settingSelect}
                  value={editorSettings.tabSize}
                  onChange={(e) => updateSetting('tabSize', Number(e.target.value))}
                >
                  <option value={2}>2 空格</option>
                  <option value={4}>4 空格</option>
                  <option value={8}>8 空格</option>
                </select>
              </div>
              <div className={styles.settingGroup}>
                <label className={styles.settingLabel}>自动换行</label>
                <button
                  className={`${styles.settingToggle} ${editorSettings.wordWrap ? styles.settingToggleOn : ""}`}
                  onClick={() => updateSetting('wordWrap', !editorSettings.wordWrap)}
                >
                  {editorSettings.wordWrap ? "开启" : "关闭"}
                </button>
              </div>
              <div className={styles.settingGroup}>
                <label className={styles.settingLabel}>小地图</label>
                <button
                  className={`${styles.settingToggle} ${editorSettings.minimap ? styles.settingToggleOn : ""}`}
                  onClick={() => updateSetting('minimap', !editorSettings.minimap)}
                >
                  {editorSettings.minimap ? "开启" : "关闭"}
                </button>
              </div>
              <div className={styles.settingGroup}>
                <label className={styles.settingLabel}>行号</label>
                <button
                  className={`${styles.settingToggle} ${editorSettings.lineNumbers ? styles.settingToggleOn : ""}`}
                  onClick={() => updateSetting('lineNumbers', !editorSettings.lineNumbers)}
                >
                  {editorSettings.lineNumbers ? "开启" : "关闭"}
                </button>
              </div>
              <div className={styles.settingGroup}>
                <label className={styles.settingLabel}>括号着色</label>
                <button
                  className={`${styles.settingToggle} ${editorSettings.bracketPairColorization ? styles.settingToggleOn : ""}`}
                  onClick={() => updateSetting('bracketPairColorization', !editorSettings.bracketPairColorization)}
                >
                  {editorSettings.bracketPairColorization ? "开启" : "关闭"}
                </button>
              </div>
              <div className={styles.settingGroup}>
                <label className={styles.settingLabel}>显示空白</label>
                <select
                  className={styles.settingSelect}
                  value={editorSettings.renderWhitespace}
                  onChange={(e) => updateSetting('renderWhitespace', e.target.value as EditorSettings['renderWhitespace'])}
                >
                  <option value="none">无</option>
                  <option value="boundary">边界</option>
                  <option value="selection">选中</option>
                  <option value="trailing">尾部</option>
                  <option value="all">全部</option>
                </select>
              </div>
              <div className={styles.settingGroup}>
                <label className={styles.settingLabel}>光标样式</label>
                <select
                  className={styles.settingSelect}
                  value={editorSettings.cursorBlinking}
                  onChange={(e) => updateSetting('cursorBlinking', e.target.value as EditorSettings['cursorBlinking'])}
                >
                  <option value="smooth">平滑闪烁</option>
                  <option value="blink">闪烁</option>
                  <option value="phase">相位</option>
                  <option value="expand">扩展</option>
                  <option value="solid">实心</option>
                </select>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className={styles.statusBar}>
        <div className={styles.statusBarLeft}>
          <span className={styles.statusItem}>
            {getFileIcon()}
            {getLanguageLabel()}
          </span>
          <span className={styles.statusItem}>
            行: {lineCount}
          </span>
          <span className={styles.statusItem}>
            字符: {charCount}
          </span>
          {activeScript && (
            <span className={styles.statusItem}>
              {activeScript.isDirty ? '● 已修改' : '✓ 已保存'}
            </span>
          )}
        </div>
        <div className={styles.statusBarRight}>
          <button className={styles.zoomButton} onClick={handleZoomOut} title="缩小字体">
            <ZoomOut size={14} />
          </button>
          <span className={styles.zoomLevel}>{editorSettings.fontSize}px</span>
          <button className={styles.zoomButton} onClick={handleZoomIn} title="放大字体">
            <ZoomIn size={14} />
          </button>
          <div className={styles.statusBarDivider} />
          <span className={styles.statusItem}>
            Tab: {editorSettings.tabSize}
          </span>
          <span className={styles.statusItem}>
            {getLanguageLabel()}
          </span>
          <span className={styles.statusItem}>
            UTF-8
          </span>
        </div>
      </div>
    </div>
  );
}
