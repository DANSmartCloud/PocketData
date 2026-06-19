import { useState } from "react";
import {
  X, FolderPlus, Loader2, Folder, BarChart3, FileCode2, ClipboardList, Sigma,
} from "lucide-react";
import { useNotify } from "@/hooks/useNotify";
import styles from "./ProjectCreateModal.module.css";

export type ProjectTemplateId = "empty" | "stata" | "python" | "survey" | "rstats";

interface Template {
  id: ProjectTemplateId;
  label: string;
  desc: string;
  Icon: React.ComponentType<{ size?: number | string }>;
}

const TEMPLATES: Template[] = [
  { id: "empty", label: "空白项目", desc: "仅含 README 与 .pocketdata 元数据", Icon: Folder },
  { id: "stata", label: "Stata 项目", desc: "data/ scripts/ output/ logs/ + main.do", Icon: BarChart3 },
  { id: "python", label: "Python 项目", desc: "data/ notebooks/ src/ tests/ + requirements.txt", Icon: FileCode2 },
  { id: "survey", label: "问卷/调查", desc: "data/raw data/cleaned scripts/ output/", Icon: ClipboardList },
  { id: "rstats", label: "R 项目", desc: "data/ R/ output/ man/", Icon: Sigma },
];

interface ProjectCreateModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (rootPath: string) => void;
}

/**
 * 新建项目对话框
 * - 用户选择模板 + 填写项目名 + 选择父目录
 * - 后端根据模板生成完整目录结构
 * - 完成后自动打开项目
 */
export function ProjectCreateModal({ open, onClose, onCreated }: ProjectCreateModalProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [parentDir, setParentDir] = useState<string | null>(null);
  const [template, setTemplate] = useState<ProjectTemplateId>("stata");
  const [gitInit, setGitInit] = useState(true);
  const [creating, setCreating] = useState(false);
  const notify = useNotify();

  if (!open) return null;

  const pickParent = async () => {
    try {
      const { isTauri } = await import("@tauri-apps/api/core");
      if (!(await isTauri())) {
        notify("warning", "Web 模式下无法新建项目。");
        return;
      }
      const { open } = await import("@tauri-apps/plugin-dialog");
      const dir = await open({ multiple: false, directory: true, title: "选择父目录" });
      if (dir) {
        setParentDir(typeof dir === "string" ? dir : (dir as any).path ?? null);
      }
    } catch (err) {
      notify("error", `选择目录失败: ${err}`);
    }
  };

  const handleCreate = async () => {
    if (!name.trim()) {
      notify("warning", "请输入项目名");
      return;
    }
    if (!parentDir) {
      notify("warning", "请选择父目录");
      return;
    }
    setCreating(true);
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const result = await invoke<{ root_path: string; name: string; created_files: string[] }>(
        "create_project",
        {
          req: {
            parent_dir: parentDir,
            name: name.trim(),
            template,
            description: description.trim() || null,
            git_init: gitInit,
          },
        }
      );
      notify(
        "success",
        `已创建项目 ${result.name}（${result.created_files.length} 个文件/目录）`,
        3000
      );
      onCreated(result.root_path);
      // 重置表单
      setName("");
      setDescription("");
      setParentDir(null);
      onClose();
    } catch (err) {
      notify("error", `创建项目失败: ${err}`);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <div className={styles.title}>
            <FolderPlus size={16} />
            新建项目
          </div>
          <button className={styles.closeBtn} onClick={onClose} title="关闭">
            <X size={16} />
          </button>
        </div>

        <div className={styles.body}>
          {/* 项目名 */}
          <div className={styles.field}>
            <label className={styles.label}>项目名</label>
            <input
              className={styles.input}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如：毕业论文、消费分析 2026"
              autoFocus
              spellCheck={false}
            />
            <div className={styles.hint}>项目名将作为新目录的名称。避免使用 / \ : * ? " &lt; &gt; |</div>
          </div>

          {/* 描述 */}
          <div className={styles.field}>
            <label className={styles.label}>描述（可选）</label>
            <input
              className={styles.input}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="一句话说明项目目的"
            />
          </div>

          {/* 父目录 */}
          <div className={styles.field}>
            <label className={styles.label}>父目录</label>
            <div className={styles.dirRow}>
              <div className={styles.dirValue} title={parentDir ?? ""}>
                {parentDir ?? "未选择"}
              </div>
              <button className={styles.browseBtn} onClick={pickParent}>
                浏览…
              </button>
            </div>
          </div>

          {/* 模板选择 */}
          <div className={styles.field}>
            <label className={styles.label}>项目模板</label>
            <div className={styles.templates}>
              {TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  className={`${styles.templateCard} ${
                    template === t.id ? styles.templateCardActive : ""
                  }`}
                  onClick={() => setTemplate(t.id)}
                  type="button"
                >
                  <div className={styles.templateIcon}><t.Icon size={20} /></div>
                  <div className={styles.templateLabel}>{t.label}</div>
                  <div className={styles.templateDesc}>{t.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* 高级选项 */}
          <div className={styles.field}>
            <label className={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={gitInit}
                onChange={(e) => setGitInit(e.target.checked)}
              />
              <span>初始化 Git 仓库（写入 .gitignore）</span>
            </label>
          </div>
        </div>

        <div className={styles.footer}>
          <button className={styles.cancelBtn} onClick={onClose} disabled={creating}>
            取消
          </button>
          <button className={styles.createBtn} onClick={handleCreate} disabled={creating}>
            {creating ? (
              <>
                <Loader2 size={14} className={styles.spinner} />
                创建中…
              </>
            ) : (
              <>
                <FolderPlus size={14} />
                创建项目
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
