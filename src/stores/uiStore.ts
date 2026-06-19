import { create } from 'zustand';

type Theme = 'light' | 'dark' | 'system';
type OperationMode = 'stata' | 'excel';

export interface CellPosition {
  row: number;
  col: number;
}

export interface SelectionRange {
  start: CellPosition;
  end: CellPosition;
}

export interface HighlightedCell {
  row: number;
  col: number;
  color: string;
}

export type NotificationType = 'info' | 'success' | 'warning' | 'error';

export interface Notification {
  id: string;
  type: NotificationType;
  message: string;
  duration?: number;
}

interface UIState {
  theme: Theme;
  operationMode: OperationMode;
  sidebarCollapsed: boolean;
  sidebarWidth: number;
  setSidebarWidth: (w: number) => void;
  // 终端抽屉可见性
  terminalVisible: boolean;
  terminalHeight: number;
  setTerminalVisible: (v: boolean) => void;
  toggleTerminal: () => void;
  setTerminalHeight: (h: number) => void;
  // 窗格（panes）显隐 - 菜单栏"窗格"菜单的勾选项
  rightPanelVisible: boolean;
  rightPanelTab: string;
  setRightPanelVisible: (v: boolean) => void;
  toggleRightPanel: () => void;
  setRightPanelTab: (tab: string) => void;
  // 设置面板侧边栏活动标签
  sidebarActiveTab: string;
  setSidebarActiveTab: (tab: string) => void;
  /** 设置子页面意图（如打开 AI 配置时预选 'ai'）。由事件消费后清空。 */
  settingsIntent: string | null;
  setSettingsIntent: (intent: string | null) => void;
  consumeSettingsIntent: () => string | null;
  statusBarVisible: boolean;
  setStatusBarVisible: (v: boolean) => void;
  toggleStatusBar: () => void;
  formulaBarVisible: boolean;
  setFormulaBarVisible: (v: boolean) => void;
  toggleFormulaBar: () => void;
  outlineVisible: boolean;
  setOutlineVisible: (v: boolean) => void;
  toggleOutline: () => void;
  selectedCell: CellPosition | null;
  editingCell: CellPosition | null;
  editValue: string;
  selectionRange: SelectionRange | null;
  isSelecting: boolean;
  selectionStart: CellPosition | null;
  highlightedCells: HighlightedCell[];
  searchQuery: string;
  sortColumn: string | null;
  sortDirection: 'asc' | 'desc';
  selectedColumn: number | null;
  pinnedColumns: number[];
  // Excel 模式：列宽/行高调整（key 为列/行索引，value 为像素）
  columnWidths: Record<number, number>;
  rowHeights: Record<number, number>;
  // Excel 模式：冻结的列数与行数（左侧 frozenColumns 列，上方 frozenRows 行固定不滚动）
  frozenColumns: number;
  frozenRows: number;
  notifications: Notification[];
  setTheme: (theme: Theme) => void;
  setOperationMode: (mode: OperationMode) => void;
  /** 主题强调色（影响 --color-primary 等 CSS 变量） */
  accentColor: AccentColorId;
  setAccentColor: (id: AccentColorId) => void;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setSelectedCell: (cell: CellPosition | null) => void;
  setEditingCell: (cell: CellPosition | null) => void;
  setEditValue: (value: string) => void;
  setSelectionRange: (range: SelectionRange | null) => void;
  setIsSelecting: (isSelecting: boolean) => void;
  setSelectionStart: (cell: CellPosition | null) => void;
  addHighlightedCell: (cell: HighlightedCell) => void;
  removeHighlightedCell: (row: number, col: number) => void;
  clearHighlightedCells: () => void;
  setSearchQuery: (query: string) => void;
  setSort: (column: string | null, direction: 'asc' | 'desc') => void;
  setSelectedColumn: (col: number | null) => void;
  togglePinColumn: (col: number) => void;
  selectColumn: (col: number, rowCount: number) => void;
  setColumnWidth: (col: number, width: number) => void;
  setRowHeight: (row: number, height: number) => void;
  setColumnWidths: (widths: Record<number, number>) => void;
  setRowHeights: (heights: Record<number, number>) => void;
  clearColumnWidths: () => void;
  clearRowHeights: () => void;
  setFrozenColumns: (n: number) => void;
  setFrozenRows: (n: number) => void;
  pushNotification: (n: Omit<Notification, 'id'>) => string;
  dismissNotification: (id: string) => void;
}

const HIGHLIGHT_COLORS = [
  '#FEF3C7', // yellow
  '#DCFCE7', // green
  '#DBEAFE', // blue
  '#FCE7F3', // pink
  '#E9D5FF', // purple
  '#FED7AA', // orange
];

/** 8 种预设强调色（默认 blue），与 --color-primary 联动 */
export type AccentColorId =
  | 'blue' | 'indigo' | 'purple' | 'pink'
  | 'red' | 'orange' | 'green' | 'teal';

export interface AccentColor {
  id: AccentColorId;
  label: string;
  /** 主色（用于按钮/高亮） */
  base: string;
  /** 浅色（如浅色主题下的浅蓝背景） */
  light: string;
  /** 深色（hover/active） */
  dark: string;
  /** 浅色模式下的对比文字色（一般 white） */
  contrast: string;
}

export const ACCENT_COLORS: AccentColor[] = [
  { id: 'blue',   label: '天空蓝',  base: '#2563EB', light: '#DBEAFE', dark: '#1D4ED8', contrast: '#FFFFFF' },
  { id: 'indigo', label: '靛青',   base: '#4F46E5', light: '#E0E7FF', dark: '#4338CA', contrast: '#FFFFFF' },
  { id: 'purple', label: '紫罗兰', base: '#9333EA', light: '#F3E8FF', dark: '#7E22CE', contrast: '#FFFFFF' },
  { id: 'pink',   label: '樱粉',   base: '#EC4899', light: '#FCE7F3', dark: '#DB2777', contrast: '#FFFFFF' },
  { id: 'red',    label: '朱砂',   base: '#DC2626', light: '#FEE2E2', dark: '#B91C1C', contrast: '#FFFFFF' },
  { id: 'orange', label: '橙阳',   base: '#EA580C', light: '#FFEDD5', dark: '#C2410C', contrast: '#FFFFFF' },
  { id: 'green',  label: '翠绿',   base: '#16A34A', light: '#DCFCE7', dark: '#15803D', contrast: '#FFFFFF' },
  { id: 'teal',   label: '青蓝',   base: '#0D9488', light: '#CCFBF1', dark: '#0F766E', contrast: '#FFFFFF' },
];

let highlightColorIndex = 0;

export const useUIStore = create<UIState>((set, get) => ({
  theme: 'light',
  operationMode: 'stata',
  accentColor: 'blue',
  sidebarCollapsed: false,
  sidebarWidth: 280,
  terminalVisible: false,
  terminalHeight: 260,
  rightPanelVisible: true,
  rightPanelTab: 'settings',
  sidebarActiveTab: 'explorer',
  settingsIntent: null,
  statusBarVisible: true,
  formulaBarVisible: true,
  outlineVisible: true,
  selectedCell: null,
  editingCell: null,
  editValue: '',
  selectionRange: null,
  isSelecting: false,
  selectionStart: null,
  highlightedCells: [],
  searchQuery: '',
  sortColumn: null,
  sortDirection: 'asc',
  selectedColumn: null,
  pinnedColumns: [],
  columnWidths: {},
  rowHeights: {},
  frozenColumns: 0,
  frozenRows: 0,
  notifications: [],

  setTheme: (theme: Theme) => {
    const current = get().theme;
    if (current === theme) return; // 防止广播循环
    try {
      localStorage.setItem('pocketdata-theme', theme);
      localStorage.removeItem('pocket-stata-theme');
    } catch {}
    set({ theme });
    // 关键：把 data-theme 同步到 <html> 元素
    // 这样 Portal 到 document.body 的弹层（下拉菜单/Tooltip 等）
    // 也能通过 [data-theme="dark"] 选择器匹配到深色主题样式
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-theme', theme);
    }
    // 异步广播主题变更给所有子窗口
    import('@/utils/windowManager').then(({ broadcastThemeChange }) => {
      broadcastThemeChange(theme);
    }).catch(() => {});
  },

  setOperationMode: (mode: OperationMode) => {
    try {
      localStorage.setItem('pocketdata-mode', mode);
      localStorage.removeItem('pocket-stata-mode');
    } catch {}
    set({ operationMode: mode, selectionRange: null, highlightedCells: [] });
  },

  setAccentColor: (id) => {
    const accent = ACCENT_COLORS.find((a) => a.id === id);
    if (!accent) return;
    try {
      localStorage.setItem('pocketdata-accent', id);
    } catch {}
    set({ accentColor: id });
    // 同步到 CSS 变量：影响 --color-primary / --color-primary-dark / --color-primary-light
    if (typeof document !== 'undefined') {
      const root = document.documentElement;
      root.style.setProperty('--color-primary', accent.base);
      root.style.setProperty('--color-primary-dark', accent.dark);
      root.style.setProperty('--color-primary-light', accent.light);
      root.style.setProperty('--color-primary-contrast', accent.contrast);
    }
  },

  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),

  setSidebarCollapsed: (collapsed: boolean) => set({ sidebarCollapsed: collapsed }),

  setSidebarWidth: (w: number) => {
    const clamped = Math.max(180, Math.min(600, Math.floor(w)));
    try {
      localStorage.setItem('pocketdata-sidebar-width', String(clamped));
    } catch {}
    set({ sidebarWidth: clamped });
  },

  setTerminalVisible: (v: boolean) => set({ terminalVisible: v }),
  toggleTerminal: () => set((state) => ({ terminalVisible: !state.terminalVisible })),
  setTerminalHeight: (h: number) => set({ terminalHeight: h }),

  setRightPanelVisible: (v: boolean) => set({ rightPanelVisible: v }),
  toggleRightPanel: () => set((state) => ({ rightPanelVisible: !state.rightPanelVisible })),
  setRightPanelTab: (tab: string) => set({ rightPanelTab: tab }),
  /** 设置侧边栏活动标签（explorer / settings / ai / ai-history 等） */
  setSidebarActiveTab: (tab: string) => {
    try {
      localStorage.setItem('pocketdata-sidebar-tab', tab);
    } catch {}
    set({ sidebarActiveTab: tab });
  },
  /** 设置设置面板跳转意图（如打开 AI / 代码 / 主题 子页）。由事件消费后清空。 */
  setSettingsIntent: (intent: string | null) => set({ settingsIntent: intent }),
  /** 消费并清空设置面板意图；返回消费前的值。 */
  consumeSettingsIntent: () => {
    const intent = get().settingsIntent;
    if (intent !== null) set({ settingsIntent: null });
    return intent;
  },
  setStatusBarVisible: (v: boolean) => set({ statusBarVisible: v }),
  toggleStatusBar: () => set((state) => ({ statusBarVisible: !state.statusBarVisible })),
  setFormulaBarVisible: (v: boolean) => set({ formulaBarVisible: v }),
  toggleFormulaBar: () => set((state) => ({ formulaBarVisible: !state.formulaBarVisible })),
  setOutlineVisible: (v: boolean) => set({ outlineVisible: v }),
  toggleOutline: () => set((state) => ({ outlineVisible: !state.outlineVisible })),

  setSelectedCell: (cell: CellPosition | null) => {
    if (cell) {
      set({ selectedCell: cell, selectionRange: { start: cell, end: cell } });
    } else {
      set({ selectedCell: null, selectionRange: null });
    }
  },

  setEditingCell: (cell: CellPosition | null) => set({ editingCell: cell }),

  setEditValue: (value: string) => set({ editValue: value }),

  setSelectionRange: (range: SelectionRange | null) => set({ selectionRange: range }),

  setIsSelecting: (isSelecting: boolean) => set({ isSelecting }),

  setSelectionStart: (cell: CellPosition | null) => set({ selectionStart: cell }),

  addHighlightedCell: (cell: HighlightedCell) => {
    const color = HIGHLIGHT_COLORS[highlightColorIndex % HIGHLIGHT_COLORS.length];
    highlightColorIndex++;
    set(state => ({
      highlightedCells: [...state.highlightedCells, { ...cell, color }]
    }));
  },

  removeHighlightedCell: (row: number, col: number) => {
    set(state => ({
      highlightedCells: state.highlightedCells.filter(
        c => !(c.row === row && c.col === col)
      )
    }));
  },

  clearHighlightedCells: () => set({ highlightedCells: [] }),

  setSearchQuery: (query: string) => set({ searchQuery: query }),

  setSort: (column, direction) => set({ sortColumn: column, sortDirection: direction }),

  setSelectedColumn: (col: number | null) => set({ selectedColumn: col }),

  togglePinColumn: (col: number) => set((state) => {
    if (state.pinnedColumns.includes(col)) {
      return { pinnedColumns: state.pinnedColumns.filter((c) => c !== col) };
    }
    return { pinnedColumns: [...state.pinnedColumns, col] };
  }),

  selectColumn: (col: number, rowCount: number) => {
    // 选中整列：从第0行到最后一行
    set({
      selectedColumn: col,
      selectedCell: { row: 0, col },
      selectionRange: {
        start: { row: 0, col },
        end: { row: rowCount - 1, col }
      }
    });
  },

  setColumnWidth: (col: number, width: number) => {
    set(state => ({
      columnWidths: { ...state.columnWidths, [col]: width }
    }));
  },

  setRowHeight: (row: number, height: number) => {
    set(state => ({
      rowHeights: { ...state.rowHeights, [row]: height }
    }));
  },

  setColumnWidths: (widths: Record<number, number>) => {
    set({ columnWidths: { ...widths } });
  },

  setRowHeights: (heights: Record<number, number>) => {
    set({ rowHeights: { ...heights } });
  },

  clearColumnWidths: () => set({ columnWidths: {} }),
  clearRowHeights: () => set({ rowHeights: {} }),

  setFrozenColumns: (n: number) => {
    const v = Math.max(0, Math.floor(n));
    set({ frozenColumns: v });
  },

  setFrozenRows: (n: number) => {
    const v = Math.max(0, Math.floor(n));
    set({ frozenRows: v });
  },

  pushNotification: (n) => {
    const id = `n_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const duration = n.duration ?? 3500;
    set(state => ({
      notifications: [...state.notifications, { ...n, id }]
    }));
    if (duration > 0) {
      setTimeout(() => {
        set(state => ({
          notifications: state.notifications.filter(x => x.id !== id)
        }));
      }, duration);
    }
    return id;
  },

  dismissNotification: (id) => {
    set(state => ({
      notifications: state.notifications.filter(x => x.id !== id)
    }));
  }
}));
