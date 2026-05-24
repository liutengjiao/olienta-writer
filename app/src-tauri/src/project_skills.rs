use std::fs;
use std::path::{Path, PathBuf};

use crate::fs_safety::{atomic_write_text, ensure_project_path};
use crate::project_events::append_system_event;
use crate::project_model::{ProjectError, ProjectFileDocument, SkillFileSummary};

pub fn list_selected_skills(root_path: String) -> Result<Vec<SkillFileSummary>, ProjectError> {
    let root = PathBuf::from(root_path);
    let skills_dir = ensure_project_path(&root, "skills/selected")?;
    let disabled = read_skill_name_list(&root, ".olienta/disabled-skills.json")?;
    let temporary = read_skill_name_list(&root, ".olienta/temporary-skills.json")?;
    let mut skills = Vec::new();

    if skills_dir.exists() {
        for entry in fs::read_dir(skills_dir)? {
            let entry = entry?;
            let path = entry.path();
            if path.extension().and_then(|value| value.to_str()) != Some("md") {
                continue;
            }

            let name = path
                .file_name()
                .and_then(|value| value.to_str())
                .unwrap_or("unknown.md")
                .to_owned();
            let content = fs::read_to_string(&path).unwrap_or_default();
            skills.push(build_skill_summary(
                name.clone(),
                format!("skills/selected/{name}"),
                &path,
                &content,
                disabled.contains(&name),
                temporary.contains(&name),
            ));
        }
    }

    skills.sort_by(|left, right| left.relative_path.cmp(&right.relative_path));
    Ok(skills)
}

pub fn import_skill_file(
    root_path: String,
    source_path: String,
) -> Result<SkillFileSummary, ProjectError> {
    let mut source = PathBuf::from(source_path);
    if source.is_dir() {
        let skill_md = source.join("SKILL.md");
        let skill_lower = source.join("skill.md");
        if skill_md.exists() {
            source = skill_md;
        } else if skill_lower.exists() {
            source = skill_lower;
        } else {
            return Err(ProjectError::InvalidInput(
                "Skill 文件夹中没有 SKILL.md。".to_owned(),
            ));
        }
    }
    let extension = source
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_ascii_lowercase());
    if !matches!(extension.as_deref(), Some("md" | "markdown")) {
        return Err(ProjectError::InvalidInput(
            "Skill 必须是 Markdown 文件。".to_owned(),
        ));
    }

    let source_name = source
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("skill.md");
    let safe_name = skill_file_name(source_name);
    let root = PathBuf::from(root_path);
    let relative_path = format!("skills/selected/{safe_name}");
    let target = ensure_project_path(&root, &relative_path)?;
    let content = fs::read_to_string(&source)?;
    atomic_write_text(&target, &content)?;
    append_system_event(
        &root,
        "skill_imported",
        serde_json::json!({
            "name": safe_name.clone(),
            "path": relative_path.clone(),
            "sourcePath": source.to_string_lossy().to_string()
        }),
    )?;
    Ok(build_skill_summary(
        safe_name,
        relative_path,
        &target,
        &content,
        false,
        false,
    ))
}

pub fn set_skill_disabled(
    root_path: String,
    file_name: String,
    disabled: bool,
) -> Result<Vec<SkillFileSummary>, ProjectError> {
    let root = PathBuf::from(&root_path);
    let safe_name = skill_file_name(&file_name);
    update_skill_name_list(&root, ".olienta/disabled-skills.json", &safe_name, disabled)?;
    append_system_event(
        &root,
        "skill_disabled_changed",
        serde_json::json!({
            "name": safe_name,
            "disabled": disabled
        }),
    )?;
    list_selected_skills(root_path)
}

pub fn set_temporary_skill(
    root_path: String,
    file_name: String,
    temporary: bool,
) -> Result<Vec<SkillFileSummary>, ProjectError> {
    let root = PathBuf::from(&root_path);
    let safe_name = skill_file_name(&file_name);
    update_skill_name_list(
        &root,
        ".olienta/temporary-skills.json",
        &safe_name,
        temporary,
    )?;
    append_system_event(
        &root,
        "skill_temporary_changed",
        serde_json::json!({
            "name": safe_name,
            "temporary": temporary
        }),
    )?;
    list_selected_skills(root_path)
}

pub fn analyze_skill_conflicts(root_path: String) -> Result<Vec<String>, ProjectError> {
    let root = PathBuf::from(root_path);
    analyze_skill_conflicts_for_root(&root)
}

pub fn load_skill_file(
    root_path: String,
    file_name: String,
) -> Result<ProjectFileDocument, ProjectError> {
    let root = PathBuf::from(root_path);
    let safe_name = skill_file_name(&file_name);
    let relative_path = format!("skills/selected/{safe_name}");
    let path = ensure_project_path(&root, &relative_path)?;
    let content = fs::read_to_string(path).unwrap_or_default();
    Ok(ProjectFileDocument {
        relative_path,
        content,
    })
}

pub(crate) fn skill_file_name(file_name: &str) -> String {
    let name = file_name
        .chars()
        .filter(|value| value.is_ascii_alphanumeric() || matches!(value, '-' | '_' | '.'))
        .collect::<String>();
    let fallback = if name.is_empty() {
        "skill.md".to_owned()
    } else {
        name
    };

    if fallback.ends_with(".md") {
        fallback
    } else {
        format!("{fallback}.md")
    }
}

#[derive(Debug, Clone)]
struct SkillAnalysis {
    name: String,
    category: String,
    conflict_tags: Vec<String>,
    scope: String,
}

fn build_skill_summary(
    name: String,
    relative_path: String,
    path: &Path,
    content: &str,
    disabled: bool,
    temporary: bool,
) -> SkillFileSummary {
    let analysis = analyze_skill_file(&name, content);
    let bytes = path.metadata().map(|metadata| metadata.len()).unwrap_or(0);

    SkillFileSummary {
        name,
        relative_path,
        bytes,
        disabled,
        temporary,
        category: analysis.category,
        conflict_tags: analysis.conflict_tags,
        scope: analysis.scope,
    }
}

fn analyze_skill_file(name: &str, content: &str) -> SkillAnalysis {
    let metadata = parse_skill_front_matter(content);
    let search = format!(
        "{}\n{}",
        name.to_ascii_lowercase(),
        content.to_ascii_lowercase()
    );
    let category = metadata
        .get("category")
        .or_else(|| metadata.get("type"))
        .cloned()
        .unwrap_or_else(|| infer_skill_category(&search));
    let scope = metadata
        .get("scope")
        .cloned()
        .unwrap_or_else(|| infer_skill_scope(&search));
    let mut conflict_tags = metadata
        .get("conflicts")
        .or_else(|| metadata.get("conflict_tags"))
        .or_else(|| metadata.get("tags"))
        .map(|value| parse_skill_list_value(value))
        .unwrap_or_default();

    add_inferred_skill_tags(&search, &mut conflict_tags);
    conflict_tags.sort();
    conflict_tags.dedup();

    SkillAnalysis {
        name: name.to_owned(),
        category,
        conflict_tags,
        scope,
    }
}

fn parse_skill_front_matter(content: &str) -> std::collections::HashMap<String, String> {
    let mut metadata = std::collections::HashMap::new();
    let normalized = content.strip_prefix('\u{feff}').unwrap_or(content);
    let Some(rest) = normalized.strip_prefix("---") else {
        return metadata;
    };
    let rest = rest
        .strip_prefix('\n')
        .or_else(|| rest.strip_prefix("\r\n"));
    let Some(rest) = rest else {
        return metadata;
    };

    for line in rest.lines() {
        if line.trim() == "---" {
            break;
        }
        let Some((key, value)) = line.split_once(':') else {
            continue;
        };
        let key = key.trim().to_ascii_lowercase();
        let value = value.trim().trim_matches('"').trim_matches('\'').to_owned();
        if !key.is_empty() && !value.is_empty() {
            metadata.insert(key, value);
        }
    }

    metadata
}

fn parse_skill_list_value(value: &str) -> Vec<String> {
    let trimmed = value
        .trim()
        .trim_start_matches('[')
        .trim_end_matches(']')
        .trim();
    trimmed
        .split(',')
        .flat_map(|part| part.split('|'))
        .map(|part| part.trim().trim_matches('"').trim_matches('\''))
        .filter(|part| !part.is_empty())
        .map(normalize_skill_tag)
        .collect()
}

fn infer_skill_category(search: &str) -> String {
    if contains_any(search, &["pacing", "节奏", "爽点", "留白", "钩子"]) {
        "pacing".to_owned()
    } else if contains_any(
        search,
        &["style", "风格", "文风", "语气", "去ai味", "现实主义"],
    ) {
        "style".to_owned()
    } else if contains_any(search, &["structure", "结构", "三幕", "起承转合", "章节"]) {
        "structure".to_owned()
    } else if contains_any(search, &["fact", "事实", "设定", "时间线", "一致性"]) {
        "facts".to_owned()
    } else if contains_any(search, &["blueprint", "蓝图", "大纲", "情节"]) {
        "blueprint".to_owned()
    } else {
        "general".to_owned()
    }
}

fn infer_skill_scope(search: &str) -> String {
    if contains_any(search, &["chapter", "章节", "本章", "单章"]) {
        "chapter".to_owned()
    } else if contains_any(search, &["rewrite", "改写", "润色", "候选稿"]) {
        "rewrite".to_owned()
    } else if contains_any(search, &["project", "全书", "长期", "全局"]) {
        "project".to_owned()
    } else {
        "general".to_owned()
    }
}

fn add_inferred_skill_tags(search: &str, tags: &mut Vec<String>) {
    if contains_any(
        search,
        &[
            "fast-pace",
            "快节奏",
            "爽点",
            "强钩子",
            "强推进",
            "商业节奏",
        ],
    ) {
        tags.push("fast-pace".to_owned());
    }
    if contains_any(
        search,
        &["slow-burn", "慢节奏", "留白", "克制", "文学性", "现实主义"],
    ) {
        tags.push("slow-burn".to_owned());
    }
    if contains_any(
        search,
        &[
            "strict-outline",
            "严格遵循",
            "不得改动",
            "不得偏离",
            "必须遵守",
        ],
    ) {
        tags.push("strict-outline".to_owned());
    }
    if contains_any(
        search,
        &["free-rewrite", "自由发挥", "大胆改写", "即兴", "发散"],
    ) {
        tags.push("free-rewrite".to_owned());
    }
    if contains_any(search, &["first-person", "第一人称", "我叙事"]) {
        tags.push("first-person".to_owned());
    }
    if contains_any(search, &["third-person", "第三人称", "他叙事", "她叙事"]) {
        tags.push("third-person".to_owned());
    }
}

fn normalize_skill_tag(value: &str) -> String {
    let normalized = value.trim().to_ascii_lowercase().replace('_', "-");
    match normalized.as_str() {
        "fast" | "fast-paced" | "commercial" => "fast-pace".to_owned(),
        "slow" | "slowburn" | "slow-paced" | "literary" => "slow-burn".to_owned(),
        "strict" | "outline" | "strict-outline" => "strict-outline".to_owned(),
        "free" | "rewrite" | "freeform" | "free-rewrite" => "free-rewrite".to_owned(),
        "first" | "first-person" => "first-person".to_owned(),
        "third" | "third-person" => "third-person".to_owned(),
        _ => normalized,
    }
}

fn contains_any(haystack: &str, needles: &[&str]) -> bool {
    needles.iter().any(|needle| haystack.contains(needle))
}

fn read_skill_name_list(root: &Path, relative_path: &str) -> Result<Vec<String>, ProjectError> {
    let path = ensure_project_path(root, relative_path)?;
    if !path.exists() {
        return Ok(Vec::new());
    }

    let content = fs::read_to_string(path)?;
    let names: Vec<String> = serde_json::from_str(&content).unwrap_or_default();
    Ok(names
        .into_iter()
        .map(|name| skill_file_name(&name))
        .filter(|name| !name.trim().is_empty())
        .collect())
}

fn update_skill_name_list(
    root: &Path,
    relative_path: &str,
    file_name: &str,
    enabled: bool,
) -> Result<(), ProjectError> {
    let mut names = read_skill_name_list(root, relative_path)?;
    let safe_name = skill_file_name(file_name);

    if enabled {
        if !names.contains(&safe_name) {
            names.push(safe_name);
        }
    } else {
        names.retain(|name| name != &safe_name);
    }

    names.sort();
    names.dedup();
    let target = ensure_project_path(root, relative_path)?;
    atomic_write_text(&target, &(serde_json::to_string_pretty(&names)? + "\n"))?;
    Ok(())
}

fn analyze_skill_conflicts_for_root(root: &Path) -> Result<Vec<String>, ProjectError> {
    let disabled = read_skill_name_list(root, ".olienta/disabled-skills.json")?;
    let temporary = read_skill_name_list(root, ".olienta/temporary-skills.json")?;
    let skills_dir = ensure_project_path(root, "skills/selected")?;
    let mut active_skills = Vec::new();

    if skills_dir.exists() {
        for entry in fs::read_dir(skills_dir)? {
            let entry = entry?;
            let path = entry.path();
            if path.extension().and_then(|value| value.to_str()) != Some("md") {
                continue;
            }

            let name = path
                .file_name()
                .and_then(|value| value.to_str())
                .map(skill_file_name)
                .unwrap_or_else(|| "skill.md".to_owned());
            if disabled.contains(&name) && !temporary.contains(&name) {
                continue;
            }

            let content = fs::read_to_string(path)?;
            active_skills.push(analyze_skill_file(&name, &content));
        }
    }

    let mut warnings = Vec::new();
    push_pair_conflict_warning(
        &active_skills,
        &mut warnings,
        "fast-pace",
        "slow-burn",
        "节奏冲突",
        "快节奏/爽点",
        "慢节奏/留白",
        "请确认本章节奏。",
    );
    push_pair_conflict_warning(
        &active_skills,
        &mut warnings,
        "strict-outline",
        "free-rewrite",
        "改写边界冲突",
        "严格遵循蓝图",
        "自由发挥/大胆改写",
        "请确认 AI 改写边界。",
    );
    push_pair_conflict_warning(
        &active_skills,
        &mut warnings,
        "first-person",
        "third-person",
        "叙事视角冲突",
        "第一人称",
        "第三人称",
        "请确认本章叙事视角。",
    );

    if warnings.is_empty() && !active_skills.is_empty() {
        warnings.push(format!(
            "已启用 {} 个 Skill，分类：{}。未发现明显冲突。",
            active_skills.len(),
            summarize_skill_categories(&active_skills)
        ));
    }

    Ok(warnings)
}

fn push_pair_conflict_warning(
    skills: &[SkillAnalysis],
    warnings: &mut Vec<String>,
    left_tag: &str,
    right_tag: &str,
    title: &str,
    left_label: &str,
    right_label: &str,
    action: &str,
) {
    let left = skill_names_with_tag(skills, left_tag);
    let right = skill_names_with_tag(skills, right_tag);
    if left.is_empty() || right.is_empty() {
        return;
    }

    warnings.push(format!(
        "{title}：{} 偏{left_label}，{} 偏{right_label}，{action}",
        left.join("、"),
        right.join("、")
    ));
}

fn skill_names_with_tag(skills: &[SkillAnalysis], tag: &str) -> Vec<String> {
    skills
        .iter()
        .filter(|skill| skill.conflict_tags.iter().any(|value| value == tag))
        .map(|skill| skill.name.clone())
        .collect()
}

fn summarize_skill_categories(skills: &[SkillAnalysis]) -> String {
    let mut counts = std::collections::BTreeMap::<String, usize>::new();
    for skill in skills {
        *counts.entry(skill.category.clone()).or_default() += 1;
    }

    counts
        .into_iter()
        .map(|(category, count)| format!("{category} {count}"))
        .collect::<Vec<_>>()
        .join("、")
}

#[derive(Debug, Clone)]
struct SkillPromptChunk {
    name: String,
    content: String,
    analysis: SkillAnalysis,
    temporary: bool,
}

impl SkillPromptChunk {
    fn render(&self, max_chars: usize) -> String {
        let scope = if self.temporary {
            "临时启用"
        } else {
            "已选择"
        };
        let content = if max_chars == usize::MAX {
            self.content.clone()
        } else {
            trim_to_chars(&self.content, max_chars)
        };
        format!(
            "## {}（{}；category={}；scope={}）\n\n{}",
            self.name, scope, self.analysis.category, self.analysis.scope, content
        )
    }
}

fn read_active_skill_prompt_chunks(root: &Path) -> Result<Vec<SkillPromptChunk>, ProjectError> {
    let skills_dir = ensure_project_path(root, "skills/selected")?;
    let disabled = read_skill_name_list(root, ".olienta/disabled-skills.json")?;
    let temporary = read_skill_name_list(root, ".olienta/temporary-skills.json")?;
    let mut chunks = Vec::new();

    if skills_dir.exists() {
        for entry in fs::read_dir(skills_dir)? {
            let entry = entry?;
            let path = entry.path();
            if path.extension().and_then(|value| value.to_str()) != Some("md") {
                continue;
            }

            let name = path
                .file_name()
                .and_then(|value| value.to_str())
                .unwrap_or("unknown.md");
            let safe_name = skill_file_name(name);
            if disabled.contains(&safe_name) && !temporary.contains(&safe_name) {
                continue;
            }
            let content = fs::read_to_string(&path).unwrap_or_default();
            let analysis = analyze_skill_file(name, &content);
            chunks.push(SkillPromptChunk {
                name: name.to_owned(),
                content,
                analysis,
                temporary: temporary.contains(&safe_name),
            });
        }
    }

    chunks.sort_by(|left, right| left.name.cmp(&right.name));
    Ok(chunks)
}

pub(crate) fn read_selected_skills_for_task(root: &Path, task: &str) -> Result<String, ProjectError> {
    let chunks = read_active_skill_prompt_chunks(root)?;
    if chunks.is_empty() {
        Ok("没有启用的 Skill。".to_owned())
    } else {
        let mut selected = chunks
            .iter()
            .filter(|chunk| skill_matches_generation_task(chunk, task))
            .collect::<Vec<_>>();
        if selected.is_empty() {
            selected = chunks.iter().collect();
        }
        selected.sort_by_key(|chunk| skill_generation_priority(chunk, task));
        Ok(selected
            .into_iter()
            .take(8)
            .map(|chunk| chunk.render(2600))
            .collect::<Vec<_>>()
            .join("\n\n---\n\n"))
    }
}

fn skill_matches_generation_task(skill: &SkillPromptChunk, task: &str) -> bool {
    let name = skill.name.to_ascii_lowercase();
    let category = skill.analysis.category.to_ascii_lowercase();
    let scope = skill.analysis.scope.to_ascii_lowercase();
    let tags = skill.analysis.conflict_tags.join(" ");
    let search = format!("{name} {category} {scope} {}", tags.to_ascii_lowercase());

    match task {
        "framework" => contains_any(
            &search,
            &[
                "genre",
                "style",
                "structure",
                "planning",
                "context",
                "realism",
                "project",
                "pacing",
                "dialogue",
                "scene",
                "prose",
            ],
        ),
        "blueprint" => contains_any(
            &search,
            &[
                "blueprint",
                "planning",
                "pacing",
                "context",
                "open-loops",
                "web-serial",
                "genre",
                "facts",
                "memory",
            ],
        ),
        "facts" => contains_any(
            &search,
            &[
                "fact",
                "facts",
                "memory",
                "continuity",
                "review",
                "open-loops",
                "forbidden",
                "character-state",
            ],
        ),
        "chapter" => contains_any(
            &search,
            &[
                "chapter", "draft", "pacing", "prose", "dialogue", "scene", "style", "context",
                "review", "genre", "facts", "memory",
            ],
        ),
        "chat" => true,
        _ => true,
    }
}

fn skill_generation_priority(skill: &SkillPromptChunk, task: &str) -> usize {
    let name = skill.name.to_ascii_lowercase();
    let category = skill.analysis.category.to_ascii_lowercase();
    match task {
        "facts" if name.contains("fact-memory") => 0,
        "blueprint" if name.contains("chapter-blueprint") => 0,
        "chapter" if name.contains("chapter-context") => 0,
        "framework" if name.contains("serious-realism") => 0,
        _ if skill.temporary => 1,
        _ if category == task => 2,
        _ if skill.analysis.scope == "project" => 3,
        _ => 4,
    }
}

fn write_default_skill_file(root: &Path, relative_path: &str, content: &str) -> Result<(), ProjectError> {
    let target = ensure_project_path(root, relative_path)?;
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent)?;
    }
    atomic_write_text(&target, content)?;
    Ok(())
}

fn write_default_skill_files_english(root: &Path) -> Result<bool, ProjectError> {
    let files = [
        (
            "skills/selected/fact-memory-extraction.md",
            r#"---
name: fact-memory-extraction
description: Extract durable story memory from confirmed manuscript and confirmed chapter blueprints. Use after saving manuscript chapters, saving official blueprints, or rebuilding facts, open loops, character growth, plot progress, relationship changes, and continuity constraints.
category: memory
scope: project
tags:
  - fact-database
  - open-loops
  - continuity
  - character-state
---

# Fact Memory Extraction

## Goal

Convert author-confirmed manuscript and author-confirmed chapter blueprints into a durable fact database that every later AI call must obey. This is not a prose summary. It is the searchable memory contract for a long novel.

Only record narrative reality that has been confirmed by the author. Do not expand the plot, repair logic by invention, or promote candidate drafts into truth.

## Source Priority

1. Author-confirmed manuscript has the highest priority.
2. Author-confirmed chapter blueprint may be used when no confirmed manuscript exists.
3. Framework, character files, worldbuilding, and timeline are supporting context and validation rules.
4. Candidate drafts, chat logs, and unconfirmed notes may only be listed under "Needs Author Confirmation".

When blueprint and manuscript conflict, manuscript wins. When confirmed manuscript conflicts with itself, prefer the newer chapter but mark the conflict.

## Extraction Dimensions

- Plot progress: what actually changed, who acted, and what result followed.
- Open loops: unresolved questions, promises, deadlines, objects, secrets, abnormal details, and planted clues.
- Closed loops: questions answered, promises fulfilled, clues explained, and pressure released.
- Character state: goals, abilities, relationships, stance, emotional defenses, resources, and social position.
- Relationship change: trust, debt, dependence, alliance, betrayal, misunderstanding, distance, or intimacy.
- Rules and resources: money, evidence, contracts, identity, locations, tools, powers, taboos, and hard limits.
- Time and place anchors: dates, deadlines, travel, parallel scenes, and sequence constraints.
- Forbidden contradictions: facts, knowledge boundaries, ability limits, or setting rules that later writing must not violate.
- Reader promise: what pressure, question, or expectation must carry into the next chapter.

## Writing Rules

- Extract from confirmed manuscript first; use confirmed blueprint only when manuscript is absent.
- Do not confirm facts from candidate drafts.
- Do not treat metaphor, atmosphere, speculation, or character assumptions as fact.
- Avoid uncertain language unless the item is explicitly under "Needs Author Confirmation".
- Every important fact should include a source: chapter number, file path, or scene label where possible.
- Classify open loops as planted, advanced, closed, or overdue.
- The output must help future AI avoid amnesia, timeline drift, repeated exposition, and premature reveals.

## Output Format

```markdown
### 001 "Chapter Title"
#### Plot Progress
- ...

#### Planted Open Loops
- ...

#### Closed Loops
- ...

#### Character State Changes
- ...

#### Relationship Changes
- ...

#### Setting / Rules / Resources
- ...

#### Time And Place Anchors
- ...

#### Forbidden Contradictions
- ...

#### Needs Author Confirmation
- ...
```
"#,
        ),
        (
            "skills/selected/chapter-context-assembly.md",
            r#"---
name: chapter-context-assembly
description: Assemble focused chapter-writing context before drafting. Use when preparing chapter briefs, selecting facts, loops, timeline, character state, reader promises, and style constraints for AI novel generation.
category: context
scope: chapter
tags:
  - writing-brief
  - retrieval
  - chapter-generation
---

# Chapter Context Assembly

## Principle

Retrieve only what the current chapter needs. Do not stuff the entire project into context. Build a focused writing brief that answers: why does this material matter for this chapter?

Priority:

1. The author's current instruction.
2. The current chapter blueprint.
3. Confirmed manuscript and fact database.
4. Current character state, relationship changes, timeline, and open loops.
5. Global writing requirements, style profile, and reference notes.

## Five-Part Brief

1. Opening assignment: book, chapter number, title, viewpoint, and one-sentence target.
2. Story task: objective, obstacle, cost, required beats, forbidden spoilers, and previous hook.
3. Character task: current state, desire, pressure, voice tendency, and relationship tension.
4. Craft task: pacing, viewpoint control, prose style, anti-AI reminders, and scene strategy.
5. Handoff: chapter ending pressure, unanswered question, and what must carry forward.

## Required Fields

- Chapter goal: what the viewpoint character wants to obtain or avoid.
- Obstacle: who or what blocks the goal.
- Cost: what is lost, exposed, promised, or owed after this chapter advances.
- Must happen: confirmed blueprint beats that cannot be skipped.
- Must not reveal: later climax, truth, identity, relationship turn, or setting answer that must remain hidden.
- Continuity anchors: time, place, character state, and prior hook.
- Reader hook: one previous question to answer and one new pressure to leave behind.
- Micro-payoff: a small answer, win, reversal, discovery, or relationship movement.

## Red Lines

- Confirmed manuscript is law; confirmed facts outrank guesses.
- Each chapter needs at least one goal, cost, or relationship shift.
- The previous hook must be answered or intentionally escalated.
- Do not solve later climaxes early.
- Do not let AI summarize psychology; show it through action, dialogue, and choice.
- Do not give every character the same speech rhythm.
"#,
        ),
        (
            "skills/selected/narrative-reviewer.md",
            r#"---
name: narrative-reviewer
description: Review novel manuscript drafts for continuity, setting consistency, character behavior, timeline conflicts, logic, pacing, and AI-flavored prose. Use before adopting candidate drafts as confirmed manuscript.
category: review
scope: chapter
tags:
  - continuity
  - conflict-check
  - anti-ai-prose
  - candidate-review
---

# Narrative Reviewer

## Review Axes

1. Setting consistency: powers, places, objects, identity, and rules must not violate confirmed facts.
2. Timeline: dates, deadlines, travel, and simultaneous appearances must be possible.
3. Narrative continuity: previous hooks, scene transitions, emotional state, and information flow must connect.
4. Character consistency: voice, knowledge boundary, motive, and choice must fit the established character.
5. Logic and causality: decisions need pressure and consequences must follow conditions already on the page.
6. Pacing: avoid water-treading, over-exposition, and scenes without conflict pressure.
7. AI flavor: remove template gestures, generic realizations, emotional labels, moral summaries, and uniform dialogue.

## Severity

- critical: empty manuscript, direct contradiction of confirmed facts, impossible time/place conflict, or broken character knowledge boundary.
- major: missing required beat, mishandled major open loop, unsupported motivation, or ending without a usable hook.
- minor: local pacing drag, repeated expression, explanatory dialogue, or replaceable AI-flavored sentence.

## Output Rules

- Report only verifiable issues.
- Every issue needs evidence and a repair direction.
- Do not rewrite the author's plot. Identify risk and the smallest useful fix.
- Author may override pacing and style notes, but not confirmed-fact conflicts.

## Output Format

```json
{
  "blocking": false,
  "issues": [
    {
      "severity": "major",
      "category": "continuity",
      "evidence": "quote or concrete confirmed fact",
      "fix_hint": "smallest repair direction"
    }
  ]
}
```
"#,
        ),
        (
            "skills/selected/serious-realism-novel.md",
            r#"---
name: serious-realism-novel
description: Guide serious realistic or literary-leaning long-form fiction. Use when the project aims for contemporary realism, social texture, restrained emotion, believable causality, and character-driven conflict rather than spectacle.
category: genre
scope: project
tags:
  - realism
  - literary
  - social-pressure
  - causality
---

# Serious Realism Novel

## Core Direction

Realism does not mean flat events. It means every choice is squeezed by real conditions: money, age, work, family, class, region, body, relationship debt, law, institutional boundaries, and time.

## Writing Rules

- Conflict should come from circumstance, interest structure, and character debt, not convenient villains or stacked coincidences.
- Characters do not need to be morally correct, but their actions must have lived origin and psychological debt.
- Avoid naming emotions directly; prefer action, pause, avoidance, slips, topic shifts, and bodily hesitation.
- Scenes need specific social texture: place, work process, transaction, acquaintance rules, and time pressure.
- Do not replace detail with grand judgment.
- A restrained ending is allowed, but something must change: situation, relationship pressure, knowledge, or risk.

## Avoid

- Ending complex emotion with "he finally understood" or "she was relieved".
- Resolving structural conflict with one argument.
- Making supporting characters serve only as tools.
- Sacrificing credible industry, law, medicine, finance, or social procedure for a cheap twist.
"#,
        ),
        (
            "skills/selected/commercial-serial-pacing.md",
            r#"---
name: commercial-serial-pacing
description: Control web-serial chapter pacing, reader hooks, micro-payoffs, cool points, and strand weaving. Use for long commercial fiction, daily-update rhythm, chapter blueprint generation, and manuscript drafting.
category: pacing
scope: chapter
tags:
  - web-serial
  - hooks
  - payoff
  - chapter-rhythm
---

# Commercial Serial Pacing

## Reader Drive

Each chapter should advance at least one active drive:

- Crisis: danger, deadline, or resource shortage approaches.
- Mystery: the reader wants the truth, cost, or hidden actor.
- Desire: a character wants a person, object, status, answer, or escape.
- Emotion: a relationship shifts through attraction, conflict, dependence, betrayal, or distance.
- Choice: a character must choose between two costs.
- Identity: a character faces a change in self-knowledge or public identity.

## Chapter Shape

1. Open by answering or escalating the previous hook; do not start with weather, waking up, or setting exposition.
2. Raise resistance in the middle and make the character pay a visible action cost.
3. Deliver a micro-payoff: information, win, reversal, evidence, resource, or relationship change.
4. End with unfinished pressure, not a random broken sentence.

## Long-Strand Weaving

- Main strand: the volume-level goal must move steadily.
- Fire strand: the chapter's immediate pressure must be felt.
- Star strand: relationship, identity, theme, or emotional long arc should shift slightly.

Not every strand needs equal weight in every chapter, but several chapters in a row cannot be pure explanation.

## Rhythm Red Lines

- Do not run three consecutive exposition paragraphs.
- Do not have characters repeat facts the reader already knows in pressure-free dialogue.
- Do not reveal the big truth early; signal it without answering it.
- Do not use "suddenly" or "unexpectedly" as a substitute for planted setup.
"#,
        ),
        (
            "skills/selected/chapter-blueprint-planning.md",
            r#"---
name: chapter-blueprint-planning
description: Plan chapter blueprints with required beats, forbidden spoilers, reader promises, continuity anchors, and handoff notes for drafting. Use when generating or reviewing chapter blueprints before manuscript writing.
category: planning
scope: chapter
tags:
  - blueprint
  - outline
  - signal-vs-spoiler
  - chapter-brief
---

# Chapter Blueprint Planning

## Blueprint Is Not A Plot Summary

A blueprint tells the drafting engine what this chapter must accomplish. It is not compressed prose. It needs causality, pressure, and boundaries while leaving room for the manuscript to breathe on the page.

## Required Fields

- Chapter goal: who wants to accomplish what.
- Obstacle: who or what makes the goal difficult.
- Cost: what is paid after progress.
- Must happen: 3 to 7 beats that cannot be skipped.
- Must not reveal: facts, answers, or new settings that cannot appear yet.
- Continuity anchors: time, place, character state, and previous ending hook.
- Reader signal: what may be hinted.
- Spoiler boundary: what must not be directly exposed.
- Ending stop point: pressure, choice, discovery, relationship shift, or new question.

## Signal Versus Spoiler

- Signal lets the reader later feel that the answer was planted fairly.
- Spoiler gives the answer now and weakens later reading drive.

Blueprints may plant signals. They should not write future climax answers as drafting instructions.
"#,
        ),
        (
            "skills/selected/anti-ai-prose-polish.md",
            r#"---
name: anti-ai-prose-polish
description: Rewrite or polish generated Chinese prose to reduce AI flavor while preserving plot facts, character intent, viewpoint, and author style. Use after drafting or when a candidate feels generic, over-explained, or emotionally labeled.
category: prose
scope: chapter
tags:
  - polish
  - anti-ai
  - style
  - rewrite
---

# Anti-AI Prose Polish

## Preserve

- Confirmed facts, character actions, scene order, viewpoint, and dialogue meaning.
- The author's existing temperature, speed, density, and sentence-length tendency.
- Useful silence and ambiguity; do not explain every motive.

## Remove Or Rewrite

- Cheap adverbs and filler gestures such as slowly, faintly, slightly, could not help, and subconsciously.
- Template expressions such as pupils shrinking, eyes flashing, lips curling, or the air freezing.
- Emotional labels such as "he felt angry" or "she was very sad".
- Paragraph-end moral summaries and safe landings.
- Repeated explanation after dialogue that already carries the intent.

## Rewrite Method

- Replace emotion labels with action.
- Use objects, body response, work procedure, and spatial blocking to carry pressure.
- Let dialogue misalign: evade, interrupt, pause, answer the wrong question, or change topic.
- Use longer sentences for pressure accumulation and short sentences for rupture or landing.
- Preserve uncertainty; do not translate every inner state into authorial explanation.
"#,
        ),
        (
            "skills/selected/dialogue-and-scene-craft.md",
            r#"---
name: dialogue-and-scene-craft
description: Improve dialogue, scene description, viewpoint control, and sensory detail for Chinese fiction. Use when drafting or revising scenes that need subtext, conflict, clearer blocking, or stronger lived texture.
category: craft
scope: scene
tags:
  - dialogue
  - scene
  - subtext
  - viewpoint
---

# Dialogue And Scene Craft

## Dialogue

- Every line should have a purpose: probe, hide, request, refuse, delay, pressure, reconcile, or wound.
- Characters should not always answer directly. They can evade, counter-question, interrupt, stay silent, or change topic.
- In the same scene, characters should know different things and want different things.
- Important emotion often appears through what is not said, what is said too lightly, or what is said incorrectly.
- Avoid explanatory dialogue where characters tell each other facts the reader already knows.

## Scene

- Identify the pressure source before describing the environment.
- Environmental details should affect action: cover, distance, sound, smell, light, heat, crowd, paperwork, or screens.
- Do not describe for decoration; each detail should serve mood, obstacle, identity, or later action.
- Do not reveal what the viewpoint character cannot know.
- Keep blocking clear so the reader knows where bodies, objects, doors, screens, and exits are.

## Paragraphs

- Shorten paragraphs when emotion spikes.
- Use longer sentence groups when pressure accumulates.
- Interleave dialogue and action so speech does not become a broadcast.
- End scenes with change: information, relationship, choice, risk, or pressure.
"#,
        ),
    ];
    for (relative_path, content) in files {
        write_default_skill_file(root, relative_path, content)?;
    }
    Ok(true)
}

pub(crate) fn write_default_skill_files(root: &Path) -> Result<(), ProjectError> {
    write_default_skill_files_english(root)?;
    Ok(())
}

fn trim_to_chars(value: &str, max_chars: usize) -> String {
    let mut output = String::new();
    for character in value.chars().take(max_chars) {
        output.push(character);
    }
    if value.chars().count() > max_chars {
        output.push_str("...");
    }
    output
}
