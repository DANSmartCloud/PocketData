import { isTauri } from "@tauri-apps/api/core";
import { useFileStore, DTAFile, Variable, ScriptFile } from "@/stores/fileStore";
import { useUIStore } from "@/stores/uiStore";


async function parseExcelFromBackend(path: string): Promise<DTAFile> {
  const { invoke } = await import("@tauri-apps/api/core");
  
  const excelData = await invoke<any>("open_excel_file", { 
    path,
    sheetName: null
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

async function parseCSVFile(file: File): Promise<DTAFile> {
  let text = await file.text();

  if (text.charCodeAt(0) === 0xFEFF) {
    text = text.slice(1);
  }

  const lines = text.split(/\r?\n/).filter(line => line.trim());
  if (lines.length < 2) throw new Error("CSV 文件格式错误");

  const headers = lines[0].split(",").map(h => h.trim());
  const data: Record<string, unknown>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(",");
    const row: Record<string, unknown> = {};
    headers.forEach((header, idx) => {
      const value = values[idx]?.trim() || "";
      const num = Number(value);
      row[header] = isNaN(num) ? value : num;
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
  const headers = file.variables.map(v => v.name).join(",");
  const rows = file.data.map(row => {
    return file.variables.map(v => {
      const value = row[v.name];
      if (value === null || value === undefined) return "";
      const str = String(value);
      // 如果值包含逗号或引号，需要用引号包裹
      if (str.includes(",") || str.includes('"')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    }).join(",");
  });
  return [headers, ...rows].join("\n");
}

export function useFileOperations() {
  const { openFile, openScript } = useFileStore();

  const handleOpenFile = async () => {
    try {
      const tauriEnv = await isTauri();

      if (!tauriEnv) {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".dta,.csv,.xls,.xlsx,.do,.py";
        input.onchange = async (e) => {
          const file = (e.target as HTMLInputElement).files?.[0];
          if (!file) return;

          try {
            let dtaFile: DTAFile;

            if (file.name.endsWith(".csv")) {
              dtaFile = await parseCSVFile(file);
            } else {
              console.warn("Web 模式仅支持 CSV 文件。其他格式请使用桌面版本。");
              return;
            }

            openFile(dtaFile);
          } catch (error) {
            console.error("解析文件失败:", error);
            alert(`解析文件失败: ${error}`);
          }
        };
        input.click();
        return;
      }

      const { open } = await import("@tauri-apps/plugin-dialog");

      const selected = await open({
        multiple: false,
        filters: [
          { name: "Stata Data Files", extensions: ["dta"] },
          { name: "CSV Files", extensions: ["csv"] },
          { name: "Excel Files", extensions: ["xls", "xlsx"] },
          { name: "Stata Script Files", extensions: ["do"] },
          { name: "Python Script Files", extensions: ["py"] },
          { name: "All Files", extensions: ["*"] }
        ]
      });

      if (selected) {
        const path = typeof selected === 'string' ? selected : selected;
        const fileName = path.split(/[/\\]/).pop() || '';
        const extension = fileName.split('.').pop()?.toLowerCase();

        if (extension === 'do' || extension === 'py') {
          const scriptFile = await parseScriptFile(path, fileName);
          openScript(scriptFile);
          return;
        }

        let dtaFile: DTAFile;

        if (extension === 'csv') {
          const { readFile } = await import('@tauri-apps/plugin-fs');
          const fileData = await readFile(path);
          const text = new TextDecoder().decode(fileData);
          
          const blob = new Blob([text]);
          const file = new File([blob], fileName);
          dtaFile = await parseCSVFile(file);
        } else if (extension === 'dta') {
          const { invoke } = await import("@tauri-apps/api/core");
          dtaFile = await invoke("open_dta_file", { path });
          useUIStore.getState().setOperationMode('stata');
        } else if (extension === 'xls' || extension === 'xlsx') {
          dtaFile = await parseExcelFromBackend(path);
          useUIStore.getState().setOperationMode('excel');
        } else {
          alert(`不支持的文件格式: .${extension}`);
          return;
        }

        openFile(dtaFile);
      }
    } catch (error) {
      console.error("Failed to open file:", error);
      alert(`打开文件失败: ${error}`);
    }
  };

  const handleSaveFile = async () => {
    const tauriEnv = await isTauri();

    if (!tauriEnv) {
      alert("Web 模式下保存功能不可用，请使用桌面版本。");
      return;
    }

    const { getActiveFile, markFileClean } = useFileStore.getState();
    const currentFile = getActiveFile();
    if (!currentFile) return;

    try {
      const { save } = await import("@tauri-apps/plugin-dialog");

      const path = await save({
        filters: [
          { name: "Stata Data Files", extensions: ["dta"] }
        ],
        defaultPath: currentFile.name
      });

      if (path) {
        console.log("Saving to:", path);
        markFileClean(currentFile.id);
        alert("文件保存成功！");
      }
    } catch (error) {
      console.error("Failed to save file:", error);
      alert(`保存失败: ${error}`);
    }
  };

  const handleExportFile = async (format: 'csv' | 'dta' | 'xlsx') => {
    const { getActiveFile } = useFileStore.getState();
    const currentFile = getActiveFile();
    if (!currentFile) {
      alert("没有打开的文件");
      return;
    }

    try {
      const tauriEnv = await isTauri();

      if (!tauriEnv) {
        // Web 模式：直接下载 CSV
        if (format === 'csv') {
          const csv = convertToCSV(currentFile);
          const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
          const link = document.createElement('a');
          link.href = URL.createObjectURL(blob);
          link.download = currentFile.name.replace(/\.[^/.]+$/, '') + '.csv';
          link.click();
          URL.revokeObjectURL(link.href);
        } else {
          alert("Web 模式下仅支持导出 CSV 格式，请使用桌面版本导出其他格式。");
        }
        return;
      }

      // Tauri 模式
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
        if (format === 'csv') {
          const csv = convertToCSV(currentFile);
          const { writeTextFile } = await import('@tauri-apps/plugin-fs');
          await writeTextFile(path, csv);
        }
        alert(`导出成功: ${path}`);
      }
    } catch (error) {
      console.error("导出失败:", error);
      alert(`导出失败: ${error}`);
    }
  };

  const handleImportFile = async () => {
    await handleOpenFile();
  };

  return { handleOpenFile, handleSaveFile, handleExportFile, handleImportFile };
}
