use std::fs;
use std::path::{Path, PathBuf};

use crate::fs_safety::ensure_project_path;
use crate::project_events::append_system_event;
use crate::project_model::{
    fallback_project_yaml, read_project_yaml, reject_software_directory_project_path,
    scaffold_project, ProjectError, ProjectFileDocument, ProjectHealthItem, ProjectHealthReport,
};

pub fn inspect_project_health(root_path: String) -> Result<ProjectHealthReport, ProjectError> {
    let root = PathBuf::from(root_path);
    let mut checks = Vec::new();

    for (relative_path, label) in required_project_directories() {
        checks.push(inspect_project_path(
            &root,
            relative_path,
            label,
            "directory",
            true,
        ));
    }

    for (relative_path, label) in required_project_files() {
        checks.push(inspect_project_path(
            &root,
            relative_path,
            label,
            "file",
            true,
        ));
    }

    for (relative_path, label) in recommended_project_files() {
        checks.push(inspect_project_path(
            &root,
            relative_path,
            label,
            "file",
            false,
        ));
    }

    let missing_count = checks
        .iter()
        .filter(|item| item.status == "missing" && is_required_check(&item.kind))
        .count();
    let warning_count = checks
        .iter()
        .filter(|item| item.status == "missing" && !is_required_check(&item.kind))
        .count();
    let ready = missing_count == 0;
    let status = if ready && warning_count == 0 {
        "ready"
    } else if ready {
        "warning"
    } else {
        "missing"
    }
    .to_owned();

    Ok(ProjectHealthReport {
        status,
        ready,
        missing_count,
        warning_count,
        checks,
    })
}

pub fn repair_project_structure(root_path: String) -> Result<ProjectHealthReport, ProjectError> {
    if root_path.trim().is_empty() {
        return Err(ProjectError::MissingPath);
    }

    let root = PathBuf::from(root_path);
    reject_software_directory_project_path(&root)?;
    fs::create_dir_all(&root)?;
    let project = read_project_yaml(&root).unwrap_or_else(|_| fallback_project_yaml(&root));
    scaffold_project(&root, &project)?;
    append_system_event(
        &root,
        "project_structure_repaired",
        serde_json::json!({
            "message": "已修复缺失的项目结构",
            "chapterCount": project.chapter_count
        }),
    )?;
    inspect_project_health(root.to_string_lossy().to_string())
}

pub fn reveal_project_folder(root_path: String) -> Result<ProjectFileDocument, ProjectError> {
    if root_path.trim().is_empty() {
        return Err(ProjectError::MissingPath);
    }

    let root = PathBuf::from(root_path);
    reject_software_directory_project_path(&root)?;
    if !root.is_dir() {
        return Err(ProjectError::InvalidInput(
            "项目文件夹不存在，无法在文件管理器中打开。".to_owned(),
        ));
    }

    let canonical = root.canonicalize()?;
    launch_file_manager(&canonical)?;
    Ok(ProjectFileDocument {
        relative_path: canonical.to_string_lossy().to_string(),
        content: "已请求操作系统打开项目文件夹。".to_owned(),
    })
}

pub fn reveal_project_path(
    root_path: String,
    relative_path: String,
) -> Result<ProjectFileDocument, ProjectError> {
    if root_path.trim().is_empty() {
        return Err(ProjectError::MissingPath);
    }
    if relative_path.trim().is_empty() {
        return reveal_project_folder(root_path);
    }

    let root = PathBuf::from(root_path);
    reject_software_directory_project_path(&root)?;
    let target = ensure_project_path(&root, &relative_path)?;
    if !target.exists() {
        return Err(ProjectError::InvalidInput(
            "要定位的项目文件不存在。".to_owned(),
        ));
    }

    let canonical = target.canonicalize()?;
    launch_path_in_file_manager(&canonical)?;
    Ok(ProjectFileDocument {
        relative_path: relative_path.replace('\\', "/"),
        content: "已请求操作系统定位项目文件。".to_owned(),
    })
}

fn required_project_directories() -> &'static [(&'static str, &'static str)] {
    &[
        ("framework", "故事框架"),
        ("blueprints/chapters", "章节蓝图"),
        ("manuscript/chapters", "正文"),
        ("manuscript/candidates", "候选草稿"),
        ("manuscript/author-input", "作者输入"),
        ("facts", "事实库"),
        ("timeline", "时间线与里程碑"),
        ("knowledge/markdown/imported", "导入资料"),
        ("characters/cards", "角色卡"),
        ("story-contracts/chapters", "章级合同"),
        ("story-contracts/fulfillment", "合同履约摘要"),
        ("skills/selected", "已选择 Skill"),
        ("tasks/writing-briefs", "写作任务书"),
        ("tasks/contract-revisions", "合同回修清单"),
        ("logs/model-calls", "模型调用日志"),
        ("exports", "导出目录"),
        (".olienta", "项目配置"),
    ]
}

fn required_project_files() -> &'static [(&'static str, &'static str)] {
    &[
        ("project.yaml", "项目配置总表"),
        ("framework/01-setting.md", "小说设置"),
        ("framework/02-premise.md", "故事概述"),
        ("framework/03-characters.md", "角色图谱"),
        ("framework/04-plot-outline.md", "情节大纲"),
        ("framework/05-world.md", "世界观"),
        ("framework/06-style.md", "文风配置"),
        ("framework/07-scenes.md", "重要场景"),
        ("facts/author-confirmation.md", "作者确认"),
        ("facts/confirmed-facts.md", "已确认事实"),
        ("facts/open-loops.md", "未闭合伏笔"),
        ("facts/time-facts.md", "时间事实"),
        ("facts/location-facts.md", "地点事实"),
        ("facts/relation-facts.md", "关系事实"),
        ("facts/event-facts.md", "事件事实"),
        ("facts/world-rules.md", "世界规则"),
        ("facts/forbidden-rules.md", "禁止违背"),
        ("rules/anti-ai-patterns.md", "Anti-AI 规则"),
        ("story-contracts/master-contract.json", "章级合同总表"),
        ("timeline/events.md", "时间线事件"),
        ("timeline/milestones.md", "里程碑"),
    ]
}

fn recommended_project_files() -> &'static [(&'static str, &'static str)] {
    &[
        ("knowledge/README.md", "知识库说明"),
        ("knowledge/markdown/README.md", "本地 Markdown 说明"),
        ("knowledge/search/README.md", "全文检索说明"),
        ("characters/cards/README.md", "角色卡索引"),
        ("logs/system-events.jsonl", "系统事件日志"),
        ("logs/model-calls/README.md", "模型调用说明"),
        ("logs/model-calls/history.md", "模型调用记录"),
        ("tasks/history.jsonl", "任务历史"),
        ("tasks/current.json", "当前任务状态"),
        ("models/README.md", "模型调用说明"),
    ]
}

fn inspect_project_path(
    root: &Path,
    relative_path: &str,
    label: &str,
    expected_kind: &str,
    required: bool,
) -> ProjectHealthItem {
    let kind = if required {
        format!("required-{expected_kind}")
    } else {
        format!("recommended-{expected_kind}")
    };
    let path = root.join(relative_path);
    let exists = if expected_kind == "directory" {
        path.is_dir()
    } else {
        path.is_file()
    };
    let status = if exists { "ok" } else { "missing" }.to_owned();
    let message = if exists {
        "已就绪。".to_owned()
    } else if required {
        "缺失会影响项目读写，重新打开项目会自动补齐基础结构。".to_owned()
    } else {
        "建议存在，用于更完整的日志、说明或索引体验。".to_owned()
    };

    ProjectHealthItem {
        kind,
        label: label.to_owned(),
        relative_path: relative_path.to_owned(),
        status,
        message,
    }
}

fn is_required_check(kind: &str) -> bool {
    kind.starts_with("required-")
}

fn launch_file_manager(path: &Path) -> Result<(), ProjectError> {
    #[cfg(test)]
    {
        let _ = path;
        Ok(())
    }

    #[cfg(not(test))]
    {
        #[cfg(target_os = "windows")]
        let result = std::process::Command::new("explorer").arg(path).spawn();

        #[cfg(target_os = "macos")]
        let result = std::process::Command::new("open").arg(path).spawn();

        #[cfg(all(unix, not(target_os = "macos")))]
        let result = std::process::Command::new("xdg-open").arg(path).spawn();

        result.map(|_| ()).map_err(ProjectError::Io)
    }
}

fn launch_path_in_file_manager(path: &Path) -> Result<(), ProjectError> {
    #[cfg(test)]
    {
        let _ = path;
        Ok(())
    }

    #[cfg(not(test))]
    {
        if path.is_dir() {
            return launch_file_manager(path);
        }

        #[cfg(target_os = "windows")]
        let result = std::process::Command::new("explorer")
            .arg("/select,")
            .arg(path)
            .spawn();

        #[cfg(target_os = "macos")]
        let result = std::process::Command::new("open")
            .arg("-R")
            .arg(path)
            .spawn();

        #[cfg(all(unix, not(target_os = "macos")))]
        let result = {
            let parent = path.parent().unwrap_or(path);
            std::process::Command::new("xdg-open").arg(parent).spawn()
        };

        result.map(|_| ()).map_err(ProjectError::Io)
    }
}
