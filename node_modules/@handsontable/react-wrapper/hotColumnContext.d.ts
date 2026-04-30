import { FC, PropsWithChildren } from 'react';
export interface HotColumnContextImpl {
    /**
     * Column index within a HotTable.
     */
    readonly columnIndex: number;
    /**
     * Get the `Document` object corresponding to the main component element.
     *
     * @returns The `Document` object used by the component.
     */
    readonly getOwnerDocument: () => Document | null;
}
declare const HotColumnContextProvider: FC<PropsWithChildren<HotColumnContextImpl>>;
declare const useHotColumnContext: () => HotColumnContextImpl;
export { useHotColumnContext, HotColumnContextProvider };
