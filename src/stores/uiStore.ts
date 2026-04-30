import { create } from 'zustand';

type Theme = 'light' | 'dark' | 'system';
type OperationMode = 'stata' | 'excel';

interface CellPosition {
  row: number;
  col: number;
}

interface SelectionRange {
  start: CellPosition;
  end: CellPosition;
}

interface HighlightedCell {
  row: number;
  col: number;
  color: string;
}

interface UIState {
  theme: Theme;
  operationMode: OperationMode;
  sidebarCollapsed: boolean;
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
  setTheme: (theme: Theme) => void;
  setOperationMode: (mode: OperationMode) => void;
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
  selectColumn: (col: number, rowCount: number) => void;
}

const HIGHLIGHT_COLORS = [
  '#FEF3C7', // yellow
  '#DCFCE7', // green
  '#DBEAFE', // blue
  '#FCE7F3', // pink
  '#E9D5FF', // purple
  '#FED7AA', // orange
];

let highlightColorIndex = 0;

export const useUIStore = create<UIState>((set) => ({
  theme: 'light',
  operationMode: 'stata',
  sidebarCollapsed: false,
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

  setTheme: (theme: Theme) => {
    localStorage.setItem('pocket-stata-theme', theme);
    set({ theme });
  },

  setOperationMode: (mode: OperationMode) => {
    localStorage.setItem('pocket-stata-mode', mode);
    set({ operationMode: mode, selectionRange: null, highlightedCells: [] });
  },

  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),

  setSidebarCollapsed: (collapsed: boolean) => set({ sidebarCollapsed: collapsed }),

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
  }
}));
