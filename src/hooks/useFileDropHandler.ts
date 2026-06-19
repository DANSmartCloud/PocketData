import { useCallback } from 'react';
import { isTauri } from '@tauri-apps/api/core';
import { useFileStore, DTAFile, ScriptFile, MarkdownFile } from '@/stores/fileStore';
import { useUIStore } from '@/stores/uiStore';
import { useNotify } from '@/hooks/useNotify';

const SUPPORTED_EXTS = ['dta', 'csv', 'tsv', 'txt', 'xls', 'xlsx', 'do', 'py', 'json', 'md', 'markdown', 'sav', 'rdata', 'sas7bdat'] as const;
type SupportedExt = typeof SUPPORTED_EXTS[number];

function getExt(name: string): string {
  return (name.split('.').pop() ?? '').toLowerCase();
}

function isSupported(name: string): boolean {
  return SUPPORTED_EXTS.includes(getExt(name) as SupportedExt);
}

async function parseCSVText(text: string, fileName: string, sourcePath?: string): Promise<DTAFile> {
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  const parseCsvLine = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (inQuotes) {
        if (c === '"') {
          if (line[i + 1] === '"') { current += '"'; i++; }
          else inQuotes = false;
        } else current += c;
      } else {
        if (c === '"') inQuotes = true;
        else if (c === ',') { result.push(current); current = ''; }
        else current += c;
      }
    }
    result.push(current);
    return result;
  };
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 1) throw new Error('CSV 文件为空');
  const headers = parseCsvLine(lines[0]).map(h => h.trim());
  const data: Record<string, unknown>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]);
    const row: Record<string, unknown> = {};
    headers.forEach((h, idx) => {
      const v = (values[idx] ?? '').trim();
      row[h] = v !== '' && /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v;
    });
    data.push(row);
  }
  return {
    id: `csv_${Date.now()}`,
    path: sourcePath ?? fileName,
    name: fileName,
    version: 0,
    nvar: headers.length,
    nobs: data.length,
    variables: headers.map(name => ({ name, type: 'string' as const, label: name })),
    data,
    valueLabels: {},
    timestamp: new Date().toISOString().split('T')[0],
    label: fileName,
    isDirty: false
  };
}

async function readDtaFileFromPath(path: string): Promise<DTAFile> {
  const { invoke } = await import('@tauri-apps/api/core');
  return await invoke<DTAFile>('open_dta_file', { path });
}

async function readExcelFileFromPath(path: string): Promise<DTAFile> {
  const { invoke } = await import('@tauri-apps/api/core');
  const excelData: any = await invoke('open_excel_file', { path, sheetName: null });
  const headers = excelData.headers as string[];
  const rawData = excelData.data as any[][];
  const variables = headers.map((name, idx) => ({
    name: name || `Column_${idx + 1}`,
    type: 'string' as const,
    label: name || `Column_${idx + 1}`
  }));
  const data: Record<string, unknown>[] = rawData.map((row) => {
    const record: Record<string, unknown> = {};
    headers.forEach((header, idx) => {
      const v = row[idx];
      record[header || `Column_${idx + 1}`] = v === null || v === undefined ? '' : v;
    });
    return record;
  });
  return {
    id: `excel_${Date.now()}`,
    path: excelData.path as string,
    name: excelData.name as string,
    version: 0,
    nvar: variables.length,
    nobs: data.length,
    variables,
    data,
    valueLabels: {},
    timestamp: new Date().toISOString().split('T')[0],
    label: excelData.name as string,
    isDirty: false
  };
}

async function readScriptFileFromPath(path: string, fileName: string): Promise<ScriptFile> {
  const { readFile } = await import('@tauri-apps/plugin-fs');
  const text = new TextDecoder().decode(await readFile(path));
  const ext = getExt(fileName);
  return {
    id: `script_${Date.now()}`,
    path,
    name: fileName,
    content: text,
    language: ext === 'py' ? 'python' : 'stata',
    isDirty: false
  };
}

async function readMarkdownFileFromPath(path: string, fileName: string): Promise<MarkdownFile> {
  const { readTextFile } = await import('@tauri-apps/plugin-fs');
  const text = await readTextFile(path);
  return {
    id: `md_${Date.now()}`,
    path,
    name: fileName,
    content: text,
    isDirty: false
  };
}

async function readJsonFileFromPath(path: string, fileName: string): Promise<DTAFile> {
  const { readTextFile } = await import('@tauri-apps/plugin-fs');
  const text = await readTextFile(path);
  const parsed = JSON.parse(text);
  if (!Array.isArray(parsed)) throw new Error('JSON 必须是对象数组');
  const headers = parsed.length > 0 ? Object.keys(parsed[0]) : [];
  return {
    id: `json_${Date.now()}`,
    path,
    name: fileName,
    version: 0,
    nvar: headers.length,
    nobs: parsed.length,
    variables: headers.map(h => ({ name: h, type: 'string' as const, label: h })),
    data: parsed.map(row => {
      const out: Record<string, unknown> = {};
      headers.forEach(h => { out[h] = row[h] ?? ''; });
      return out;
    }),
    valueLabels: {},
    timestamp: new Date().toISOString().split('T')[0],
    label: fileName,
    isDirty: false
  };
}

/**
 * 处理拖拽 / drop 到应用的文件
 * 支持：
 *  - 来自操作系统的本地文件拖拽（File API + Tauri）
 *  - 来自 Tauri 文件系统拖拽（带有 path 的 TauriFile）
 */
export function useFileDropHandler() {
  const { openFile, openScript, openMarkdown } = useFileStore();
  const setOperationMode = useUIStore(s => s.setOperationMode);
  const notify = useNotify();

  const handleTauriDrop = useCallback(async (paths: string[]) => {
    for (const path of paths) {
      const fileName = path.split(/[/\\]/).pop() || path;
      const ext = getExt(fileName);
      if (!isSupported(fileName)) {
        console.warn('[drop] 不支持的文件类型:', fileName);
        continue;
      }
      try {
        if (ext === 'do' || ext === 'py') {
          openScript(await readScriptFileFromPath(path, fileName));
        } else if (ext === 'md' || ext === 'markdown') {
          openMarkdown(await readMarkdownFileFromPath(path, fileName));
        } else if (ext === 'dta') {
          openFile(await readDtaFileFromPath(path));
          setOperationMode('stata');
        } else if (ext === 'xls' || ext === 'xlsx') {
          openFile(await readExcelFileFromPath(path));
          setOperationMode('excel');
        } else if (ext === 'csv' || ext === 'tsv' || ext === 'txt') {
          const { readTextFile } = await import('@tauri-apps/plugin-fs');
          const text = await readTextFile(path);
          openFile(await parseCSVText(text, fileName, path));
        } else if (ext === 'json') {
          openFile(await readJsonFileFromPath(path, fileName));
        } else {
          console.warn('[drop] 暂不支持的格式:', ext);
        }
      } catch (err) {
        console.error('[drop] 打开文件失败:', err);
      }
    }
  }, [openFile, openScript, openMarkdown, setOperationMode]);

  const handleWebDrop = useCallback(async (files: FileList | File[]) => {
    const list = Array.from(files);
    for (const file of list) {
      if (!isSupported(file.name)) {
        console.warn('[drop] 不支持的文件类型:', file.name);
        continue;
      }
      try {
        const ext = getExt(file.name);
        if (ext === 'csv' || ext === 'tsv' || ext === 'txt') {
          const text = await file.text();
          openFile(await parseCSVText(text, file.name));
        } else {
          notify('warning', `Web 模式仅支持 CSV/TSV/TXT 文件。${ext.toUpperCase()} 文件请使用桌面版本。`);
        }
      } catch (err) {
        console.error('[drop] 解析文件失败:', err);
      }
    }
  }, [openFile]);

  /**
   * 通用 drop 入口
   * - 在 Tauri 环境中优先使用 Tauri 拖放事件
   * - 回退到浏览器 HTML5 drop
   */
  const handleDrop = useCallback(async (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!e.dataTransfer) return;

    let tauri = false;
    try {
      tauri = await isTauri();
    } catch {
      tauri = false;
    }
    if (tauri) {
      // Tauri 拖放：files 可能带有 path 属性
      const files = Array.from(e.dataTransfer.files || []);
      const paths = files
        .map((f: any) => f.path)
        .filter((p): p is string => typeof p === 'string' && p.length > 0);
      if (paths.length > 0) {
        await handleTauriDrop(paths);
        return;
      }
    }
    await handleWebDrop(e.dataTransfer.files);
  }, [handleTauriDrop, handleWebDrop]);

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'copy';
    }
  }, []);

  return { handleDrop, handleDragOver };
}

// 导出底层工具供 App.tsx 的原生 Tauri 拖放监听使用
export {
  parseCSVText,
  readDtaFileFromPath,
  readExcelFileFromPath,
  readScriptFileFromPath,
  readMarkdownFileFromPath,
  readJsonFileFromPath,
  isSupported as isSupportedExt
};
