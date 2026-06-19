import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import App from "./App";
import { AboutPage } from "./pages/AboutPage";
import { clearDebugCache } from "./utils/clearDebugCache";
import "./styles/global.css";

// 启动时清除 debug 缓存（仅 Vite dev 模式或 ?cleardebug=1 时生效）
clearDebugCache();

// 检测是否为拖拽预览模式
const isDragPreview = typeof window !== 'undefined' 
  && new URLSearchParams(window.location.search).get('dragpreview') === 'true';

if (isDragPreview) {
  // 拖拽预览模式：只渲染极简内容，不走 React Router
  const params = new URLSearchParams(window.location.search);
  const title = params.get('title') || 'Drag Preview';
  const w = parseInt(params.get('w') || '150');
  const h = parseInt(params.get('h') || '32');
  
  // 监听徽章模式变化
  let currentBadge = params.get('badge') || 'none';
  let badgeText = currentBadge === 'reorder' ? '易序' : currentBadge === 'new-window' ? '新窗口' : null;
  let badgeBg = currentBadge === 'reorder' ? '#f59e0b' : '#3b82f6';
  
  document.body.style.background = '#ffffff';
  document.body.style.margin = '0';
  document.body.style.padding = '0';
  document.body.style.overflow = 'hidden';
  
  const rootEl = document.getElementById("root") as HTMLElement;
  
  const render = () => {
    ReactDOM.createRoot(rootEl).render(
      <div style={{
        width: `${w}px`,
        height: `${h}px`,
        background: '#ffffff',
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        fontSize: 12,
        fontWeight: 500,
        color: '#334155',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        pointerEvents: 'none',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        overflow: 'hidden',
        whiteSpace: 'nowrap',
        padding: '0 8px 0 6px',
      }}>
        <svg width={16} height={16} viewBox="0 0 174.55 182.43" style={{ flexShrink: 0 }}>
          <polyline points="158.13 60.75 85.21 102.87 43.09 29.95" fill="none" stroke="#3b82f6" strokeLinecap="round" strokeLinejoin="round" strokeWidth="10" />
          <path d="M59.75,17.64C35.13,26.41,15.09,46.72,7.82,73.88c-11.75,43.88,14.3,88.98,58.19,100.73,43.88,11.75,88.98-14.3,100.73-58.19,7.46-27.85-.33-56.18-18.22-76.17" fill="none" stroke="#3b82f6" strokeLinecap="round" strokeLinejoin="round" strokeWidth="10" />
          <line x1="80.99" y1="48.05" x2="96.25" y2="74.36" fill="none" stroke="#3b82f6" strokeLinecap="round" strokeLinejoin="round" strokeWidth="10" />
          <line x1="78.47" y1="5" x2="113.04" y2="64.62" fill="none" stroke="#3b82f6" strokeLinecap="round" strokeLinejoin="round" strokeWidth="10" />
          <line x1="104.06" y1="8.32" x2="130.76" y2="54.35" fill="none" stroke="#3b82f6" strokeLinecap="round" strokeLinejoin="round" strokeWidth="10" />
        </svg>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', flex: 1, lineHeight: '1' }}>{title}</span>
        {badgeText && (
          <div style={{
            marginLeft: '4px',
            padding: '1px 5px',
            background: badgeBg,
            color: 'white',
            borderRadius: 3,
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: '0.5px',
            flexShrink: 0,
          }}>{badgeText}</div>
        )}
      </div>
    );
  };
  
  render();
  
  // 监听徽章变化
  import('@tauri-apps/api/event').then(({ listen }) => {
    listen<string>('dragpreview:badge', (event) => {
      currentBadge = event.payload;
      badgeText = currentBadge === 'reorder' ? '易序' : currentBadge === 'new-window' ? '新窗口' : null;
      badgeBg = currentBadge === 'reorder' ? '#f59e0b' : '#3b82f6';
      render();
    }).catch(() => {});
  }).catch(() => {});
} else {
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<App />} />
          <Route path="/about" element={<AboutPage />} />
        </Routes>
      </BrowserRouter>
    </React.StrictMode>
  );
}
