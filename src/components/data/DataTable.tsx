import { useCallback, useMemo, useRef, useEffect, useState } from "react";
import { HotTable } from "@handsontable/react-wrapper";
import { registerAllModules } from "handsontable/registry";
import { useFileStore } from "@/stores/fileStore";
import { useUIStore } from "@/stores/uiStore";
import { useZoomStore } from "@/stores/zoomStore";
import type { CellChange } from "handsontable/common";
import type Handsontable from "handsontable";
import "handsontable/styles/handsontable.min.css";
import "handsontable/styles/ht-theme-main.min.css";
import styles from "./DataTable.module.css";

registerAllModules();

type CellValue = string | number | null;

export function DataTable() {
  const { getActiveFile, updateCell } = useFileStore();
  const { highlightedCells, operationMode, theme, selectedColumn, selectedCell } = useUIStore();
  const { scale, setScale, zoomIn, zoomOut, resetZoom } = useZoomStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const hotTableRef = useRef<Handsontable | null>(null);
  const [containerHeight, setContainerHeight] = useState(400);

  // 用于追踪捏合手势
  const pinchState = useRef({
    initialDistance: 0,
    initialScale: 1,
    isPinching: false,
  });

  const activeFile = getActiveFile();

  // Calculate container height
  useEffect(() => {
    const updateHeight = () => {
      if (containerRef.current) {
        const parent = containerRef.current.parentElement;
        if (parent) {
          const rect = parent.getBoundingClientRect();
          setContainerHeight(Math.max(300, rect.height));
        }
      }
    };

    updateHeight();
    window.addEventListener('resize', updateHeight);
    return () => window.removeEventListener('resize', updateHeight);
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

  const data = useMemo<CellValue[][]>(() => {
    if (!activeFile) return [];

    return activeFile.data.map((row) => {
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
  }, [activeFile]);

  const handleChange = useCallback((changes: CellChange[] | null) => {
    if (!activeFile || !changes) return;

    changes.forEach((change) => {
      const [row, col, oldValue, newValue] = change;
      if (oldValue !== newValue && typeof row === 'number' && typeof col === 'number') {
        updateCell(activeFile.id, row, col, newValue as CellValue);
      }
    });
  }, [activeFile, updateCell]);

  if (!activeFile) return null;

  const isEditable = operationMode === "excel" || operationMode === "stata";

  // 根据缩放比例调整列宽
  const baseColWidth = 120;
  const scaledColWidth = Math.round(baseColWidth * scale);

  return (
    <div 
      ref={containerRef}
      className={`${styles.container} ${theme === 'dark' ? styles.dark : ''}`}
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
          ref={(hotTable) => {
            if (hotTable) {
              hotTableRef.current = hotTable.hotInstance || null;
            }
          }}
          data={data}
          colHeaders={activeFile.variables.map((v) => v.name)}
          rowHeaders={true}
          width="100%"
          height={containerHeight / scale}
          autoWrapRow={true}
          autoWrapCol={true}
          stretchH="none"
          manualRowMove={false}
          manualColumnMove={false}
          filters={true}
          dropdownMenu={false}
          contextMenu={false}
          comments={false}
          fixedRowsTop={0}
          fixedRowsBottom={0}
          fixedColumnsLeft={0}
          readOnly={!isEditable}
          licenseKey="non-commercial-and-evaluation"
          afterChange={handleChange}
          colWidths={scaledColWidth}
          cells={(row, col) => {
            const cellMeta: Record<string, unknown> = {};

            const variable = activeFile.variables[col];
            if (variable) {
              if (variable.type === "double" || variable.type === "float") {
                cellMeta.type = "numeric";
                cellMeta.numericFormat = {
                  pattern: "0.0000",
                };
              }
            }

            const highlight = highlightedCells.find(h => h.row === row && h.col === col);
            if (highlight) {
              cellMeta.style = {
                background: highlight.color,
              };
            }

            // 选中列高亮
            if (selectedColumn === col) {
              const currentStyle = (cellMeta.style as Record<string, string>) || {};
              cellMeta.style = {
                ...currentStyle,
                background: highlight ? highlight.color : 'rgba(37, 99, 235, 0.1)',
                borderLeft: '2px solid var(--color-primary)',
                borderRight: '2px solid var(--color-primary)',
              };
            }

            // 当前选中单元格
            if (selectedCell && selectedCell.row === row && selectedCell.col === col) {
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
    </div>
  );
}
