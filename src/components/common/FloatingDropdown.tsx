import { useEffect, useState, useRef, useCallback, useLayoutEffect, ReactNode } from "react";
import { createPortal } from "react-dom";
import styles from "./FloatingDropdown.module.css";

/**
 * 浮动下拉菜单（基于 Portal 渲染，不受父级 overflow 裁剪影响）
 *
 * 设计要点：
 *  - 使用 React Portal 渲染到 document.body，避免被父级 overflow:hidden 裁剪
 *  - 通过 triggerRef 的 getBoundingClientRect() 动态计算位置
 *  - 向上展开（默认），下方有空间时也可改为向下展开
 *  - 关闭：点击外部、Esc 键
 *  - 滚动时自动重新定位（避免浮动面板错位）
 */
export interface FloatingDropdownProps {
  trigger: (props: {
    open: boolean;
    onClick: () => void;
    onKeyDown: (e: React.KeyboardEvent) => void;
    buttonRef: React.Ref<HTMLButtonElement>;
  }) => ReactNode;
  children: (props: { close: () => void }) => ReactNode;
  /** 最小宽度（px） */
  minWidth?: number;
  /** 最大宽度（px） */
  maxWidth?: number;
  /** 最大高度（px） */
  maxHeight?: number;
  /** 偏移动态（X/Y 偏移量） */
  offsetX?: number;
  offsetY?: number;
  /** 自定义类名 */
  className?: string;
}

type Direction = "up" | "down";

export function FloatingDropdown({
  trigger,
  children,
  minWidth = 240,
  maxWidth = 340,
  maxHeight = 360,
  offsetX = 0,
  offsetY = 6,
  className,
}: FloatingDropdownProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number; dir: Direction; width: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const tickingRef = useRef(false);

  // 计算面板位置
  const updatePosition = useCallback(() => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const wantWidth = Math.max(minWidth, rect.width);
    let left = rect.left + offsetX;
    // 防止右侧溢出
    if (left + wantWidth > vw - 8) {
      left = Math.max(8, vw - wantWidth - 8);
    }
    if (left < 8) left = 8;
    // 判断上下方向：上方空间不够时改为向下
    const spaceAbove = rect.top;
    const spaceBelow = vh - rect.bottom;
    const dir: Direction = spaceAbove >= maxHeight + offsetY || spaceAbove >= spaceBelow ? "up" : "down";
    let top: number;
    if (dir === "up") {
      // 面板底部对齐 trigger 顶部
      top = rect.top - offsetY;
    } else {
      // 面板顶部对齐 trigger 底部
      top = rect.bottom + offsetY;
    }
    setPos({ left, top, dir, width: wantWidth });
  }, [minWidth, maxHeight, offsetX, offsetY]);

  // open 变化时 / 滚动 / 窗口缩放 → 重新定位
  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    updatePosition();
    let raf = 0;
    const onScrollOrResize = () => {
      if (tickingRef.current) return;
      tickingRef.current = true;
      raf = requestAnimationFrame(() => {
        updatePosition();
        tickingRef.current = false;
      });
    };
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
      cancelAnimationFrame(raf);
    };
  }, [open, updatePosition]);

  // 点击外部关闭
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (buttonRef.current?.contains(t)) return;
      if (panelRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  const close = useCallback(() => setOpen(false), []);

  return (
    <>
      {trigger({
        open,
        onClick: () => setOpen((v) => !v),
        onKeyDown: (e) => {
          if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
          }
        },
        buttonRef,
      })}

      {open && pos && typeof document !== "undefined" && createPortal(
        <div
          ref={panelRef}
          className={`${styles.panel} ${pos.dir === "up" ? styles.panelUp : styles.panelDown} ${className || ""}`}
          style={{
            left: pos.left,
            top: pos.dir === "up" ? pos.top : pos.top,
            transform: pos.dir === "up" ? "translateY(-100%)" : "none",
            minWidth: pos.width,
            maxWidth,
            maxHeight,
          }}
          role="listbox"
          onClick={(e) => e.stopPropagation()}
        >
          {children({ close })}
        </div>,
        document.body
      )}
    </>
  );
}
