import { isTauri } from "@tauri-apps/api/core";
import { useFileStore, DTAFile } from "@/stores/fileStore";
import { sampleData, sampleVariables } from "@/utils/sampleData";

const sampleFile: DTAFile = {
  id: "sample_1",
  path: "sample_data.dta",
  name: "sample_data.dta",
  version: 118,
  nvar: 5,
  nobs: 5,
  variables: sampleVariables,
  data: sampleData,
  valueLabels: {},
  timestamp: "2026-01-15",
  label: "示例数据文件",
  isDirty: false
};

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
  const { openFile } = useFileStore();

  const handleOpenFile = async () => {
    try {
      const tauriEnv = await isTauri();

      if (!tauriEnv) {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".dta,.csv,.xls,.xlsx";
        input.onchange = async (e) => {
          const file = (e.target as HTMLInputElement).files?.[0];
          if (!file) return;

          try {
            let dtaFile: DTAFile;

            if (file.name.endsWith(".csv")) {
              dtaFile = await parseCSVFile(file);
            } else {
              console.warn("Web 模式仅支持 CSV 文件。其他格式请使用桌面版本。");
              dtaFile = await parseCSVFile(file);
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
      const { invoke } = await import("@tauri-apps/api/core");

      const selected = await open({
        multiple: false,
        filters: [
          { name: "Stata Data Files", extensions: ["dta"] },
          { name: "CSV Files", extensions: ["csv"] },
          { name: "Excel Files", extensions: ["xls", "xlsx"] },
          { name: "All Files", extensions: ["*"] }
        ]
      });

      if (selected) {
        const path = typeof selected === 'string' ? selected : selected;
        const file: DTAFile = await invoke("open_dta_file", { path });
        openFile(file);
      }
    } catch (error) {
      console.error("Failed to open file:", error);
      openFile(sampleFile);
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
