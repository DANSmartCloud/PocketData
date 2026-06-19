import { useEffect, useCallback, useMemo, useRef, useState } from "react";
import { useFileStore } from "@/stores/fileStore";
import { useUIStore } from "@/stores/uiStore";
import styles from "./FormulaBar.module.css";

/**
 * Excel 模式下的顶部公式/编辑栏。
 *
 * 关键修复：
 * - 使用本地 state（draft）保存正在编辑的值，避免每次 onChange 直接 updateCell 导致 DataTable 重新渲染
 *   进而意外改变列选区或失焦。
 * - 仅在 Enter / 失焦时提交变更；Escape 撤销。
 * - 当 selectedCell 变化时，刷新 draft。
 */
interface FormulaBarProps {
  /** 指定要关联的文件 ID；不传则回退到当前活跃文件 */
  fileId?: string;
}

export function FormulaBar({ fileId }: FormulaBarProps) {
  const { files, getActiveFile, updateCell } = useFileStore();
  const activeFile = fileId ? (files[fileId] ?? null) : getActiveFile();
  const { selectedCell, operationMode, setEditValue } = useUIStore();

  const isExcelMode = operationMode === "excel";

  // 本地草稿值，避免 onChange 直接触发数据写入
  const [draft, setDraft] = useState<string>("");
  // 跟踪当前选中的单元格，确保草稿值与单元格同步
  const lastCellKeyRef = useRef<string>("");
  // 标识正在输入，防止 selectedCell 同步副作用覆盖用户输入
  const isComposingRef = useRef(false);

  const colToLetter = useCallback((col: number) => {
    let letter = '';
    let n = col;
    while (n >= 0) {
      letter = String.fromCharCode(65 + (n % 26)) + letter;
      n = Math.floor(n / 26) - 1;
    }
    return letter;
  }, []);

  // 当选中的单元格变化时，加载对应单元格的当前值到草稿
  useEffect(() => {
    if (!selectedCell || !activeFile) {
      lastCellKeyRef.current = "";
      setDraft("");
      return;
    }
    const cellKey = `${selectedCell.row}:${selectedCell.col}`;
    if (cellKey === lastCellKeyRef.current) return;
    lastCellKeyRef.current = cellKey;

    const adjustedRow = isExcelMode ? selectedCell.row - 1 : selectedCell.row;
    // Excel 模式：第一行（row === 0）是表头，单独处理
    if (isExcelMode && adjustedRow < 0) {
      const varName = activeFile.variables[selectedCell.col]?.name || "";
      setDraft(varName);
      setEditValue(varName);
      return;
    }
    const varName = activeFile.variables[selectedCell.col]?.name;
    const value = varName ? activeFile.data[adjustedRow]?.[varName] : undefined;
    const display = value === null || value === undefined ? "" : String(value);
    setDraft(display);
    setEditValue(display);
  }, [selectedCell, activeFile, isExcelMode, setEditValue]);

  /**
   * 提交当前草稿到 store（仅在 Enter / blur 时触发）
   */
  const commitDraft = useCallback(() => {
    if (isComposingRef.current) return;
    if (!selectedCell || !activeFile) return;
    const adjustedRow = isExcelMode ? selectedCell.row - 1 : selectedCell.row;
    // Excel 模式下选中"列头"行不直接写入（重命名应通过单独的列操作）
    if (isExcelMode && adjustedRow < 0) return;
    const varName = activeFile.variables[selectedCell.col]?.name;
    if (!varName) return;

    const currentValue = activeFile.data[adjustedRow]?.[varName];
    const newValue = draft === ""
      ? null
      : (isNaN(Number(draft)) || /[a-zA-Z]/.test(draft) ? draft : Number(draft));
    if (String(newValue) !== String(currentValue)) {
      updateCell(activeFile.id, adjustedRow, selectedCell.col, newValue);
    }
  }, [selectedCell, activeFile, isExcelMode, draft, updateCell]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setDraft(e.target.value);
  }, []);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitDraft();
      (e.target as HTMLInputElement).blur();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      if (!selectedCell || !activeFile) {
        setDraft("");
        return;
      }
      const adjustedRow = isExcelMode ? selectedCell.row - 1 : selectedCell.row;
      if (isExcelMode && adjustedRow < 0) {
        setDraft(activeFile.variables[selectedCell.col]?.name || "");
        return;
      }
      const varName = activeFile.variables[selectedCell.col]?.name;
      const value = varName ? activeFile.data[adjustedRow]?.[varName] : undefined;
      setDraft(value === null || value === undefined ? "" : String(value));
      (e.target as HTMLInputElement).blur();
    }
  }, [commitDraft, selectedCell, activeFile, isExcelMode]);

  const handleFocus = useCallback(() => {
    isComposingRef.current = true;
  }, []);

  const handleBlur = useCallback(() => {
    isComposingRef.current = false;
    commitDraft();
  }, [commitDraft]);

  const handleCompositionStart = useCallback(() => {
    isComposingRef.current = true;
  }, []);

  const handleCompositionEnd = useCallback(() => {
    isComposingRef.current = false;
  }, []);

  const cellAddress = useMemo(() => {
    if (!selectedCell) return "";
    return `${colToLetter(selectedCell.col)}${selectedCell.row + 1}`;
  }, [selectedCell, colToLetter]);

  if (!activeFile || !selectedCell) {
    return (
      <div className={styles.formulaBar}>
        <div className={styles.cellAddress}>-</div>
        <div className={styles.divider} />
        <input
          type="text"
          className={styles.input}
          value=""
          disabled
          placeholder="选择单元格..."
        />
      </div>
    );
  }

  return (
    <div className={styles.formulaBar}>
      <div className={styles.cellAddress}>
        {cellAddress}
      </div>
      <div className={styles.divider} />
      <input
        type="text"
        className={styles.input}
        value={draft}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onCompositionStart={handleCompositionStart}
        onCompositionEnd={handleCompositionEnd}
        placeholder="输入值..."
      />
    </div>
  );
}
