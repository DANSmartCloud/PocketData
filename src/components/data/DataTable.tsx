import { createPortal } from "react-dom";
import { useCallback, useMemo, useRef, useEffect, useState } from "react";
import { HotTable } from "@handsontable/react-wrapper";
import { registerAllModules } from "handsontable/registry";
import { useFileStore, type Variable } from "@/stores/fileStore";
import { useUIStore, type CellPosition, type HighlightedCell } from "@/stores/uiStore";
import { useZoomStore } from "@/stores/zoomStore";
import { useVirtualRows } from "@/hooks/useVirtualRows";
import type { CellChange } from "handsontable/common";
import type Handsontable from "handsontable";
import { Hash, Type, Calendar, Pin, PinOff, Lock, Unlock, Columns } from "lucide-react";
import "handsontable/styles/handsontable.min.css";
import "handsontable/styles/ht-theme-main.min.css";
import styles from "./DataTable.module.css";

registerAllModules();

type CellValue = string | number | null;
type StataType = "numeric" | "string" | "date";

interface OrderedVariable {
  variable: Variable;
  originalIndex: number;
}

interface TooltipState {
  x: number;
  y: number;
  variable: Variable;
  type: StataType;
  missingCount: number;
  isPinned: boolean;
}

interface ContextMenuState {
  x: number;
  y: number;
  visualCol: number;
  originalIndex: number;
  variable: Variable;
  isPinned: boolean;
}

interface ExcelContextMenuState {
  x: number;
  y: number;
  visualCol: number;
  isFrozen: boolean;
}

function getStataType(v: Variable): StataType {
  if (v.type === "string") return "string";
  if (v.format && v.format.trim().startsWith("%t")) return "date";
  return "numeric";
}

function isMissingValue(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string" && value === "") return true;
  if (typeof value === "number" && Number.isNaN(value)) return true;
  return false;
}

const ICON_SVG: Record<StataType, string> = {
  numeric:
    '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="9" x2="20" y2="9"></line><line x1="4" y1="15" x2="20" y2="15"></line><line x1="10" y1="3" x2="8" y2="21"></line><line x1="16" y1="3" x2="14" y2="21"></line></svg>',
  string:
    '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 7 4 4 20 4 20 7"></polyline><line x1="9" y1="20" x2="15" y2="20"></line><line x1="12" y1="4" x2="12" y2="20"></line></svg>',
  date:
    '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>',
};

const PIN_INDICATOR_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="currentColor" style="margin-left:4px;vertical-align:middle;"><path d="M16 2l-2 4-4 1-4 4 4 4 4-1 2 4 4-4-3-3 3-3z"/></svg>';

interface DataTableProps {
  /** 指定要渲染的文件 ID；不传则回退到当前活跃文件 */
  fileId?: string;
}

export function DataTable({ fileId }: DataTableProps) {
  const { files, getActiveFile, updateCell } = useFileStore();
  const activeFile = fileId ? (files[fileId] ?? null) : getActiveFile();
  const {
    highlightedCells,
    operationMode,
    theme,
    selectedColumn,
    selectedCell,
    pinnedColumns,
    togglePinColumn,
    // Excel 模式：列宽/行高/冻结
    columnWidths,
    rowHeights,
    frozenColumns,
    frozenRows,
    setColumnWidth,
    setRowHeight,
    setFrozenColumns,
  } = useUIStore();

  // 将 "system" 解析为实际的 "light" | "dark"
  const resolvedTheme = theme === 'system'
    ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : theme;
  const { scale, setScale, zoomIn, zoomOut, resetZoom } = useZoomStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const hotTableRef = useRef<Handsontable | null>(null);
  const [containerHeight, setContainerHeight] = useState(400);

  const EXTRA_ROWS = 100;
  const EXTRA_COLS = 26;

  const colToLetter = useCallback((col: number) => {
    let letter = '';
    let n = col;
    while (n >= 0) {
      letter = String.fromCharCode(65 + (n % 26)) + letter;
      n = Math.floor(n / 26) - 1;
    }
    return letter;
  }, []);

  // 用于追踪捏合手势
  const pinchState = useRef({
    initialDistance: 0,
    initialScale: 1,
    isPinching: false,
  });

  // 防止 afterSelection 无限循环
  const lastSelectionRef = useRef<{ row: number; col: number; row2: number; col2: number } | null>(null);

  // Calculate container height
  useEffect(() => {
    const updateHeight = () => {
      if (containerRef.current) {
        const parent = containerRef.current.parentElement;
        if (parent) {
          const rect = parent.getBoundingClientRect();
          // 容器隐藏时（display:none）height 为 0，不更新以保留旧值
          if (rect.height > 0) {
            setContainerHeight(Math.max(300, rect.height));
          }
        }
      }
    };

    updateHeight();
    window.addEventListener('resize', updateHeight);

    // ResizeObserver：监听容器尺寸变化（标签页切换、侧边栏折叠等）
    const observer = new ResizeObserver(() => {
      updateHeight();
    });
    if (containerRef.current?.parentElement) {
      observer.observe(containerRef.current.parentElement);
    }

    return () => {
      window.removeEventListener('resize', updateHeight);
      observer.disconnect();
    };
  }, []);

  // 桌面端：Ctrl + 滚轮缩放
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      // 只有在按住 Ctrl 键时才进行缩放
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        e.stopPropagation();

        const delta = e.deltaY > 0 ? -0.05 : 0.05;
        const newScale = Math.max(0.5, Math.min(2, scale + delta));
        setScale(newScale);
      }
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, [scale, setScale]);

  // 移动端：双指捏合缩放
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const getDistance = (touches: TouchList) => {
      const dx = touches[0].clientX - touches[1].clientX;
      const dy = touches[0].clientY - touches[1].clientY;
      return Math.sqrt(dx * dx + dy * dy);
    };

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        // 双指触摸，开始捏合
        pinchState.current.isPinching = true;
        pinchState.current.initialDistance = getDistance(e.touches);
        pinchState.current.initialScale = scale;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (pinchState.current.isPinching && e.touches.length === 2) {
        e.preventDefault();
        e.stopPropagation();

        const currentDistance = getDistance(e.touches);
        const ratio = currentDistance / pinchState.current.initialDistance;
        const newScale = Math.max(0.5, Math.min(2, pinchState.current.initialScale * ratio));
        setScale(newScale);
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) {
        pinchState.current.isPinching = false;
      }
    };

    container.addEventListener('touchstart', handleTouchStart, { passive: true });
    container.addEventListener('touchmove', handleTouchMove, { passive: false });
    container.addEventListener('touchend', handleTouchEnd, { passive: true });
    container.addEventListener('touchcancel', handleTouchEnd, { passive: true });

    return () => {
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
      container.removeEventListener('touchcancel', handleTouchEnd);
    };
  }, [scale, setScale]);

  // 监听键盘快捷键
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl/Cmd + + 放大
      if ((e.ctrlKey || e.metaKey) && e.key === '=') {
        e.preventDefault();
        zoomIn();
      }
      // Ctrl/Cmd + - 缩小
      if ((e.ctrlKey || e.metaKey) && e.key === '-') {
        e.preventDefault();
        zoomOut();
      }
      // Ctrl/Cmd + 0 重置
      if ((e.ctrlKey || e.metaKey) && e.key === '0') {
        e.preventDefault();
        resetZoom();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [zoomIn, zoomOut, resetZoom]);

  // 当选中列变化时，滚动到对应列
  useEffect(() => {
    if (selectedColumn !== null && hotTableRef.current && activeFile) {
      const hot = hotTableRef.current;
      // 滚动到选中列，并选中该列的第一个单元格
      hot.scrollViewportTo(0, selectedColumn, true, true);
      // 选中整列
      hot.selectColumns(selectedColumn);
    }
  }, [selectedColumn, activeFile]);

  // ========== Stata 模式：变量排序（pinned 在前） ==========
  const orderedVariables = useMemo<OrderedVariable[]>(() => {
    if (!activeFile) return [];
    const indexed = activeFile.variables.map((v, i) => ({ variable: v, originalIndex: i }));
    if (operationMode !== "stata") return indexed;
    const pinnedSet = new Set(pinnedColumns);
    const pinnedList = pinnedColumns
      .map((idx) => indexed.find((x) => x.originalIndex === idx))
      .filter((x): x is OrderedVariable => x !== undefined);
    const unpinnedList = indexed.filter((x) => !pinnedSet.has(x.originalIndex));
    return [...pinnedList, ...unpinnedList];
  }, [activeFile, pinnedColumns, operationMode]);

  const isStataMode = operationMode === "stata";
  const isExcelMode = operationMode === "excel";

  // 计算每个变量的缺失值数量（用于 tooltip）
  const missingCountByVar = useMemo<Record<string, number>>(() => {
    const map: Record<string, number> = {};
    if (!activeFile) return map;
    for (const v of activeFile.variables) {
      let count = 0;
      for (const row of activeFile.data) {
        if (isMissingValue(row[v.name])) count++;
      }
      map[v.name] = count;
    }
    return map;
  }, [activeFile]);

  // ========== 准备 data 矩阵 ==========
  const data = useMemo<CellValue[][]>(() => {
    if (!activeFile) return [];

    const isExcelMode = operationMode === "excel";

    // 原始数据行数
    const originalRows = activeFile.data.map((row) => {
      return activeFile.variables.map((variable) => {
        const value = row[variable.name];
        if (value === null || value === undefined) return "";
        if (variable.type === "double" || variable.type === "float") {
          const num = Number(value);
          return isNaN(num) ? String(value) : num;
        }
        return String(value);
      });
    });

    if (isExcelMode) {
      // Excel模式：第一行是变量名
      const headerRow = activeFile.variables.map(v => v.name);
      // 添加EXTRA_COLS个空白列标题
      for (let i = 0; i < EXTRA_COLS; i++) {
        headerRow.push("");
      }

      // 在右侧添加空列
      const extendedRows = originalRows.map(row => {
        const emptyCols = new Array(EXTRA_COLS).fill("");
        return [...row, ...emptyCols];
      });

      // 第一行插入变量名行
      extendedRows.unshift(headerRow);

      // 在底部添加EXTRA_ROWS个空白行
      const totalCols = activeFile.variables.length + EXTRA_COLS;
      for (let i = 0; i < EXTRA_ROWS; i++) {
        extendedRows.push(new Array(totalCols).fill(""));
      }

      return extendedRows;
    }

    // Stata 模式：按 orderedVariables 重新排列列
    const colOrder = orderedVariables.map((x) => activeFile.variables.indexOf(x.variable));
    const stataRows = originalRows.map(row => colOrder.map((origIdx) => row[origIdx]));

    // 在底部添加 EXTRA_ROWS 空白行
    const totalCols = activeFile.variables.length;
    for (let i = 0; i < EXTRA_ROWS; i++) {
      stataRows.push(new Array(totalCols).fill(""));
    }

    return stataRows;
  }, [activeFile, operationMode, orderedVariables]);

  // ========== 准备列头 ==========
  const colHeaders = useMemo(() => {
    if (!activeFile) return true;

    const isExcelMode = operationMode === "excel";

    if (isExcelMode) {
      // Excel模式：列标题全为字母A, B, C...
      const totalCols = activeFile.variables.length + EXTRA_COLS;
      const headers: string[] = [];
      for (let i = 0; i < totalCols; i++) {
        headers.push(colToLetter(i));
      }
      return headers;
    }

    // Stata模式：仅使用变量名（在 afterGetColHeader 中再注入图标）
    return activeFile.variables.map((v) => v.name);
  }, [activeFile, operationMode, colToLetter]);

  const selectedCellRef = useRef<CellPosition | null>(null);
  const selectedColumnRef = useRef<number | null>(null);
  const highlightedCellsRef = useRef<HighlightedCell[]>([]);
  const orderedVariablesRef = useRef<OrderedVariable[]>([]);
  const missingCountRef = useRef<Record<string, number>>({});
  const pinnedColumnsRef = useRef<number[]>([]);
  // Excel 模式：列宽/行高/冻结 的同步 ref
  const columnWidthsRef = useRef<Record<number, number>>({});
  const rowHeightsRef = useRef<Record<number, number>>({});
  const frozenColumnsRef = useRef<number>(0);
  const frozenRowsRef = useRef<number>(0);

  useEffect(() => {
    selectedCellRef.current = selectedCell;
    if (hotTableRef.current) {
      hotTableRef.current.render();
    }
  }, [selectedCell]);

  useEffect(() => {
    selectedColumnRef.current = selectedColumn;
    if (hotTableRef.current) {
      hotTableRef.current.render();
    }
  }, [selectedColumn]);

  useEffect(() => {
    highlightedCellsRef.current = highlightedCells;
    if (hotTableRef.current) {
      hotTableRef.current.render();
    }
  }, [highlightedCells]);

  useEffect(() => {
    orderedVariablesRef.current = orderedVariables;
  }, [orderedVariables]);

  useEffect(() => {
    missingCountRef.current = missingCountByVar;
  }, [missingCountByVar]);

  useEffect(() => {
    pinnedColumnsRef.current = pinnedColumns;
  }, [pinnedColumns]);

  useEffect(() => {
    columnWidthsRef.current = columnWidths;
  }, [columnWidths]);

  useEffect(() => {
    rowHeightsRef.current = rowHeights;
  }, [rowHeights]);

  useEffect(() => {
    frozenColumnsRef.current = frozenColumns;
  }, [frozenColumns]);

  useEffect(() => {
    frozenRowsRef.current = frozenRows;
  }, [frozenRows]);

  // ========== Tooltip 与 ContextMenu 状态 ==========
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  // Excel 模式右键菜单（冻结列）
  const [excelContextMenu, setExcelContextMenu] = useState<ExcelContextMenuState | null>(null);
  const tooltipTimerRef = useRef<number | null>(null);

  // 关闭 tooltip / context menu 的通用 effect
  useEffect(() => {
    if (!contextMenu) return;
    const handler = () => setContextMenu(null);
    // 延迟绑定以避免本次点击立即触发
    const t = window.setTimeout(() => {
      window.addEventListener('click', handler);
      window.addEventListener('scroll', handler, true);
    }, 0);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('click', handler);
      window.removeEventListener('scroll', handler, true);
    };
  }, [contextMenu]);

  // 关闭 Excel 右键菜单
  useEffect(() => {
    if (!excelContextMenu) return;
    const handler = () => setExcelContextMenu(null);
    const t = window.setTimeout(() => {
      window.addEventListener('click', handler);
      window.addEventListener('scroll', handler, true);
    }, 0);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('click', handler);
      window.removeEventListener('scroll', handler, true);
    };
  }, [excelContextMenu]);

  // 组件卸载时清理 tooltip 定时器
  useEffect(() => {
    return () => {
      if (tooltipTimerRef.current) {
        window.clearTimeout(tooltipTimerRef.current);
      }
    };
  }, []);

  const handleAfterSelection = useCallback((
    row: number,
    col: number,
    row2: number,
    col2: number
  ) => {
    const lastSel = lastSelectionRef.current;
    if (lastSel && lastSel.row === row && lastSel.col === col && lastSel.row2 === row2 && lastSel.col2 === col2) {
      return;
    }
    lastSelectionRef.current = { row, col, row2, col2 };
    useUIStore.setState({
      selectedCell: { row, col },
      selectionRange: { start: { row, col }, end: { row: row2, col: col2 } },
    });
  }, []);

  const handleChange = useCallback((changes: CellChange[] | null) => {
    if (!activeFile || !changes) return;

    const isExcelMode = operationMode === "excel";

    changes.forEach((change) => {
      const [row, col, oldValue, newValue] = change;
      if (oldValue !== newValue && typeof row === 'number' && typeof col === 'number') {
        // Excel 模式：第 0 行是变量名行，实际数据从第 1 行开始
        // Stata 模式：第 0 行就是第一行数据
        const dataRow = isExcelMode ? row - 1 : row;
        // 防止越界
        if (dataRow < 0 || dataRow >= activeFile.data.length) return;
        // 防止列越界
        if (col < 0 || col >= activeFile.variables.length) return;
        updateCell(activeFile.id, dataRow, col, newValue as CellValue);
      }
    });
  }, [activeFile, operationMode, updateCell]);

  // ========== Excel 模式：TSV 剪贴板辅助函数 ==========
  // 将值转换为 TSV 单元格字符串（保留换行/制表符信息）
  const cellToTSV = useCallback((value: unknown): string => {
    if (value === null || value === undefined) return "";
    if (typeof value === "number") {
      if (Number.isNaN(value) || !Number.isFinite(value)) return "";
      return String(value);
    }
    return String(value);
  }, []);

  // 获取第一个选中范围（用于复制/粘贴/剪切）
  const getFirstRange = useCallback((hot: Handsontable): { row1: number; col1: number; row2: number; col2: number } | null => {
    const ranges = hot.getSelectedRange();
    if (!ranges || ranges.length === 0) {
      // 回退：尝试使用 getSelected
      const sel = hot.getSelected();
      if (!sel) return null;
      if (Array.isArray(sel[0])) {
        const [r1, c1, r2, c2] = sel[0] as unknown as [number, number, number, number];
        return { row1: r1, col1: c1, row2: r2, col2: c2 };
      }
      return { row1: sel[0] as unknown as number, col1: sel[1] as unknown as number, row2: sel[0] as unknown as number, col2: sel[1] as unknown as number };
    }
    const r = ranges[0];
    return {
      row1: Math.min(r.from.row, r.to.row),
      col1: Math.min(r.from.col, r.to.col),
      row2: Math.max(r.from.row, r.to.row),
      col2: Math.max(r.from.col, r.to.col),
    };
  }, []);

  // 获取所有选中范围（用于多选复制/剪切）
  const getAllRanges = useCallback((hot: Handsontable): Array<{ row1: number; col1: number; row2: number; col2: number }> => {
    const ranges = hot.getSelectedRange();
    if (!ranges || ranges.length === 0) return [];
    return ranges.map(r => ({
      row1: Math.min(r.from.row, r.to.row),
      col1: Math.min(r.from.col, r.to.col),
      row2: Math.max(r.from.row, r.to.row),
      col2: Math.max(r.from.col, r.to.col),
    }));
  }, []);

  // 构建选中区域的 TSV 文本
  const buildSelectionTSV = useCallback((hot: Handsontable): string => {
    const ranges = getAllRanges(hot);
    if (ranges.length === 0) return "";
    const blocks: string[] = [];
    for (const range of ranges) {
      const lines: string[] = [];
      for (let row = range.row1; row <= range.row2; row++) {
        const cells: string[] = [];
        for (let col = range.col1; col <= range.col2; col++) {
          cells.push(cellToTSV(hot.getDataAtCell(row, col)));
        }
        lines.push(cells.join("\t"));
      }
      blocks.push(lines.join("\n"));
    }
    return blocks.join("\n");
  }, [cellToTSV, getAllRanges]);

  // 解析 TSV 文本为二维数组
  const parseTSV = useCallback((text: string): string[][] => {
    // 拆分行为：处理 \r\n / \n / \r
    const lines = text.replace(/\r\n?/g, "\n").split("\n");
    return lines.map(line => line.split("\t"));
  }, []);

  // ========== Excel 模式：TSV 复制 ==========
  const handleExcelCopy = useCallback(async (hot: Handsontable, isCut: boolean) => {
    if (!activeFile) return;
    const tsv = buildSelectionTSV(hot);
    if (tsv === "") return;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(tsv);
      } else {
        // 回退方案：使用 document.execCommand
        const ta = document.createElement("textarea");
        ta.value = tsv;
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
    } catch {
      // 静默失败，避免阻塞
    }
    if (isCut) {
      // 清空源单元格
      const ranges = getAllRanges(hot);
      const isExcel = operationMode === "excel";
      for (const range of ranges) {
        for (let row = range.row1; row <= range.row2; row++) {
          const dataRow = isExcel ? row - 1 : row;
          if (dataRow < 0 || dataRow >= activeFile.data.length) continue;
          for (let col = range.col1; col <= range.col2; col++) {
            if (col < 0 || col >= activeFile.variables.length) continue;
            updateCell(activeFile.id, dataRow, col, null);
          }
        }
      }
    }
  }, [activeFile, buildSelectionTSV, getAllRanges, operationMode, updateCell]);

  // ========== Excel 模式：TSV 粘贴 ==========
  const handleExcelPaste = useCallback(async (hot: Handsontable) => {
    if (!activeFile) return;
    let text = "";
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        text = await navigator.clipboard.readText();
      } else {
        // 无法读取剪贴板，直接返回
        return;
      }
    } catch {
      return;
    }
    if (!text) return;
    const rows = parseTSV(text);
    if (rows.length === 0) return;

    const range = getFirstRange(hot);
    if (!range) return;
    const startRow = range.row1;
    const startCol = range.col1;
    const isExcel = operationMode === "excel";

    // 收集需要写入的单元格
    const changes: Array<[number, number, unknown]> = [];
    for (let r = 0; r < rows.length; r++) {
      const cells = rows[r];
      const targetRow = startRow + r;
      for (let c = 0; c < cells.length; c++) {
        const targetCol = startCol + c;
        if (targetCol < 0 || targetCol >= activeFile.variables.length) continue;
        const dataRow = isExcel ? targetRow - 1 : targetRow;
        if (dataRow < 0 || dataRow >= activeFile.data.length) continue;
        const raw = cells[c];
        if (raw === "") {
          changes.push([dataRow, targetCol, null]);
          continue;
        }
        const variable = activeFile.variables[targetCol];
        if (variable && (variable.type === "double" || variable.type === "float" || variable.type === "long" || variable.type === "int" || variable.type === "byte")) {
          const n = Number(raw);
          if (!Number.isNaN(n) && Number.isFinite(n) && raw.trim() !== "") {
            changes.push([dataRow, targetCol, n]);
            continue;
          }
        }
        changes.push([dataRow, targetCol, raw]);
      }
    }
    // 逐个写入（updateCell 不会因 lastSelection 相同而跳过）
    for (const [dataRow, col, value] of changes) {
      updateCell(activeFile.id, dataRow, col, value);
    }
  }, [activeFile, getFirstRange, operationMode, parseTSV, updateCell]);

  // ========== Excel 模式：键盘处理（Ctrl+C/V/X + Enter/Tab/Esc 辅助） ==========
  const handleBeforeKeyDown = useCallback((event: KeyboardEvent) => {
    if (!isExcelMode) return;
    const hot = hotTableRef.current;
    if (!hot) return;

    // 防止在编辑器中拦截（让用户能正常编辑）
    let isEditorOpen = false;
    try {
      const editor = hot.getActiveEditor && hot.getActiveEditor();
      if (editor && typeof editor.isOpened === "function") {
        isEditorOpen = !!editor.isOpened();
      }
    } catch {
      isEditorOpen = false;
    }
    const cmd = event.ctrlKey || event.metaKey;

    // 复制 / 剪切 / 粘贴：即使编辑器打开也要拦截（Excel 也是这样）
    if (cmd && (event.key === "c" || event.key === "C")) {
      event.preventDefault();
      void handleExcelCopy(hot, false);
      return;
    }
    if (cmd && (event.key === "v" || event.key === "V")) {
      event.preventDefault();
      void handleExcelPaste(hot);
      return;
    }
    if (cmd && (event.key === "x" || event.key === "X")) {
      event.preventDefault();
      void handleExcelCopy(hot, true);
      return;
    }

    if (isEditorOpen) return;

    // Esc：取消选择焦点（不进入编辑态）。HOT 默认在编辑器中已能 revert。
    if (event.key === "Escape") {
      // 无需阻止，让 HOT 自行处理
    }
  }, [isExcelMode, handleExcelCopy, handleExcelPaste]);

  // ========== 菜单"编辑 → 复制/粘贴/剪切"自定义事件监听 ==========
  useEffect(() => {
    const handleCopy = () => {
      const hot = hotTableRef.current;
      if (!hot || !activeFile) return;
      if (isExcelMode) void handleExcelCopy(hot, false);
    };
    const handlePaste = () => {
      const hot = hotTableRef.current;
      if (!hot || !activeFile) return;
      if (isExcelMode) void handleExcelPaste(hot);
    };
    const handleCut = () => {
      const hot = hotTableRef.current;
      if (!hot || !activeFile) return;
      if (isExcelMode) void handleExcelCopy(hot, true);
    };
    window.addEventListener('pocketdata:clipboard-copy', handleCopy);
    window.addEventListener('pocketdata:clipboard-paste', handlePaste);
    window.addEventListener('pocketdata:clipboard-cut', handleCut);
    return () => {
      window.removeEventListener('pocketdata:clipboard-copy', handleCopy);
      window.removeEventListener('pocketdata:clipboard-paste', handlePaste);
      window.removeEventListener('pocketdata:clipboard-cut', handleCut);
    };
  }, [isExcelMode, activeFile, handleExcelCopy, handleExcelPaste]);

  // ========== Excel 模式：列宽/行高 调整 ==========
  const handleAfterColumnResize = useCallback((
    newSize: number,
    column: number,
    _isDoubleClick: boolean
  ) => {
    if (!isExcelMode) return;
    if (typeof column !== "number" || typeof newSize !== "number") return;
    if (newSize < 20) return; // 避免异常值
    setColumnWidth(column, newSize);
  }, [isExcelMode, setColumnWidth]);

  const handleAfterRowResize = useCallback((
    newSize: number,
    row: number,
    _isDoubleClick: boolean
  ) => {
    if (!isExcelMode) return;
    if (typeof row !== "number" || typeof newSize !== "number") return;
    if (newSize < 16) return;
    setRowHeight(row, newSize);
  }, [isExcelMode, setRowHeight]);

  if (!activeFile) return null;

  const isEditable = operationMode === "excel" || operationMode === "stata";

  // 根据缩放比例调整列宽
  const baseColWidth = 120;
  const scaledColWidth = Math.round(baseColWidth * scale);
  // 默认行高
  const baseRowHeight = 23;
  const scaledRowHeight = Math.round(baseRowHeight * scale);

  // ========== 虚拟滚动 / 懒加载状态 ==========
  // 仅在大数据量（>1000 行）时启动按需分块加载；行数较少时跳过以减少开销
  const enableVirtualChunkLoad = data.length > 1000;
  const virtualRows = useVirtualRows({
    total: data.length,
    rowHeight: scaledRowHeight,
    viewportHeight: containerHeight,
    overscan: 10,
    chunkSize: 1000,
    // 大数据场景下模拟分块加载：返回空 Promise，
    // 因为 handsontable 本身已流式按需渲染行，无需再额外取数
    loadChunk: enableVirtualChunkLoad
      ? async (_start: number, _end: number) => []
      : undefined,
  });
  // Excel 模式：列宽函数（用户调整过的列宽优先）
  const excelColWidths = useCallback((col: number): number => {
    return columnWidths[col] ?? scaledColWidth;
  }, [columnWidths, scaledColWidth]);
  // Excel 模式：行高函数（用户调整过的行高优先）
  const excelRowHeights = useCallback((row: number): number => {
    return rowHeights[row] ?? scaledRowHeight;
  }, [rowHeights, scaledRowHeight]);

  // ========== Stata 模式专用：列头（注入类型图标 + 固定指示） ==========
  const stataColHeaderRenderer = useCallback(
    (col: number, TH: HTMLElement) => {
      const ordered = orderedVariablesRef.current;
      const item = ordered[col];
      if (!item) return;
      const v = item.variable;
      const t = getStataType(v);
      const iconSvg = ICON_SVG[t];
      const pinned = pinnedColumnsRef.current.includes(item.originalIndex);
      const escapedName = String(v.name)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
      TH.innerHTML =
        `<span class="${styles.stataColHeader}">` +
        `<span class="${styles.varTypeIcon} ${styles[t]}" style="display:inline-flex;align-items:center;">${iconSvg}</span>` +
        `<span class="${styles.stataColName}" title="">${escapedName}</span>` +
        (pinned ? PIN_INDICATOR_SVG : "") +
        `</span>`;
    },
    []
  );

  // ========== 边界修正：确保弹出卡片不超出视口 ==========
  const clampPopupPosition = useCallback((x: number, y: number, width: number, height: number) => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const margin = 8;
    if (x + width > vw - margin) x = Math.max(margin, vw - margin - width);
    if (y + height > vh - margin) y = Math.max(margin, vh - margin - height);
    return { x, y };
  }, []);

  // ========== Stata 模式专用：鼠标悬浮（实现 500ms 延迟 tooltip） ==========
  const handleAfterOnCellMouseOver = useCallback(
    (_event: MouseEvent, coords: { row: number; col: number }, _td: HTMLElement) => {
      if (!isStataMode) return;
      // 仅处理列头
      if (coords.row >= 0 || coords.col < 0) return;
      const ordered = orderedVariablesRef.current;
      const item = ordered[coords.col];
      if (!item) return;

      if (tooltipTimerRef.current !== null) {
        window.clearTimeout(tooltipTimerRef.current);
        tooltipTimerRef.current = null;
      }
      const clientX = _event.clientX;
      const clientY = _event.clientY;
      const v = item.variable;
      const t = getStataType(v);
      const missing = missingCountRef.current[v.name] ?? 0;
      const isPinned = pinnedColumnsRef.current.includes(item.originalIndex);

      tooltipTimerRef.current = window.setTimeout(() => {
        tooltipTimerRef.current = null;
        // 预估 tooltip 尺寸（max-width: 280, 大约 5 行 * 20px + padding = ~150px 高）
        const estWidth = 220;
        const estHeight = 150;
        const pos = clampPopupPosition(clientX + 12, clientY + 16, estWidth, estHeight);
        setTooltip({
          x: pos.x,
          y: pos.y,
          variable: v,
          type: t,
          missingCount: missing,
          isPinned,
        });
      }, 500);
    },
    [isStataMode, clampPopupPosition]
  );

  const handleAfterOnCellMouseOut = useCallback(
    (_event: MouseEvent, _coords: { row: number; col: number }, _td: HTMLElement) => {
      if (tooltipTimerRef.current !== null) {
        window.clearTimeout(tooltipTimerRef.current);
        tooltipTimerRef.current = null;
      }
      setTooltip(null);
    },
    []
  );

  // ========== 模式通用：列头右键菜单 ==========
  // Stata 模式 -> 固定列切换
  // Excel 模式 -> 冻结列
  const handleAfterOnCellMouseDown = useCallback(
    (event: MouseEvent, coords: { row: number; col: number }, _td: HTMLElement) => {
      // 仅列头
      if (coords.row >= 0 || coords.col < 0) return;
      // 仅右键
      if (event.button !== 2) return;
      event.preventDefault();
      event.stopPropagation();

      if (isStataMode) {
        const ordered = orderedVariablesRef.current;
        const item = ordered[coords.col];
        if (!item) return;
        const pos = clampPopupPosition(event.clientX, event.clientY, 180, 120);
        setContextMenu({
          x: pos.x,
          y: pos.y,
          visualCol: coords.col,
          originalIndex: item.originalIndex,
          variable: item.variable,
          isPinned: pinnedColumnsRef.current.includes(item.originalIndex),
        });
      } else if (isExcelMode) {
        const pos = clampPopupPosition(event.clientX, event.clientY, 180, 80);
        setExcelContextMenu({
          x: pos.x,
          y: pos.y,
          visualCol: coords.col,
          isFrozen: coords.col < frozenColumnsRef.current,
        });
      }
    },
    [isStataMode, isExcelMode, clampPopupPosition]
  );

  // 阻止容器上的原生右键菜单（两种模式下都需要）
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    if (!isStataMode && !isExcelMode) return;
    const handler = (e: MouseEvent) => {
      e.stopPropagation();
    };
    container.addEventListener('contextmenu', handler);
    return () => container.removeEventListener('contextmenu', handler);
  }, [isStataMode, isExcelMode]);

  // 固定列数（Stata 模式：pinnedColumns；Excel 模式：frozenColumns）
  const fixedColumnsLeft = isStataMode ? pinnedColumns.length : frozenColumns;
  // 冻结行（仅 Excel 模式生效）
  const fixedRowsTopValue = isStataMode ? 0 : frozenRows;

  return (
    <div
      ref={containerRef}
      className={`${styles.container} ${resolvedTheme === 'dark' ? styles.dark : ''}`}
      style={{ height: containerHeight }}
    >
      <div
        className={styles.zoomContainer}
        style={{
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
          width: `${100 / scale}%`,
          height: `${100 / scale}%`,
        }}
      >
        <HotTable
          key={activeFile?.id}
          ref={(hotTable) => {
            if (hotTable) {
              hotTableRef.current = hotTable.hotInstance || null;
            }
          }}
          data={data}
          colHeaders={colHeaders}
          rowHeaders={true}
          width="100%"
          height={containerHeight / scale}
          autoWrapRow={true}
          autoWrapCol={true}
          stretchH="none"
          manualRowMove={false}
          manualColumnMove={false}
          // Excel 模式：列宽/行高可拖动调整
          manualColumnResize={isExcelMode}
          manualRowResize={isExcelMode}
          filters={true}
          dropdownMenu={false}
          contextMenu={false}
          comments={false}
          fixedRowsTop={fixedRowsTopValue}
          fixedRowsBottom={0}
          fixedColumnsLeft={fixedColumnsLeft}
          readOnly={!isEditable}
          licenseKey="non-commercial-and-evaluation"
          // 虚拟滚动：仅渲染视口内行/列以提升百万级数据性能
          // handsontable 默认即按视口按需渲染，下方配置仅调整预渲染数量
          viewportRowRenderingOffset={10}
          viewportColumnRenderingOffset={10}
          afterChange={handleChange}
          afterSelection={handleAfterSelection}
          afterOnCellMouseOver={handleAfterOnCellMouseOver}
          afterOnCellMouseOut={handleAfterOnCellMouseOut}
          afterOnCellMouseDown={handleAfterOnCellMouseDown}
          // Excel 模式：列宽/行高拖动调整后保存
          afterColumnResize={isExcelMode ? handleAfterColumnResize : undefined}
          afterRowResize={isExcelMode ? handleAfterRowResize : undefined}
          // Excel 模式：键盘快捷键（Ctrl+C/V/X、Enter/Tab/Esc 等）
          beforeKeyDown={isExcelMode ? handleBeforeKeyDown : undefined}
          afterGetColHeader={isStataMode ? stataColHeaderRenderer : undefined}
          colWidths={isExcelMode ? excelColWidths : scaledColWidth}
          rowHeights={isExcelMode ? excelRowHeights : undefined}
          cells={(row, col) => {
            const cellMeta: Record<string, unknown> = {};

            const isExcelMode = operationMode === "excel";
            const isVariableHeaderRow = isExcelMode && row === 0 && col < activeFile.variables.length;

            if (!isExcelMode) {
              // Stata 模式：按 orderedVariables[col] 查找变量
              const ordered = orderedVariablesRef.current;
              const item = ordered[col];
              const variable = item?.variable;
              if (variable) {
                if (variable.type === "double" || variable.type === "float") {
                  cellMeta.type = "numeric";
                  cellMeta.numericFormat = {
                    pattern: "0.0000",
                  };
                }
                // 缺失值渲染：仅在 Stata 模式
                cellMeta.renderer = function (
                  _instance: Handsontable,
                  td: HTMLTableCellElement,
                  _row: number,
                  _col: number,
                  _prop: number,
                  value: unknown
                  // _cellProperties intentionally omitted to avoid extra dep
                ) {
                  if (isMissingValue(value)) {
                    td.innerHTML = `<span class="${styles.missingValue}">.</span>`;
                    return td;
                  }
                  const text = value === null || value === undefined ? "" : String(value);
                  // 手动写入文本避免递归调用 textRenderer
                  const div = document.createElement("div");
                  // 简单转义
                  div.textContent = text;
                  td.innerHTML = "";
                  td.appendChild(div);
                  return td;
                };
              }
            }

            if (isVariableHeaderRow) {
              cellMeta.style = {
                fontWeight: '600',
                background: 'color-mix(in srgb, var(--color-primary) 5%, transparent)',
              };
            }

            const currentHighlightedCells = highlightedCellsRef.current;
            const highlight = currentHighlightedCells.find(h => h.row === row && h.col === col);
            if (highlight) {
              cellMeta.style = {
                background: highlight.color,
              };
            }

            const currentSelectedColumn = selectedColumnRef.current;
            if (currentSelectedColumn === col) {
              const currentStyle = (cellMeta.style as Record<string, string>) || {};
              cellMeta.style = {
                ...currentStyle,
                background: highlight ? highlight.color : 'color-mix(in srgb, var(--color-primary) 10%, transparent)',
                borderLeft: '2px solid var(--color-primary)',
                borderRight: '2px solid var(--color-primary)',
              };
            }

            const currentSelectedCell = selectedCellRef.current;
            if (currentSelectedCell && currentSelectedCell.row === row && currentSelectedCell.col === col) {
              const currentStyle = (cellMeta.style as Record<string, string>) || {};
              cellMeta.style = {
                ...currentStyle,
                boxShadow: 'inset 0 0 0 2px var(--color-primary)',
              };
            }

            return cellMeta;
          }}
        />
      </div>

      {/* Stata 模式 Tooltip（自定义实现，多行内容 + 500ms 延迟） */}
      {tooltip && createPortal(
        <div
          ref={(el) => {
            if (!el) return;
            // 渲染后精确修正位置，防止超出视口
            const rect = el.getBoundingClientRect();
            const vw = window.innerWidth;
            const vh = window.innerHeight;
            const margin = 8;
            let { x, y } = { x: tooltip.x, y: tooltip.y };
            if (x + rect.width > vw - margin) x = Math.max(margin, vw - margin - rect.width);
            if (y + rect.height > vh - margin) y = Math.max(margin, vh - margin - rect.height);
            if (x !== tooltip.x || y !== tooltip.y) {
              el.style.left = `${x}px`;
              el.style.top = `${y}px`;
            }
          }}
          className={styles.stataTooltip}
          style={{ left: tooltip.x, top: tooltip.y }}
        >
          <div className={styles.stataTooltipTitle}>
            {(() => {
              if (tooltip.type === "numeric") return <Hash size={14} />;
              if (tooltip.type === "string") return <Type size={14} />;
              return <Calendar size={14} />;
            })()}
            {tooltip.variable.name}
          </div>
          {tooltip.variable.label && (
            <div className={styles.stataTooltipRow}>
              <span className={styles.stataTooltipLabel}>label</span>
              <span>{tooltip.variable.label}</span>
            </div>
          )}
          <div className={styles.stataTooltipRow}>
            <span className={styles.stataTooltipLabel}>type</span>
            <span>{tooltip.type}{tooltip.variable.format ? ` (${tooltip.variable.format})` : ""}</span>
          </div>
          <div className={styles.stataTooltipRow}>
            <span className={styles.stataTooltipLabel}>missing</span>
            <span>{tooltip.missingCount}</span>
          </div>
          <div className={styles.stataTooltipDivider} />
          <div className={styles.stataTooltipRow}>
            <span className={styles.stataTooltipLabel}>pinned</span>
            <span>{tooltip.isPinned ? "yes" : "no"}</span>
          </div>
        </div>,
        document.body
      )}

      {/* Stata 模式右键菜单（固定列切换） */}
      {contextMenu && createPortal(
        <div
          ref={(el) => {
            if (!el) return;
            const rect = el.getBoundingClientRect();
            const vw = window.innerWidth;
            const vh = window.innerHeight;
            const margin = 8;
            let { x, y } = { x: contextMenu.x, y: contextMenu.y };
            if (x + rect.width > vw - margin) x = Math.max(margin, vw - margin - rect.width);
            if (y + rect.height > vh - margin) y = Math.max(margin, vh - margin - rect.height);
            if (x !== contextMenu.x || y !== contextMenu.y) {
              el.style.left = `${x}px`;
              el.style.top = `${y}px`;
            }
          }}
          className={styles.stataContextMenu}
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            className={`${styles.stataContextMenuItem} ${contextMenu.isPinned ? styles.active : ""}`}
            onClick={() => {
              togglePinColumn(contextMenu.originalIndex);
              setContextMenu(null);
            }}
          >
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              {contextMenu.isPinned ? <PinOff size={14} /> : <Pin size={14} />}
              {contextMenu.isPinned ? "取消固定列" : "固定列"}
            </span>
            <span className={styles.stataContextMenuCheck}>
              {contextMenu.isPinned ? "✓" : ""}
            </span>
          </div>
        </div>,
        document.body
      )}

      {/* Excel 模式右键菜单（冻结列） */}
      {excelContextMenu && createPortal(
        <div
          ref={(el) => {
            if (!el) return;
            const rect = el.getBoundingClientRect();
            const vw = window.innerWidth;
            const vh = window.innerHeight;
            const margin = 8;
            let { x, y } = { x: excelContextMenu.x, y: excelContextMenu.y };
            if (x + rect.width > vw - margin) x = Math.max(margin, vw - margin - rect.width);
            if (y + rect.height > vh - margin) y = Math.max(margin, vh - margin - rect.height);
            if (x !== excelContextMenu.x || y !== excelContextMenu.y) {
              el.style.left = `${x}px`;
              el.style.top = `${y}px`;
            }
          }}
          className={styles.excelContextMenu}
          style={{ left: excelContextMenu.x, top: excelContextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            className={styles.excelContextMenuTitle}
          >
            <Columns size={14} />
            <span>列 {colToLetter(excelContextMenu.visualCol)}</span>
          </div>
          <div
            className={styles.excelContextMenuDivider}
          />
          <div
            className={styles.excelContextMenuItem}
            onClick={() => {
              setFrozenColumns(excelContextMenu.visualCol + 1);
              setExcelContextMenu(null);
            }}
          >
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <Lock size={14} />
              冻结到此处
            </span>
          </div>
          <div
            className={`${styles.excelContextMenuItem} ${!excelContextMenu.isFrozen ? styles.disabled : ""}`}
            onClick={() => {
              if (frozenColumnsRef.current > 0) {
                setFrozenColumns(0);
              }
              setExcelContextMenu(null);
            }}
          >
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <Unlock size={14} />
              取消冻结
            </span>
            <span className={styles.stataContextMenuCheck}>
              {excelContextMenu.isFrozen ? "" : "—"}
            </span>
          </div>
        </div>,
        document.body
      )}

      {/* 虚拟滚动懒加载骨架屏：仅在分块加载时显示 */}
      <div
        className={styles.virtualSkeleton}
        style={{ display: virtualRows.loading ? "block" : "none" }}
      >
        加载中…
      </div>
    </div>
  );
}
