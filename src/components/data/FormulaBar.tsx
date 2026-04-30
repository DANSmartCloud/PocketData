import { useEffect, useCallback } from "react";
import { useFileStore } from "@/stores/fileStore";
import { useUIStore } from "@/stores/uiStore";
import styles from "./FormulaBar.module.css";

export function FormulaBar() {
  const { getActiveFile, updateCell } = useFileStore();
  const { selectedCell, editingCell, editValue, setEditValue } = useUIStore();

  const activeFile = getActiveFile();

  useEffect(() => {
    if (selectedCell && activeFile && !editingCell) {
      const varName = activeFile.variables[selectedCell.col]?.name;
      if (varName) {
        const value = activeFile.data[selectedCell.row][varName];
        setEditValue(value === null || value === undefined ? "" : String(value));
      }
    }
  }, [selectedCell, activeFile, editingCell, setEditValue]);

  const cellAddress = selectedCell
    ? `${activeFile?.variables[selectedCell.col]?.name || ""}${selectedCell.row + 1}`
    : "";

  const handleInputChange = useCallback((value: string) => {
    setEditValue(value);
    if (selectedCell && activeFile && !editingCell) {
      const varName = activeFile.variables[selectedCell.col].name;
      const currentValue = activeFile.data[selectedCell.row][varName];
      const newValue = value === "" ? null : (isNaN(Number(value)) ? value : Number(value));
      if (String(newValue) !== String(currentValue)) {
        updateCell(activeFile.id, selectedCell.row, selectedCell.col, newValue);
      }
    }
  }, [selectedCell, activeFile, editingCell, setEditValue, updateCell]);

  const handleInputKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
    } else if (e.key === "Escape") {
      if (selectedCell && activeFile) {
        const varName = activeFile.variables[selectedCell.col].name;
        const value = activeFile.data[selectedCell.row][varName];
        setEditValue(value === null || value === undefined ? "" : String(value));
      }
    }
  }, [selectedCell, activeFile, setEditValue]);

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