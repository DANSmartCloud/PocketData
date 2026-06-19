import { useCallback } from 'react';
import { useUIStore, NotificationType } from '@/stores/uiStore';

export function useNotify() {
  const push = useUIStore(s => s.pushNotification);
  return useCallback((type: NotificationType, message: string, duration?: number) => {
    return push({ type, message, duration });
  }, [push]);
}

/**
 * 简单消息工具：始终使用应用内通知系统（非模态）。
 * 不阻塞用户操作，符合工业级软件习惯。
 */
export function useAlert() {
  const notify = useNotify();
  return useCallback(async (message: string, kind: 'info' | 'warning' | 'error' = 'info') => {
    const t = kind === 'error' ? 'error' : kind === 'warning' ? 'warning' : 'info';
    notify(t, message);
  }, [notify]);
}

/**
 * 简单确认工具：优先使用 Tauri 的原生 ask（如果可用）
 */
export function useConfirm() {
  return useCallback(async (message: string, title: string = '确认'): Promise<boolean> => {
    try {
      const { isTauri } = await import('@tauri-apps/api/core');
      if (await isTauri()) {
        const { ask } = await import('@tauri-apps/plugin-dialog');
        return await ask(message, { title, kind: 'info' });
      }
    } catch {}
    return window.confirm(message);
  }, []);
}

/**
 * 简单询问工具：使用浏览器 prompt（因为 Tauri 2.x 没有原生 prompt）
 */
export function usePrompt() {
  return useCallback(async (message: string, _title: string = '输入', defaultValue: string = ''): Promise<string | null> => {
    try {
      const { isTauri } = await import('@tauri-apps/api/core');
      if (await isTauri()) {
        // Tauri 2.x 没有原生 prompt，使用浏览器 prompt 作为降级
        return window.prompt(message, defaultValue);
      }
    } catch {}
    return window.prompt(message, defaultValue);
  }, []);
}
