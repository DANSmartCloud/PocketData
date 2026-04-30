declare module 'react-spread-sheet-excel' {
  import { ComponentType, RefObject } from 'react';

  export interface CellData {
    value: string | number | null;
    styles?: {
      fontWeight?: string;
      fontStyle?: string;
      textDecoration?: string;
      color?: string;
      background?: string;
    };
  }

  export interface SheetRef {
    getData: () => CellData[][];
    exportCsv: (filename: string, includeHeaders?: boolean) => void;
  }

  export interface SheetProps {
    columnLabels?: string[];
    data?: CellData[][];
    onChange?: (row: number, col: number, value: string) => void;
    onSelectionChange?: (selection: { row: number; col: number }[]) => void;
    editable?: boolean;
    className?: string;
    ref?: RefObject<SheetRef>;
  }

  const Sheet: ComponentType<SheetProps>;
  export default Sheet;
  export { SheetRef };
}