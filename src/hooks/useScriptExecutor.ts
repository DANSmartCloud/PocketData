import { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';

export type ScriptLanguage = 'stata' | 'python';

export interface ScriptOutputLine {
  stream: 'stdout' | 'stderr' | 'system';
  text: string;
}

export interface UseScriptExecutorResult {
  isReady: boolean;
  isExecuting: boolean;
  output: ScriptOutputLine[];
  error: string | null;
  executionTimeMs: number | null;
  exitCode: number | null;
  execute: (code: string, language: ScriptLanguage) => Promise<void>;
  cancel: () => Promise<void>;
  clear: () => void;
}

interface ExecutionResult {
  success: boolean;
  output: string;
  error: string;
  execution_time_ms: number;
  exit_code: number;
  session_id: string;
}

function appendLines(target: ScriptOutputLine[], text: string, stream: 'stdout' | 'stderr' | 'system') {
  if (!text) return;
  // 按行切分，保留原始行
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    if (line === '' && lines.length > 1 && lines[lines.length - 1] === '') continue;
    target.push({ stream, text: line });
  }
}

/**
 * 跨平台脚本执行 hook
 * - Stata：通过内置解释器解析（如果系统未安装 Stata）或调用外部 stata
 * - Python：通过 python3 / python 解释器
 * 替代原先在 Windows 上调用 PowerShell 的实现
 */
export function useScriptExecutor(language: ScriptLanguage = 'stata'): UseScriptExecutorResult {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [output, setOutput] = useState<ScriptOutputLine[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [executionTimeMs, setExecutionTimeMs] = useState<number | null>(null);
  const [exitCode, setExitCode] = useState<number | null>(null);
  const sessionIdRef = useRef<string | null>(null);

  // 创建会话（仅一次）
  useEffect(() => {
    let cancelled = false;
    const create = async () => {
      try {
        const id = await invoke<string>('create_script_session', { scriptType: language });
        if (cancelled) return;
        sessionIdRef.current = id;
        setSessionId(id);
      } catch (err) {
        console.warn('useScriptExecutor: failed to create session', err);
        // 即使失败也不阻塞 UI，execute 时会再次检查
      }
    };
    create();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language]);

  const execute = useCallback(async (code: string, lang: ScriptLanguage) => {
    // 懒创建会话（如果之前失败）
    let sid = sessionIdRef.current;
    if (!sid) {
      try {
        sid = await invoke<string>('create_script_session', { scriptType: lang });
        sessionIdRef.current = sid;
        setSessionId(sid);
      } catch (err) {
        setError('无法创建脚本执行会话: ' + String(err));
        return;
      }
    }

    setIsExecuting(true);
    setError(null);
    setExecutionTimeMs(null);
    setExitCode(null);
    setOutput([{ stream: 'system', text: `执行 ${lang === 'stata' ? 'Stata' : 'Python'} 脚本...` }]);

    try {
      let result: ExecutionResult;
      if (lang === 'stata') {
        result = await invoke<ExecutionResult>('execute_do_content', {
          sessionId: sid,
          doContent: code
        });
      } else {
        result = await invoke<ExecutionResult>('execute_python_script', {
          sessionId: sid,
          scriptPath: null,
          scriptContent: code,
          workingDir: null
        });
      }

      setOutput(prev => {
        const next = [...prev];
        appendLines(next, result.output || '', 'stdout');
        appendLines(next, result.error || '', 'stderr');
        return next;
      });
      setExecutionTimeMs(result.execution_time_ms);
      setExitCode(result.exit_code);
      if (!result.success) {
        setError(result.error || '脚本执行失败');
      }
    } catch (err) {
      const message = String(err);
      setError(message);
      setOutput(prev => [...prev, { stream: 'stderr', text: message }]);
    } finally {
      setIsExecuting(false);
    }
  }, []);

  const cancel = useCallback(async () => {
    const sid = sessionIdRef.current;
    if (!sid) return;
    try {
      await invoke('stop_session', { sessionId: sid });
    } catch (err) {
      console.warn('Failed to stop session:', err);
    }
    setIsExecuting(false);
  }, []);

  const clear = useCallback(() => {
    setOutput([]);
    setError(null);
    setExecutionTimeMs(null);
    setExitCode(null);
  }, []);

  return {
    isReady: sessionId !== null,
    isExecuting,
    output,
    error,
    executionTimeMs,
    exitCode,
    execute,
    cancel,
    clear
  };
}
