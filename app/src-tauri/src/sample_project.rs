use crate::project_model::{
    ChapterDocument, ChapterSummary, FrameworkFileSummary, MarkdownFileSummary,
    ProjectFileDocument, ProjectHealthItem, ProjectHealthReport, ProjectSummary, ProjectVaultEntry,
    SkillFileSummary, VolumeInfo,
};

pub const SAMPLE_ROOT: &str = "sample://wutongboli";
const SAMPLE_NAME: &str = "无痛剥离";

pub fn is_sample_project(root_path: &str) -> bool {
    root_path.trim().eq_ignore_ascii_case(SAMPLE_ROOT)
}

pub fn readonly_error() -> String {
    "示例项目不支持修改、导入、导出或 AI 交互操作。请先创建或打开本地作品项目。".to_owned()
}

pub fn open_project() -> ProjectSummary {
    ProjectSummary {
        name: SAMPLE_NAME.to_owned(),
        root_path: SAMPLE_ROOT.to_owned(),
        language: "zh-CN".to_owned(),
        chapter_count: 3,
    }
}

pub fn list_chapters() -> Vec<ChapterSummary> {
    sample_chapters()
        .into_iter()
        .map(|(id, title, content)| ChapterSummary {
            id: id.to_owned(),
            title: title.to_owned(),
            words: count_text_units(content),
            state: if content.trim().is_empty() {
                "待写".to_owned()
            } else {
                "示例".to_owned()
            },
        })
        .collect()
}

pub fn load_chapter(chapter_id: &str) -> ChapterDocument {
    let id = normalize_sample_chapter_id(chapter_id);
    let (_, title, content) = sample_chapters()
        .into_iter()
        .find(|(candidate, _, _)| *candidate == id)
        .unwrap_or(("001", "第一章：样章", "# 第一章：样章\n\n这是示例项目正文。"));
    let content = if content.trim().is_empty() {
        format!("# {title}\n\n")
    } else {
        content.to_owned()
    };
    ChapterDocument {
        chapter_id: id.to_owned(),
        relative_path: format!("manuscript/chapters/{id}.md"),
        word_count: count_text_units(&content),
        content,
    }
}

pub fn load_author_input(chapter_id: &str) -> ProjectFileDocument {
    let id = normalize_sample_chapter_id(chapter_id);
    ProjectFileDocument {
        relative_path: format!("manuscript/author-input/{id}.md"),
        content: format!(
            "# 第 {id} 章作者输入\n\n这是示例项目的只读作者输入，用来展示 Olienta 的章节工作流。"
        ),
    }
}

pub fn load_blueprint(chapter_id: &str) -> ProjectFileDocument {
    let id = normalize_sample_chapter_id(chapter_id);
    ProjectFileDocument {
        relative_path: format!("blueprints/chapters/{id}.md"),
        content: format!(
            "# 第 {id} 章蓝图\n\n- 本章展示示例项目结构。\n- AI 生成和保存动作在示例项目中被禁用。\n- 创建本地项目后可以正常生成和保存。"
        ),
    }
}

pub fn load_candidate(chapter_id: &str) -> ProjectFileDocument {
    let id = normalize_sample_chapter_id(chapter_id);
    ProjectFileDocument {
        relative_path: format!("manuscript/candidates/{id}.md"),
        content: format!(
            "# 第 {id} 章候选稿\n\n示例项目不保存候选稿；这里仅展示候选稿区域的只读状态。"
        ),
    }
}

pub fn load_volumes() -> Vec<VolumeInfo> {
    vec![VolumeInfo {
        id: "volume-1".to_owned(),
        title: "第一卷".to_owned(),
        start_chapter: 1,
        end_chapter: 3,
        summary: "示例项目卷设置。".to_owned(),
    }]
}

pub fn list_framework_files() -> Vec<FrameworkFileSummary> {
    framework_files()
        .into_iter()
        .enumerate()
        .map(|(index, (name, _))| FrameworkFileSummary {
            id: format!("{:02}", index + 1),
            name: framework_title(name).to_owned(),
            relative_path: format!("framework/{name}"),
        })
        .collect()
}

pub fn load_framework_file(file_name: &str) -> ProjectFileDocument {
    let safe_name = normalize_framework_name(file_name);
    let content = framework_files()
        .into_iter()
        .find(|(name, _)| *name == safe_name)
        .map(|(_, content)| content.to_owned())
        .unwrap_or_else(|| format!("# {}\n\n示例项目中没有找到这个故事框架文件。", safe_name));
    ProjectFileDocument {
        relative_path: format!("framework/{safe_name}"),
        content,
    }
}

pub fn load_knowledge_file(kind: &str) -> ProjectFileDocument {
    let (relative_path, title, body) = match kind {
        "open-loops" | "loops" => (
            "facts/open-loops.md",
            "未闭合伏笔",
            "- 示例伏笔：一次未解释的旧电话。",
        ),
        "forbidden" | "forbidden-rules" => (
            "facts/forbidden-rules.md",
            "禁止违背",
            "- 示例规则：不要把示例项目当作真实项目写入。",
        ),
        _ => (
            "facts/confirmed-facts.md",
            "已确认事实",
            "- 示例项目名为《无痛剥离》。\n- 示例项目只读，用于预览工作流。",
        ),
    };
    ProjectFileDocument {
        relative_path: relative_path.to_owned(),
        content: format!("# {title}\n\n{body}\n"),
    }
}

pub fn load_ai_providers() -> ProjectFileDocument {
    ProjectFileDocument {
        relative_path: "软件设置/ai-providers.json".to_owned(),
        content: "[]\n".to_owned(),
    }
}

pub fn list_selected_skills() -> Vec<SkillFileSummary> {
    vec![SkillFileSummary {
        name: "sample-readonly-skill.md".to_owned(),
        relative_path: "skills/selected/sample-readonly-skill.md".to_owned(),
        bytes: 128,
        disabled: false,
        temporary: false,
        category: "sample".to_owned(),
        conflict_tags: Vec::new(),
        scope: "project".to_owned(),
    }]
}

pub fn load_skill_file(file_name: &str) -> ProjectFileDocument {
    let safe_name = if file_name.trim().is_empty() {
        "sample-readonly-skill.md"
    } else {
        file_name.trim()
    };
    ProjectFileDocument {
        relative_path: format!("skills/selected/{safe_name}"),
        content: "# Sample Readonly Skill\n\nThis sample skill is shown for preview only. It cannot be edited in the sample project.\n".to_owned(),
    }
}

pub fn list_project_markdown_files() -> Vec<MarkdownFileSummary> {
    vec![
        MarkdownFileSummary {
            category: "故事框架".to_owned(),
            relative_path: "framework/02-premise.md".to_owned(),
            bytes: 512,
        },
        MarkdownFileSummary {
            category: "正文".to_owned(),
            relative_path: "manuscript/chapters/001.md".to_owned(),
            bytes: 256,
        },
    ]
}

pub fn list_project_vault_entries() -> Vec<ProjectVaultEntry> {
    vec![
        ProjectVaultEntry {
            category: "故事框架".to_owned(),
            relative_path: "framework/02-premise.md".to_owned(),
            bytes: 512,
            extension: "md".to_owned(),
            readable: true,
        },
        ProjectVaultEntry {
            category: "正文".to_owned(),
            relative_path: "manuscript/chapters/001.md".to_owned(),
            bytes: 256,
            extension: "md".to_owned(),
            readable: true,
        },
    ]
}

pub fn load_project_markdown_file(relative_path: &str) -> ProjectFileDocument {
    let normalized = relative_path.replace('\\', "/");
    let content = if normalized.starts_with("framework/") {
        load_framework_file(normalized.trim_start_matches("framework/")).content
    } else if normalized.starts_with("manuscript/chapters/") {
        let id = normalized
            .rsplit('/')
            .next()
            .and_then(|name| name.strip_suffix(".md"))
            .unwrap_or("001");
        load_chapter(id).content
    } else {
        "# 示例项目文件\n\n这是示例项目中的只读预览文件。".to_owned()
    };
    ProjectFileDocument {
        relative_path: normalized,
        content,
    }
}

pub fn inspect_project_health() -> ProjectHealthReport {
    ProjectHealthReport {
        status: "ready".to_owned(),
        ready: true,
        missing_count: 0,
        warning_count: 0,
        checks: vec![ProjectHealthItem {
            kind: "sample".to_owned(),
            label: "示例项目".to_owned(),
            relative_path: SAMPLE_ROOT.to_owned(),
            status: "ok".to_owned(),
            message: "示例项目已由内置只读数据提供。".to_owned(),
        }],
    }
}

fn sample_chapters() -> Vec<(&'static str, &'static str, &'static str)> {
    vec![
        (
            "001",
            "第一章：样章",
            "# 第一章：样章\n\n杨志远站在深圳 CBD 的电梯间里，手机屏幕亮着，诊所的账、客户的消息和旧日关系同时压到眼前。\n\n这不是正式项目正文，只是示例项目用来展示章节页面的只读内容。",
        ),
        (
            "002",
            "第二章：压力",
            "# 第二章：压力\n\n这一章展示蓝图和正文之间的关系。示例项目不会写入磁盘，也不会调用 AI。",
        ),
        (
            "003",
            "第三章：剥离",
            "# 第三章：剥离\n\n示例项目用于预览结构，不用于实际创作。创建本地项目后，保存、导入、生成都会恢复可用。",
        ),
    ]
}

fn framework_files() -> Vec<(&'static str, &'static str)> {
    vec![
        (
            "01-setting.md",
            "# 小说设置\n\n- 书名：无痛剥离\n- 类型：现实主义长篇\n- 位置：深圳 CBD\n- 状态：示例只读项目",
        ),
        (
            "02-premise.md",
            "# 故事概述\n\n一个经营医美诊所的男人，在商业、欲望和亲密关系中逐层失去控制，最终被迫面对自己是否还有爱的能力。",
        ),
        (
            "03-characters.md",
            "# 角色图谱\n\n## 杨志远\n\n诊所经营者，擅长计算风险，却不擅长面对情感。\n\n## 王小燕\n\n长期在场的人，代表被忽略的关系成本。",
        ),
        (
            "04-plot-outline.md",
            "# 情节大纲\n\n- 第一卷：诊所扩张。\n- 第二卷：关系与资金压力。\n- 第三卷：剥离与失控。",
        ),
        (
            "05-world.md",
            "# 世界观\n\n深圳 CBD、医美行业、疫情后消费变化和中小企业压力共同构成故事环境。",
        ),
        (
            "06-style.md",
            "# 文风配置\n\n冷静、克制、现实主义。用物证和行动承载心理变化。",
        ),
        (
            "07-scenes.md",
            "# 重要场景\n\n- 诊所前台。\n- 电梯间。\n- 手术室灯光。\n- 深夜账本。",
        ),
    ]
}

fn normalize_sample_chapter_id(chapter_id: &str) -> &'static str {
    match chapter_id.trim().trim_end_matches(".md") {
        "2" | "02" | "002" => "002",
        "3" | "03" | "003" => "003",
        _ => "001",
    }
}

fn normalize_framework_name(file_name: &str) -> String {
    let name = file_name
        .replace('\\', "/")
        .rsplit('/')
        .next()
        .unwrap_or("01-setting.md")
        .trim()
        .to_owned();
    if name.is_empty() {
        "01-setting.md".to_owned()
    } else {
        name
    }
}

fn framework_title(file_name: &str) -> &'static str {
    match file_name {
        "01-setting.md" => "小说设置",
        "02-premise.md" => "故事概述",
        "03-characters.md" => "角色图谱",
        "04-plot-outline.md" => "情节大纲",
        "05-world.md" => "世界观",
        "06-style.md" => "文风配置",
        "07-scenes.md" => "重要场景",
        _ => "故事框架",
    }
}

fn count_text_units(content: &str) -> usize {
    content.chars().filter(|ch| !ch.is_whitespace()).count()
}
