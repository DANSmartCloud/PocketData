import { useState, useCallback, useEffect, useRef } from 'react';

export interface VirtualRow {
  index: number;
  offsetTop: number;
}

export interface UseVirtualRowsOptions {
  total: number;
  rowHeight: number;
  viewportHeight: number;
  overscan?: number;
  chunkSize?: number;
  loadChunk?: (start: number, end: number) => Promise<unknown[]>;
}

export interface UseVirtualRowsResult {
  visibleStart: number;
  visibleEnd: number;
  totalHeight: number;
  offsetForIndex: (index: number) => number;
  onScroll: (e: React.UIEvent<HTMLDivElement>) => void;
  loading: boolean;
  loadedChunks: Set<number>;
}

export function useVirtualRows({
  total,
  rowHeight,
  viewportHeight,
  overscan = 10,
  chunkSize = 1000,
  loadChunk
}: UseVirtualRowsOptions): UseVirtualRowsResult {
  const [scrollTop, setScrollTop] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadedChunks, setLoadedChunks] = useState<Set<number>>(new Set());
  const lastTriggeredChunk = useRef<number>(-1);

  const visibleStart = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const visibleEnd = Math.min(total, Math.ceil((scrollTop + viewportHeight) / rowHeight) + overscan);
  const totalHeight = total * rowHeight;

  const offsetForIndex = useCallback((index: number) => index * rowHeight, [rowHeight]);

  const onScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    setScrollTop(target.scrollTop);
  }, []);

  // 按需触发分块加载
  useEffect(() => {
    if (!loadChunk) return;
    const currentChunk = Math.floor(visibleStart / chunkSize);
    if (loadedChunks.has(currentChunk) || lastTriggeredChunk.current === currentChunk) return;
    lastTriggeredChunk.current = currentChunk;
    const start = currentChunk * chunkSize;
    const end = Math.min(start + chunkSize, total);
    setLoading(true);
    loadChunk(start, end).finally(() => {
      setLoading(false);
      setLoadedChunks(prev => new Set(prev).add(currentChunk));
    });
  }, [visibleStart, chunkSize, loadChunk, total, loadedChunks]);

  return {
    visibleStart,
    visibleEnd,
    totalHeight,
    offsetForIndex,
    onScroll,
    loading,
    loadedChunks
  };
}
