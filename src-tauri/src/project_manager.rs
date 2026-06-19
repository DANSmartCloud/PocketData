use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::SystemTime;
use tauri::Manager;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectFileNode {
    pub name: String,
    pub path: String,
    pub relative_path: String,
    #[serde(rename = "type")]
    pub node_type: String,  // "file" | "folder"
    pub ext: Option<String>,
    pub size: Option<u64>,
    pub modified: Option<u64>,
    pub children: Option<Vec<ProjectFileNode>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectMetadata {
    pub name: String,
    pub root_path: String,
    pub recent_files: Vec<String>,
    pub opened_at: u64,
    pub version: String,
}

const SUPPORTED_DATA_EXTS: &[&str] = &["dta", "csv", "xls", "xlsx", "tsv", "json", "sas7bdat"];
const SUPPORTED_SCRIPT_EXTS: &[&str] = &["do", "py", "ado", "mata"];
const SUPPORTED_EXTS: &[&str] = &[
    "dta", "csv", "xls", "xlsx", "tsv", "json", "sas7bdat",
    "do", "py", "ado", "mata",
    "txt", "md", "pocketdata"
];

/// 扫描目录构建文件树（限制深度 6 层，最多 5000 节点）
#[tauri::command]
pub fn read_project_tree(path: String) -> Result<ProjectFileNode, String> {
    let root = PathBuf::from(&path);
    if !root.is_dir() {
        return Err(format!("不是有效目录: {}", path));
    }
    let name = root
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("project")
        .to_string();
    let mut node = ProjectFileNode {
        name,
        path: path.clone(),
        relative_path: String::new(),
        node_type: "folder".to_string(),
        ext: None,
        size: None,
        modified: file_modified(&root),
        children: Some(Vec::new()),
    };
    scan_dir(&root, &root, 0, 6, 5000, &mut node)?;
    Ok(node)
}

fn scan_dir(
    root: &Path,
    current: &Path,
    depth: usize,
    max_depth: usize,
    max_nodes: usize,
    parent: &mut ProjectFileNode,
) -> Result<usize, String> {
    if depth > max_depth {
        return Ok(0);
    }
    let entries = fs::read_dir(current).map_err(|e| format!("读取目录失败: {}", e))?;
    let mut folders: Vec<PathBuf> = Vec::new();
    let mut files: Vec<PathBuf> = Vec::new();
    for entry in entries.flatten() {
        let p = entry.path();
        // 跳过常见无用目录
        if let Some(name) = p.file_name().and_then(|n| n.to_str()) {
            if name.starts_with('.') || name == "node_modules" || name == "target" || name == "dist" || name == "build" {
                continue;
            }
        }
        if p.is_dir() {
            folders.push(p);
        } else if p.is_file() {
            if let Some(ext) = p.extension().and_then(|e| e.to_str()) {
                let lower = ext.to_lowercase();
                if SUPPORTED_EXTS.contains(&lower.as_str()) {
                    files.push(p);
                }
            }
        }
    }
    // 排序：文件夹优先 + 名称升序
    folders.sort();
    files.sort();

    let mut count = 0;
    for folder in folders {
        let rel = relative_path_str(root, &folder);
        let metadata = fs::metadata(&folder).ok();
        let size = metadata.as_ref().and_then(|m| if m.is_dir() { None } else { Some(m.len()) });
        let modified = file_modified(&folder);
        let mut node = ProjectFileNode {
            name: folder.file_name().and_then(|n| n.to_str()).unwrap_or("").to_string(),
            path: folder.to_string_lossy().to_string(),
            relative_path: rel,
            node_type: "folder".to_string(),
            ext: None,
            size,
            modified,
            children: Some(Vec::new()),
        };
        count += 1 + scan_dir(root, &folder, depth + 1, max_depth, max_nodes.saturating_sub(count), &mut node)?;
        if let Some(children) = parent.children.as_mut() {
            children.push(node);
        }
        if count >= max_nodes {
            break;
        }
    }
    for file in files {
        if count >= max_nodes {
            break;
        }
        let rel = relative_path_str(root, &file);
        let metadata = fs::metadata(&file).ok();
        let size = metadata.as_ref().map(|m| m.len());
        let modified = file_modified(&file);
        let ext = file.extension().and_then(|e| e.to_str()).map(|s| s.to_lowercase());
        let name = file.file_name().and_then(|n| n.to_str()).unwrap_or("").to_string();
        let node = ProjectFileNode {
            name,
            path: file.to_string_lossy().to_string(),
            relative_path: rel,
            node_type: "file".to_string(),
            ext,
            size,
            modified,
            children: None,
        };
        if let Some(children) = parent.children.as_mut() {
            children.push(node);
        }
        count += 1;
    }
    Ok(count)
}

fn relative_path_str(root: &Path, p: &Path) -> String {
    p.strip_prefix(root)
        .map(|r| r.to_string_lossy().replace('\\', "/"))
        .unwrap_or_else(|_| p.to_string_lossy().to_string())
}

fn file_modified(p: &Path) -> Option<u64> {
    fs::metadata(p)
        .ok()
        .and_then(|m| m.modified().ok())
        .and_then(|t| t.duration_since(SystemTime::UNIX_EPOCH).ok())
        .map(|d| d.as_secs())
}

/// 保存项目元数据到 `<root>/.pocketdata`
#[tauri::command]
pub fn save_project(root_path: String, metadata: ProjectMetadata) -> Result<String, String> {
    let root = PathBuf::from(&root_path);
    if !root.is_dir() {
        return Err(format!("目录不存在: {}", root_path));
    }
    let meta_path = root.join(".pocketdata");
    let json = serde_json::to_string_pretty(&metadata).map_err(|e| e.to_string())?;
    fs::write(&meta_path, json).map_err(|e| format!("写入元数据失败: {}", e))?;
    Ok(meta_path.to_string_lossy().to_string())
}

/// 读取项目元数据
#[tauri::command]
pub fn read_project(root_path: String) -> Result<ProjectMetadata, String> {
    let meta_path = PathBuf::from(&root_path).join(".pocketdata");
    if !meta_path.exists() {
        return Err("项目元数据不存在".to_string());
    }
    let content = fs::read_to_string(&meta_path).map_err(|e| e.to_string())?;
    serde_json::from_str(&content).map_err(|e| e.to_string())
}

/// 在系统文件管理器中显示文件/文件夹
#[tauri::command]
pub fn reveal_in_explorer(path: String) -> Result<(), String> {
    let p = PathBuf::from(&path);
    if !p.exists() {
        return Err(format!("路径不存在: {}", path));
    }
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg("/select,")
            .arg(&p)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .args(&["-R", &p.to_string_lossy()])
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(p.parent().unwrap_or(&p))
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// 重命名文件/文件夹
#[tauri::command]
pub fn rename_path(old_path: String, new_path: String) -> Result<(), String> {
    let old = PathBuf::from(&old_path);
    let new = PathBuf::from(&new_path);
    if !old.exists() {
        return Err(format!("源路径不存在: {}", old_path));
    }
    if new.exists() {
        return Err(format!("目标已存在: {}", new_path));
    }
    fs::rename(&old, &new).map_err(|e| e.to_string())
}

/// 删除文件/文件夹（移到回收站困难，这里直接删除但要二次确认由前端做）
#[tauri::command]
pub fn delete_path(path: String) -> Result<(), String> {
    let p = PathBuf::from(&path);
    if !p.exists() {
        return Err(format!("路径不存在: {}", path));
    }
    if p.is_dir() {
        fs::remove_dir_all(&p).map_err(|e| e.to_string())?;
    } else {
        fs::remove_file(&p).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// 复制外部文件到项目目录
#[tauri::command]
pub fn copy_file_to_project(src: String, dest: String) -> Result<String, String> {
    let s = PathBuf::from(&src);
    let d = PathBuf::from(&dest);
    if !s.exists() {
        return Err(format!("源文件不存在: {}", src));
    }
    if let Some(parent) = d.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::copy(&s, &d).map_err(|e| e.to_string())?;
    Ok(d.to_string_lossy().to_string())
}

/// 新建项目模板类型
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ProjectTemplate {
    Empty,
    Stata,
    Python,
    Survey,    // 调查数据：data/ output/ scripts/ README.md
    Rstats,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateProjectRequest {
    pub parent_dir: String,
    pub name: String,
    pub template: ProjectTemplate,
    pub description: Option<String>,
    pub git_init: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateProjectResult {
    pub root_path: String,
    pub name: String,
    pub created_files: Vec<String>,
}

/// 在 parent_dir 下创建名为 name 的项目目录，并根据模板填充文件
#[tauri::command]
pub fn create_project(req: CreateProjectRequest) -> Result<CreateProjectResult, String> {
    let name = req.name.trim();
    if name.is_empty() {
        return Err("项目名不能为空".to_string());
    }
    if name.contains(['/', '\\', ':', '*', '?', '"', '<', '>', '|']) {
        return Err("项目名包含非法字符".to_string());
    }
    let parent = PathBuf::from(&req.parent_dir);
    if !parent.is_dir() {
        return Err(format!("父目录不存在: {}", req.parent_dir));
    }
    let root = parent.join(name);
    if root.exists() {
        return Err(format!("目标已存在: {}", root.display()));
    }
    fs::create_dir_all(&root).map_err(|e| format!("创建目录失败: {}", e))?;

    let mut created = Vec::<String>::new();

    // 1. .pocketdata 元数据
    let now_secs = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let metadata = ProjectMetadata {
        name: name.to_string(),
        root_path: root.to_string_lossy().to_string(),
        recent_files: Vec::new(),
        opened_at: now_secs,
        version: "1.0".to_string(),
    };
    let meta_path = root.join(".pocketdata");
    let meta_json = serde_json::to_string_pretty(&metadata).map_err(|e| e.to_string())?;
    fs::write(&meta_path, meta_json).map_err(|e| format!("写入元数据失败: {}", e))?;
    created.push(meta_path.to_string_lossy().to_string());

    // 2. 模板内容
    match req.template {
        ProjectTemplate::Empty => {
            // 仅 .pocketdata + README.md
            let readme = root.join("README.md");
            fs::write(
                &readme,
                format!(
                    "# {}\n\n{}\n\n_创建于 {}_\n",
                    name,
                    req.description.unwrap_or_else(|| "PocketData 项目".to_string()),
                    chrono_like_now()
                ),
            )
            .map_err(|e| e.to_string())?;
            created.push(readme.to_string_lossy().to_string());
        }
        ProjectTemplate::Stata => {
            for d in ["data", "scripts", "output", "logs"] {
                let p = root.join(d);
                fs::create_dir_all(&p).map_err(|e| e.to_string())?;
                created.push(p.to_string_lossy().to_string());
            }
            let main = root.join("scripts").join("main.do");
            fs::write(
                &main,
                format!(
                    "* {name} - Stata 主脚本\n*\n* 数据流：data/raw -> data/cleaned -> output/tables\n*\nclear all\nset more off\n\nglobal root \"`c(pwd)'/\"\n\n* 1. 读入原始数据\nuse \"${{root}}data/raw.dta\", clear\n\n* 2. 数据清洗\n* describe\n* summarize\n\n* 3. 输出\n* esttab m1 m2 using \"${{root}}output/tables.rtf\", replace\n",
                    name = name
                ),
            )
            .map_err(|e| e.to_string())?;
            created.push(main.to_string_lossy().to_string());
            let readme = root.join("README.md");
            fs::write(
                &readme,
                format!(
                    "# {}\n\nStata 分析项目\n\n## 目录结构\n\n- `data/`    原始与清洗数据\n- `scripts/` Stata 脚本（.do）\n- `output/`  表格、图表\n- `logs/`    运行日志\n\n{}\n",
                    name,
                    req.description.unwrap_or_else(|| "通过 PocketData 创建".to_string())
                ),
            )
            .map_err(|e| e.to_string())?;
            created.push(readme.to_string_lossy().to_string());
        }
        ProjectTemplate::Python => {
            for d in ["data", "notebooks", "src", "tests"] {
                let p = root.join(d);
                fs::create_dir_all(&p).map_err(|e| e.to_string())?;
                created.push(p.to_string_lossy().to_string());
            }
            let main = root.join("src").join("main.py");
            fs::write(
                &main,
                format!(
                    "\"\"\"\n{name} - Python 数据分析主入口\n\"\"\"\nimport pandas as pd\n\ndef main():\n    # 读入数据\n    df = pd.read_csv(\"data/raw.csv\")\n    print(df.head())\n    print(df.describe())\n\nif __name__ == \"__main__\":\n    main()\n"
                ),
            )
            .map_err(|e| e.to_string())?;
            created.push(main.to_string_lossy().to_string());
            let reqs = root.join("requirements.txt");
            fs::write(
                &reqs,
                "pandas>=2.0\nnumpy>=1.24\nmatplotlib>=3.7\nscipy>=1.10\n",
            )
            .map_err(|e| e.to_string())?;
            created.push(reqs.to_string_lossy().to_string());
            let readme = root.join("README.md");
            fs::write(
                &readme,
                format!(
                    "# {}\n\nPython 数据分析项目\n\n## 目录结构\n\n- `data/`       原始与处理后数据\n- `notebooks/`  Jupyter notebooks\n- `src/`        源代码\n- `tests/`      单元测试\n\n{}\n",
                    name,
                    req.description.unwrap_or_else(|| "通过 PocketData 创建".to_string())
                ),
            )
            .map_err(|e| e.to_string())?;
            created.push(readme.to_string_lossy().to_string());
        }
        ProjectTemplate::Survey => {
            for d in ["data/raw", "data/cleaned", "scripts", "output/tables", "output/figures", "questionnaire"] {
                let p = root.join(d);
                fs::create_dir_all(&p).map_err(|e| e.to_string())?;
                created.push(p.to_string_lossy().to_string());
            }
            let do_file = root.join("scripts").join("01_cleaning.do");
            fs::write(
                &do_file,
                format!(
                    "* {name} - 问卷数据清洗\n*\n* 输入：data/raw/survey_raw.dta\n* 输出：data/cleaned/survey_clean.dta\n\nclear all\nset more off\n\n* 加载原始数据\nuse \"data/raw/survey_raw.dta\", clear\n\n* 1. 缺失值标记\nmvdecode _all, mv(9999=.)\n\n* 2. 重编码\n* recode age (18/30=1 \"青年\") (31/45=2 \"中年\") (46/99=3 \"老年\"), gen(age_group)\n\n* 3. 保存\nsave \"data/cleaned/survey_clean.dta\", replace\n",
                    name = name
                ),
            )
            .map_err(|e| e.to_string())?;
            created.push(do_file.to_string_lossy().to_string());
            let readme = root.join("README.md");
            fs::write(
                &readme,
                format!(
                    "# {}\n\n问卷数据分析项目\n\n## 目录结构\n\n- `data/raw/`           原始问卷数据\n- `data/cleaned/`       清洗后数据\n- `questionnaire/`      问卷文件\n- `scripts/`            清洗与分析脚本\n- `output/tables/`      表格\n- `output/figures/`     图表\n\n{}\n",
                    name,
                    req.description.unwrap_or_else(|| "通过 PocketData 创建".to_string())
                ),
            )
            .map_err(|e| e.to_string())?;
            created.push(readme.to_string_lossy().to_string());
        }
        ProjectTemplate::Rstats => {
            for d in ["data", "R", "output", "man"] {
                let p = root.join(d);
                fs::create_dir_all(&p).map_err(|e| e.to_string())?;
                created.push(p.to_string_lossy().to_string());
            }
            let r_file = root.join("R").join("analysis.R");
            fs::write(
                &r_file,
                format!(
                    "# {name} - R 数据分析\n\nlibrary(tidyverse)\n\ndf <- read_csv(\"data/raw.csv\")\n\ncat(\"数据概览：\\n\")\nprint(head(df))\nprint(summary(df))\n",
                    name = name
                ),
            )
            .map_err(|e| e.to_string())?;
            created.push(r_file.to_string_lossy().to_string());
            let readme = root.join("README.md");
            fs::write(
                &readme,
                format!(
                    "# {}\n\nR 数据分析项目\n\n## 目录结构\n\n- `data/`   数据\n- `R/`      R 脚本\n- `output/` 输出\n- `man/`    文档\n\n{}\n",
                    name,
                    req.description.unwrap_or_else(|| "通过 PocketData 创建".to_string())
                ),
            )
            .map_err(|e| e.to_string())?;
            created.push(readme.to_string_lossy().to_string());
        }
    }

    // 3. 可选：git init
    if req.git_init {
        let status = std::process::Command::new("git")
            .args(["init", "--initial-branch=main"])
            .current_dir(&root)
            .status();
        match status {
            Ok(s) if s.success() => {
                // 写 .gitignore
                let gi = root.join(".gitignore");
                let _ = fs::write(
                    &gi,
                    "*.log\n*.tmp\noutput/*\n!output/.gitkeep\nlogs/*\n!logs/.gitkeep\n",
                );
                created.push(gi.to_string_lossy().to_string());
            }
            _ => {
                // git 不可用时静默忽略
            }
        }
    }

    Ok(CreateProjectResult {
        root_path: root.to_string_lossy().to_string(),
        name: name.to_string(),
        created_files: created,
    })
}

fn chrono_like_now() -> String {
    // 不引入 chrono；手动格式化（YYYY-MM-DD）
    let now = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let secs_per_day = 86400u64;
    let days = now / secs_per_day;
    // 1970-01-01 是星期四
    let mut y = 1970u64;
    let mut d = days;
    loop {
        let leap = (y % 4 == 0 && y % 100 != 0) || (y % 400 == 0);
        let dy = if leap { 366 } else { 365 };
        if d < dy {
            break;
        }
        d -= dy;
        y += 1;
    }
    let leap = (y % 4 == 0 && y % 100 != 0) || (y % 400 == 0);
    let months = if leap {
        [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    } else {
        [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    };
    let mut m = 0usize;
    let mut rem = d;
    while m < 12 && rem >= months[m] as u64 {
        rem -= months[m] as u64;
        m += 1;
    }
    format!("{:04}-{:02}-{:02}", y, m + 1, rem + 1)
}
