import { useEffect, useRef, useState, useCallback } from "react";

/**
 * 通用下拉菜单 / 弹出层状态管理 Hook
 *
 * 设计要点：
 *  - 自动处理"点击外部关闭"和"按 Esc 关闭"
 *  - 支持"排他模式"：任意一个下拉打开时自动关闭其它下拉
 *    （避免多个下拉同时打开造成视觉混乱）
 *  - 触发元素（trigger）和面板元素（panel）都视为"内部"
 *  - 使用 pointerdown 而非 click，避免与下拉项的 click 事件冲突
 *  - 提供"打开/关闭/切换"API
 *
 * 关键安全设计：
 *  - 排他订阅 effect 的依赖中移除 `open`，改用 ref 读取最新值，
 *    杜绝"打开 → 通知 → 重置 → 重新订阅 → 再通知"的循环
 *  - acquire/release 永远在 setState 外部调用，避免在 React
 *    setState updater 内部同步通知其它 hook 造成级联渲染
 */
export interface UseDropdownOptions {
  /** 默认 false */
  defaultOpen?: boolean;
  /**
   * 排他模式：与其它 dropdown 共享 registry 时，
   * 自己打开时自动关闭其它已开的下拉
   */
  exclusiveKey?: string;
  /**
   * 注册中心（同一组件内的多个下拉共用一个）
   * 传入后会跨实例协调
   */
  registry?: DropdownRegistry;
}

/**
 * 下拉排他协调器
 *
 * 实现：
 *  - acquire(key)：标记 key 已开，并**清除非当前 key 的所有其它 key**，
 *    然后通知所有订阅者（其它 dropdown 会检查自己的 key 是否还在 open 中）
 *  - release(key)：移除 key，然后通知所有订阅者
 *  - subscribe(fn)：注册一个监听器（当 acquire/release 触发时被调用）
 *
 * 注意：listeners 的通知是同步的（forEach），所以 acquire/release
 * 绝对不能放在 React setState updater 内部执行（会导致跨实例的
 * setState 级联，触发无限渲染循环）。
 */
export class DropdownRegistry {
  private open: Set<string> = new Set();
  private listeners: Set<() => void> = new Set();

  /** 打开指定 key 并关闭所有其它已开 key */
  acquire(key: string): void {
    this.open.clear();
    this.open.add(key);
    this.listeners.forEach((l) => l());
  }

  /** 关闭指定 key */
  release(key: string): void {
    this.open.delete(key);
    this.listeners.forEach((l) => l());
  }

  isOpen(key: string): boolean {
    return this.open.has(key);
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }
}

export function useDropdown(options: UseDropdownOptions = {}) {
  const { defaultOpen = false, exclusiveKey, registry } = options;
  const [open, setOpen] = useState(defaultOpen);
  const triggerRef = useRef<HTMLElement | null>(null);
  const panelRef = useRef<HTMLElement | null>(null);

  // 用 ref 保存最新 open 值，避免 effect 因 open 变化而重新订阅
  const openRef = useRef(open);
  openRef.current = open;

  const openDropdown = useCallback(() => {
    if (registry && exclusiveKey) registry.acquire(exclusiveKey);
    setOpen(true);
  }, [registry, exclusiveKey]);

  const close = useCallback(() => {
    if (registry && exclusiveKey) registry.release(exclusiveKey);
    setOpen(false);
  }, [registry, exclusiveKey]);

  const toggle = useCallback(() => {
    // 关键：acquire/release 放在 setOpen 外部，
    // 不与 React setState batch 交叉执行
    const willOpen = !openRef.current;
    if (registry && exclusiveKey) {
      if (willOpen) {
        registry.acquire(exclusiveKey);
      } else {
        registry.release(exclusiveKey);
      }
    }
    setOpen(willOpen);
  }, [registry, exclusiveKey]);

  /* 排他模式：其它 dropdown 打开时，自动关闭自己
   *  ← 关键修复：依赖中移除 `open`，改用 openRef
   *     效果仅注册一次，避免无限循环 */
  useEffect(() => {
    if (!registry || !exclusiveKey) return;
    const unsub = registry.subscribe(() => {
      // 用 ref 读取最新值，不再需要 effect 重新订阅
      if (!registry.isOpen(exclusiveKey) && openRef.current) {
        setOpen(false);
      }
    });
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registry, exclusiveKey]);

  /* 点击外部关闭 + Esc 关闭 */
  useEffect(() => {
    if (!open) return;

    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node | null;
      if (!target) return;
      if (triggerRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      // 关闭时同步通知 registry（如果有排他模式）
      if (registry && exclusiveKey) registry.release(exclusiveKey);
      setOpen(false);
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        if (registry && exclusiveKey) registry.release(exclusiveKey);
        setOpen(false);
        triggerRef.current?.focus();
      }
    };

    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKey, true);
    };
    // `open` 依赖是正确的：只有打开/关闭时才挂载/卸载这些全局监听
    // 但 registry/exclusiveKey 是稳定的 ref 值，不影响监听逻辑
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return {
    open,
    setOpen,
    openDropdown,
    close,
    toggle,
    triggerRef,
    panelRef,
  };
}
