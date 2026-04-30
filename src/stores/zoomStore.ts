import { create } from "zustand";

interface ZoomState {
  scale: number;
  minScale: number;
  maxScale: number;
  setScale: (scale: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
}

export const useZoomStore = create<ZoomState>((set, get) => ({
  scale: 1,
  minScale: 0.5,
  maxScale: 2,
  setScale: (scale: number) => {
    const { minScale, maxScale } = get();
    const clampedScale = Math.max(minScale, Math.min(maxScale, scale));
    set({ scale: clampedScale });
  },
  zoomIn: () => {
    const { scale, maxScale } = get();
    const newScale = Math.min(maxScale, scale + 0.1);
    set({ scale: newScale });
  },
  zoomOut: () => {
    const { scale, minScale } = get();
    const newScale = Math.max(minScale, scale - 0.1);
    set({ scale: newScale });
  },
  resetZoom: () => set({ scale: 1 }),
}));
