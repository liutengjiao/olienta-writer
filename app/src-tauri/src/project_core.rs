use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use crate::fs_safety::{atomic_write_text, ensure_project_path};
use crate::project_skills::write_default_skill_files;
use crate::project_types::{ChapterSummary, CreateProjectInput, ProjectError, ProjectFileDocument, ProjectSummary, ProjectYaml};
use crate::project_volumes::default_project_volumes;

pub fn create_project(input: CreateProjectInput) -> Result<ProjectSummary, ProjectError> {
    if input.name.trim().is_empty() {
        return Err(ProjectError::MissingName);
    }
    if input.root_path.trim().is_empty() {
        return Err(ProjectError::MissingPath);
    }

    let root = PathBuf::from(&input.root_path);
    reject_software_directory_project_path(&root)?;
    fs::create_dir_all(&root)?;

    let project = ProjectYaml {
        name: input.name.trim().to_owned(),
        language: fallback_language(&input.language),
        template: input.template,
        storage: "local-files".to_owned(),
        chapter_count: input.chapter_count.max(1),
        target_words_per_chapter: input.target_words_per_chapter.max(1),
    };

    scaffold_project(&root, &project)?;
    read_summary(&root)
}

pub fn open_project(root_path: String) -> Result<ProjectSummary, ProjectError> {
    if root_path.trim().is_empty() {
        return Err(ProjectError::MissingPath);
    }

    let root = PathBuf::from(strip_windows_verbatim_prefix(&root_path));
    reject_software_directory_project_path(&root)?;
    if !root.exists() {
        return Err(ProjectError::InvalidInput(
            "项目文件夹不存在。请选择包含 project.yaml 的 Olienta 项目文件夹。".to_owned(),
        ));
    }
    if !root.is_dir() {
        return Err(ProjectError::InvalidInput(
            "请选择文件夹，而不是文件。".to_owned(),
        ));
    }
    if !root.join("project.yaml").exists() {
        return Err(ProjectError::InvalidInput(
            "这不是 Olienta 项目文件夹。请选择包含 project.yaml 的项目文件夹。".to_owned(),
        ));
    }

    let project = read_project_yaml(&root)?;
    scaffold_project(&root, &project)?;
    read_summary(&root)
}

pub fn list_known_projects() -> Result<Vec<ProjectSummary>, ProjectError> {
    let mut projects = Vec::new();
    for projects_root in known_projects_roots() {
        if !projects_root.exists() {
            continue;
        }
        for entry in fs::read_dir(projects_root)? {
            let entry = entry?;
            let path = entry.path();
            if !path.is_dir() || !path.join("project.yaml").exists() {
                continue;
            }

            if let Ok(summary) = read_summary(&path) {
                projects.push(summary);
            }
        }
    }

    projects.sort_by(|left, right| left.name.cmp(&right.name));
    Ok(projects)
}

pub(crate) fn known_projects_roots() -> Vec<PathBuf> {
    let mut roots = Vec::new();
    if let Ok(value) = std::env::var("OLIENTA_PROJECTS_DIR") {
        let trimmed = value.trim();
        if !trimmed.is_empty() {
            roots.push(PathBuf::from(trimmed));
        }
    }
    if let Some(home) = user_home_dir() {
        roots.push(home.join("Documents").join("Olienta Projects"));
    }
    roots
}

pub(crate) fn user_home_dir() -> Option<PathBuf> {
    std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .map(PathBuf::from)
}

pub fn list_chapters(root_path: String) -> Result<Vec<ChapterSummary>, ProjectError> {
    let root = PathBuf::from(root_path);
    let chapters_dir = ensure_project_path(&root, "manuscript/chapters")?;
    let mut chapters = Vec::new();

    if chapters_dir.exists() {
        for entry in fs::read_dir(chapters_dir)? {
            let entry = entry?;
            let path = entry.path();
            if path.extension().and_then(|value| value.to_str()) != Some("md") {
                continue;
            }

            let id = path
                .file_stem()
                .and_then(|value| value.to_str())
                .map(normalize_chapter_id)
                .unwrap_or_else(|| "001".to_owned());
            let content = fs::read_to_string(&path)?;
            let words = count_words(&content);
            let title = extract_title(&content).unwrap_or_else(|| {
                let number = id.parse::<u32>().unwrap_or(1);
                format!("第{number}章 未命名")
            });
            let state = if is_placeholder_or_empty(&content) {
                "待写".to_owned()
            } else {
                "已确认".to_owned()
            };

            chapters.push(ChapterSummary {
                id,
                title,
                words,
                state,
            });
        }
    }

    chapters.sort_by(|left, right| left.id.cmp(&right.id));
    Ok(chapters)
}

pub(crate) fn read_optional_project_file(root: &Path, relative_path: &str) -> Result<String, ProjectError> {
    let path = ensure_project_path(root, relative_path)?;
    Ok(fs::read_to_string(path).unwrap_or_default())
}

pub(crate) fn scaffold_project(root: &Path, project: &ProjectYaml) -> Result<(), ProjectError> {
    fs::create_dir_all(root)?;
    atomic_write_text(&root.join("project.yaml"), &serde_yaml::to_string(project)?)?;
    for dir in [
        "framework",
        "blueprints/chapters",
        "blueprints/history",
        "manuscript/chapters",
        "manuscript/candidates/reviews",
        "manuscript/candidates/history",
        "manuscript/author-input",
        "facts/history",
        "facts/candidate-fact-drafts",
        "timeline",
        "skills/selected",
        "knowledge/markdown/imported",
        "characters/cards",
        "story-contracts/chapters",
        "story-contracts/fulfillment",
        "tasks/writing-briefs",
        "tasks/pinned-context",
        "tasks/contract-revisions",
        "logs/model-calls",
        "logs/confirmations",
        "exports",
        ".olienta",
        ".olienta-events/commits",
        "models",
        "rules",
    ] {
        fs::create_dir_all(root.join(dir))?;
    }

    write_if_missing(root, "framework/01-setting.md", "# 小说设置\n\n")?;
    write_if_missing(root, "framework/02-premise.md", "# 故事梗概\n\n")?;
    write_if_missing(root, "framework/03-characters.md", "# 角色图谱\n\n")?;
    migrate_legacy_framework_file(root, "framework/05-plot.md", "framework/04-plot-outline.md")?;
    migrate_legacy_framework_file(root, "framework/04-world.md", "framework/05-world.md")?;
    write_if_missing(root, "framework/04-plot-outline.md", "# 情节大纲\n\n")?;
    write_if_missing(root, "framework/05-world.md", "# 世界观\n\n")?;
    write_if_missing(root, "framework/06-style.md", "# 文风配置\n\n")?;
    write_if_missing(root, "framework/07-scenes.md", "# 重要场景\n\n")?;
    scaffold_author_visible_vault(root, project)?;
    write_if_missing(root, "facts/confirmed-facts.md", "# 已确认事实\n\n")?;
    write_if_missing(root, "facts/author-confirmation.md", "# 作者确认边界\n\n")?;
    write_if_missing(root, "facts/open-loops.md", "# 未闭合伏笔\n\n")?;
    write_if_missing(root, "facts/character-facts.md", "# 角色事实\n\n")?;
    write_if_missing(root, "facts/time-facts.md", "# 时间事实\n\n")?;
    write_if_missing(root, "facts/event-facts.md", "# 已发生事件\n\n")?;
    write_if_missing(root, "facts/location-facts.md", "# 地点事实\n\n")?;
    write_if_missing(root, "facts/relation-facts.md", "# 关系事实\n\n")?;
    write_if_missing(root, "facts/world-rules.md", "# 世界规则\n\n")?;
    write_if_missing(root, "facts/forbidden-rules.md", "# 禁止违背\n\n")?;
    write_if_missing(
        root,
        "rules/anti-ai-patterns.md",
        "# Anti-AI 规则\n\n- 作为一个 AI：删除 AI 自我说明。\n- 内心五味杂陈：改写为可观察动作或感官细节。\n",
    )?;
    write_default_skill_files(root)?;
    write_if_missing(root, "timeline/events.md", "# 时间线事件\n\n")?;
    write_if_missing(root, "timeline/milestones.md", "# 里程碑\n\n")?;
    write_if_missing(
        root,
        "knowledge/README.md",
        "# 知识库\n\n导入资料、事实、伏笔、角色和检索索引都保存在本地文件夹中。\n",
    )?;
    write_if_missing(
        root,
        "knowledge/markdown/README.md",
        "# 本地 Markdown\n\n这里保存作者导入或整理的 Markdown/TXT 资料。\n",
    )?;
    write_if_missing(
        root,
        "knowledge/search/README.md",
        "# 本地全文检索\n\n检索结果可以钉选进当前章节任务书。\n",
    )?;
    write_if_missing(
        root,
        "characters/cards/README.md",
        "# 角色卡\n\n从角色图谱抽取的角色卡会保存在这里。\n",
    )?;
    write_if_missing(root, "characters/cards/INDEX.md", "# 角色卡索引\n\n")?;
    write_if_missing(root, "characters/relations.md", "# 关系图谱\n\n")?;
    write_if_missing(root, "characters/growth.md", "# 角色成长线\n\n")?;
    write_if_missing(
        root,
        "story-contracts/master-contract.json",
        &serde_json::to_string_pretty(&serde_json::json!({
            "version": 1,
            "policy": {
                "generateBeforeCandidate": true,
                "sources": ["blueprints/chapters", "facts", "characters", "timeline"]
            }
        }))?,
    )?;
    write_if_missing(root, "tasks/history.jsonl", "")?;
    write_if_missing(root, "tasks/current.json", "{}\n")?;
    write_if_missing(root, "logs/system-events.jsonl", "")?;
    write_if_missing(
        root,
        "logs/model-calls/README.md",
        "# 模型调用\n\n这里记录 Provider 测试和 AI 调用历史。\n",
    )?;
    write_if_missing(root, "logs/model-calls/history.md", "# 模型调用记录\n\n")?;
    write_if_missing(
        root,
        "models/README.md",
        "# 模型调用\n\nAI Provider 配置保存在软件级设置中；本项目只保存模型调用记录。\n",
    )?;
    write_if_missing(
        root,
        ".olienta/writing-methodology.json",
        &serde_json::to_string_pretty(&serde_json::json!({
            "pressureRelease": null,
            "hookTypes": [],
            "antiAiFlavor": true
        }))?,
    )?;
    write_if_missing(
        root,
        ".olienta/timeline-settings.json",
        &serde_json::to_string_pretty(&serde_json::json!({
            "enabled": false,
            "conflictCheck": false,
            "storage": "local-folder"
        }))?,
    )?;
    write_if_missing(
        root,
        ".olienta/volumes.json",
        &serde_json::to_string_pretty(&default_project_volumes(project))?,
    )?;

    for chapter in 1..=project.chapter_count {
        let id = format!("{chapter:03}");
        write_if_missing(
            root,
            &format!("manuscript/chapters/{id}.md"),
            &format!("# 第 {chapter} 章 未命名\n\n"),
        )?;
        write_if_missing(
            root,
            &format!("manuscript/author-input/{id}.md"),
            &format!("# 第 {chapter} 章作者输入\n\n"),
        )?;
        write_if_missing(
            root,
            &format!("blueprints/chapters/{id}.md"),
            &format!(
                "# 第 {chapter} 章蓝图\n\n## 本章目标\n\n## 必须发生\n\n## 禁止提前\n\n## 备注\n\n"
            ),
        )?;
        write_if_missing(
            root,
            &author_visible_blueprint_path(&id),
            &format!(
                "# {}蓝图\n\n## 本章目标\n\n## 必须发生\n\n## 禁止提前\n\n## 备注\n\n",
                chapter_title_for_filename(&id)
            ),
        )?;
        write_if_missing(
            root,
            &author_visible_manuscript_path(&id),
            &format!("# {}\n\n", chapter_title_for_filename(&id)),
        )?;
    }

    Ok(())
}

pub(crate) fn scaffold_author_visible_vault(root: &Path, _project: &ProjectYaml) -> Result<(), ProjectError> {
    for dir in ["世界观", "角色", "故事", "蓝图", "正文", "资料库", "导出"] {
        fs::create_dir_all(root.join(dir))?;
    }
    write_if_missing(root, "世界观/世界观.md", "# 世界观\n\n")?;
    write_if_missing(root, "角色/角色.md", "# 角色\n\n")?;
    write_if_missing(root, "故事/故事梗概.md", "# 故事梗概\n\n")?;
    write_if_missing(root, "故事/情节大纲.md", "# 情节大纲\n\n")?;
    write_if_missing(root, "故事/重要场景.md", "# 重要场景\n\n")?;
    write_if_missing(root, "故事/时间线.md", "# 时间线\n\n")?;
    write_if_missing(
        root,
        "资料库/README.md",
        "# 资料库\n\n这里保存作者随手记录的灵感、语音转文字、采访资料、临时片段和外部材料。资料库不是事实库，进入正式生成前需要作者钉选或确认。\n",
    )?;
    write_if_missing(root, "资料库/临时片段.md", "# 临时片段\n\n")?;
    mirror_if_missing(root, "framework/02-premise.md", "故事/故事梗概.md")?;
    mirror_if_missing(root, "framework/03-characters.md", "角色/角色.md")?;
    mirror_if_missing(root, "framework/04-plot-outline.md", "故事/情节大纲.md")?;
    mirror_if_missing(root, "framework/05-world.md", "世界观/世界观.md")?;
    mirror_if_missing(root, "framework/07-scenes.md", "故事/重要场景.md")?;
    mirror_if_missing(root, "timeline/events.md", "故事/时间线.md")?;
    Ok(())
}

pub(crate) fn mirror_if_missing(
    root: &Path,
    source_relative: &str,
    target_relative: &str,
) -> Result<(), ProjectError> {
    let target = ensure_project_path(root, target_relative)?;
    if target.exists() {
        return Ok(());
    }
    let content = read_optional_project_file(root, source_relative)?;
    if !content.trim().is_empty() {
        atomic_write_text(&target, &content)?;
    }
    Ok(())
}

pub(crate) fn mirror_author_visible_framework_file(
    root: &Path,
    file_name: &str,
    content: &str,
) -> Result<(), ProjectError> {
    let target_relative = match file_name {
        "02-premise.md" => Some("故事/故事梗概.md"),
        "03-characters.md" => Some("角色/角色.md"),
        "04-plot-outline.md" => Some("故事/情节大纲.md"),
        "05-world.md" => Some("世界观/世界观.md"),
        "07-scenes.md" => Some("故事/重要场景.md"),
        _ => None,
    };
    if let Some(relative_path) = target_relative {
        let target = ensure_project_path(root, relative_path)?;
        atomic_write_text(&target, content)?;
    }
    Ok(())
}

pub(crate) fn write_author_visible_manuscript(
    root: &Path,
    chapter_id: &str,
    content: &str,
) -> Result<(), ProjectError> {
    let relative_path = author_visible_manuscript_path(chapter_id);
    backup_author_visible_file(root, &relative_path)?;
    let target = ensure_project_path(root, &relative_path)?;
    atomic_write_text(&target, content)?;
    Ok(())
}

pub(crate) fn write_author_visible_blueprint(
    root: &Path,
    chapter_id: &str,
    content: &str,
) -> Result<(), ProjectError> {
    let relative_path = author_visible_blueprint_path(chapter_id);
    backup_author_visible_file(root, &relative_path)?;
    let target = ensure_project_path(root, &relative_path)?;
    atomic_write_text(&target, content)?;
    Ok(())
}

pub(crate) fn write_author_visible_candidate_draft(
    root: &Path,
    chapter_id: &str,
    content: &str,
) -> Result<(), ProjectError> {
    let relative_path = next_author_visible_version_path(root, "正文", chapter_id)?;
    let target = ensure_project_path(root, &relative_path)?;
    atomic_write_text(&target, content)?;
    Ok(())
}

pub(crate) fn backup_author_visible_file(root: &Path, relative_path: &str) -> Result<(), ProjectError> {
    let source = ensure_project_path(root, relative_path)?;
    if !source.exists() {
        return Ok(());
    }
    let content = fs::read_to_string(&source).unwrap_or_default();
    if is_placeholder_or_empty(&content) {
        return Ok(());
    }
    let (folder, chapter_id) = split_author_visible_chapter_path(relative_path)?;
    let backup_relative = next_author_visible_version_path(root, &folder, &chapter_id)?;
    let backup = ensure_project_path(root, &backup_relative)?;
    atomic_write_text(&backup, &content)?;
    Ok(())
}

pub(crate) fn split_author_visible_chapter_path(
    relative_path: &str,
) -> Result<(String, String), ProjectError> {
    if let Some(file_name) = relative_path
        .strip_prefix("正文/")
        .and_then(|value| value.strip_suffix(".md"))
    {
        return Ok(("正文".to_owned(), chapter_id_from_author_title(file_name)));
    }
    if let Some(file_name) = relative_path
        .strip_prefix("蓝图/")
        .and_then(|value| value.strip_suffix(".md"))
    {
        return Ok(("蓝图".to_owned(), chapter_id_from_author_title(file_name)));
    }
    Err(ProjectError::InvalidInput(format!(
        "无法识别作者可见章节路径：{relative_path}"
    )))
}

pub(crate) fn next_author_visible_version_path(
    root: &Path,
    folder: &str,
    chapter_id: &str,
) -> Result<String, ProjectError> {
    let base = chapter_title_for_filename(chapter_id);
    for index in 1..10_000 {
        let relative_path = format!("{folder}/{base}{index}.md");
        if !ensure_project_path(root, &relative_path)?.exists() {
            return Ok(relative_path);
        }
    }
    Err(ProjectError::InvalidInput(
        "作者可见版本文件过多，无法生成新的数字后缀。".to_owned(),
    ))
}

pub(crate) fn author_visible_manuscript_path(chapter_id: &str) -> String {
    format!("正文/{}.md", chapter_title_for_filename(chapter_id))
}

pub(crate) fn author_visible_blueprint_path(chapter_id: &str) -> String {
    format!("蓝图/{}.md", chapter_title_for_filename(chapter_id))
}

pub(crate) fn chapter_title_for_filename(chapter_id: &str) -> String {
    let number = normalize_chapter_id(chapter_id).parse::<u32>().unwrap_or(1);
    format!("第{}章", number_to_chinese(number))
}

pub(crate) fn chapter_id_from_author_title(title: &str) -> String {
    let core = title
        .trim()
        .trim_start_matches('第')
        .split('章')
        .next()
        .unwrap_or(title)
        .trim();
    let digits = core
        .chars()
        .filter(|ch| ch.is_ascii_digit())
        .collect::<String>();
    if !digits.is_empty() {
        return normalize_chapter_id(&digits);
    }
    if let Some(number) = chinese_to_number(core) {
        return normalize_chapter_id(&number.to_string());
    }
    normalize_chapter_id("001")
}

pub(crate) fn number_to_chinese(number: u32) -> String {
    if number == 0 {
        return "零".to_owned();
    }
    if number <= 10 {
        return digit_to_chinese(number).to_owned();
    }
    if number < 20 {
        return format!(
            "十{}",
            if number % 10 == 0 {
                ""
            } else {
                digit_to_chinese(number % 10)
            }
        );
    }
    if number < 100 {
        let tens = number / 10;
        let ones = number % 10;
        return format!(
            "{}十{}",
            digit_to_chinese(tens),
            if ones == 0 {
                ""
            } else {
                digit_to_chinese(ones)
            }
        );
    }
    if number < 1000 {
        let hundreds = number / 100;
        let rest = number % 100;
        if rest == 0 {
            return format!("{}百", digit_to_chinese(hundreds));
        }
        return format!(
            "{}百{}",
            digit_to_chinese(hundreds),
            number_to_chinese(rest)
        );
    }
    number.to_string()
}

pub(crate) fn digit_to_chinese(number: u32) -> &'static str {
    match number {
        1 => "一",
        2 => "二",
        3 => "三",
        4 => "四",
        5 => "五",
        6 => "六",
        7 => "七",
        8 => "八",
        9 => "九",
        10 => "十",
        _ => "零",
    }
}

pub(crate) fn chinese_to_number(value: &str) -> Option<u32> {
    if value.is_empty() {
        return None;
    }
    if value == "十" {
        return Some(10);
    }
    if let Some((left, right)) = value.split_once('百') {
        let hundreds = chinese_digit(left)? * 100;
        let rest = if right.is_empty() {
            0
        } else {
            chinese_to_number(right)?
        };
        return Some(hundreds + rest);
    }
    if let Some((left, right)) = value.split_once('十') {
        let tens = if left.is_empty() {
            1
        } else {
            chinese_digit(left)?
        };
        let ones = if right.is_empty() {
            0
        } else {
            chinese_digit(right)?
        };
        return Some(tens * 10 + ones);
    }
    chinese_digit(value)
}

pub(crate) fn chinese_digit(value: &str) -> Option<u32> {
    match value {
        "一" => Some(1),
        "二" => Some(2),
        "三" => Some(3),
        "四" => Some(4),
        "五" => Some(5),
        "六" => Some(6),
        "七" => Some(7),
        "八" => Some(8),
        "九" => Some(9),
        _ => None,
    }
}

pub(crate) fn update_author_confirmation(root: &Path) -> Result<(), ProjectError> {
    let chapters_dir = ensure_project_path(root, "manuscript/chapters")?;
    let mut entries = Vec::new();

    if chapters_dir.exists() {
        for entry in fs::read_dir(chapters_dir)? {
            let entry = entry?;
            let path = entry.path();
            if path.extension().and_then(|value| value.to_str()) != Some("md") {
                continue;
            }

            let content = fs::read_to_string(&path)?;
            if is_placeholder_or_empty(&content) {
                continue;
            }

            let chapter_id = path
                .file_stem()
                .and_then(|value| value.to_str())
                .unwrap_or("unknown");
            let title = content
                .lines()
                .find(|line| line.trim_start().starts_with('#'))
                .map(|line| line.trim_start_matches('#').trim())
                .filter(|title| !title.is_empty())
                .unwrap_or("未命名章节");

            entries.push(format!(
                "- {chapter_id}《{title}》：{} 字",
                count_words(&content)
            ));
        }
    }

    entries.sort();
    let content = if entries.is_empty() {
        "# 作者确认链\n\n".to_owned()
    } else {
        "# 作者确认链\n\n以下章节已保存为作者确认正文，后续 AI 生成必须尊重。\n\n".to_owned()
    };
    let content = format!("{content}{}\n", entries.join("\n"));
    let target = ensure_project_path(root, "facts/author-confirmation.md")?;
    atomic_write_text(&target, &content)?;
    Ok(())
}

pub(crate) fn write_chapter_commit(root: &Path, chapter_id: &str, content: &str) -> Result<(), ProjectError> {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or_default();
    let relative_path = format!(".olienta-events/commits/{timestamp}-{chapter_id}.json");
    let target = ensure_project_path(root, &relative_path)?;
    let commit = serde_json::json!({
        "kind": "chapter_saved",
        "chapterId": chapter_id,
        "wordCount": count_words(content),
        "createdAtUnix": timestamp
    });
    atomic_write_text(&target, &serde_json::to_string_pretty(&commit)?)?;
    Ok(())
}

pub(crate) fn write_if_missing(root: &Path, relative_path: &str, content: &str) -> Result<(), ProjectError> {
    let target = ensure_project_path(root, relative_path)?;
    if !target.exists() {
        atomic_write_text(&target, content)?;
    }
    Ok(())
}

pub(crate) fn migrate_legacy_framework_file(
    root: &Path,
    legacy_relative_path: &str,
    current_relative_path: &str,
) -> Result<(), ProjectError> {
    let legacy = ensure_project_path(root, legacy_relative_path)?;
    let current = ensure_project_path(root, current_relative_path)?;
    if legacy.exists() && !current.exists() {
        let content = fs::read_to_string(legacy)?;
        atomic_write_text(&current, &content)?;
    }
    Ok(())
}

pub(crate) fn read_summary(root: &Path) -> Result<ProjectSummary, ProjectError> {
    let project = read_project_yaml(root)?;
    Ok(ProjectSummary {
        name: project.name,
        root_path: display_project_path(&root.canonicalize()?),
        language: project.language,
        chapter_count: project.chapter_count,
    })
}

pub(crate) fn display_project_path(path: &Path) -> String {
    strip_windows_verbatim_prefix(&path.to_string_lossy()).to_owned()
}

pub(crate) fn strip_windows_verbatim_prefix(path: &str) -> &str {
    path.strip_prefix(r"\\?\UNC\")
        .map(|value| {
            // \\?\UNC\server\share is the verbatim form of \\server\share.
            // Re-add the leading double slash after removing the marker.
            // This branch is uncommon for local projects, but keeps network paths readable.
            value
        })
        .map(|value| {
            // This returns a borrowed suffix; callers that need exact UNC semantics should
            // already go through PathBuf before display. Local drive paths use the branch below.
            value
        })
        .or_else(|| path.strip_prefix(r"\\?\"))
        .unwrap_or(path)
}

pub(crate) fn read_project_yaml(root: &Path) -> Result<ProjectYaml, ProjectError> {
    let path = ensure_project_path(root, "project.yaml")?;
    let content = fs::read_to_string(path)?;
    Ok(serde_yaml::from_str(&content)?)
}

pub(crate) fn fallback_project_yaml(root: &Path) -> ProjectYaml {
    let name = root
        .file_name()
        .and_then(|value| value.to_str())
        .filter(|value| !value.trim().is_empty())
        .unwrap_or("未命名作品")
        .to_owned();

    ProjectYaml {
        name,
        language: "zh-CN".to_owned(),
        template: "blank".to_owned(),
        storage: "local-files".to_owned(),
        chapter_count: 1,
        target_words_per_chapter: 3000,
    }
}

pub(crate) fn fallback_language(language: &str) -> String {
    if language.trim().is_empty() {
        "zh-CN".to_owned()
    } else {
        language.trim().to_owned()
    }
}

pub(crate) fn normalize_chapter_id(chapter_id: &str) -> String {
    let digits: String = chapter_id
        .chars()
        .filter(|value| value.is_ascii_digit())
        .collect();
    let number = digits.parse::<u32>().unwrap_or(1).max(1);
    format!("{number:03}")
}

pub(crate) fn count_words(content: &str) -> usize {
    content
        .chars()
        .filter(|value| !value.is_whitespace())
        .count()
}

pub(crate) fn is_placeholder_or_empty(content: &str) -> bool {
    let body = content
        .lines()
        .filter(|line| !line.trim_start().starts_with('#'))
        .collect::<Vec<_>>()
        .join("")
        .trim()
        .to_owned();

    body.is_empty() || body.contains("正文待写")
}

pub(crate) fn extract_title(content: &str) -> Option<String> {
    content
        .lines()
        .find(|line| line.trim_start().starts_with('#'))
        .map(|line| line.trim_start_matches('#').trim().to_owned())
        .filter(|title| !title.is_empty())
}

pub(crate) fn reject_software_directory_project_path(root: &Path) -> Result<(), ProjectError> {
    if is_inside_probable_olienta_software_dir(root) || is_inside_dev_olienta_workspace(root) {
        return Err(ProjectError::InvalidInput(
            "小说项目不能放在 Olienta 软件目录内部。请选择软件目录外的作品文件夹，例如“文档/Olienta Projects/作品名”，或任意 Obsidian 可直接打开的小说文件夹。".to_owned(),
        ));
    }

    Ok(())
}

pub(crate) fn is_inside_probable_olienta_software_dir(root: &Path) -> bool {
    let mut current = Some(root);
    while let Some(path) = current {
        if is_probable_olienta_software_dir(path) {
            return true;
        }
        current = path.parent();
    }

    false
}

pub(crate) fn is_probable_olienta_software_dir(root: &Path) -> bool {
    root.join("app")
        .join("src-tauri")
        .join("tauri.conf.json")
        .exists()
        || root.join("app").join("package.json").exists()
        || root.join("src-tauri").join("tauri.conf.json").exists()
        || root.join("package.json").exists() && root.join("src-tauri").exists()
}

pub(crate) fn is_inside_dev_olienta_workspace(root: &Path) -> bool {
    let Some(manifest_dir) = option_env!("CARGO_MANIFEST_DIR") else {
        return false;
    };
    let dev_root = PathBuf::from(manifest_dir)
        .parent()
        .and_then(|path| path.parent())
        .map(Path::to_path_buf);
    let Some(dev_root) = dev_root else {
        return false;
    };
    let Ok(dev_root) = dev_root.canonicalize() else {
        return false;
    };
    let candidate_root = root.canonicalize().unwrap_or_else(|_| root.to_path_buf());
    let canonical_root = if candidate_root.is_absolute() {
        candidate_root
    } else {
        std::env::current_dir()
            .map(|cwd| cwd.join(candidate_root))
            .unwrap_or_else(|_| root.to_path_buf())
    };

    canonical_root.starts_with(dev_root)
}

pub(crate) fn save_chapter_side_file(
    root_path: String,
    chapter_id: String,
    folder: &str,
    content: String,
) -> Result<ProjectFileDocument, ProjectError> {
    let root = PathBuf::from(root_path);
    let id = normalize_chapter_id(&chapter_id);
    let relative_path = format!("{folder}/{id}.md");
    let path = ensure_project_path(&root, &relative_path)?;
    atomic_write_text(&path, &content)?;

    Ok(ProjectFileDocument {
        relative_path,
        content,
    })
}

pub(crate) fn write_generation_context_snapshot(
    root: &Path,
    task: &str,
    target: &str,
    prompt: &str,
) -> Result<String, ProjectError> {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let safe_task = task
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' {
                ch
            } else {
                '-'
            }
        })
        .collect::<String>();
    let relative_path = format!("logs/agent-context/{safe_task}-{timestamp}.md");
    let path = ensure_project_path(root, &relative_path)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    let snapshot = format!(
        "# AI generation context snapshot\n\nTask: {task}\nTarget: {target}\n\n---\n\n{prompt}\n"
    );
    atomic_write_text(&path, &snapshot)?;
    Ok(relative_path)
}

pub(crate) fn trim_to_chars(value: &str, max_chars: usize) -> String {
    let trimmed = value.trim();
    let mut output = String::new();
    for (index, ch) in trimmed.chars().enumerate() {
        if index >= max_chars {
            output.push_str("\n\n[已截断]");
            return output;
        }
        output.push(ch);
    }
    output
}

pub(crate) fn load_chapter_side_file(
    root_path: String,
    chapter_id: String,
    folder: &str,
) -> Result<ProjectFileDocument, ProjectError> {
    let root = PathBuf::from(root_path);
    let id = normalize_chapter_id(&chapter_id);
    let relative_path = format!("{folder}/{id}.md");
    let path = ensure_project_path(&root, &relative_path)?;
    let content = fs::read_to_string(path).unwrap_or_default();

    Ok(ProjectFileDocument {
        relative_path,
        content,
    })
}

pub(crate) fn read_framework_files(root: &Path) -> Result<String, ProjectError> {
    let framework_dir = ensure_project_path(root, "framework")?;
    let mut chunks = Vec::new();

    if framework_dir.exists() {
        for entry in fs::read_dir(framework_dir)? {
            let entry = entry?;
            let path = entry.path();
            if path.extension().and_then(|value| value.to_str()) != Some("md") {
                continue;
            }
            let name = path
                .file_name()
                .and_then(|value| value.to_str())
                .unwrap_or("unknown.md");
            chunks.push(format!("### {name}\n\n{}", fs::read_to_string(&path)?));
        }
    }

    chunks.sort();
    Ok(chunks.join("\n\n"))
}

