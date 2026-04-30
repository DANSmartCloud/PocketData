import { ForwardRefExoticComponent, RefAttributes } from 'react';
import { HotTableProps, HotTableRef } from './types';
interface Version {
    version?: string;
}
declare type HotTable = ForwardRefExoticComponent<HotTableProps & RefAttributes<HotTableRef>> & Version;
/**
 * A Handsontable-ReactJS wrapper.
 *
 * To implement, use the `HotTable` tag with properties corresponding to Handsontable options.
 * For example:
 *
 * ```js
 * <HotTable id="hot" data={dataObject} contextMenu={true} colHeaders={true} width={600} height={300} stretchH="all" />
 *
 * // is analogous to
 * let hot = new Handsontable(document.getElementById('hot'), {
 *    data: dataObject,
 *    contextMenu: true,
 *    colHeaders: true,
 *    width: 600
 *    height: 300
 * });
 *
 * ```
 */
declare const HotTable: HotTable;
export default HotTable;
export { HotTable };
