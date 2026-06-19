import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import styles from './GeometricBackground.module.css';

const COLORS = {
  red: ['#ff4d4d', '#ff7676'],
  green: ['#4ce066', '#36d399'],
  blue: ['#4d9fff', '#2b7fff'],
  yellow: ['#ffc940', '#ffd966']
};
// 深色模式调色板 - 极致饱和度 + 发光感
const COLORS_DARK = {
  red: ['#ff6b6b', '#ff8b8b'],
  green: ['#5ee883', '#4ae09a'],
  blue: ['#74b9ff', '#5aa0ff'],
  yellow: ['#ffd966', '#ffe082']
};
const TYPES = ['circle', 'triangle', 'square', 'cross'] as const;
const MIN_D = 0.1;
const MAX_D = 1.8;
function clamp01(x: number) { return Math.min(1, Math.max(0, x)); }
function normDepth(d: number) { return clamp01((d - MIN_D) / (MAX_D - MIN_D)); }
function blurPxForDepth(d: number, lowEnd: boolean) {
  const n = normDepth(d);
  const base = lowEnd ? 5 : 8;
  const floor = 0.6;
  const v = Math.abs(Math.cos(Math.PI * n));
  return floor + base * v;
}
function opacityForDepth(d: number) {
  const n = normDepth(d);
  const middle = 1 - Math.abs(2 * n - 1);
  // 提升基础不透明度：0.85 - 1.0（更明显的形状）
  return 0.85 + 0.15 * middle;
}

function rand(min: number, max: number) { return Math.random() * (max - min) + min; }
function pick<T>(arr: readonly T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }

interface GeometricBackgroundProps {
  count?: number;
  lowEnd?: boolean;
  /** true 时使用深色调色板（适配深色主题） */
  darkPalette?: boolean;
}

interface ShapeData {
  t: typeof TYPES[number];
  c: string[];
  size: number;
  depth: number;
  x: number;
  y: number;
}

interface ShapeState {
  node: HTMLElement;
  depth: number;
  idleX: number;
  idleY: number;
  reactiveX: number;
  reactiveY: number;
  baseX: number;
  baseY: number;
  targetX: number;
  targetY: number;
  setX: gsap.QuickToFunc;
  setY: gsap.QuickToFunc;
  zoom: number;
  rot: number;
  size: number;
  repelX: number;
  repelY: number;
  dPhase?: 'up' | 'down';
}

// 生成稳定的随机形状数据（只执行一次）
function generateShapes(count: number, darkPalette: boolean): ShapeData[] {
  const palette = darkPalette ? COLORS_DARK : COLORS;
  return new Array(count).fill(0).map(() => {
    const t = pick(TYPES);
    const c = pick(Object.values(palette));
    const size = rand(22, 120);
    const depth = rand(0.2, 1.2);
    const x = rand(0, 100);
    const y = rand(0, 100);
    return { t, c, size, depth, x, y };
  });
}

export function GeometricBackground({ count = 28, lowEnd = false, darkPalette = false }: GeometricBackgroundProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  // 使用 ref 存储形状数据，避免重新渲染时重新生成
  const shapesRef = useRef<ShapeData[]>(generateShapes(count, darkPalette));
  const initializedRef = useRef(false);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    
    const el = containerRef.current;
    if (!el) return;
    
    const states: ShapeState[] = [];
    Array.from(el.children).forEach((node) => {
      const htmlNode = node as HTMLElement;
      const targetX = parseFloat(htmlNode.dataset.x || '50');
      const targetY = parseFloat(htmlNode.dataset.y || '50');
      const s: ShapeState = {
        node: htmlNode,
        depth: htmlNode.dataset.depth ? parseFloat(htmlNode.dataset.depth) : 1,
        idleX: 0,
        idleY: 0,
        reactiveX: 0,
        reactiveY: 0,
        baseX: 50,
        baseY: 50,
        targetX,
        targetY,
        setX: gsap.quickTo(htmlNode, 'x', { duration: 0.25, ease: 'sine.out', overwrite: 'auto' }),
        setY: gsap.quickTo(htmlNode, 'y', { duration: 0.25, ease: 'sine.out', overwrite: 'auto' }),
        zoom: 1,
        rot: 0,
        size: parseFloat(htmlNode.dataset.size || '60'),
        repelX: 0,
        repelY: 0
      };
      states.push(s);
      htmlNode.style.left = '50%';
      htmlNode.style.top = '50%';
      gsap.set(htmlNode, { transformOrigin: '50% 50%', scale: s.depth, rotation: rand(-30, 30) });
    });
    
    introBlast(states, lowEnd, () => {
      states.forEach((s) => {
        startWander(s, lowEnd);
        startRoam(s, lowEnd);
        startDepthSpin(s, lowEnd);
      });
    });

    function onMove(e: PointerEvent) {
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const mx = (e.clientX - rect.left) / rect.width;
      const my = (e.clientY - rect.top) / rect.height;
      states.forEach((s) => {
        const d = s.depth;
        const base = lowEnd ? 48 : 80;
        const dx = (mx - 0.5) * base * d;
        const dy = (my - 0.5) * base * d;
        const avoid = (lowEnd ? 30 : 46) / d;
        const bx = (mx * 100 - s.baseX) / 100;
        const by = (my * 100 - s.baseY) / 100;
        s.reactiveX = dx - avoid * bx;
        s.reactiveY = dy - avoid * by;
        s.setX(s.idleX + s.reactiveX);
        s.setY(s.idleY + s.reactiveY);
        s.node.style.filter = `blur(${blurPxForDepth(s.depth, lowEnd)}px)`;
      });
    }
    window.addEventListener('pointermove', onMove);
    
    function tick() {
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const n = states.length;
      const pos: [number, number][] = new Array(n);
      const rad: number[] = new Array(n);
      for (let i = 0; i < n; i++) {
        const s = states[i];
        const px = s.baseX / 100 * rect.width + s.idleX + s.reactiveX + s.repelX;
        const py = s.baseY / 100 * rect.height + s.idleY + s.reactiveY + s.repelY;
        pos[i] = [px, py];
        rad[i] = (s.size / 2) * s.depth * s.zoom;
      }
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          const dx = pos[j][0] - pos[i][0];
          const dy = pos[j][1] - pos[i][1];
          const dist = Math.sqrt(dx * dx + dy * dy) || 0.0001;
          const minDist = rad[i] + rad[j];
          if (dist < minDist) {
            const overlap = minDist - dist;
            const nx = dx / dist;
            const ny = dy / dist;
            const tx = -ny;
            const ty = nx;
            const k = 0.5;
            const t = 0.25;
            const pushX = nx * overlap * k;
            const pushY = ny * overlap * k;
            const slideX = tx * overlap * t;
            const slideY = ty * overlap * t;
            states[i].repelX += -(pushX) + (slideX);
            states[i].repelY += -(pushY) + (slideY);
            states[j].repelX += (pushX) - (slideX);
            states[j].repelY += (pushY) - (slideY);
          }
        }
      }
      for (let i = 0; i < n; i++) {
        const s = states[i];
        s.repelX *= 0.9;
        s.repelY *= 0.9;
        if (s.repelX > 40) s.repelX = 40; if (s.repelX < -40) s.repelX = -40;
        if (s.repelY > 40) s.repelY = 40; if (s.repelY < -40) s.repelY = -40;
        s.setX(s.idleX + s.reactiveX + s.repelX);
        s.setY(s.idleY + s.reactiveY + s.repelY);
      }
    }
    gsap.ticker.add(tick);
    
    function onDown(e: PointerEvent) {
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const mx = (e.clientX - rect.left);
      const my = (e.clientY - rect.top);
      states.forEach((s) => {
        const boxX = s.baseX / 100 * rect.width;
        const boxY = s.baseY / 100 * rect.height;
        const vx = boxX - mx;
        const vy = boxY - my;
        const dist = Math.sqrt(vx * vx + vy * vy);
        const dirX = vx / (dist || 1);
        const dirY = vy / (dist || 1);
        const amp = (lowEnd ? 40 : 80) * s.depth;
        const delay = dist / 900;
        gsap.to(s, {
          reactiveX: s.reactiveX + dirX * amp,
          reactiveY: s.reactiveY + dirY * amp,
          duration: 0.22,
          yoyo: true,
          repeat: 1,
          ease: 'power2.out',
          delay,
          onUpdate() { s.setX(s.idleX + s.reactiveX); s.setY(s.idleY + s.reactiveY); }
        });
      });
    }
    window.addEventListener('pointerdown', onDown);
    
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerdown', onDown);
      gsap.ticker.remove(tick);
    };
  }, [lowEnd]);

  return (
    <div className={styles.bgLayer} ref={containerRef} aria-hidden>
      {shapesRef.current.map((s, i) => (
        <SVGShape key={i} data={s} lowEnd={lowEnd} />
      ))}
    </div>
  );
}

function startWander(s: ShapeState, lowEnd: boolean) {
  function loop() {
    const amp = (lowEnd ? 20 : 36) * s.depth;
    const tx = rand(-amp, amp);
    const ty = rand(-amp, amp);
    gsap.to(s, {
      idleX: tx,
      idleY: ty,
      duration: rand(1.2, 2.2),
      yoyo: true,
      repeat: 1,
      ease: 'sine.inOut',
      onUpdate() { s.setX(s.idleX + s.reactiveX); s.setY(s.idleY + s.reactiveY); },
      onComplete: loop
    });
  }
  loop();
}

function startRoam(s: ShapeState, lowEnd: boolean) {
  function roam() {
    const rect = s.node.parentElement!.getBoundingClientRect();
    let nextX = s.baseX, nextY = s.baseY;
    let ok = false; let tries = 10; let best = { x: nextX, y: nextY, score: -Infinity };
    while (tries-- > 0) {
      const candX = Math.min(95, Math.max(5, s.baseX + rand(-25, 25)));
      const candY = Math.min(95, Math.max(5, s.baseY + rand(-25, 25)));
      const score = separationScore(candX, candY, s, rect);
      if (score > 0.6) { nextX = candX; nextY = candY; ok = true; break; }
      if (score > best.score) best = { x: candX, y: candY, score };
    }
    if (!ok) { nextX = best.x; nextY = best.y; }
    gsap.to(s, {
      baseX: nextX,
      baseY: nextY,
      duration: (lowEnd ? rand(6, 10) : rand(8, 14)) / s.depth,
      ease: 'sine.inOut',
      onUpdate() { s.node.style.left = s.baseX + '%'; s.node.style.top = s.baseY + '%'; },
      onComplete: roam
    });
  }
  roam();
}

function startDepthSpin(s: ShapeState, lowEnd: boolean) {
  s.dPhase = Math.random() < 0.5 ? 'up' : 'down';
  function cycle() {
    const up = s.dPhase === 'up';
    const targetDepth = up
      ? rand(1.0, 1.8)
      : rand(0.1, 0.6);
    const targetZoom = lowEnd ? rand(0.85, 1.15) : rand(0.75, 1.25);
    const targetRot = (s.rot || 0) + rand(-180, 180);
    gsap.to(s, {
      depth: targetDepth,
      zoom: targetZoom,
      rot: targetRot,
      duration: rand(2, 4.5),
      ease: 'sine.inOut',
      onUpdate() {
        gsap.set(s.node, { scale: s.depth * s.zoom, rotation: s.rot });
        s.node.style.filter = `blur(${blurPxForDepth(s.depth, lowEnd)}px)`;
        s.node.style.opacity = String(opacityForDepth(s.depth));
      },
      onComplete() { s.dPhase = up ? 'down' : 'up'; cycle(); }
    });
  }
  cycle();
}

function separationScore(candX: number, candY: number, s: ShapeState, rect: DOMRect) {
  const r1 = ((s.size / 2) * s.depth * s.zoom) / rect.width * 100;
  let minRatio = Infinity;
  const siblings = Array.from(s.node.parentElement!.children);
  for (let i = 0; i < siblings.length; i++) {
    const n = siblings[i] as HTMLElement;
    if (n === s.node) continue;
    const depth = parseFloat(n.dataset.depth || '1');
    const size = parseFloat(n.dataset.size || '60');
    const zoom = 1;
    const r2 = ((size / 2) * depth * zoom) / rect.width * 100;
    const bx = parseFloat(n.style.left) || (parseFloat(n.dataset.x || '50'));
    const by = parseFloat(n.style.top) || (parseFloat(n.dataset.y || '50'));
    const dx = candX - bx;
    const dy = candY - by;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const ratio = dist / (r1 + r2 + 0.001);
    if (ratio < minRatio) minRatio = ratio;
  }
  return Math.min(minRatio, 2);
}

function introBlast(states: ShapeState[], lowEnd: boolean, onDone?: () => void) {
  let doneCount = 0;
  const total = states.length;
  states.forEach((s) => {
    const dx = (s.targetX - 50);
    const dy = (s.targetY - 50);
    const dist = Math.sqrt(dx * dx + dy * dy);
    const delay = dist / 120;
    gsap.to(s, {
      baseX: s.targetX,
      baseY: s.targetY,
      duration: lowEnd ? 0.9 : 1.2,
      ease: 'power2.out',
      delay,
      onUpdate() { s.node.style.left = s.baseX + '%'; s.node.style.top = s.baseY + '%'; },
      onComplete() { doneCount++; if (doneCount === total) onDone?.(); }
    });
  });
}

interface SVGShapeProps {
  data: ShapeData;
  lowEnd: boolean;
}

function SVGShape({ data, lowEnd }: SVGShapeProps) {
  const { t, c, size, depth, x, y } = data;
  const style: React.CSSProperties = {
    left: `${x}%`,
    top: `${y}%`,
    transform: `translate(-50%, -50%)`,
    opacity: opacityForDepth(depth),
    filter: `blur(${blurPxForDepth(depth, lowEnd)}px)`
  };
  const [c1, c2] = c;
  const sw = Math.max(2.5, 4.5 * depth);
  const half = size / 2;
  const gradId = `g${t}${size}${depth}`;
  return (
    <div className={styles.shape} style={style} data-depth={depth} data-x={x} data-y={y} data-size={size}>
      <svg width={size} height={size} viewBox={`0 0 ${size + 4} ${size + 4}`}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={c1} />
            <stop offset="100%" stopColor={c2} />
          </linearGradient>
          <filter id={`glow${gradId}`}>
            <feGaussianBlur stdDeviation="2" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <g filter={`url(#glow${gradId})`}>
          {t === 'circle' && <circle cx={half} cy={half} r={half - sw} fill="none" stroke={`url(#${gradId})`} strokeWidth={sw} />}
          {t === 'square' && <rect x={sw} y={sw} width={size - sw * 2} height={size - sw * 2} rx="8" ry="8" fill="none" stroke={`url(#${gradId})`} strokeWidth={sw} />}
          {t === 'triangle' && <polygon points={`${half},${sw} ${size - sw},${size - sw} ${sw},${size - sw}`} fill="none" stroke={`url(#${gradId})`} strokeWidth={sw} />}
          {t === 'cross' && (
            <g stroke={`url(#${gradId})`} strokeWidth={sw}>
              <line x1={sw} y1={sw} x2={size - sw} y2={size - sw} />
              <line x1={size - sw} y1={sw} x2={sw} y2={size - sw} />
            </g>
          )}
        </g>
      </svg>
    </div>
  );
}
