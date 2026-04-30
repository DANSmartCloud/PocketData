import React, { FC } from 'react';
import { HotColumnProps } from './types';
declare const isHotColumn: (childNode: any) => childNode is React.ReactElement<any, string | ((props: any, deprecatedLegacyContext?: any) => React.ReactElement<any, any> | null) | (new (props: any, deprecatedLegacyContext?: any) => React.Component<any, any, any>)>;
declare const HotColumn: FC<HotColumnProps>;
export { HotColumn, isHotColumn };
