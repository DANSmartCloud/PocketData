import { useCallback } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { useFileStore, DTAFile, Variable, ScriptFile, MarkdownFile } from "@/stores/fileStore";
import { useProjectStore, ProjectFileNode } from "@/stores/projectStore";
import { useNotify } from "@/hooks/useNotify";


async function parseExcelFromBackend(path: string, sheetName?: string | null): Promise<DTAFile> {
  const { invoke } = await import("@tauri-apps/api/core");

  const excelData = await invoke<any>("open_excel_file", {
    path,
    sheetName: sheetName ?? null
  });

  const headers = excelData.headers as string[];
  const rawData = excelData.data as any[][];

  const variables: Variable[] = headers.map((name, idx) => ({
    name: name || `Column_${idx + 1}`,
    type: "string" as const,
    label: name || `Column_${idx + 1}`
  }));

  const data: Record<string, unknown>[] = rawData.map((row) => {
    const record: Record<string, unknown> = {};
    headers.forEach((header, idx) => {
      const value = row[idx];
      record[header || `Column_${idx + 1}`] = value === null || value === undefined ? "" : value;
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
    timestamp: new Date().toISOString().split("T")[0],
    label: excelData.name as string,
    isDirty: false
  };
}

async function parseScriptFile(path: string, fileName: string): Promise<ScriptFile> {
  const { readFile } = await import('@tauri-apps/plugin-fs');
  const fileData = await readFile(path);
  const text = new TextDecoder().decode(fileData);

  const extension = fileName.split('.').pop()?.toLowerCase();
  const language = extension === 'py' ? 'python' : 'stata';

  return {
    id: `script_${Date.now()}`,
    path,
    name: fileName,
    content: text,
    language,
    isDirty: false
  };
}

async function parseMarkdownFile(path: string, fileName: string): Promise<MarkdownFile> {
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

/**
 * 保存 Markdown 文件到 Tauri 端。
 */
async function saveMarkdownFile(path: string, content: string): Promise<void> {
  const { writeTextFile } = await import('@tauri-apps/plugin-fs');
  await writeTextFile(path, content);
}

async function parseCSVFile(file: File): Promise<DTAFile> {
  let text = await file.text();

  if (text.charCodeAt(0) === 0xFEFF) {
    text = text.slice(1);
  }

  // 简单的 CSV 解析：支持双引号包裹、转义双引号、CRLF
  const parseCsvLine = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (inQuotes) {
        if (c === '"') {
          if (line[i + 1] === '"') {
            current += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          current += c;
        }
      } else {
        if (c === '"') {
          inQuotes = true;
        } else if (c === ',') {
          result.push(current);
          current = '';
        } else {
          current += c;
        }
      }
    }
    result.push(current);
    return result;
  };

  const lines = text.split(/\r?\n/).filter(line => line.trim());
  if (lines.length < 2) throw new Error("CSV 文件格式错误：至少需要表头和一行数据");

  const headers = parseCsvLine(lines[0]).map(h => h.trim());
  const data: Record<string, unknown>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]);
    const row: Record<string, unknown> = {};
    headers.forEach((header, idx) => {
      const value = (values[idx] ?? "").trim();
      // 仅当字段在 1-15 位数字字符内才尝试转换为数字
      if (value !== "" && /^-?\d+(\.\d+)?$/.test(value)) {
        row[header] = Number(value);
      } else {
        row[header] = value;
      }
    });
    data.push(row);
  }

  const variables = headers.map(name => ({
    name,
    type: "string" as const,
    label: name
  }));

  return {
    id: `csv_${Date.now()}`,
    path: file.name,
    name: file.name,
    version: 0,
    nvar: variables.length,
    nobs: data.length,
    variables,
    data,
    valueLabels: {},
    timestamp: new Date().toISOString().split("T")[0],
    label: file.name,
    isDirty: false
  };
}

function convertToCSV(file: DTAFile): string {
  const escape = (v: unknown): string => {
    if (v === null || v === undefined) return "";
    const str = String(v);
    if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };
  const headers = file.variables.map(v => v.name).join(",");
  const rows = file.data.map(row =>
    file.variables.map(v => escape(row[v.name])).join(",")
  );
  return [headers, ...rows].join("\n");
}

// 新增：保存文件到 Tauri 端 (DTA)
async function saveDtaFile(path: string, file: DTAFile): Promise<void> {
  const { invoke } = await import("@tauri-apps/api/core");
  // 将前端 Record<string, unknown>[] 转换为后端 Vec<Vec<Value>>（行优先）
  const data2d = file.data.map(row =>
    file.variables.map(v => {
      const value = row[v.name];
      if (value === null || value === undefined) return null;
      if (typeof value === 'number') return value;
      if (typeof value === 'boolean') return value;
      return String(value);
    })
  );
  // 将前端的 variables（type 字段）转换为后端变量（vtype 字段）
  const variables = file.variables.map(v => ({
    name: v.name,
    vtype: v.type ?? 'str244',
    label: v.label ?? null,
    format: v.format ?? null,
    value_label: v.valueLabel ?? null,
  }));
  // 转换 valueLabels（前端用 string key，后端用 string key，但值是 number->string）
  const valueLabels: Record<string, Record<number, string>> = {};
  for (const [k, v] of Object.entries(file.valueLabels ?? {})) {
    const numMap: Record<number, string> = {};
    for (const [key, val] of Object.entries(v)) {
      const n = Number(key);
      if (!Number.isNaN(n)) numMap[n] = String(val);
    }
    valueLabels[k] = numMap;
  }
  await invoke("save_dta_file", {
    path,
    file: {
      path: file.path,
      name: file.name,
      version: file.version,
      nvar: file.nvar,
      nobs: file.nobs,
      variables,
      data: data2d,
      valueLabels,
      label: file.label ?? null,
      timestamp: file.timestamp ?? null,
    }
  });
}

// 新增：保存文件到 Tauri 端 (XLSX)
async function saveXlsxFile(path: string, file: DTAFile): Promise<void> {
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("save_xlsx_file", {
    path,
    file: {
      name: file.name,
      variables: file.variables.map(v => v.name),
      data: file.data.map(row =>
        file.variables.map(v => {
          const value = row[v.name];
          return value === null || value === undefined ? "" : value;
        })
      )
    }
  });
}

// 统一支持的文件筛选器列表（顺序：默认第一项 = "所有支持的文件"）
const FILE_FILTERS = [
  { name: "所有支持的文件", extensions: ["dta", "csv", "xls", "xlsx", "do", "py", "txt", "tsv", "json", "md", "markdown", "sav", "rdata", "sas7bdat"] },
  { name: "Stata 数据文件", extensions: ["dta"] },
  { name: "CSV / TSV / TXT", extensions: ["csv", "tsv", "txt"] },
  { name: "Excel 文件", extensions: ["xls", "xlsx"] },
  { name: "SPSS / R / SAS", extensions: ["sav", "rdata", "sas7bdat"] },
  { name: "Stata 脚本", extensions: ["do"] },
  { name: "Python 脚本", extensions: ["py"] },
  { name: "Markdown 文档", extensions: ["md", "markdown"] },
  { name: "所有文件", extensions: ["*"] }
];

/**
 * 内部工具：根据已知的 path + extension 打开文件（不做对话框）。
 * 抽出来供 openProjectFile / handleOpenFile 共用。
 */
async function openFileByPath(path: string, fileName: string, extension: string): Promise<string | null> {
  const { invoke } = await import("@tauri-apps/api/core");
  const { readFile, readTextFile } = await import('@tauri-apps/plugin-fs');
  const { useFileStore } = await import('@/stores/fileStore');
  const { useUIStore } = await import('@/stores/uiStore');
  const { openFile, openScript, openMarkdown } = useFileStore.getState();

  if (extension === 'do' || extension === 'py') {
    const scriptFile = await parseScriptFile(path, fileName);
    openScript(scriptFile);
    return `script:${scriptFile.id}`;
  }

  if (extension === 'md' || extension === 'markdown') {
    const mdFile = await parseMarkdownFile(path, fileName);
    openMarkdown(mdFile);
    return `markdown:${mdFile.id}`;
  }

  let dtaFile: DTAFile;

  if (extension === 'csv' || extension === 'tsv' || extension === 'txt') {
    const fileData = await readFile(path);
    const text = new TextDecoder().decode(fileData);
    const blob = new Blob([text]);
    const file = new File([blob], fileName);
    dtaFile = await parseCSVFile(file);
    // 修复：parseCSVFile 内部用 file.name 作为 path（仅文件名），
    // 此处用完整绝对路径覆盖，确保文件树高亮、activateTabByPath 等逻辑正常工作
    dtaFile.path = path;
  } else if (extension === 'dta') {
    dtaFile = await invoke("open_dta_file", { path });
    useUIStore.getState().setOperationMode('stata');
  } else if (extension === 'xls' || extension === 'xlsx') {
    dtaFile = await parseExcelFromBackend(path, null);
    useUIStore.getState().setOperationMode('excel');
  } else if (extension === 'json') {
    const text = await readTextFile(path);
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) {
      throw new Error("JSON 必须是对象数组");
    }
    const headers = parsed.length > 0 ? Object.keys(parsed[0]) : [];
    dtaFile = {
      id: `json_${Date.now()}`,
      path,
      name: fileName,
      version: 0,
      nvar: headers.length,
      nobs: parsed.length,
      variables: headers.map(h => ({ name: h, type: "string" as const, label: h })),
      data: parsed.map(row => {
        const out: Record<string, unknown> = {};
        headers.forEach(h => { out[h] = row[h] ?? ""; });
        return out;
      }),
      valueLabels: {},
      timestamp: new Date().toISOString().split("T")[0],
      label: fileName,
      isDirty: false
    };
  } else {
    return null; // 暂不支持
  }

  openFile(dtaFile);
  return `data:${dtaFile.id}`;
}

export function useFileOperations() {
  const { openFile, markFileClean, getActiveMarkdown, markMarkdownClean } = useFileStore();
  const notify = useNotify();

  /**
   * 保存当前活动的 Markdown 文件。
   * 若文件路径有效（已存在）则直接写回，否则弹出保存对话框。
   */
  const handleSaveMarkdown = useCallback(async (content: string) => {
    try {
      const tauriEnv = await isTauri();
      if (!tauriEnv) {
        notify('warning', "Web 模式下保存功能不可用，请使用桌面版本。");
        return;
      }
      const md = getActiveMarkdown();
      if (!md) {
        notify('warning', "没有打开的 Markdown 文件");
        return;
      }
      if (md.path && !md.path.startsWith('md_') && !md.path.startsWith('debug_')) {
        // 直接写回
        await saveMarkdownFile(md.path, content);
        markMarkdownClean(md.id);
        notify('success', `文件已保存: ${md.path}`);
      } else {
        // 弹保存对话框
        const { save } = await import("@tauri-apps/plugin-dialog");
        const path = await save({
          filters: [
            { name: "Markdown Files", extensions: ["md", "markdown"] }
          ],
          defaultPath: (md.name || 'untitled').replace(/\.[^/.]+$/, '') + '.md'
        });
        if (!path) return;
        await saveMarkdownFile(path, content);
        notify('success', `文件已保存: ${path}`);
      }
    } catch (err) {
      console.error('Failed to save markdown:', err);
      notify('error', `保存失败: ${err}`);
    }
  }, [getActiveMarkdown, markMarkdownClean, notify]);

  /**
   * 在已打开项目中双击文件节点时调用。
   * 根据扩展名分派到不同的打开方式（数据文件 -> 新标签页，脚本 -> 编辑器）。
   */
  const openProjectFile = useCallback(async (path: string) => {
    const fileName = path.split(/[/\\]/).pop() || '';
    const extension = (fileName.split('.').pop() ?? '').toLowerCase();
    try {
      const result = await openFileByPath(path, fileName, extension);
      if (result === null) {
        notify('warning', `暂不支持直接打开 .${extension} 格式。请先在外部工具中转换为 CSV / DTA / Excel 后再打开。`);
      }
    } catch (error) {
      console.error("Failed to open project file:", error);
      notify('error', `打开文件失败: ${error}`);
    }
  }, []);

  const handleOpenFile = async () => {
    try {
      const tauriEnv = await isTauri();

      if (!tauriEnv) {
        // Web fallback：使用 input[type=file]，accept 与筛选器保持一致
        const input = document.createElement("input");
        input.type = "file";
        input.accept = FILE_FILTERS
          .filter(f => !f.extensions.includes("*"))
          .map(f => f.extensions.map(ext => `.${ext}`).join(","))
          .join(",");
        input.onchange = async (e) => {
          const file = (e.target as HTMLInputElement).files?.[0];
          if (!file) return;

          try {
            const ext = (file.name.split('.').pop() ?? '').toLowerCase();
            if (ext === "csv" || ext === "tsv" || ext === "txt") {
              const dtaFile = await parseCSVFile(file);
              openFile(dtaFile);
            } else {
              notify('warning', `Web 模式仅支持 CSV/TSV/TXT 文件。${ext.toUpperCase()} 文件请使用桌面版本。`);
            }
          } catch (error) {
            console.error("解析文件失败:", error);
            notify('error', `解析文件失败: ${error}`);
          }
        };
        input.click();
        return;
      }

      // Tauri：使用 @tauri-apps/plugin-dialog
      const { open } = await import("@tauri-apps/plugin-dialog");

      const selected = await open({
        multiple: false,
        directory: false,
        filters: FILE_FILTERS,
        title: "打开文件"
      });

      if (selected) {
        const path = typeof selected === 'string' ? selected : selected;
        const fileName = path.split(/[/\\]/).pop() || '';
        const extension = fileName.split('.').pop()?.toLowerCase();
        if (!extension) {
          notify('warning', "无法识别文件扩展名");
          return;
        }
        const result = await openFileByPath(path, fileName, extension);
        if (result === null) {
          notify('warning', `暂不支持直接打开 .${extension} 格式。请先在外部工具中转换为 CSV / DTA / Excel 后再打开。`);
        }
      }
    } catch (error) {
      console.error("Failed to open file:", error);
      notify('error', `打开文件失败: ${error}`);
    }
  };

  const handleSaveFile = async (forceSaveAs: boolean = false) => {
    const tauriEnv = await isTauri();

    if (!tauriEnv) {
      notify('warning', "Web 模式下保存功能不可用，请使用桌面版本。");
      return;
    }

    const { getActiveFile } = useFileStore.getState();
    const currentFile = getActiveFile();
    if (!currentFile) return;

    try {
      const { save } = await import("@tauri-apps/plugin-dialog");

      // 推断默认扩展名
      const originalExt = (currentFile.name.split('.').pop() ?? '').toLowerCase();
      const defaultExt = ["dta", "xls", "xlsx"].includes(originalExt) ? originalExt : "dta";

      // 如果是「另存为」或文件从未保存过，弹保存对话框
      const hasRealPath = currentFile.path && !currentFile.path.startsWith("debug_") && !currentFile.id.startsWith("csv_") && !currentFile.id.startsWith("json_");
      if (forceSaveAs || !hasRealPath) {
        const path = await save({
          filters: [
            { name: "Stata Data Files", extensions: ["dta"] },
            { name: "Excel Files", extensions: ["xlsx"] },
            { name: "CSV Files", extensions: ["csv"] },
            { name: "All Files", extensions: ["*"] }
          ],
          defaultPath: currentFile.name.replace(/\.[^/.]+$/, '') + '.' + defaultExt
        });
        if (!path) return;
        await writeFileToPath(path, currentFile);
        useFileStore.getState().updateFilePath?.(currentFile.id, path);
        markFileClean(currentFile.id);
        notify('success', `文件已保存: ${path}`);
      } else {
        // 直接写回原路径
        await writeFileToPath(currentFile.path, currentFile);
        markFileClean(currentFile.id);
        notify('success', `文件已保存: ${currentFile.path}`);
      }
    } catch (error) {
      console.error("Failed to save file:", error);
      notify('error', `保存失败: ${error}`);
    }
  };

  // 实际写文件
  async function writeFileToPath(path: string, file: DTAFile): Promise<void> {
    const ext = (path.split('.').pop() ?? '').toLowerCase();
    if (ext === 'dta') {
      await saveDtaFile(path, file);
    } else if (ext === 'xlsx' || ext === 'xls') {
      await saveXlsxFile(path, file);
    } else if (ext === 'csv' || ext === 'tsv' || ext === 'txt') {
      const csv = convertToCSV(file);
      const { writeTextFile } = await import('@tauri-apps/plugin-fs');
      await writeTextFile(path, csv);
    } else {
      throw new Error(`不支持的导出格式: .${ext}`);
    }
  }

  const handleExportFile = async (format: 'csv' | 'dta' | 'xlsx') => {
    const { getActiveFile } = useFileStore.getState();
    const currentFile = getActiveFile();
    if (!currentFile) {
      notify('warning', "没有打开的文件");
      return;
    }

    try {
      const tauriEnv = await isTauri();

      if (!tauriEnv) {
        if (format === 'csv') {
          const csv = convertToCSV(currentFile);
          const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
          const link = document.createElement('a');
          link.href = URL.createObjectURL(blob);
          link.download = currentFile.name.replace(/\.[^/.]+$/, '') + '.csv';
          link.click();
          URL.revokeObjectURL(link.href);
        } else {
          notify('warning', "Web 模式下仅支持导出 CSV 格式，请使用桌面版本导出其他格式。");
        }
        return;
      }

      const { save } = await import("@tauri-apps/plugin-dialog");
      const extensions: Record<string, string[]> = {
        csv: ['csv'],
        dta: ['dta'],
        xlsx: ['xlsx']
      };

      const path = await save({
        filters: [
          { name: format.toUpperCase() + " Files", extensions: extensions[format] }
        ],
        defaultPath: currentFile.name.replace(/\.[^/.]+$/, '') + '.' + format
      });

      if (path) {
        await writeFileToPath(path, currentFile);
        notify('success', `导出成功: ${path}`);
      }
    } catch (error) {
      console.error("导出失败:", error);
      notify('error', `导出失败: ${error}`);
    }
  };

  const handleImportFile = async () => {
    await handleOpenFile();
  };

  // 退出应用
  const handleExitApp = async () => {
    const tauriEnv = await isTauri();
    if (!tauriEnv) {
      notify('warning', "Web 模式下无法退出应用。");
      return;
    }
    // 检查是否有未保存的文件
    const { files } = useFileStore.getState();
    const dirtyCount = Object.values(files).filter(f => f.isDirty).length;
    if (dirtyCount > 0) {
      const { ask } = await import("@tauri-apps/plugin-dialog");
      const confirmed = await ask(`有 ${dirtyCount} 个文件未保存，确定要退出吗？`, {
        title: "未保存的更改",
        kind: "warning"
      });
      if (!confirmed) return;
    }
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("exit_app");
  };

  // 打开项目：选择目录 -> 读取文件树 -> 写入 projectStore
  const handleOpenProject = async () => {
    try {
      const tauriEnv = await isTauri();
      if (!tauriEnv) {
        notify('warning', "Web 模式下无法打开项目，请使用桌面版本。");
        return;
      }

      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({
        multiple: false,
        directory: true,
        title: "选择项目根目录"
      });

      if (!selected) return;

      const path = typeof selected === 'string' ? selected : (selected as any).path;
      if (!path) return;

      await loadProjectFromPath(path);
    } catch (error) {
      console.error("Failed to open project:", error);
      notify('error', `打开项目失败: ${error}`);
    }
  };

  // 关闭项目
  const handleCloseProject = () => {
    useProjectStore.getState().closeProject();
  };

  // 重新加载最近项目
  const handleOpenRecentProject = async (rootPath: string) => {
    try {
      const tauriEnv = await isTauri();
      if (!tauriEnv) {
        notify('warning', "Web 模式下无法打开项目，请使用桌面版本。");
        return;
      }
      await loadProjectFromPath(rootPath);
    } catch (error) {
      console.error("Failed to open recent project:", error);
      notify('error', `打开最近项目失败: ${error}`);
    }
  };

  // 内部：读取文件树并写入 projectStore
  async function loadProjectFromPath(path: string): Promise<void> {
    const { invoke } = await import("@tauri-apps/api/core");
    const tree = await invoke<ProjectFileNode>('read_project_tree', { path });
    const name = tree.name;
    useProjectStore.getState().openProject(path, name, tree);
  }

  return {
    handleOpenFile, handleSaveFile, handleSaveMarkdown, handleExportFile, handleImportFile, handleExitApp,
    openProjectFile,
    handleOpenProject, handleCloseProject, handleOpenRecentProject
  };
}
