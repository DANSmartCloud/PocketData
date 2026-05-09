import { useState, useEffect, useCallback, useRef } from "react";
import Editor from "@monaco-editor/react";
import { useUIStore } from "@/stores/uiStore";
import { useFileStore } from "@/stores/fileStore";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Terminal, PanelRightClose, PanelRightOpen, ZoomIn, ZoomOut, Minimize2, FileType, Code } from "lucide-react";
import styles from "./CodeEditor.module.css";

interface StataCommandInfo {
  name: string;
  description: string;
  syntax: string;
  category: string;
}

interface EditorSettings {
  fontSize: number;
  tabSize: number;
  wordWrap: boolean;
  minimap: boolean;
}

export function CodeEditor() {
  const { updateScriptContent, tabs, activeTabId, scripts } = useFileStore();
  const isInitialized = useRef(false);
  const terminalRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<any>(null);

  const activeScript = tabs.find(t => t.id === activeTabId && t.type === 'script') 
    ? scripts[tabs.find(t => t.id === activeTabId && t.type === 'script')!.fileId] 
    : null;

  const [activeTabType, setActiveTabType] = useState<"stata" | "python">("stata");
  const [stataCode, setStataCode] = useState(`// Stata Do File
clear all
sysuse auto

// 描述数据
describe

// 回归分析
regress price mpg weight foreign

// 绘制散点图
twoway scatter price mpg`);
  const [pythonCode, setPythonCode] = useState(`# Python Script
import pandas as pd
import numpy as np

# 读取数据
df = pd.read_stata('auto.dta')

# 查看数据
print(df.head())

# 基本统计
print(df.describe())

# 回归分析
from sklearn.linear_model import LinearRegression
X = df[['mpg', 'weight']]
y = df['price']
model = LinearRegression().fit(X, y)
print(f"R²: {model.score(X, y):.4f}")`);

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [stataCommands, setStataCommands] = useState<StataCommandInfo[]>([]);

  const [terminalOutput, setTerminalOutput] = useState<string[]>([]);
  const [terminalError, setTerminalError] = useState<string[]>([]);
  const [isTerminalExecuting, setIsTerminalExecuting] = useState(false);

  const [showTerminalDrawer, setShowTerminalDrawer] = useState(false);
  const [showCommandsDrawer, setShowCommandsDrawer] = useState(false);

  const [editorSettings, setEditorSettings] = useState<EditorSettings>({
    fontSize: 14,
    tabSize: 2,
    wordWrap: false,
    minimap: true
  });

  const [terminalHeight, setTerminalHeight] = useState(250);
  const isResizingTerminal = useRef(false);

  const { theme } = useUIStore();

  useEffect(() => {
    if (activeScript && !isInitialized.current) {
      if (activeScript.language === 'stata') {
        setActiveTabType('stata');
        setStataCode(activeScript.content);
      } else {
        setActiveTabType('python');
        setPythonCode(activeScript.content);
      }
      isInitialized.current = true;
    }
  }, [activeScript]);

  useEffect(() => {
    if (activeScript) {
      const content = activeScript.language === 'stata' ? stataCode : pythonCode;
      if (content !== activeScript.content) {
        updateScriptContent(activeScript.id, content);
      }
    }
  }, [stataCode, pythonCode, activeScript, updateScriptContent]);

  useEffect(() => {
    let unlistenOutput: (() => void) | null = null;
    let unlistenError: (() => void) | null = null;
    let unlistenDone: (() => void) | null = null;

    const setupListeners = async () => {
      try {
        unlistenOutput = await listen<string>('powershell:output', (event) => {
          setTerminalOutput(prev => [...prev, event.payload]);
          setTimeout(() => {
            if (terminalRef.current) {
              terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
            }
          }, 10);
        });

        unlistenError = await listen<string>('powershell:error', (event) => {
          setTerminalError(prev => [...prev, event.payload]);
          setTimeout(() => {
            if (terminalRef.current) {
              terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
            }
          }, 10);
        });

        unlistenDone = await listen<number>('powershell:done', () => {
          setIsTerminalExecuting(false);
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

  const initializeSession = async () => {
    try {
      const id = await invoke<string>("create_script_session", {
        scriptType: activeTabType,
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
    setShowTerminalDrawer(true);
    setTerminalOutput([]);
    setTerminalError([]);

    const codeToExecute = activeTabType === "stata" ? stataCode : pythonCode;

    try {
      await invoke("execute_powershell_command", {
        code: codeToExecute
      });
    } catch (error) {
      setTerminalError(prev => [...prev, `执行错误: ${error}`]);
      setIsExecuting(false);
    } finally {
      setIsExecuting(false);
    }
  }, [sessionId, activeTabType, stataCode, pythonCode]);

  const handleCommandInsert = useCallback((syntax: string) => {
    const currentCode = activeTabType === "stata" ? stataCode : pythonCode;
    const insertText = `${syntax}\n`;
    const newCode = currentCode + insertText;
    
    if (activeTabType === "stata") {
      setStataCode(newCode);
    } else {
      setPythonCode(newCode);
    }
  }, [activeTabType, stataCode, pythonCode]);

  const handleTabChange = async (tab: "stata" | "python") => {
    setActiveTabType(tab);
    try {
      const id = await invoke<string>("create_script_session", {
        scriptType: tab,
      });
      setSessionId(id);
    } catch (error) {
      console.error("Failed to create session:", error);
    }
  };

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

  const handleEditorDidMount = (editor: any) => {
    editorRef.current = editor;
  };

  const lineCount = activeTabType === "stata" ? stataCode.split('\n').length : pythonCode.split('\n').length;
  const charCount = activeTabType === "stata" ? stataCode.length : pythonCode.length;

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    isResizingTerminal.current = true;
    const startY = e.clientY;
    const startHeight = terminalHeight;

    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizingTerminal.current) return;
      const delta = startY - e.clientY;
      setTerminalHeight(Math.max(100, Math.min(600, startHeight + delta)));
    };

    const handleMouseUp = () => {
      isResizingTerminal.current = false;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [terminalHeight]);

  const getLanguage = () => {
    if (activeTabType === "python") return "python";
    return "javascript";
  };

  const getCurrentCode = () => {
    return activeTabType === "stata" ? stataCode : pythonCode;
  };

  const handleEditorChange = (value: string | undefined) => {
    if (!value) return;
    if (activeTabType === "stata") {
      setStataCode(value);
    } else {
      setPythonCode(value);
    }
  };

  const getFileIcon = () => {
    if (activeScript) {
      if (activeScript.language === 'stata') return <Code size={14} color="#2196f3" />;
      if (activeScript.name.endsWith('.py')) return <Code size={14} color="#f59e0b" />;
    }
    return <FileType size={14} color="#9ca3af" />;
  };

  return (
    <div className={styles.container}>
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          {getFileIcon()}
          <span className={styles.toolbarTitle}>{activeScript?.name || '代码编辑器'}</span>
          <div className={styles.toolbarDivider} />
          <button
            className={`${styles.tab} ${activeTabType === "stata" ? styles.active : ""}`}
            onClick={() => handleTabChange("stata")}
          >
            Stata
          </button>
          <button
            className={`${styles.tab} ${activeTabType === "python" ? styles.active : ""}`}
            onClick={() => handleTabChange("python")}
          >
            Python
          </button>
        </div>
        <div className={styles.toolbarCenter}>
          <button
            className={styles.executeButton}
            onClick={handleExecute}
            disabled={isExecuting}
          >
            {isExecuting ? "执行中..." : "▶ 执行"}
          </button>
        </div>
        <div className={styles.toolbarRight}>
          <button
            className={styles.drawerButton}
            onClick={() => setShowTerminalDrawer(!showTerminalDrawer)}
            title="终端面板"
          >
            <Terminal size={16} />
          </button>
          {activeTabType === "stata" && (
            <button
              className={styles.drawerButton}
              onClick={() => setShowCommandsDrawer(!showCommandsDrawer)}
              title="Stata 命令参考"
            >
              {showCommandsDrawer ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}
            </button>
          )}
        </div>
      </div>
      <div className={styles.mainContent}>
        <div className={styles.editorContainer}>
          <Editor
            height="100%"
            language={getLanguage()}
            value={getCurrentCode()}
            onChange={handleEditorChange}
            theme={theme === "dark" ? "vs-dark" : "vs-light"}
            onMount={handleEditorDidMount}
            options={{
              fontSize: editorSettings.fontSize,
              tabSize: editorSettings.tabSize,
              wordWrap: editorSettings.wordWrap ? "on" : "off",
              minimap: { enabled: editorSettings.minimap },
              lineNumbers: "on",
              renderLineHighlight: "all",
              scrollBeyondLastLine: true,
              smoothScrolling: true,
              cursorBlinking: "smooth",
              cursorSmoothCaretAnimation: "on",
              bracketPairColorization: { enabled: true },
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
              quickSuggestions: { other: "on", comments: "on", strings: "on" },
              acceptSuggestionOnCommitCharacter: true,
              acceptSuggestionOnEnter: "on",
              snippetSuggestions: "inline",
              formatOnPaste: true,
              formatOnType: true,
              padding: { top: 10, bottom: 10 },
              stickyScroll: { enabled: true },
            }}
          />
        </div>

        {showCommandsDrawer && activeTabType === "stata" && (
          <div className={styles.commandsDrawer}>
            <div className={styles.drawerHeader}>
              <span>Stata 命令参考（点击插入）</span>
              <button 
                className={styles.drawerCloseBtn}
                onClick={() => setShowCommandsDrawer(false)}
              >
                <Minimize2 size={14} />
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

        {showTerminalDrawer && (
          <div 
            className={styles.terminalDrawer} 
            style={{ height: terminalHeight }}
          >
            <div 
              className={styles.terminalResizeHandle} 
              onMouseDown={handleMouseDown}
            />
            <div className={styles.drawerHeader}>
              <span>终端输出</span>
              <div className={styles.drawerActions}>
                <button className={styles.clearButton} onClick={handleClearOutput}>
                  清除
                </button>
                <button 
                  className={styles.drawerCloseBtn}
                  onClick={() => setShowTerminalDrawer(false)}
                >
                  <Minimize2 size={14} />
                </button>
              </div>
            </div>
            <div className={styles.terminalContent} ref={terminalRef}>
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
                      正在执行...
                    </div>
                  )}
                </>
              ) : (
                <div className={styles.noOutput}>
                  点击"执行"按钮运行代码
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <div className={styles.statusBar}>
        <div className={styles.statusBarLeft}>
          <span className={styles.statusItem}>
            {getFileIcon()}
            {activeScript?.language === 'stata' ? 'Stata' : 'Python'}
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
          <button className={styles.zoomButton} onClick={handleZoomOut} title="缩小">
            <ZoomOut size={14} />
          </button>
          <span className={styles.zoomLevel}>{editorSettings.fontSize}px</span>
          <button className={styles.zoomButton} onClick={handleZoomIn} title="放大">
            <ZoomIn size={14} />
          </button>
          <div className={styles.statusBarDivider} />
          <span className={styles.statusItem}>
            Tab 大小: {editorSettings.tabSize}
          </span>
          <span className={styles.statusItem}>
            {getLanguage() === 'python' ? 'Python' : 'JavaScript'}
          </span>
          <span className={styles.statusItem}>
            UTF-8
          </span>
        </div>
      </div>
    </div>
  );
}
