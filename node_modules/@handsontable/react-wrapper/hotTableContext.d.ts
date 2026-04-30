import Handsontable from 'handsontable/base';
import { ComponentType, FC, PropsWithChildren } from 'react';
import { ScopeIdentifier, HotRendererProps } from './types';
import { RenderersPortalManagerRef } from './renderersPortalManager';
export interface HotTableContextImpl {
    /**
     * Map with column indexes (or a string = 'global') as keys, and booleans as values. Each key represents a component-based editor
     * declared for the used column index, or a global one, if the key is the `global` string.
     */
    readonly componentRendererColumns: Map<ScopeIdentifier, boolean>;
    /**
     * Array of object containing the column settings.
     */
    readonly columnsSettings: Handsontable.ColumnSettings[];
    /**
     * Sets the column settings based on information received from HotColumn.
     *
     * @param {HotTableProps} columnSettings Column settings object.
     * @param {Number} columnIndex Column index.
     */
    readonly emitColumnSettings: (columnSettings: Handsontable.ColumnSettings, columnIndex: number) => void;
    /**
     * Return a renderer wrapper function for the provided renderer component.
     *
     * @param {ComponentType<HotRendererProps>} Renderer React renderer component.
     * @returns {Handsontable.renderers.BaseRenderer} The Handsontable rendering function.
     */
    readonly getRendererWrapper: (Renderer: ComponentType<HotRendererProps>) => typeof Handsontable.renderers.BaseRenderer;
    /**
     * Clears portals cache.
     */
    readonly clearPortalCache: () => void;
    /**
     * Clears rendered cells cache.
     */
    readonly clearRenderedCellCache: () => void;
    /**
     * Set the renderers portal manager dispatch function.
     *
     * @param {RenderersPortalManagerRef} pm The PortalManager dispatch function.
     */
    readonly setRenderersPortalManagerRef: (pm: RenderersPortalManagerRef) => void;
    /**
     * Puts cell portals into portal manager and purges portals cache.
     */
    readonly pushCellPortalsIntoPortalManager: () => void;
}
declare const HotTableContextProvider: FC<PropsWithChildren>;
/**
 * Exposes the table context object to components
 *
 * @returns HotTableContext
 */
declare function useHotTableContext(): HotTableContextImpl;
export { HotTableContextProvider, useHotTableContext };
