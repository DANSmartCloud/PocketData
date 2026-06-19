import { useEffect, useRef, useState, useCallback } from 'react';
import { CheckCircle2, AlertCircle, Info, X, AlertTriangle } from 'lucide-react';
import { useUIStore } from '@/stores/uiStore';
import styles from './Notifications.module.css';

const ITEM_HEIGHT = 46;
const ITEM_GAP = 8;
const VISIBLE_COUNT = 3; // 聚焦区显示数量
const MAX_LAYERS = 5;    // 最大堆叠层级（含 focus）
const EXIT_MS = 400;

const ICON_BY_TYPE = {
  success: CheckCircle2,
  warning: AlertTriangle,
  error: AlertCircle,
  info: Info,
} as const;

export function Notifications() {
  const { notifications, dismissNotification } = useUIStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const currentStartRef = useRef(0);
  const [exitingIds, setExitingIds] = useState<Set<string>>(new Set());
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const hoverToastId = useRef<string | null>(null);
  const touchStartX = useRef(0);
  const swipeToastId = useRef<string | null>(null);

  // 触发 re-render（用于 currentStartRef 变化的滚动/悬停场景）
  const [, force] = useState(0);
  const tick = () => force(n => (n + 1) % 1_000_000);

  // ---- 退出动画（必须在引用它的 useEffect 之前定义）----
  const handleDismiss = useCallback((id: string) => {
    if (exitingIds.has(id)) return;
    setExitingIds(prev => new Set(prev).add(id));
    const t = timersRef.current.get(id);
    if (t) { clearTimeout(t); timersRef.current.delete(id); }
    setTimeout(() => {
      setExitingIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      dismissNotification(id);
    }, EXIT_MS);
  }, [exitingIds, dismissNotification]);

  // 任意 toast 变化时（新增/删除）若无 hover，自动跟随到最新
  useEffect(() => {
    const maxStart = Math.max(0, notifications.length - VISIBLE_COUNT);
    if (hoverToastId.current === null) {
      currentStartRef.current = maxStart;
    } else {
      // 限制越界
      currentStartRef.current = Math.min(currentStartRef.current, maxStart);
    }
    tick();
  }, [notifications.length]);

  // 自动消失定时器
  useEffect(() => {
    const existing = new Set(notifications.map(n => n.id));
    for (const [id, t] of timersRef.current) {
      if (!existing.has(id) || exitingIds.has(id)) {
        clearTimeout(t);
        timersRef.current.delete(id);
      }
    }
    for (const n of notifications) {
      if (timersRef.current.has(n.id)) continue;
      const dur = n.duration ?? 5000;
      if (dur > 0) {
        timersRef.current.set(n.id, setTimeout(() => {
          handleDismiss(n.id);
        }, dur));
      }
    }
  }, [notifications, exitingIds, handleDismiss]);

  // 全局滚轮事件：滚动堆叠
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const maxStart = Math.max(0, notifications.length - VISIBLE_COUNT);
      if (maxStart === 0) return;
      const dir = e.deltaY > 0 ? 1 : -1;
      const next = currentStartRef.current + dir;
      currentStartRef.current = Math.max(0, Math.min(maxStart, next));
      hoverToastId.current = null;
      tick();
    };
    container.addEventListener('wheel', onWheel, { passive: false });
    return () => container.removeEventListener('wheel', onWheel);
  }, [notifications.length]);

  // ---- 触摸滑动 ----
  const onTouchStart = (e: React.TouchEvent, id: string) => {
    touchStartX.current = e.touches[0].clientX;
    swipeToastId.current = id;
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (!swipeToastId.current) return;
    const delta = e.touches[0].clientX - touchStartX.current;
    const item = (e.target as HTMLElement).closest<HTMLElement>(`[data-toast-id="${swipeToastId.current}"]`);
    if (item) {
      item.style.transition = 'none';
      item.style.transform = `translateX(${Math.max(-120, delta)}px)`;
    }
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (!swipeToastId.current) return;
    const delta = e.changedTouches[0].clientX - touchStartX.current;
    const id = swipeToastId.current;
    swipeToastId.current = null;
    if (delta < -60) handleDismiss(id);
    else {
      const item = (e.target as HTMLElement).closest<HTMLElement>(`[data-toast-id="${id}"]`);
      if (item) {
        item.style.transition = 'transform 0.25s ease';
        item.style.transform = '';
      }
    }
  };

  // ---- hover → 聚焦 ----
  const onMouseEnter = (index: number) => {
    hoverToastId.current = `idx-${index}`;
    currentStartRef.current = index;
    tick();
  };
  const onMouseLeaveContainer = () => {
    hoverToastId.current = null;
    currentStartRef.current = Math.max(0, notifications.length - VISIBLE_COUNT);
    tick();
  };

  if (notifications.length === 0 && exitingIds.size === 0) return null;

  const totalFocusHeight = (VISIBLE_COUNT - 1) * (ITEM_HEIGHT + ITEM_GAP);
  const centerY = totalFocusHeight / 2;
  const baseStep = (ITEM_HEIGHT + ITEM_GAP) / 3;
  const tightFactor = 0.7;

  return (
    <div
      className={styles.container}
      ref={containerRef}
      role="status"
      aria-live="polite"
      onMouseLeave={onMouseLeaveContainer}
    >
      <div className={styles.stack}>
        {notifications.map((n, index) => {
          const isExiting = exitingIds.has(n.id);
          const relativePos = index - currentStartRef.current;
          let distance = 0;
          if (relativePos < 0) distance = Math.abs(relativePos);
          else if (relativePos >= VISIBLE_COUNT) distance = relativePos - VISIBLE_COUNT + 1;

          const isBeyondLayer = distance > MAX_LAYERS;
          const isFocus = !isBeyondLayer && relativePos >= 0 && relativePos < VISIBLE_COUNT;
          const layerClass = !isFocus && !isBeyondLayer ? styles[`layer${distance}` as keyof typeof styles] : '';

          // 计算 top
          let topPos: number;
          if (isFocus) {
            topPos = (relativePos * (ITEM_HEIGHT + ITEM_GAP)) - centerY;
          } else if (isBeyondLayer) {
            topPos = -200; // 视野外
          } else {
            const nonlinearStep = baseStep * Math.sqrt(distance) * tightFactor;
            topPos = relativePos < 0 ? -centerY - nonlinearStep : centerY + nonlinearStep;
          }

          const Icon = ICON_BY_TYPE[n.type];

          return (
            <div
              key={n.id}
              data-toast-id={n.id}
              className={[
                styles.toast,
                styles[`type_${n.type}`],
                isFocus ? styles.focus : '',
                layerClass,
                isBeyondLayer ? styles.hidden : '',
                isExiting ? styles.animateOut : styles.animateIn,
              ].filter(Boolean).join(' ')}
              style={{ top: `${Math.round(topPos)}px` }}
              onClick={() => !isExiting && handleDismiss(n.id)}
              onMouseEnter={() => onMouseEnter(index)}
              onTouchStart={(e) => onTouchStart(e, n.id)}
              onTouchMove={onTouchMove}
              onTouchEnd={onTouchEnd}
            >
              <span className={styles.iconWrap}>
                <Icon size={14} />
              </span>
              <span className={styles.message}>{n.message}</span>
              <button
                className={styles.close}
                onClick={(e) => { e.stopPropagation(); handleDismiss(n.id); }}
                title="关闭"
              >
                <X size={12} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
