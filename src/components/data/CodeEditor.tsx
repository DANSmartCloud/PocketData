import { useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { useUIStore } from "@/stores/uiStore";
import styles from "./CodeEditor.module.css";

export function CodeEditor() {
  const [activeTab, setActiveTab] = useState<"stata" | "python">("stata");
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

  const { theme } = useUIStore();

  const stataExtensions = [javascript({ jsx: false })];
  const pythonExtensions = [python()];

  const handleTabChange = (tab: "stata" | "python") => {
    setActiveTab(tab);
  };

  return (
    <div className={styles.container}>
      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${activeTab === "stata" ? styles.active : ""}`}
          onClick={() => handleTabChange("stata")}
        >
          Do File (Stata)
        </button>
        <button
          className={`${styles.tab} ${activeTab === "python" ? styles.active : ""}`}
          onClick={() => handleTabChange("python")}
        >
          Python
        </button>
      </div>
      <div className={styles.editorWrapper}>
        {activeTab === "stata" ? (
          <CodeMirror
            value={stataCode}
            height="100%"
            extensions={stataExtensions}
            onChange={(value) => setStataCode(value)}
            theme={theme === "dark" ? "dark" : "light"}
            className={styles.editor}
            basicSetup={{
              lineNumbers: true,
              highlightActiveLineGutter: true,
              highlightSpecialChars: true,
              foldGutter: true,
              drawSelection: true,
              dropCursor: true,
              allowMultipleSelections: true,
              indentOnInput: true,
              syntaxHighlighting: true,
              bracketMatching: true,
              closeBrackets: true,
              autocompletion: true,
              rectangularSelection: true,
              crosshairCursor: true,
              highlightActiveLine: true,
              highlightSelectionMatches: true,
            }}
          />
        ) : (
          <CodeMirror
            value={pythonCode}
            height="100%"
            extensions={pythonExtensions}
            onChange={(value) => setPythonCode(value)}
            theme={theme === "dark" ? "dark" : "light"}
            className={styles.editor}
            basicSetup={{
              lineNumbers: true,
              highlightActiveLineGutter: true,
              highlightSpecialChars: true,
              foldGutter: true,
              drawSelection: true,
              dropCursor: true,
              allowMultipleSelections: true,
              indentOnInput: true,
              syntaxHighlighting: true,
              bracketMatching: true,
              closeBrackets: true,
              autocompletion: true,
              rectangularSelection: true,
              crosshairCursor: true,
              highlightActiveLine: true,
              highlightSelectionMatches: true,
            }}
          />
        )}
      </div>
    </div>
  );
}
