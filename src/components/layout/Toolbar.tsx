import { useState, useRef, useEffect } from "react";
import { FolderOpen, Save, Search, PanelLeft, Highlighter, Eraser, Download, Moon, Sun, MoreHorizontal, FileSpreadsheet, FileText, Database } from "lucide-react";
import { useFileStore } from "@/stores/fileStore";
import { useUIStore } from "@/stores/uiStore";
import { useFileOperations } from "@/hooks/useFileOperations";
import styles from "./Toolbar.module.css";

const HIGHLIGHT_COLORS = [
  { color: "#fef3c7", label: "黄色" },
  { color: "#dbeafe", label: "蓝色" },
  { color: "#d1fae5", label: "绿色" },
  { color: "#fce7f3", label: "粉色" },
  { color: "#f3e8ff", label: "紫色" },
  { color: "#fee2e2", label: "红色" },
  { color: "#ffedd5", label: "橙色" },
  { color: "#ccfbf1", label: "青色" },
];

interface ToolbarProps {
  onOpenFile: () => void;
  onToggleSidebar?: () => void;
}

export function Toolbar({ onOpenFile, onToggleSidebar }: ToolbarProps) {
  const { getActiveFile } = useFileStore();
  const { theme, setTheme, selectedCell, highlightedCells, addHighlightedCell, removeHighlightedCell, clearHighlightedCells } = useUIStore();
  const { handleSaveFile, handleExportFile } = useFileOperations();

  const [showColorPicker, setShowColorPicker] = useState(false);
  const [isColorPickerClosing, setIsColorPickerClosing] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [isExportMenuClosing, setIsExportMenuClosing] = useState(false);
  const [exportMenuPosition, setExportMenuPosition] = useState({ top: 0, left: 0 });
  const [selectedColor, setSelectedColor] = useState(HIGHLIGHT_COLORS[0].color);
  const [showMoreTools, setShowMoreTools] = useState(false);
  const [isMoreToolsClosing, setIsMoreToolsClosing] = useState(false);
  const [showSearchBar, setShowSearchBar] = useState(false);
  const [isSearchBarClosing, setIsSearchBarClosing] = useState(false);
  const [overflowItems, setOverflowItems] = useState<string[]>([]);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const mobileToolbarRef = useRef<HTMLDivElement>(null);
  const highlightBtnRef = useRef<HTMLButtonElement>(null);
  const exportBtnRef = useRef<HTMLButtonElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // 辅助函数：带关闭动画的状态切换
  const toggleWithAnimation = (
    isOpen: boolean,
    setIsOpen: (v: boolean) => void,
    setIsClosing: (v: boolean) => void,
    duration: number = 200
  ) => {
    if (isOpen) {
      setIsClosing(true);
      setTimeout(() => {
        setIsClosing(false);
        setIsOpen(false);
      }, duration);
    } else {
      setIsOpen(true);
    }
  };

  const activeFile = getActiveFile();
  const isDirty = activeFile?.isDirty || false;

  // 检测哪些按钮应该被折叠
  useEffect(() => {
    const checkOverflow = () => {
      if (!mobileToolbarRef.current) return;
      
      const toolbar = mobileToolbarRef.current;
      const toolbarWidth = toolbar.offsetWidth;
      const children = Array.from(toolbar.children) as HTMLElement[];
      
      let totalWidth = 0;
      const overflow: string[] = [];
      
      // 计算每个按钮的宽度（包括间距）
      for (const child of children) {
        const style = window.getComputedStyle(child);
        const marginLeft = parseInt(style.marginLeft) || 0;
        const marginRight = parseInt(style.marginRight) || 0;
        const childWidth = child.offsetWidth + marginLeft + marginRight;
        
        totalWidth += childWidth;
        
        // 如果总宽度超过工具栏宽度，标记为溢出
        if (totalWidth > toolbarWidth - 100) { // 预留100px给"更多"按钮
          const itemType = child.getAttribute('data-item');
          if (itemType && itemType !== 'fixed') {
            overflow.push(itemType);
          }
        }
      }
      
      setOverflowItems(overflow);
    };

    checkOverflow();
    window.addEventListener('resize', checkOverflow);
    return () => window.removeEventListener('resize', checkOverflow);
  }, []);

  // 处理高亮颜色选择
  const handleColorSelect = (color: string) => {
    setSelectedColor(color);
    if (selectedCell) {
      const isHighlighted = highlightedCells.some(
        h => h.row === selectedCell.row && h.col === selectedCell.col
      );
      if (isHighlighted) {
        removeHighlightedCell(selectedCell.row, selectedCell.col);
      } else {
        addHighlightedCell({ row: selectedCell.row, col: selectedCell.col, color });
      }
    }
    toggleWithAnimation(true, setShowColorPicker, setIsColorPickerClosing, 150);
  };

  // 处理清除高亮
  const handleClearHighlights = () => {
    clearHighlightedCells();
    toggleWithAnimation(true, setShowColorPicker, setIsColorPickerClosing, 150);
  };

  // 处理导出
  const handleExport = (format: 'dta' | 'csv' | 'xlsx') => {
    toggleWithAnimation(true, setShowExportMenu, setIsExportMenuClosing, 100);
    handleExportFile(format);
  };

  // 计算导出菜单位置
  const handleExportButtonClick = () => {
    if (exportBtnRef.current) {
      const rect = exportBtnRef.current.getBoundingClientRect();
      setExportMenuPosition({
        top: rect.bottom + 4,
        left: rect.left
      });
    }
    toggleWithAnimation(showExportMenu, setShowExportMenu, setIsExportMenuClosing, 100);
  };

  // 点击外部关闭菜单
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (showColorPicker && highlightBtnRef.current && !highlightBtnRef.current.contains(e.target as Node)) {
        toggleWithAnimation(true, setShowColorPicker, setIsColorPickerClosing, 150);
      }
      if (showExportMenu && exportBtnRef.current && !exportBtnRef.current.contains(e.target as Node)) {
        toggleWithAnimation(true, setShowExportMenu, setIsExportMenuClosing, 100);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showColorPicker, showExportMenu]);

  // 判断按钮是否在溢出列表中
  const isOverflow = (item: string) => overflowItems.includes(item);

  return (
    <div className={styles.toolbar} ref={toolbarRef}>
      {/* 桌面端工具栏 */}
      <div className={styles.toolbarScroll}>
        <div className={styles.group}>
          {onToggleSidebar && (
            <button
              className={styles.iconBtn}
              onClick={onToggleSidebar}
              title="侧边栏"
            >
              <PanelLeft size={18} />
            </button>
          )}
          <button className={styles.btn} onClick={onOpenFile} title="打开文件 (Ctrl+O)">
            <FolderOpen size={18} />
            <span className={styles.btnText}>打开</span>
          </button>
          <button className={styles.btn} disabled={!activeFile || !isDirty} onClick={handleSaveFile} title="保存 (Ctrl+S)">
            <Save size={18} />
            <span className={styles.btnText}>保存</span>
          </button>
        </div>
        <div className={styles.divider} />
        <div className={styles.group}>
          <div className={styles.highlightWrapper}>
            <button
              ref={highlightBtnRef}
              className={`${styles.iconBtn} ${selectedCell && highlightedCells.some(h => h.row === selectedCell.row && h.col === selectedCell.col) ? styles.active : ""}`}
              onClick={() => setShowColorPicker(!showColorPicker)}
              disabled={!selectedCell}
              title="高亮选中单元格"
            >
              <Highlighter size={18} />
            </button>
          </div>
          <button
            className={styles.iconBtn}
            onClick={handleClearHighlights}
            disabled={highlightedCells.length === 0}
            title="清除所有高亮"
          >
            <Eraser size={18} />
          </button>
        </div>
        <div className={styles.divider} />
        <div className={styles.group}>
          <div className={styles.exportWrapper}>
            <button
              ref={exportBtnRef}
              className={styles.iconBtn}
              onClick={handleExportButtonClick}
              disabled={!activeFile}
              title="导出文件"
            >
              <Download size={18} />
            </button>
          </div>
        </div>
        <div className={styles.spacer} />
        <div className={styles.group}>
          <button
            className={styles.iconBtn}
            onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
            title={theme === 'light' ? '切换深色模式' : '切换浅色模式'}
          >
            {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
          </button>
        </div>
        <div className={styles.divider} />
        <div className={styles.group}>
          <div className={styles.searchWrapper}>
            <Search size={16} className={styles.searchIcon} />
            <input
              type="text"
              className={styles.searchInput}
              placeholder="搜索..."
              disabled={!activeFile}
            />
          </div>
        </div>
      </div>

      {/* 移动端工具栏 */}
      <div className={styles.mobileToolbar} ref={mobileToolbarRef}>
        {/* 左侧固定按钮 */}
        <div className={styles.mobileLeft} data-item="fixed">
          {onToggleSidebar && (
            <button className={styles.iconBtn} onClick={onToggleSidebar} title="侧边栏">
              <PanelLeft size={18} />
            </button>
          )}
          <button className={styles.iconBtn} onClick={onOpenFile} title="打开">
            <FolderOpen size={18} />
          </button>
          <button className={styles.iconBtn} disabled={!activeFile || !isDirty} onClick={handleSaveFile} title="保存">
            <Save size={18} />
          </button>
        </div>

        {/* 中间可折叠区域 */}
        <div className={styles.mobileCenter}>
          {/* 高亮按钮 */}
          {!isOverflow('highlight') && (
            <button
              className={`${styles.iconBtn} ${selectedCell && highlightedCells.some(h => h.row === selectedCell.row && h.col === selectedCell.col) ? styles.active : ""}`}
              onClick={() => toggleWithAnimation(showColorPicker, setShowColorPicker, setIsColorPickerClosing, 150)}
              disabled={!selectedCell}
              data-item="highlight"
              title="高亮"
            >
              <Highlighter size={18} />
            </button>
          )}
          
          {/* 清除按钮 */}
          {!isOverflow('clear') && (
            <button 
              className={styles.iconBtn}
              onClick={handleClearHighlights}
              disabled={highlightedCells.length === 0}
              data-item="clear"
              title="清除"
            >
              <Eraser size={18} />
            </button>
          )}
          
          {/* 导出按钮 */}
          {!isOverflow('export') && (
            <button
              className={styles.iconBtn}
              onClick={() => toggleWithAnimation(showExportMenu, setShowExportMenu, setIsExportMenuClosing, 100)}
              disabled={!activeFile}
              data-item="export"
              title="导出"
            >
              <Download size={18} />
            </button>
          )}
          
          {/* 主题按钮 */}
          {!isOverflow('theme') && (
            <button 
              className={styles.iconBtn}
              onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
              data-item="theme"
              title="主题"
            >
              {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
            </button>
          )}
        </div>

        {/* 右侧固定按钮 */}
        <div className={styles.mobileRight} data-item="fixed">
          {/* 更多按钮 - 仅在有溢出项时显示 */}
          {overflowItems.length > 0 && (
            <button
              className={`${styles.iconBtn} ${styles.moreBtn} ${showMoreTools ? styles.active : ""}`}
              onClick={() => {
                if (showMoreTools) {
                  toggleWithAnimation(true, setShowMoreTools, setIsMoreToolsClosing, 200);
                } else {
                  setShowMoreTools(true);
                  if (showSearchBar) toggleWithAnimation(true, setShowSearchBar, setIsSearchBarClosing, 200);
                }
              }}
              title="更多"
            >
              <MoreHorizontal size={18} />
            </button>
          )}

          {/* 搜索按钮 - 窄屏设备上显示为按钮 */}
          <button
            className={`${styles.iconBtn} ${styles.searchBtn} ${showSearchBar ? styles.active : ""}`}
            onClick={() => {
              if (showSearchBar) {
                toggleWithAnimation(true, setShowSearchBar, setIsSearchBarClosing, 200);
              } else {
                setShowSearchBar(true);
                if (showMoreTools) toggleWithAnimation(true, setShowMoreTools, setIsMoreToolsClosing, 200);
              }
            }}
            title="搜索"
            disabled={!activeFile}
          >
            <Search size={18} />
          </button>
        </div>
      </div>

      {/* 移动端更多工具展开栏 */}
      {(showMoreTools || isMoreToolsClosing) && overflowItems.length > 0 && (
        <div className={`${styles.mobileMoreBar} ${isMoreToolsClosing ? styles.mobileMoreBarExit : styles.mobileMoreBarEnter}`}>
          {overflowItems.includes('highlight') && (
            <button
              className={styles.mobileMoreItem}
              onClick={() => { setShowColorPicker(true); toggleWithAnimation(true, setShowMoreTools, setIsMoreToolsClosing, 200); }}
              disabled={!selectedCell}
            >
              <Highlighter size={18} />
              <span>高亮</span>
            </button>
          )}
          {overflowItems.includes('clear') && (
            <button
              className={styles.mobileMoreItem}
              onClick={() => { handleClearHighlights(); toggleWithAnimation(true, setShowMoreTools, setIsMoreToolsClosing, 200); }}
              disabled={highlightedCells.length === 0}
            >
              <Eraser size={18} />
              <span>清除</span>
            </button>
          )}
          {overflowItems.includes('export') && (
            <button
              className={styles.mobileMoreItem}
              onClick={() => { setShowExportMenu(true); toggleWithAnimation(true, setShowMoreTools, setIsMoreToolsClosing, 200); }}
              disabled={!activeFile}
            >
              <Download size={18} />
              <span>导出</span>
            </button>
          )}
          {overflowItems.includes('theme') && (
            <button
              className={styles.mobileMoreItem}
              onClick={() => { setTheme(theme === 'light' ? 'dark' : 'light'); toggleWithAnimation(true, setShowMoreTools, setIsMoreToolsClosing, 200); }}
            >
              {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
              <span>主题</span>
            </button>
          )}
        </div>
      )}

      {/* 移动端搜索栏展开 */}
      {(showSearchBar || isSearchBarClosing) && (
        <div className={`${styles.mobileSearchBar} ${isSearchBarClosing ? styles.mobileSearchBarExit : styles.mobileSearchBarEnter}`}>
          <div className={styles.mobileSearchWrapper}>
            <Search size={18} className={styles.mobileSearchIcon} />
            <input
              ref={searchInputRef}
              type="text"
              className={styles.mobileSearchInput}
              placeholder="搜索数据..."
              autoFocus
            />
          </div>
          <button
            className={styles.mobileSearchClose}
            onClick={() => toggleWithAnimation(true, setShowSearchBar, setIsSearchBarClosing, 200)}
          >
            取消
          </button>
        </div>
      )}

      {/* 颜色选择器 */}
      {(showColorPicker || isColorPickerClosing) && (
        <div className={`${styles.colorPicker} ${isColorPickerClosing ? styles.colorPickerExit : styles.colorPickerEnter}`}>
          <div className={styles.colorPickerTitle}>选择高亮颜色</div>
          <div className={styles.colorGrid}>
            {HIGHLIGHT_COLORS.map((item) => (
              <button
                key={item.color}
                className={`${styles.colorBtn} ${selectedColor === item.color ? styles.selected : ""}`}
                style={{ backgroundColor: item.color }}
                onClick={() => handleColorSelect(item.color)}
                title={item.label}
              />
            ))}
          </div>
          <div className={styles.colorPickerDivider} />
          <button className={styles.colorPickerAction} onClick={handleClearHighlights}>
            清除所有高亮
          </button>
        </div>
      )}

      {/* 导出菜单 */}
      {(showExportMenu || isExportMenuClosing) && (
        <>
          {/* 桌面端导出菜单 */}
          <div
            className={`${styles.exportMenu} ${isExportMenuClosing ? styles.exportMenuExit : styles.exportMenuEnter}`}
            style={{
              top: `${exportMenuPosition.top}px`,
              left: `${exportMenuPosition.left}px`
            }}
          >
            <button className={styles.exportMenuItem} onClick={() => handleExport('dta')}>
              导出为 DTA
            </button>
            <button className={styles.exportMenuItem} onClick={() => handleExport('csv')}>
              导出为 CSV
            </button>
            <button className={styles.exportMenuItem} onClick={() => handleExport('xlsx')}>
              导出为 Excel
            </button>
          </div>

          {/* 移动端导出弹窗 */}
          <div className={`${styles.mobileExportOverlay} ${isExportMenuClosing ? styles.mobileExportOverlayExit : styles.mobileExportOverlayEnter}`} onClick={() => toggleWithAnimation(true, setShowExportMenu, setIsExportMenuClosing, 100)}>
            <div className={styles.mobileExportDialog} onClick={(e) => e.stopPropagation()}>
              <div className={styles.mobileExportHeader}>
                <h3>导出文件</h3>
                <button className={styles.mobileExportClose} onClick={() => toggleWithAnimation(true, setShowExportMenu, setIsExportMenuClosing, 100)}>
                  ✕
                </button>
              </div>
              <div className={styles.mobileExportGrid}>
                <button className={styles.mobileExportCard} onClick={() => handleExport('dta')}>
                  <div className={styles.mobileExportIcon}><Database size={32} /></div>
                  <span>Stata DTA</span>
                  <small>原生格式</small>
                </button>
                <button className={styles.mobileExportCard} onClick={() => handleExport('csv')}>
                  <div className={styles.mobileExportIcon}><FileText size={32} /></div>
                  <span>CSV</span>
                  <small>通用格式</small>
                </button>
                <button className={styles.mobileExportCard} onClick={() => handleExport('xlsx')}>
                  <div className={styles.mobileExportIcon}><FileSpreadsheet size={32} /></div>
                  <span>Excel</span>
                  <small>电子表格</small>
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
