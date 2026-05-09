import { useEffect, useCallback, useMemo } from "react";
import { useFileStore } from "@/stores/fileStore";
import { useUIStore } from "@/stores/uiStore";
import styles from "./FormulaBar.module.css";

export function FormulaBar() {
  const { getActiveFile, updateCell } = useFileStore();
  const { selectedCell, editingCell, editValue, setEditValue, operationMode } = useUIStore();

  const activeFile = getActiveFile();

  const colToLetter = useCallback((col: number) => {
    let letter = '';
    let n = col;
    while (n >= 0) {
      letter = String.fromCharCode(65 + (n % 26)) + letter;
      n = Math.floor(n / 26) - 1;
    }
    return letter;
  }, []);

  const isExcelMode = operationMode === "excel";

  useEffect(() => {
    if (selectedCell && activeFile && !editingCell) {
      const adjustedRow = isExcelMode ? selectedCell.row - 1 : selectedCell.row;
      const varName = activeFile.variables[selectedCell.col]?.name;
      if (varName && adjustedRow >= 0) {
        const value = activeFile.data[adjustedRow]?.[varName];
        setEditValue(value === null || value === undefined ? "" : String(value));
      } else if (isExcelMode && adjustedRow < 0) {
        setEditValue(activeFile.variables[selectedCell.col]?.name || "");
      }
    }
  }, [selectedCell, activeFile, editingCell, setEditValue, isExcelMode]);

  const cellAddress = useMemo(() => {
    if (!selectedCell) return "";
    return `${colToLetter(selectedCell.col)}${selectedCell.row + 1}`;
  }, [selectedCell, colToLetter]);

  const handleInputChange = useCallback((value: string) => {
    setEditValue(value);
    if (selectedCell && activeFile) {
      const adjustedRow = isExcelMode ? selectedCell.row - 1 : selectedCell.row;
      if (adjustedRow < 0) return;

      const varName = activeFile.variables[selectedCell.col]?.name;
      if (!varName) return;

      const currentValue = activeFile.data[adjustedRow]?.[varName];
      const newValue = value === "" ? null : (isNaN(Number(value)) ? value : Number(value));
      if (String(newValue) !== String(currentValue)) {
        updateCell(activeFile.id, adjustedRow, selectedCell.col, newValue);
      }
    }
  }, [selectedCell, activeFile, isExcelMode, setEditValue, updateCell]);

  const handleInputKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
    } else if (e.key === "Escape") {
      if (selectedCell && activeFile) {
        const adjustedRow = isExcelMode ? selectedCell.row - 1 : selectedCell.row;
        if (adjustedRow < 0) {
          const varName = activeFile.variables[selectedCell.col]?.name;
          setEditValue(varName || "");
          return;
        }
        const varName = activeFile.variables[selectedCell.col].name;
        const value = activeFile.data[adjustedRow]?.[varName];
        setEditValue(value === null || value === undefined ? "" : String(value));
      }
    }
  }, [selectedCell, activeFile, setEditValue, isExcelMode]);

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
        value={editValue}
        onChange={(e) => handleInputChange(e.target.value)}
        onKeyDown={handleInputKeyDown}
        placeholder="输入值..."
      />
    </div>
  );
}